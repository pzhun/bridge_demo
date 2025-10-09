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

  const requestData = {
    hash: "0x08175435746c990289ccb32b029d5217f457122a7074c906b9edccb90f3ebcbf",
    bridgeAddress: "0x65f07C7D521164a4d5DaC6eB8Fac8DA067A3B78F",
    chainId: networks.ethTestnet.chainId,
    chain: "ethereum",
    userAddress: wallet.address,
  };
  const bridgeResult = await bridgeService.listenBridgeResult(requestData);

  if (bridgeResult.claimable) {
    const claimData = await bridgeService.claimBridgeResult({
      ...bridgeResult.data,
      ...requestData,
    });
    console.log(claimData);
    const signedTx = await wallet.signTransaction(claimData);
    const broadcastTx = await wallet.broadcastTransaction(
      networks.ethTestnet.rpc,
      signedTx
    );
    console.log("broadcastTx", broadcastTx);
  } else if (bridgeResult.claimed) {
    console.log("ℹ️ 该交易已经被 claim 过了");
  } else {
    console.log("⏳ 交易还不能被 claim，请稍后再试");
  }
}

// 运行演示
if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = { runDemo };
