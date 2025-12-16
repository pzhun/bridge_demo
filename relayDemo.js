const { ethers } = require("ethers");
const BridgeService = require("./services/BridgeService");
const UserWallet = require("./services/userWallet");

// ------- 配置区 -------
// 钱包私钥（测试用，千万不要把真实私钥提交到线上）
const PRIVATE_KEY =
  "0xcb28292e69f20f36a8eff9f848c935b44fa9d84f2de1f4f29990e2affb5f91c8";

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

const wallet = new UserWallet(PRIVATE_KEY);
const userAddress = wallet.address;
const recipientAddress = wallet.address; // 接收者地址

// ----------------------

async function main() {
  try {
    console.log("🚀 开始 Relay 跨链桥演示...\n");

    // 初始化 BridgeService
    const bridgeService = new BridgeService("relay_bridge", networks);

    // 1️⃣ 准备跨链请求数据
    const requestData = {
      userAddress: userAddress,
      originChainId: networks.arbTestnet.chainId, // arb sepolia
      destinationChainId: networks.baseTestnet.chainId, // Base sepolia
      srcToken: {
        amount: "0.0001", // 转账 0.01 ETH
        address: ethers.ZeroAddress, // 原生代币使用 ZeroAddress
      },
      destToken: {
        address: ethers.ZeroAddress, // 目标链也是原生代币
      },
    };

    console.log("1) 获取报价并创建交易...");
    const transaction = await bridgeService.createBridgeTransaction(
      requestData
    );

    console.log(transaction);

    // const unsignedTx = transaction.unsignedTx;
    // unsignedTx.from = userAddress;
    // unsignedTx.chainId = networks.arbTestnet.chainId;

    // const finalizedTx = await finalizeTransaction(
    //   unsignedTx,
    //   networks.arbTestnet
    // );

    // console.log(finalizedTx);
    // const signedTx = await wallet.signTransaction(finalizedTx);

    // const broadcastTx = await wallet.broadcastTransaction(
    //   networks.arbTestnet.rpc,
    //   signedTx
    // );

    // console.log(broadcastTx);
  } catch (error) {
    console.error("❌ 错误:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

async function finalizeTransaction(unsignedTx, network) {
  const provider = new ethers.JsonRpcProvider(network.rpc);
  const nonce = await provider.getTransactionCount(unsignedTx.from);
  const gasLimit = await provider.estimateGas(unsignedTx);
  const gasPrice = await provider.getFeeData();
  const maxFeePerGas = gasPrice.maxFeePerGas;
  const maxPriorityFeePerGas = gasPrice.maxPriorityFeePerGas;
  return {
    ...unsignedTx,
    type: 2, // EIP-1559
    nonce,
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
}

// 如果直接运行此文件，则执行演示
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
