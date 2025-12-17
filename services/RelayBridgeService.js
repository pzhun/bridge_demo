const axios = require("axios");
const { ethers } = require("ethers");

/**
 * Relay API 跨链桥服务
 * 支持通过 Relay.link API 进行跨链转账
 */
class RelayBridgeService {
  constructor(networks) {
    this.networks = networks;
    // this.relayQuoteUrl = "https://api.relay.link/quote";
    this.relayQuoteUrl = "https://api.testnets.relay.link";
    this.providers = {};

    // 初始化各个链的 provider
    if (networks) {
      Object.keys(networks).forEach((chainName) => {
        const network = networks[chainName];
        if (network.rpc) {
          this.providers[chainName] = new ethers.JsonRpcProvider(network.rpc);
        }
      });
    }
  }
  // https://api.testnets.relay.link/intents/status?requestId=0x73f6dded3fa46e0d9ee31f54ea21b011f87259957eaccac698e070f2e9c07a1c
  // 0x4b817363d398d8a376c5461fcd5ab0414c2273f1d668815e67f716a8914a1606
  /**
   * 创建跨链转账交易
   */
  async createBridgeTransaction(requestData) {
    try {
      this.validateRequestData(requestData);

      // 获取报价
      const quote = await this.getQuote(requestData);

      const details = quote.details;
      const { currencyIn, currencyOut } = details;
      const fees = quote.fees || {};

      // 构建 unsigned_tx 数组
      const unsignedTx = [];
      let bridgeAddress = null;
      quote.steps.forEach((step) => {
        step.items.forEach((item) => {
          if (item.data) {
            unsignedTx.push(item.data);
          }
        });
      });

      // 获取链名称
      const fromChainName = "";
      const toChainName = "";

      // 构建 from_token
      const fromToken = {
        name: currencyIn.name,
        symbol: currencyIn.currency.symbol,
        icon: currencyIn.currency.metadata?.logoURI,
        address: currencyIn.currency.address,
        chain: fromChainName,
      };

      // 构建 to_token
      const toToken = {
        name: currencyOut.name,
        symbol: currencyOut.currency.symbol,
        icon: currencyOut.currency.metadata?.logoURI,
        address: currencyOut.currency.address,
        chain: toChainName,
      };

      // 构建 fee_info
      const feeInfo = {};
      if (fees.relayer) {
        const relayerCurrency = fees.relayer.currency;
        feeInfo.relay_bridge = {
          fee: fees.relayer.amountFormatted || "0",
          fee_token: {
            name: relayerCurrency.name,
            symbol: relayerCurrency.symbol,
            icon: relayerCurrency.metadata?.logoURI || null,
            address: relayerCurrency.address,
            chain: fromChainName,
          },
        };
      }

      // 构建结果对象
      const result = {
        bridge_id: 2, // Relay bridge ID
        bridge: "relay bridge",
        bridge_address:
          bridgeAddress || "0x0000000000000000000000000000000000000000",
        bridge_icon: null,
        amount: currencyIn.amountFormatted || "0",
        to_amount: currencyOut.amountFormatted || "0",
        lock_period: 0, // Relay 通常不需要锁定期
        waiting_period: 0,
        fee_info: feeInfo,
        is_need_claim: false, // Relay 通常不需要手动 claim
        from_token: fromToken,
        to_token: toToken,
        unsigned_tx: unsignedTx,
      };

      // 如果只有一个交易，直接返回；如果有多个，返回数组
      return result;
    } catch (error) {
      console.error("❌ 创建 Relay 跨链交易失败:", error.message);
      throw error;
    }
  }

  /**
   * 验证请求数据
   */
  validateRequestData(requestData) {
    const required = [
      "userAddress",
      "originChainId",
      "destinationChainId",
      "srcToken",
    ];
    for (const field of required) {
      if (!requestData[field]) {
        throw new Error(`缺少必需字段: ${field}`);
      }
    }

    if (
      !requestData.srcToken.amount ||
      parseFloat(requestData.srcToken.amount) <= 0
    ) {
      throw new Error("转账金额必须大于0");
    }

    // 验证用户地址
    if (!ethers.isAddress(requestData.userAddress)) {
      throw new Error(`无效的用户地址: ${requestData.userAddress}`);
    }
  }

