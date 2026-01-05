const { ethers } = require("ethers");
const BridgeService = require("./services/BridgeService");
const UserWallet = require("./services/userWallet");
const axios = require("axios");
const ERC20ABI = require("./config/erc20.json");

// const host = "http://127.0.0.1:14042";
const host = "https://api.fxwallet.in";
const quoteApi = "/bridge/quote";
const executeApi = "/bridge/execute";
const txDetailApi = "/bridge/record";

// ------- 配置区 -------
// 钱包私钥（测试用，千万不要把真实私钥提交到线上）
const PRIVATE_KEY =
  "0xcb28292e69f20f36a8eff9f848c935b44fa9d84f2de1f4f29990e2affb5f91c8";

const wallet = new UserWallet(PRIVATE_KEY);
const userAddress = wallet.address;
const recipientAddress = wallet.address; // 接收者地址

// 网络配置
const networks = {
  arbTestnet: {
    chainId: 421614,
    rpc: "https://arbitrum-sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876",
  },
  ethTestnet: {
    chainId: 11155111,
    rpc: "https://sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876",
  },
  baseTestnet: {
    chainId: 84532,
    rpc: "https://base-sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876",
  },
};

const baseUsdc = {
  chain: "base_sepolia",
  address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

const arbUsdc = {
  chain: "arb_sepolia",
  address: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
};

const ethUsdc = {
  chain: "sepolia",
  address: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
};

// 根据链名称获取对应的网络配置
function getNetworkByChainName(chainName) {
  const chainToNetwork = {
    sepolia: networks.ethTestnet,
    arb_sepolia: networks.arbTestnet,
    base_sepolia: networks.baseTestnet,
  };
  return chainToNetwork[chainName] || networks.ethTestnet;
}
// ======================

const fromToken = arbUsdc;

const toToken = ethUsdc;

const network = networks.arbTestnet;

const bridgeService = new BridgeService("across_bridge");

async function main() {
  try {
    const requestData = {
      user_address: "0x565d4ba385fc4e3c1b07ce078682c84719475e76",
      from_chain: fromToken.chain,
      from_token_address: fromToken.address,
      to_token_address: toToken.address,
      to_chain: toToken.chain,
      amount: "1",
      bridge: "across testnet bridge",
    };

    console.log(requestData);

    const data = await axios.post(
      `https://admin.fxwallet.in/api/swap/bridge/route/quote`,
      requestData
    );

    console.log(data);
    const quotes = data.data.data.quotes;
    const quote = quotes[0];

    // 根据 from_chain 获取正确的网络配置
    const network = getNetworkByChainName(requestData.from_chain);
    console.log(
      `使用网络: ${requestData.from_chain}, chainId: ${network.chainId}`
    );

    for (const tx of quote.unsigned_tx) {
      tx.from = userAddress;
      await approve(fromToken, tx.to, network);

      console.log(tx);

      const finalizedTx = await finalizeTransaction(tx, network);
      const signedTx = await wallet.signTransaction(finalizedTx);
      console.log(signedTx);

      // const executeTx = await axios.post(`${host}${executeApi}`, {
      //   bridge: "relay testnet bridge",
      //   user_address: userAddress,
      //   from_chain: requestData.from_chain,
      //   to_chain: requestData.to_chain,
      //   from_token_address: requestData.from_token_address,
      //   to_token_address: requestData.to_token_address,
      //   extra_data: quote.extra_data,
      //   signed_tx: signedTx,
      // });

      // console.log(executeTx);
    }
  } catch (error) {
    console.error("❌ 错误:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }

  // 查询是否approve
  async function approve(fromToken, contractAddress, network) {
    const provider = new ethers.JsonRpcProvider(network.rpc);
    const erc20Contract = new ethers.Contract(
      fromToken.address,
      ERC20ABI,
      provider
    );

    const allowance = await erc20Contract.allowance(
      userAddress,
      contractAddress
    );
    if (allowance <= 0) {
      const data = erc20Contract.interface.encodeFunctionData("approve", [
        contractAddress,
        ethers.MaxUint256,
      ]);
      const tx = {
        from: userAddress,
        to: fromToken.address,
        data: data,
      };
      const unsignedTx = await finalizeTransaction(tx, network);
      const signedTx = await wallet.signTransaction(unsignedTx);
      const hash = await wallet.broadcastTransaction(network.rpc, signedTx);
      console.log(hash);
    }
  }

  async function finalizeTransaction(unsignedTx, network) {
    const provider = new ethers.JsonRpcProvider(network.rpc);
    const nonce = await provider.getTransactionCount(unsignedTx.from);

    // 确保 chainId 正确设置
    const txWithChainId = {
      ...unsignedTx,
      chainId: network.chainId,
    };

    const gasLimit = await provider.estimateGas(txWithChainId);
    const gasPrice = await provider.getFeeData();
    const maxFeePerGas = gasPrice.maxFeePerGas;
    const maxPriorityFeePerGas = gasPrice.maxPriorityFeePerGas;
    return {
      ...txWithChainId,
      type: 2, // EIP-1559
      nonce,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };
  }
}

// 如果直接运行此文件，则执行演示
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
