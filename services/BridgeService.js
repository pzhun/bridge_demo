const { networks } = require("../config/blockchain");
const ArbNativeBridge = require("./arbNativeBridge");
const RelayBridgeService = require("./RelayBridgeService");
const AcrossBridgeService = require("./AcrossBridgeService");
const MesonBridgeService = require("./MesonBridgeService");

const bridges = {
  arb_native_bridge: "arb_native_bridge",
  relay_bridge: "relay_bridge",
  across_bridge: "across_bridge",
  meson_bridge: "meson_bridge",
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
      case bridges.relay_bridge:
        this.bridgeService = new RelayBridgeService(networks);
        break;
      case bridges.across_bridge:
        this.bridgeService = new AcrossBridgeService(networks);
        break;
      case bridges.meson_bridge:
        this.bridgeService = new MesonBridgeService(networks);
        break;
      default:
        throw new Error("不支持的跨链桥");
    }
  }

  async createBridgeTransaction(requestData) {
    return await this.bridgeService.createBridgeTransaction(requestData);
  }

  async listenBridgeResult(requestData) {
    return await this.bridgeService.listenBridgeResult(requestData);
  }

  async claimBridgeResult(requestData) {
    return await this.bridgeService.claimBridgeResult(requestData);
  }
}

module.exports = BridgeService;
