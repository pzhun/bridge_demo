const BridgeService = require('./services/BridgeService');
const ExternalDataService = require('./services/ExternalDataService');

/**
 * 跨链桥主入口文件
 */
class CrossChainBridge {
  constructor() {
    this.bridgeService = new BridgeService();
    this.externalDataService = new ExternalDataService();
    this.isInitialized = false;
  }

  /**
   * 初始化跨链桥
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('跨链桥已经初始化');
      return;
    }

    try {
      console.log('🚀 正在初始化跨链桥...');
      await this.bridgeService.initializeProviders();
      this.isInitialized = true;
      console.log('✅ 跨链桥初始化完成');
    } catch (error) {
      console.error('❌ 跨链桥初始化失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取代币价格
   */
  async getTokenPrice(tokenId) {
    return await this.externalDataService.getTokenPrice(tokenId);
  }

  /**
   * 获取Gas价格
   */
  async getGasPrice(chainId) {
    return await this.externalDataService.getGasPrice(chainId);
  }

  /**
   * 获取网络状态
   */
  async getNetworkStatus(chainId) {
    return await this.externalDataService.getNetworkStatus(chainId);
  }

  /**
   * 创建跨链转账
   */
  async createBridgeTransaction(fromChain, toChain, amount, tokenAddress, recipientAddress) {
    return await this.bridgeService.createBridgeTransaction(
      fromChain, toChain, amount, tokenAddress, recipientAddress
    );
  }

  /**
   * 执行跨链转账
   */
  async executeBridgeTransaction(transaction, privateKey) {
    return await this.bridgeService.executeBridgeTransaction(transaction, privateKey);
  }

  /**
   * 获取账户余额
   */
  async getBalance(chainName, address, tokenAddress = null) {
    return await this.bridgeService.getBalance(chainName, address, tokenAddress);
  }

  /**
   * 获取支持的代币
   */
  getSupportedTokens(chainName) {
    return this.bridgeService.getSupportedTokens(chainName);
  }

  /**
   * 获取跨链桥统计
   */
  async getBridgeStats() {
    return await this.bridgeService.getBridgeStats();
  }

  /**
   * 获取费用估算
   */
  async getFeeEstimate(fromChain, toChain, amount, token) {
    return await this.externalDataService.getBridgeFeeEstimate(
      fromChain, toChain, amount, token
    );
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.bridgeService.cleanup();
    console.log('🧹 资源清理完成');
  }
}

// 如果直接运行此文件，则执行演示
if (require.main === module) {
  const bridge = new CrossChainBridge();
  
  bridge.initialize()
    .then(() => {
      console.log('\n🌉 跨链桥已就绪!');
      console.log('使用 bridge.getTokenPrice("ethereum") 等方法开始使用');
      console.log('运行 "npm run demo" 查看完整演示');
    })
    .catch(console.error);
}

module.exports = CrossChainBridge;
