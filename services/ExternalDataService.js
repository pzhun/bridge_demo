const axios = require('axios');
const { ethers } = require('ethers');
const config = require('../config');

/**
 * 外部数据服务 - 提取价格、gas费用、网络状态等信息
 */
class ExternalDataService {
  constructor() {
    this.priceCache = new Map();
    this.gasPriceCache = new Map();
    this.networkStatusCache = new Map();
    this.lastUpdate = new Map();
  }

  /**
   * 获取代币价格
   */
  async getTokenPrice(tokenId, vsCurrency = 'usd') {
    try {
      const cacheKey = `${tokenId}-${vsCurrency}`;
      const now = Date.now();
      
      // 检查缓存
      if (this.priceCache.has(cacheKey) && 
          this.lastUpdate.get(cacheKey) > now - config.updateIntervals.prices) {
        return this.priceCache.get(cacheKey);
      }

      const response = await axios.get(`${config.apis.coingecko}/simple/price`, {
        params: {
          ids: tokenId,
          vs_currencies: vsCurrency,
          include_24hr_change: true,
          include_24hr_vol: true
        }
      });

      const priceData = response.data[tokenId];
      if (priceData) {
        this.priceCache.set(cacheKey, priceData);
        this.lastUpdate.set(cacheKey, now);
        return priceData;
      }
      
      throw new Error('价格数据获取失败');
    } catch (error) {
      console.error('获取代币价格失败:', error.message);
      return null;
    }
  }

  /**
   * 获取多个代币价格
   */
  async getMultipleTokenPrices(tokenIds, vsCurrency = 'usd') {
    try {
      const response = await axios.get(`${config.apis.coingecko}/simple/price`, {
        params: {
          ids: tokenIds.join(','),
          vs_currencies: vsCurrency,
          include_24hr_change: true
        }
      });

      return response.data;
    } catch (error) {
      console.error('获取多代币价格失败:', error.message);
      return {};
    }
  }

  /**
   * 获取Gas价格
   */
  async getGasPrice(chainId) {
    try {
      const now = Date.now();
      
      // 检查缓存
      if (this.gasPriceCache.has(chainId) && 
          this.lastUpdate.get(`gas-${chainId}`) > now - config.updateIntervals.gasPrices) {
        return this.gasPriceCache.get(chainId);
      }

      let gasData = null;
      
      if (chainId === 1) { // Ethereum
        const response = await axios.get(`${config.apis.gasTracker}`, {
          params: {
            module: 'gastracker',
            action: 'gasoracle',
            apikey: 'YOUR_ETHERSCAN_API_KEY'
          }
        });
        
        if (response.data.status === '1') {
          gasData = {
            slow: response.data.result.SafeGasPrice,
            standard: response.data.result.ProposeGasPrice,
            fast: response.data.result.FastGasPrice,
            instant: response.data.result.FastGasPrice * 1.2
          };
        }
      } else {
        // 其他链使用默认RPC
        const { networks } = require('../config/blockchain');
        const network = Object.values(networks).find(n => n.chainId === chainId);
        
        if (network) {
          const provider = new ethers.JsonRpcProvider(network.rpcUrl);
          const gasPrice = await provider.getFeeData();
          
          gasData = {
            slow: ethers.formatUnits(gasPrice.gasPrice, 'gwei'),
            standard: ethers.formatUnits(gasPrice.gasPrice * 1.1, 'gwei'),
            fast: ethers.formatUnits(gasPrice.gasPrice * 1.2, 'gwei'),
            instant: ethers.formatUnits(gasPrice.gasPrice * 1.5, 'gwei')
          };
        }
      }

      if (gasData) {
        this.gasPriceCache.set(chainId, gasData);
        this.lastUpdate.set(`gas-${chainId}`, now);
      }

      return gasData;
    } catch (error) {
      console.error(`获取链 ${chainId} Gas价格失败:`, error.message);
      return null;
    }
  }

  /**
   * 获取网络状态
   */
  async getNetworkStatus(chainId) {
    try {
      const now = Date.now();
      
      // 检查缓存
      if (this.networkStatusCache.has(chainId) && 
          this.lastUpdate.get(`status-${chainId}`) > now - config.updateIntervals.networkStatus) {
        return this.networkStatusCache.get(chainId);
      }

      const { networks } = require('../config/blockchain');
      const network = Object.values(networks).find(n => n.chainId === chainId);
      
      if (!network) {
        throw new Error(`不支持的链ID: ${chainId}`);
      }

      const provider = new ethers.JsonRpcProvider(network.rpcUrl);
      
      // 获取网络信息
      const [blockNumber, networkInfo, gasPrice] = await Promise.all([
        provider.getBlockNumber(),
        provider.getNetwork(),
        provider.getFeeData()
      ]);

      const status = {
        chainId: networkInfo.chainId,
        blockNumber,
        isHealthy: true,
        gasPrice: ethers.formatUnits(gasPrice.gasPrice, 'gwei'),
        lastChecked: new Date().toISOString(),
        latency: Date.now() - now
      };

      this.networkStatusCache.set(chainId, status);
      this.lastUpdate.set(`status-${chainId}`, now);

      return status;
    } catch (error) {
      console.error(`获取链 ${chainId} 状态失败:`, error.message);
      return {
        chainId,
        isHealthy: false,
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  /**
   * 获取所有支持链的状态
   */
  async getAllNetworkStatus() {
    const { networks } = require('../config/blockchain');
    const statusPromises = Object.values(networks).map(network => 
      this.getNetworkStatus(network.chainId)
    );
    
    const results = await Promise.allSettled(statusPromises);
    
    return results.map((result, index) => ({
      network: Object.values(networks)[index].name,
      status: result.status === 'fulfilled' ? result.value : { error: result.reason.message }
    }));
  }

  /**
   * 获取跨链桥费用估算
   */
  async getBridgeFeeEstimate(fromChain, toChain, amount, token) {
    try {
      // 获取源链和目标链的gas价格
      const [fromGas, toGas] = await Promise.all([
        this.getGasPrice(fromChain),
        this.getGasPrice(toChain)
      ]);

      // 获取代币价格
      const tokenPrice = await this.getTokenPrice(token);
      
      if (!fromGas || !toGas || !tokenPrice) {
        throw new Error('无法获取必要的外部数据');
      }

      // 计算费用（简化版本）
      const baseFee = config.bridge.feePercentage / 100 * amount;
      const gasFee = (parseFloat(fromGas.standard) + parseFloat(toGas.standard)) * 0.000000001; // 转换为ETH
      const totalFee = baseFee + gasFee;

      return {
        baseFee,
        gasFee,
        totalFee,
        tokenPrice: tokenPrice.usd,
        estimatedTime: '5-15分钟',
        fromChain: fromChain,
        toChain: toChain
      };
    } catch (error) {
      console.error('获取跨链桥费用估算失败:', error.message);
      return null;
    }
  }

  /**
   * 清理过期缓存
   */
  cleanExpiredCache() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, timestamp] of this.lastUpdate.entries()) {
      if (now - timestamp > 300000) { // 5分钟过期
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => {
      this.lastUpdate.delete(key);
      if (key.startsWith('gas-')) {
        this.gasPriceCache.delete(key.replace('gas-', ''));
      } else if (key.startsWith('status-')) {
        this.networkStatusCache.delete(key.replace('status-', ''));
      } else {
        this.priceCache.delete(key);
      }
    });
  }
}

module.exports = ExternalDataService;
