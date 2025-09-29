/**
 * 全局配置
 */
module.exports = {
  // API配置
  apis: {
    coingecko: 'https://api.coingecko.com/api/v3',
    gasTracker: 'https://api.etherscan.io/api',
    moralis: 'https://deep-index.moralis.io/api/v2'
  },
  
  // 跨链桥配置
  bridge: {
    supportedChains: ['ethereum', 'bsc', 'polygon'],
    minTransferAmount: '0.001', // 最小转账金额
    maxTransferAmount: '1000',  // 最大转账金额
    feePercentage: 0.1, // 手续费百分比
    confirmationBlocks: 12, // 确认区块数
    timeoutMinutes: 30 // 超时时间（分钟）
  },
  
  // 外部信息更新间隔
  updateIntervals: {
    prices: 30000, // 30秒
    gasPrices: 60000, // 1分钟
    networkStatus: 120000 // 2分钟
  }
};
