const { networks } = require("../config/blockchain");
const ArbNativeBridge = require("./arbNativeBridge");

const bridges = {
  arb_native_bridge: "arb_native_bridge",
};

/**
 * 跨链桥服务入口类
 */
class BridgeService {
  constructor(bridge, networks) {
    this.bridge = bridge;
    this.bridgeService;
    switch (this.bridge) {
      case bridges.arb_native_bridge:
        this.bridgeService = new ArbNativeBridge(networks);
        break;
      default:
        throw new Error("不支持的跨链桥");
    }
  }

  async createBridgeTransaction(requestData) {
    return await this.bridgeService.createBridgeTransaction(requestData);
  }

  async listenBridgeResult(transactionHash) {
    return await this.bridgeService.listenBridgeResult(transactionHash);
  }
}

module.exports = BridgeService;
