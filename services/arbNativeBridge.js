const { ethers } = require("ethers");
/**
 * Arbitrum 原生代币跨链桥服务
 * 支持从 Arbitrum 跨链到 Ethereum
 */
class ArbNativeBridge {
  constructor(networks) {
    // 不再硬编码 bridge 地址，从 requestData 中获取
    this.supportChain = {
      arbitrum: "arbitrum",
      ethereum: "ethereum",
    };
    this.abi = [
      {
        inputs: [
          { internalType: "address", name: "destAddr", type: "address" },
          { internalType: "uint256", name: "l2CallValue", type: "uint256" },
          {
            internalType: "uint256",
            name: "maxSubmissionCost",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "excessFeeRefundAddress",
            type: "address",
          },
          {
            internalType: "address",
            name: "callValueRefundAddress",
            type: "address",
          },
          { internalType: "uint256", name: "maxGas", type: "uint256" },
          { internalType: "uint256", name: "maxFeePerGas", type: "uint256" },
          { internalType: "bytes", name: "data", type: "bytes" },
        ],
        name: "createRetryableTicket",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "payable",
        type: "function",
      },
      {
        inputs: [
          { internalType: "address", name: "destination", type: "address" },
        ],
        name: "withdrawEth",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "nonpayable",
        type: "function",
      },
      "event InboxMessageDelivered(uint256 indexed messageNum, bytes data)",
    ];
    this.arbitrumProvider = new ethers.JsonRpcProvider(networks.arbitrum.rpc);
    this.arbitrumChainId = networks.arbitrum.chainId;
    this.ethereumProvider = new ethers.JsonRpcProvider(networks.ethereum.rpc);
    this.ethereumChainId = networks.ethereum.chainId;
    this.providers = {
      arbitrum: this.arbitrumProvider,
      ethereum: this.ethereumProvider,
    };
  }

  /**
   * 创建跨链转账交易
   */
  async createBridgeTransaction(requestData) {
    try {
      this.validateRequestData(requestData);

      const amount = ethers.parseEther(requestData.srcToken.amount);

      const transactionConfig = {
        amount,
        userAddress: requestData.userAddress,
        bridgeAddress: requestData.bridgeAddress,
      };
      let unsignedTx;
      switch (requestData.chain) {
        case this.supportChain.arbitrum:
          unsignedTx = await this.createArbitrumToEthereumTx(transactionConfig);
          break;
        case this.supportChain.ethereum:
          unsignedTx = await this.createEthereumToArbitrumTx(transactionConfig);
          break;
        default:
          throw new Error(`不支持的链: ${requestData.chain}`);
      }

      return await this.finalizeTransaction(unsignedTx, requestData);
    } catch (error) {
      console.error("❌ 创建跨链交易失败:", error.message);
      throw error;
    }
  }

  /**
   * 验证请求数据
   */
  validateRequestData(requestData) {
    const required = ["userAddress", "bridgeAddress", "srcToken"];
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

    // 验证桥接合约地址
    if (!ethers.isAddress(requestData.bridgeAddress)) {
      throw new Error(`无效的桥接合约地址: ${requestData.bridgeAddress}`);
    }
  }

  /**
   * 获取Gas数据
   */
  async getGasData() {
    const [l1GasData, l2GasData] = await Promise.all([
      this.ethereumProvider.getFeeData(),
    ]);
    return [l1GasData, l2GasData];
  }

  /**
   * 创建从Arbitrum到Ethereum的交易
   */
  async createArbitrumToEthereumTx(config) {
    const contract = new ethers.Contract(
      config.bridgeAddress,
      this.abi,
      this.providers.arbitrum
    );

    const unsignedTx = await contract.withdrawEth.populateTransaction(
      config.userAddress,
      { value: config.amount }
    );

    return unsignedTx;
  }

  /**
   * 创建从Ethereum到Arbitrum的交易
   */
  async createEthereumToArbitrumTx(config) {
    const contract = new ethers.Contract(
      config.bridgeAddress,
      this.abi,
      this.providers.ethereum
    );

    const retryableTicketParams = await this.calculateRetryableTicketParams(
      config
    );

    const unsignedTx = await contract.createRetryableTicket.populateTransaction(
      retryableTicketParams.toAddress,
      retryableTicketParams.l2CallValue,
      retryableTicketParams.maxSubmissionCost,
      retryableTicketParams.excessFeeRefundAddress,
      retryableTicketParams.callValueRefundAddress,
      retryableTicketParams.gasLimit,
      retryableTicketParams.maxFeePerGas,
      retryableTicketParams.data,
      { value: retryableTicketParams.totalValue }
    );

    return unsignedTx;
  }

  /**
   * 计算RetryableTicket参数
   */
  async calculateRetryableTicketParams(config) {
    const l2GasData = await this.arbitrumProvider.getFeeData();
    const data = "0x";
    const calldataSize = data.length / 2;
    const dataGasPerByte = 16;
    const calldataCost =
      l2GasData.maxFeePerGas * BigInt(calldataSize) * BigInt(dataGasPerByte);

    const maxSubmissionCost = calldataCost;
    const gasLimit = 27514; // 固定值，也可以动态计算
    const l2ExecutionCost = BigInt(gasLimit) * l2GasData.maxFeePerGas;
    const totalValue = config.amount + maxSubmissionCost + l2ExecutionCost;

    return {
      toAddress: config.userAddress,
      l2CallValue: config.amount,
      maxSubmissionCost,
      excessFeeRefundAddress: config.userAddress,
      callValueRefundAddress: config.userAddress,
      gasLimit,
      maxFeePerGas: l2GasData.maxFeePerGas,
      data,
      totalValue,
    };
  }

  /**
   * 完成交易配置
   */
  async finalizeTransaction(unsignedTx, requestData) {
    const provider = this.providers[requestData.chain];
    const chainId = requestData.chian_id;
    const nonce = await provider.getTransactionCount(requestData.userAddress);
    const gasLimit = await provider.estimateGas(unsignedTx);
    const gasPrice = await provider.getFeeData();
    const maxFeePerGas = gasPrice.maxFeePerGas;
    const maxPriorityFeePerGas = gasPrice.maxPriorityFeePerGas;
    return {
      ...unsignedTx,
      type: 2, // EIP-1559
      from: requestData.userAddress,
      chainId,
      nonce,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };
  }

  // 监听跨链结果
  async listenBridgeResult(requestData) {
    try {
      await this.listenRetryableTicket(requestData);
    } catch (error) {
      console.error("❌ 监听跨链结果失败:", error.message);
      throw error;
    }
  }

  async listenRetryableTicket(requestData) {
    // 1️⃣ 获取 L1 交易 receipt
    const receipt = await this.ethereumProvider.getTransactionReceipt(
      requestData.hash
    );
    if (!receipt) {
      console.log("L1 tx not yet mined.");
      return;
    }

    let ticketId = null;

    // 2️⃣ 解析 logs，找到 InboxMessageDelivered 事件
    const iface = new ethers.Interface(this.abi);
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === requestData.bridgeAddress.toLowerCase()
      ) {
        try {
          const parsed = iface.parseLog(log);
          const ticketId = parsed.args.messageNum; // 可以对应 Retryable Ticket
          ticketId = ticketId;
        } catch (err) {}
      }
    }
    console.log(ticketId);
  }

  /**
   * 生成交易ID
   */
  generateTransactionId() {
    return (
      "arb_bridge_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)
    );
  }
}

module.exports = ArbNativeBridge;
