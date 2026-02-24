const { ethers } = require("ethers");
const axios = require("axios");
const readline = require("readline");
const UserWallet = require("./services/userWallet");
const config = require("./config/config");

const GAS_API = "https://api.fxwallet.in/chain/optimism/gas";
const PRIVATE_KEY = config.wallets.gasPayer.privateKey;
const { node: RPC_URL, chainId } = config.chains.optimism;

const wallet = new UserWallet(PRIVATE_KEY);

/**
 * 广播前等待用户确认
 * @param {object} summary - { description, estimatedCostEth }
 * @returns {Promise<boolean>}
 */
function confirmBeforeBroadcast(summary) {
    return new Promise((resolve) => {
        console.log("\n--- 请确认后广播 ---");
        console.log("  说明:", summary.description);
        console.log("  预估成本:", summary.estimatedCostEth, "ETH");
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question("输入 y/yes 确认，其他取消: ", (answer) => {
            rl.close();
            const ok = /^y(es)?$/i.test(answer.trim());
            resolve(ok);
        });
    });
}

/**
 * 调用 fxwallet gas 接口获取 Optimism 链的 gas 数据
 * @returns {Promise<{ safe, propose, fast, suggestBaseFee, l1Fee, source }>}
 */
async function fetchGasFromApi() {
    const { data } = await axios.get(GAS_API);
    if (data.status !== "success" || data.code !== 20000) {
        throw new Error(`Gas API 返回异常: ${JSON.stringify(data)}`);
    }
    return data;
}

/**
 * 将 API 返回的 gas 数据转换为 EIP-1559 交易所需的 maxFeePerGas / maxPriorityFeePerGas（wei）
 * API 的 suggestBaseFee 单位为 Gwei，safe/propose/fast.gas 为单笔交易预估总成本（ETH）
 */
function buildFeeFromGasData(gasData, speed = "propose") {
    const tier = gasData[speed] || gasData.propose;
    // suggestBaseFee 一般为 Gwei，转为 wei
    const suggestBaseFeeGwei = Number(gasData.suggestBaseFee);
    const baseFeePerGasWei = BigInt(Math.ceil(suggestBaseFeeGwei * 1e9));
    // Optimism 上 priority fee 通常很小，用 0.001 Gwei
    const maxPriorityFeePerGasWei = 1000000n; // 0.001 Gwei
    const maxFeePerGasWei = baseFeePerGasWei + maxPriorityFeePerGasWei;

    return {
        maxFeePerGas: maxFeePerGasWei,
        maxPriorityFeePerGas: maxPriorityFeePerGasWei,
        estimatedCostEth: tier ? tier.gas : null,
    };
}

/**
 * 使用 API 返回的 gas 发送一笔交易。
 * 默认：自己给自己转账 0 ETH，仅用于测试 gas 与验证（只消耗 gas 费）。
 */
async function sendTxWithApiGas(options = {}) {
    const { speed = "propose" } = options; // safe | propose | fast

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const gasData = await fetchGasFromApi();
    const fee = buildFeeFromGasData(gasData, speed);

    const to = options.to ?? wallet.address;
    const value = options.value ?? 0n;
    const data = options.data ?? "0x";

    const tx = {
        type: 2, // EIP-1559
        chainId,
        from: wallet.address,
        to,
        value,
        data,
        maxFeePerGas: fee.maxFeePerGas,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
    };

    const gasLimit = await provider.estimateGas({
        ...tx,
        maxFeePerGas: fee.maxFeePerGas,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
    });
    tx.gasLimit = gasLimit;

    const nonce = await provider.getTransactionCount(wallet.address, "pending");
    tx.nonce = nonce;

    const signedTx = await wallet.signTransaction(tx);
    const confirmed = await confirmBeforeBroadcast({
        description: "自己 → 自己 0 ETH (测试)",
        estimatedCostEth: fee.estimatedCostEth,
    });
    if (!confirmed) {
        console.log("已取消。");
        return { hash: null, fee, gasData, gasLimit: tx.gasLimit };
    }

  const txResponse = await wallet.broadcastTransaction(RPC_URL, signedTx);
  const hash = typeof txResponse === "string" ? txResponse : txResponse.hash;
  console.log("已广播, hash:", hash);
  return { hash, fee, gasData, gasLimit: tx.gasLimit };
}

/**
 * 等待交易上链并获取收据（带简单轮询）
 */
async function waitForReceipt(provider, hash, maxWaitMs = 120000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const receipt = await provider.getTransactionReceipt(hash);
        if (receipt && receipt.blockNumber) return receipt;
        await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`交易 ${hash} 在 ${maxWaitMs / 1000}s 内未上链`);
}

/**
 * 验证已发送交易的 gas 是否正确：拉取链上 receipt，对比实际消耗与发送时的 fee/API 预估
 * @param {string} hash - 交易 hash
 * @param {object} [sentContext] - 发送时保存的上下文（含 fee, gasData）
 */
async function verifyTxGas(hash, sentContext = null) {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const receipt = await waitForReceipt(provider, hash);

    const gasUsed = receipt.gasUsed;
    const effectiveGasPrice = receipt.gasPrice ?? receipt.effectiveGasPrice ?? 0n;
    const totalCostWei = gasUsed * effectiveGasPrice;
    const totalCostEth = Number(ethers.formatUnits(totalCostWei, "ether"));

    const report = {
        hash: receipt.hash,
        blockNumber: Number(receipt.blockNumber),
        status: receipt.status === 1 ? "success" : "reverted",
        gasUsed: gasUsed.toString(),
        effectiveGasPriceGwei: ethers.formatUnits(effectiveGasPrice, "gwei"),
        totalCostEth,
    };

    const costStr = report.totalCostEth < 0.0001 ? report.totalCostEth.toExponential(4) : report.totalCostEth.toFixed(6);
    console.log("\n--- Gas 验证 ---");
    console.log("  status:", report.status, "| gasUsed:", report.gasUsed, "| 实际成本:", costStr, "ETH");

    if (sentContext) {
        const { fee, gasData } = sentContext;
        const withinMaxFee = effectiveGasPrice <= fee.maxFeePerGas;
        console.log("  实际单价 ≤ maxFeePerGas:", withinMaxFee ? "✓" : "✗");
        if (gasData?.propose?.gas != null && gasData.propose.gas > 0) {
            const diffPct = (totalCostEth - gasData.propose.gas) / gasData.propose.gas * 100;
            const diffPctStr = Math.abs(diffPct) >= 100 ? diffPct.toFixed(0) : diffPct.toFixed(1);
            console.log("  API 预估(propose):", gasData.propose.gas, "ETH | 差异:", diffPctStr + "%");
            if (Math.abs(diffPct) > 50) {
                console.log("  (差异较大：API 可能含 L1 费或按其他交易类型估算，本笔为极简自转 0)");
            }
        }
    }

    return report;
}

async function main() {
    console.log("Optimism 测试：自己给自己转 0 ETH，验证 Gas API\n");
    const { hash, fee, gasData } = await sendTxWithApiGas({ speed: "propose" });
    if (hash) {
        await verifyTxGas(hash, { fee, gasData });
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    fetchGasFromApi,
    buildFeeFromGasData,
    sendTxWithApiGas,
    waitForReceipt,
    verifyTxGas,
};