  /**
   * 从 Relay API 获取报价
   */
  async getQuote(requestData) {
    try {
      const amount = ethers.parseEther(requestData.srcToken.amount).toString();

      const quoteRequest = {
        user: requestData.userAddress,
        originChainId: requestData.originChainId,
        destinationChainId: requestData.destinationChainId,
        originCurrency: requestData.srcToken.address || ethers.ZeroAddress,
        destinationCurrency:
          requestData.destToken?.address || ethers.ZeroAddress,
        amount: amount,
        tradeType: "EXACT_INPUT",
        recipient: requestData.recipientAddress || requestData.userAddress,
        // 可选字段
        useDepositAddress: false,
        useExternalLiquidity: false,
      };

      const response = await axios.post(
        `${this.relayQuoteUrl}/quote`,
        quoteRequest
      );

      if (!response.data) {
        throw new Error("Relay API 返回空数据");
      }

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(
          `Relay API 请求失败: ${error.response.status} - ${JSON.stringify(
            error.response.data
          )}`
        );
      }
      throw new Error(`获取 Relay 报价失败: ${error.message}`);
    }
  }

  /**
   * 完成交易配置
   */
  async finalizeTransaction(unsignedTx, requestData) {
    // 根据 originChainId 找到对应的 provider
    const chainName = this.findChainNameByChainId(requestData.originChainId);
    if (!chainName || !this.providers[chainName]) {
      throw new Error(
        `未找到链 ID ${requestData.originChainId} 对应的 provider`
      );
    }

    const provider = this.providers[chainName];
    const nonce = await provider.getTransactionCount(requestData.userAddress);
    const gasLimit =
      unsignedTx.gasLimit || (await provider.estimateGas(unsignedTx));
    const gasPrice = await provider.getFeeData();
    const maxFeePerGas = gasPrice.maxFeePerGas;
    const maxPriorityFeePerGas = gasPrice.maxPriorityFeePerGas;

    return {
      ...unsignedTx,
      type: 2, // EIP-1559
      from: requestData.userAddress,
      chainId: requestData.originChainId,
      nonce,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };
  }

  /**
   * 根据 chainId 查找链名称
   */
  findChainNameByChainId(chainId) {
    if (!this.networks) return null;

    for (const [chainName, network] of Object.entries(this.networks)) {
      if (network.chainId === chainId) {
        return chainName;
      }
    }
    return null;
  }

  /**
   * 根据 chainId 获取链名称（用于格式化输出）
   */
  getChainNameByChainId(chainId) {
    // 常见的 chainId 映射
    const chainIdMap = {
      1: "ethereum",
      11155111: "sepolia",
      42161: "arbitrum",
      421614: "arb_sepolia",
      8453: "base",
      84532: "base_sepolia",
      56: "bsc",
      97: "bsc_testnet",
      137: "polygon",
      80001: "polygon_mumbai",
    };

    // 先从 networks 配置中查找
    const chainName = this.findChainNameByChainId(chainId);
    if (chainName) {
      // 将链名称转换为小写，并处理常见的命名格式
      return chainName.toLowerCase().replace("testnet", "_testnet");
    }

    // 如果 networks 中没有，使用预定义的映射
    return chainIdMap[chainId] || null;
  }

  /**
   * 监听跨链结果
   * Relay API 通常不需要手动 claim，但我们可以监听交易状态
   */
  async listenBridgeResult(requestData) {
    try {
      const { requestId } = requestData;

      if (!requestId) {
        throw new Error("缺少 requestId");
      }

      const response = await axios.get(
        `${this.relayQuoteUrl}/intents/status/v3`,
        {
          params: {
            requestId: requestId,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("监听 Relay 跨链结果失败:", error.message);
      throw error;
    }
  }

  /**
   * Relay API 通常不需要手动 claim
   * 但为了接口一致性，保留此方法
   */
  async claimBridgeResult(requestData) {
    throw new Error("Relay API 桥接不需要手动 claim，跨链会自动完成");
  }

  /**
   * 生成交易ID
   */
  generateTransactionId() {
    return (
      "relay_bridge_" +
      Date.now() +
      "_" +
      Math.random().toString(36).substr(2, 9)
    );
  }
}

module.exports = RelayBridgeService;
