const { ethers } = require("ethers");
const BridgeService = require("./services/BridgeService");
const UserWallet = require("./services/userWallet");
const axios = require("axios");

// const host = "http://127.0.0.1:14042";
const host = "https://api.fxwallet.in";
const quoteApi = "/bridge/quote";
const executeApi = "/bridge/execute";
const txDetailApi = "/bridge/record";

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

const bridgeService = new BridgeService("meson_bridge");

// ----------------------

const toToken = arbUsdc;
const fromToken = ethUsdc;
const network = networks.baseTestnet;

async function main() {
  try {
    const requestData = {
      user_address: userAddress,
      from_chain: fromToken.chain,
      from_token_address: fromToken.address,
      to_token_address: toToken.address,
      to_chain: toToken.chain,
      amount: "1",
    };

    const bridgeResult = await bridgeService.createBridgeTransaction(
      requestData
    );
    console.log(bridgeResult);
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
