const { ethers } = require("ethers");

const BridgeService = require("./services/BridgeService");
const UserWallet = require("./services/userWallet");
/**
 * 跨链桥演示脚本
 */

const networks = {
  arbTestnet: {
    chainId: 421614,
    rpc: "https://arbitrum-sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876",
  },
  ethTestnet: {
    chainId: 11155111,
    rpc: "https://sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876",
  },
  // arbMainnet: {
  //   chainId: 42161,
  //   rpc: "https://arb-mainnet.g.alchemy.com/v2/demo",
  // },
  // ethMainnet: {
  //   chainId: 1,
  //   rpc: "https://eth-mainnet.g.alchemy.com/v2/demo",
  // },
};

const bridgeName = "arb_native_bridge";

async function runDemo() {
  const privateKey =
    "0xcb28292e69f20f36a8eff9f848c935b44fa9d84f2de1f4f29990e2affb5f91c8";
  const wallet = new UserWallet(privateKey);

  let bridgeService;

  bridgeService = new BridgeService(bridgeName, {
    arbitrum: networks.arbTestnet,
    ethereum: networks.ethTestnet,
  });

  const eth2ArbTx = await eth2ArbDemo(bridgeService);
  const arb2EthTx = await arb2EthDemo(bridgeService);

  console.log("eth2ArbTx", eth2ArbTx);
  console.log("arb2EthTx", arb2EthTx);

  const signedEth2ArbTx = await wallet.signTransaction(eth2ArbTx);
  const signedArb2EthTx = await wallet.signTransaction(arb2EthTx);

  const broadcastEth2ArbTx = await wallet.broadcastTransaction(
    networks.ethTestnet.rpc,
    signedEth2ArbTx
  );
  const broadcastArb2EthTx = await wallet.broadcastTransaction(
    networks.arbTestnet.rpc,
    signedArb2EthTx
  );
  console.log("广播后的交易", broadcastEth2ArbTx);
  console.log("广播后的交易", broadcastArb2EthTx);
}

async function eth2ArbDemo(bridgeService) {
  // 从eth跨链到arb;
  const requestData = {
    bridge: bridgeName,
    userAddress: "0x565d4ba385fc4e3c1b07ce078682c84719475e76", // 用户地址
    chain: "ethereum",
    chian_id: networks.ethTestnet.chainId,
    bridgeAddress: "0xaAe29B0366299461418F5324a79Afc425BE5ae21", // Arbitrum Bridge 合约地址
    srcToken: {
      address: null,
      amount: "0.0001",
    },
    dstToken: {
      address: null,
      chain: "eth",
    },
  };

  const transaction = await bridgeService.createBridgeTransaction(requestData);

  return transaction;
}

async function arb2EthDemo(bridgeService) {
  // 从arb跨链到eth;
  const requestData = {
    bridge: bridgeName,
    userAddress: "0x565d4ba385fc4e3c1b07ce078682c84719475e76", // 用户地址
    chain: "arbitrum",
    chian_id: networks.arbTestnet.chainId,
    bridgeAddress: "0x0000000000000000000000000000000000000064", // Arbitrum Bridge 合约地址
    srcToken: {
      address: null,
      amount: "0.0001",
    },
    dstToken: {
      address: null,
      chain: "eth",
    },
  };

  const transaction = await bridgeService.createBridgeTransaction(requestData);

  return transaction;
}

// 运行演示
if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = { runDemo };
