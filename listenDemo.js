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

  const l2hash =
    "0x8dac0859074feb0398bdfb452e702e2cc405d226cf2f022f9a23872aabbe61fb";
  const lhash = await bridgeService.listenBridgeResult({
    hash: l2hash,
    bridgeAddress: "0x0000000000000000000000000000000000000064",
    chainId: networks.arbTestnet.chainId,
    userAddress: wallet.address,
  });

  console.log("lhash", lhash);
}

// 运行演示
if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = { runDemo };
