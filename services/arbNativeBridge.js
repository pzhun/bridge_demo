const { ethers } = require("ethers");
const { providers } = require("ethers5");
const {
  ChildTransactionReceipt,
  ChildToParentMessageStatus,
} = require("@arbitrum/sdk");

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
      {
        inputs: [
          { internalType: "bytes32[]", name: "proof", type: "bytes32[]" },
          { internalType: "uint256", name: "index", type: "uint256" },
          { internalType: "address", name: "l2Sender", type: "address" },
          { internalType: "address", name: "to", type: "address" },
          { internalType: "uint256", name: "l2Block", type: "uint256" },
          { internalType: "uint256", name: "l1Block", type: "uint256" },
          { internalType: "uint256", name: "l2Timestamp", type: "uint256" },
          { internalType: "uint256", name: "value", type: "uint256" },
          { internalType: "bytes", name: "data", type: "bytes" },
        ],
        name: "executeTransaction",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
      "event InboxMessageDelivered(uint256 indexed messageNum, bytes data)",
    ];
    this.networks = networks;
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
    const chainId = requestData.chainId;
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
    const result = {
      claimed: false, // 是否已经被claim
      claimable: false, // 是否可以被claim
    };
    /**
     * First, let's find the transaction from the transaction hash provided
     */
    const receipt = await this.arbitrumProvider.getTransactionReceipt(
      requestData.hash
    );
    const transactionReceipt = new ChildTransactionReceipt(receipt);

    // 转换为arb sdk 可用的对象
    const ether5L1Provider = new providers.JsonRpcProvider(
      this.networks.ethereum.rpc
    );

    const ether5L2Provider = new providers.JsonRpcProvider(
      this.networks.arbitrum.rpc
    );

    const messages = await transactionReceipt.getChildToParentMessages(
      ether5L1Provider
    );
    const childToParentMessage = messages[0];

    if (
      (await childToParentMessage.status(ether5L2Provider)) ==
      ChildToParentMessageStatus.EXECUTED
    ) {
      result.claimed = true;
      return result;
    }

    const timeToWaitMs = 1000 * 60;
    await childToParentMessage.waitUntilReadyToExecute(
      ether5L2Provider,
      timeToWaitMs
    );
    result.claimable = true;

    const proof = await childToParentMessage.getOutboxProof(ether5L2Provider);
    const event = childToParentMessage.nitroReader.event;
    result.data = {
      bridgeAddress: requestData.bridgeAddress,
      proof: proof,
      index: event.position.toString(),
      l2Sender: event.caller,
      to: event.destination,
      l2Block: event.arbBlockNum.toString(),
      l1Block: event.ethBlockNum.toString(),
      l2Timestamp: event.timestamp.toString(),
      value: event.callvalue.toString(),
      data: event.data,
    };

    return result;
  }

  async claimBridgeResult(requestData) {
    try {
      const l1Contract = new ethers.Contract(
        requestData.bridgeAddress,
        this.abi,
        this.ethereumProvider
      );

      // 构建待签名的交易数据
      const unsignedTx =
        await l1Contract.executeTransaction.populateTransaction(
          requestData.proof,
          requestData.index,
          requestData.l2Sender,
          requestData.to,
          requestData.l2Block,
          requestData.l1Block,
          requestData.l2Timestamp,
          requestData.value,
          requestData.data
        );

      return await this.finalizeTransaction(unsignedTx, requestData);
    } catch (error) {
      console.error("❌ 准备 claim 数据失败:", error.message);
      throw error;
    }
  }

  async getSequenceNumber(l2hash, bridgeAddress) {
    const receipt = await this.arbitrumProvider.getTransactionReceipt(l2hash);

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === bridgeAddress.toLowerCase()) {
        const sequenceNumber = BigInt(log.topics[3]).toString();
        return sequenceNumber;
      }
    }
    throw new Error("L2ToL1Tx not found in this tx");
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
          ticketId = parsed.args.messageNum; // 可以对应 Retryable Ticket
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
