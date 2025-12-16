const axios = require("axios");
const { ethers } = require("ethers");

/**
 * Across 跨链桥服务
 * 支持通过 Across.to API 进行跨链转账
 */
class AcrossBridgeService {
  constructor(networks) {
    this.networks = networks;
    this.acrossQuoteUrl = "https://across.to/api/v2/quote";
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

  /**
   * 创建跨链转账交易
   */
  async createBridgeTransaction(requestData) {
    try {
      this.validateRequestData(requestData);

      // 获取报价
      const quote = await this.getQuote(requestData);

      // 构造交易
      const unsignedTx = {
        to: quote.relayer,
        data: quote.depositCalldata,
        value: quote.value ? BigInt(quote.value) : 0n,
        gasLimit: 250000n, // 默认 gas limit，也可以从 quote 中获取
      };

      // 完成交易配置
      return await this.finalizeTransaction(unsignedTx, requestData);
    } catch (error) {
      console.error("❌ 创建 Across 跨链交易失败:", error.message);
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

    if (!requestData.srcToken.address) {
      throw new Error("缺少源代币地址");
    }

    if (!requestData.destToken || !requestData.destToken.address) {
      throw new Error("缺少目标代币地址");
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
   * 从 Across API 获取报价
   */
  async getQuote(requestData) {
    try {
      // 处理金额：根据代币精度转换
      // 如果 amount 是字符串格式（如 "1.0"），需要根据代币精度转换
      // 如果 amount 已经是最小单位（如 "1000000"），直接使用
      let originAmount;
      if (requestData.srcToken.decimals !== undefined) {
        // 如果有精度信息，使用 parseUnits
        originAmount = ethers.parseUnits(
          requestData.srcToken.amount,
          requestData.srcToken.decimals
        ).toString();
      } else {
        // 否则假设 amount 已经是最小单位
        originAmount = requestData.srcToken.amount;
      }

      const quoteRequest = {
        originChainId: requestData.originChainId,
        destinationChainId: requestData.destinationChainId,
        originToken: requestData.srcToken.address,
        destinationToken: requestData.destToken.address,
        originAmount: originAmount,
        integratorId: requestData.integratorId || "0x8888",
        // 可选字段
        feeRefundAddress: requestData.feeRefundAddress || requestData.userAddress,
      };

      const response = await axios.post(this.acrossQuoteUrl, quoteRequest);

      if (!response.data) {
        throw new Error("Across API 返回空数据");
      }

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(
          `Across API 请求失败: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        );
      }
      throw new Error(`获取 Across 报价失败: ${error.message}`);
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
    
    // 如果 gasLimit 未设置，尝试估算
    let gasLimit = unsignedTx.gasLimit;
    if (!gasLimit) {
      try {
        gasLimit = await provider.estimateGas(unsignedTx);
      } catch (error) {
        // 如果估算失败，使用默认值
        gasLimit = 250000n;
      }
    }

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
   * 监听跨链结果
   * Across 桥接会自动完成，但我们可以监听交易状态
   */
  async listenBridgeResult(requestData) {
    try {
      const { hash, originChainId, destinationChainId } = requestData;

      if (!hash) {
        throw new Error("缺少交易 hash");
      }

      // 根据 originChainId 找到对应的 provider
      const originChainName = this.findChainNameByChainId(originChainId);
      if (!originChainName || !this.providers[originChainName]) {
        throw new Error(
          `未找到链 ID ${originChainId} 对应的 provider`
        );
      }

      const provider = this.providers[originChainName];
      const receipt = await provider.getTransactionReceipt(hash);

      if (!receipt) {
        return {
          status: "pending",
          message: "交易未找到或未确认",
          l1TxHash: hash,
        };
      }

      // 检查交易状态
      if (receipt.status === 1) {
        // 交易成功，Across 会自动处理跨链
        return {
          status: "success",
          claimed: true,
          claimable: false,
          l1TxHash: hash,
          message: "跨链交易已成功提交，Across 正在处理跨链",
        };
      } else {
        return {
          status: "failed",
          claimed: false,
          claimable: false,
          l1TxHash: hash,
          message: "交易失败",
        };
      }
    } catch (error) {
      console.error("监听 Across 跨链结果失败:", error.message);
      throw error;
    }
  }

  /**
   * Across 桥接不需要手动 claim
   * 但为了接口一致性，保留此方法
   */
  async claimBridgeResult(requestData) {
    throw new Error("Across 桥接不需要手动 claim，跨链会自动完成");
  }

  /**
   * 生成交易ID
   */
  generateTransactionId() {
    return (
      "across_bridge_" +
      Date.now() +
      "_" +
      Math.random().toString(36).substr(2, 9)
    );
  }
}

module.exports = AcrossBridgeService;

