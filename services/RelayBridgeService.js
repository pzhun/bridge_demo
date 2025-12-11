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

      console.log(JSON.stringify(quote, null, 2));

      const items = quote.steps[0].items;

      // 处理多个交易（Relay 可能返回多个交易需要依次执行）
      const transactions = [];
      for (const item of items) {
        const tx = item.data;
        const unsignedTx = {
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : 0n,
          gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
        };

        transactions.push(unsignedTx);
      }

      const result = {
        unsignedTx: transactions.length === 1 ? transactions[0] : transactions,
        requestId: quote.steps[0].requestId,
        feeInfo: quote.fees,
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

      console.log(JSON.stringify(quoteRequest, null, 2));

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
   * 监听跨链结果
   * Relay API 通常不需要手动 claim，但我们可以监听交易状态
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
        throw new Error(`未找到链 ID ${originChainId} 对应的 provider`);
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
        // 交易成功，Relay 会自动处理跨链，可能需要等待一段时间
        return {
          status: "success",
          claimed: true,
          claimable: false,
          l1TxHash: hash,
          message: "跨链交易已成功提交，Relay 正在处理跨链",
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
