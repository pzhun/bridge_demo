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

async function runDemo() {
  const privateKey =
    "0xcb28292e69f20f36a8eff9f848c935b44fa9d84f2de1f4f29990e2affb5f91c8";
  const wallet = new UserWallet(privateKey);
  console.log(wallet.address);
  // 从eth跨链到arb
  // const requestData = {
  //   bridge: "arb_native_bridge",
  //   userAddress: "0x565d4ba385fc4e3c1b07ce078682c84719475e76", // 用户地址
  //   chain: "ethereum",
  //   chian_id: networks.ethTestnet.chainId,
  //   bridgeAddress: "0xaAe29B0366299461418F5324a79Afc425BE5ae21", // Arbitrum Bridge 合约地址
  //   srcToken: {
  //     address: null,
  //     amount: "0.0001",
  //   },
  //   dstToken: {
  //     address: null,
  //     chain: "eth",
  //   },
  // };

  // 从arb跨链到eth
  const requestData = {
    bridge: "arb_native_bridge",
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

  let bridgeService;

  bridgeService = new BridgeService(requestData.bridge, {
    arbitrum: networks.arbTestnet,
    ethereum: networks.ethTestnet,
  });
  const transaction = await bridgeService.createBridgeTransaction(requestData);
  console.log("跨链转账", transaction);
  const signedTx = await wallet.signTransaction(transaction);
  console.log("签名后的交易", signedTx);

  // const provider = new ethers.JsonRpcProvider(networks.arbTestnet.rpc);
  // const broadcastTx = await provider.broadcastTransaction(signedTx);
  // console.log("广播后的交易", broadcastTx);
  // const hash =
  //   "0x2b7c81a4fab37571bb7b19a00e50b243eb19c99559d01e6a7fc6719573d64866";
  // const receipt = await bridgeService.listenBridgeResult({
  //   ...requestData,
  //   hash,
  // });
  // console.log("跨链结果", receipt);
}

// 运行演示
if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = { runDemo };
