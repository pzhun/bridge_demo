# 跨链桥演示项目

这是一个用Node.js实现的跨链桥演示项目，展示了如何提取和使用外部信息（价格、Gas费用、网络状态等）来实现跨链功能。

## 功能特性

### 🔗 跨链桥核心功能
- 支持多链转账 (Ethereum, BSC, Polygon)
- 智能合约交互
- 交易状态跟踪
- 费用估算

### 📊 外部信息提取
- **代币价格**: 从CoinGecko API获取实时价格
- **Gas费用**: 获取各链的Gas价格信息
- **网络状态**: 监控区块链网络健康状态
- **费用估算**: 计算跨链转账总费用

### 🛠️ 技术栈
- Node.js
- ethers.js (以太坊交互)
- axios (HTTP请求)
- 支持多链RPC连接

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 运行演示
```bash
npm run demo
```

### 3. 使用API
```javascript
const CrossChainBridge = require('./index');

const bridge = new CrossChainBridge();
await bridge.initialize();

// 获取代币价格
const ethPrice = await bridge.getTokenPrice('ethereum');

// 获取Gas价格
const gasPrice = await bridge.getGasPrice(1); // Ethereum

// 创建跨链交易
const transaction = await bridge.createBridgeTransaction(
  'ethereum', 'bsc', '1.0', 
  '0x...', '0x...'
);
```

## 项目结构

```
bridge_demo/
├── config/
│   ├── blockchain.js    # 区块链网络配置
│   └── index.js         # 全局配置
├── services/
│   ├── BridgeService.js        # 跨链桥核心服务
│   └── ExternalDataService.js  # 外部数据提取服务
├── index.js             # 主入口文件
├── demo.js              # 演示脚本
├── package.json
└── README.md
```

## 外部信息提取详解

### 1. 代币价格提取
- 使用CoinGecko API获取实时价格
- 支持24小时变化率和交易量
- 内置缓存机制，减少API调用

### 2. Gas费用监控
- Ethereum: 使用Etherscan API获取Gas Oracle数据
- 其他链: 通过RPC直接获取Gas价格
- 提供慢速、标准、快速、极速四个档位

### 3. 网络状态监控
- 实时监控各链的区块高度
- 检测网络健康状态
- 测量RPC响应延迟

### 4. 费用估算算法
```javascript
总费用 = 基础费用 + Gas费用
基础费用 = 转账金额 × 手续费百分比
Gas费用 = (源链Gas + 目标链Gas) × Gas价格
```

## 配置说明

### 区块链网络配置
在 `config/blockchain.js` 中配置支持的区块链网络：

```javascript
const networks = {
  ethereum: {
    name: 'Ethereum',
    chainId: 1,
    rpcUrl: 'https://mainnet.infura.io/v3/YOUR_KEY',
    // ... 更多配置
  }
};
```

### API配置
在 `config/index.js` 中配置外部API：

```javascript
const config = {
  apis: {
    coingecko: 'https://api.coingecko.com/api/v3',
    gasTracker: 'https://api.etherscan.io/api'
  }
};
```

## 使用示例

### 基本使用
```javascript
const bridge = new CrossChainBridge();
await bridge.initialize();

// 获取所有网络状态
const stats = await bridge.getBridgeStats();
console.log('活跃网络:', stats.activeBridges);

// 获取费用估算
const fee = await bridge.getFeeEstimate(1, 56, 10, 'ethereum');
console.log('预估费用:', fee.totalFee);
```

### 高级使用
```javascript
// 获取多个代币价格
const prices = await bridge.externalDataService.getMultipleTokenPrices([
  'ethereum', 'bitcoin', 'binancecoin'
]);

// 监控所有网络状态
const allStatus = await bridge.externalDataService.getAllNetworkStatus();
allStatus.forEach(network => {
  console.log(`${network.network}: ${network.status.isHealthy ? '健康' : '异常'}`);
});
```

## 注意事项

1. **API密钥**: 需要配置Etherscan API密钥以获取Gas价格
2. **私钥安全**: 生产环境中应使用硬件钱包或安全的密钥管理
3. **网络连接**: 确保RPC节点连接稳定
4. **费用估算**: 实际费用可能因网络拥堵而变化

## 扩展功能

- 添加更多区块链网络支持
- 实现真实智能合约交互
- 添加交易历史记录
- 实现Web界面
- 添加移动端支持

## 许可证

MIT License
