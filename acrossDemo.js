const { ethers } = require("ethers");
const BridgeService = require("./services/BridgeService");
const UserWallet = require("./services/userWallet");

// ====== 配置区域 ======
const PRIVATE_KEY = "0x你的私钥"; // 你的钱包私钥
const wallet = new UserWallet(PRIVATE_KEY);

// 网络配置
const networks = {
  ethTestnet: {
    chainId: 11155111, // Sepolia
    rpc: "https://rpc.ankr.com/eth_sepolia",
  },
  polygonAmoy: {
    chainId: 80002, // Polygon Amoy
    rpc: "https://rpc.ankr.com/polygon_amoy",
  },
  // 可以根据需要添加更多网络
  arbitrum: {
    chainId: 42161,
    rpc: "https://rpc.ankr.com/arbitrum",
  },
  base: {
    chainId: 8453,
    rpc: "https://rpc.ankr.com/base",
  },
};

// 跨链参数（例子：Sepolia → Polygon Amoy USDC）
const INTEGRATOR_ID = "0x8888"; // 自定义 or 申请的 integratorId

// ======================

async function main() {
  try {
    console.log("🚀 开始 Across 跨链桥演示...\n");

    // 初始化 Across 桥服务
    const bridgeService = new BridgeService("across_bridge", networks);

    // 准备跨链请求数据
    // 方式1: 使用带小数点的金额（需要提供 decimals）
    const requestData = {
      userAddress: wallet.address,
      originChainId: 11155111, // Sepolia
      destinationChainId: 80002, // Polygon Amoy
      srcToken: {
        address: "0x7ea2be2df7ba6e54b1aA503394Fb2c47cC1c4f84", // USDC sepolia
        amount: "1.0", // 1 USDC（会自动转换为最小单位）
        decimals: 6, // USDC 有 6 位小数
      },
      destToken: {
        address: "0xA8ce8aee21BC2A48a5EF670afCc9274C7CdE44af", // USDC Amoy
      },
      integratorId: INTEGRATOR_ID,
      feeRefundAddress: wallet.address, // 可选：手续费退款地址
    };

    // 方式2: 直接使用最小单位（不需要 decimals）
    // const requestData = {
    //   userAddress: wallet.address,
    //   originChainId: 11155111,
    //   destinationChainId: 80002,
    //   srcToken: {
    //     address: "0x7ea2be2df7ba6e54b1aA503394Fb2c47cC1c4f84",
    //     amount: "1000000", // 1 USDC = 1000000 (6 decimals)
    //   },
    //   destToken: {
    //     address: "0xA8ce8aee21BC2A48a5EF670afCc9274C7CdE44af",
    //   },
    //   integratorId: INTEGRATOR_ID,
    // };

    console.log("1) 获取 Across 报价并创建交易...");
    const transaction = await bridgeService.createBridgeTransaction(requestData);

    console.log("✅ 交易已创建:");
    console.log(`  To: ${transaction.to}`);
    console.log(`  Value: ${ethers.formatEther(transaction.value || 0n)} ETH`);
    console.log(`  Gas Limit: ${transaction.gasLimit?.toString()}`);
    console.log(`  Chain ID: ${transaction.chainId}\n`);

    // 2️⃣ 签名并发送交易
    console.log("2) 签名并发送交易...");
    const signedTx = await wallet.signTransaction(transaction);

    // 根据 chainId 找到对应的 RPC URL
    const chainName = Object.keys(networks).find(
      (name) => networks[name].chainId === transaction.chainId
    );
    const providerUrl = networks[chainName].rpc;

    const response = await wallet.broadcastTransaction(providerUrl, signedTx);

    console.log(`✅ 已发送，hash: ${response.hash}`);

    // 等待交易确认
    const provider = new ethers.JsonRpcProvider(providerUrl);
    const receipt = await provider.waitForTransaction(response.hash);

    console.log(`✅ 已上链确认，区块号: ${receipt.blockNumber}`);
    console.log(`✅ 跨链成功提交！Tx Hash: ${receipt.hash}\n`);

    // 3️⃣ 监听跨链结果
    console.log("3) 监听跨链结果...");
    const listenRequestData = {
      hash: receipt.hash,
      originChainId: requestData.originChainId,
      destinationChainId: requestData.destinationChainId,
    };

    // 等待一段时间后查询结果
    console.log("等待 10 秒后查询跨链状态...");
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const result = await bridgeService.listenBridgeResult(listenRequestData);
    console.log("跨链状态:", result);

    console.log("\n✅ Across 跨链桥演示完成！");
  } catch (error) {
    console.error("❌ 错误:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// 如果直接运行此文件，则执行演示
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };

