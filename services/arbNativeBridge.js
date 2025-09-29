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
    ];
    this.arbitrumProvider = new ethers.JsonRpcProvider(networks.arbitrum.rpc);
    this.arbitrumChainId = networks.arbitrum.chainId;
    this.ethereumProvider = new ethers.JsonRpcProvider(networks.ethereum.rpc);
    this.ethereumChainId = networks.ethereum.chainId;
  }

  /**
   * 创建跨链转账交易
   */
  async createBridgeTransaction(requestData) {
    try {
      const amount = ethers.parseEther(requestData.srcToken.amount);
      const toAddress = requestData.userAddress;
      const l2CallValue = amount;
      const excessFeeRefundAddress = requestData.userAddress;
      const callValueRefundAddress = requestData.userAddress;
      const data = "0x";

      const l1gasPrice = await this.ethereumProvider.getFeeData();
      const l2gasPrice = await this.arbitrumProvider.getFeeData();

      let unsignedTx = {};

      switch (requestData.chain) {
        case this.supportChain.arbitrum:
          unsignedTx = await contract.depositEth.populateTransaction({
            value: amount,
          });
          unsignedTx.chainId = this.arbitrumChainId;
          break;
        case this.supportChain.ethereum:
          const contract = new ethers.Contract(
            requestData.bridgeAddress,
            this.abi,
            this.ethereumProvider
          );
          const maxFeePerGas = l2gasPrice.maxFeePerGas;

          const calldataSize = data.length / 2; // bytes
          const dataGasPerByte = 16;
          const calldataCost =
            l2gasPrice.maxFeePerGas *
            BigInt(calldataSize) *
            BigInt(dataGasPerByte);

          const maxSubmissionCost = calldataCost;

          // L2 执行 gas
          const gasLimit = 27514; // 或用 estimateGas 计算
          const l2ExecutionCost = BigInt(gasLimit) * maxFeePerGas;

          // L1 发送总金额
          const totalValue = l2CallValue + maxSubmissionCost + l2ExecutionCost;

          unsignedTx = await contract.createRetryableTicket.populateTransaction(
            toAddress,
            l2CallValue,
            maxSubmissionCost,
            excessFeeRefundAddress,
            callValueRefundAddress,
            27514,
            maxFeePerGas,
            data,
            { value: totalValue } // ✅ 注意这里必须覆盖所有部分
          );
          unsignedTx.chainId = this.ethereumChainId;
          unsignedTx.gasPrice = l1gasPrice.maxFeePerGas;
          unsignedTx.maxFeePerGas = l1gasPrice.maxFeePerGas;
          unsignedTx.maxPriorityFeePerGas = l1gasPrice.maxPriorityFeePerGas;
          break;
        default:
          throw new Error(`不支持的链: ${requestData.chain}`);
      }

      // 添加必要字段
      const nonce = await this.ethereumProvider.getTransactionCount(
        requestData.userAddress
      );
      unsignedTx.nonce = nonce;
      unsignedTx.type = 2; // EIP-1559
      unsignedTx.from = requestData.userAddress;
      // 估算gaslimit 使用l1的gaslimit
      unsignedTx.gasLimit = 1000000;

      return unsignedTx;
    } catch (error) {
      console.error("❌ 创建跨链交易失败:", error.message);
      throw error;
    }
  }

  // 监听跨链结果
  async listenBridgeResult(transactionHash) {
    try {
      // 暂时返回模拟结果，因为 EthBridger 有问题
      console.log("监听跨链结果:", transactionHash);
      return {
        transactionHash,
        status: "completed",
        message: "跨链交易已完成（模拟结果）",
      };
    } catch (error) {
      console.error("❌ 监听跨链结果失败:", error.message);
      throw error;
    }
  }

  /**
   * 验证请求数据
   */
  validateRequestData(requestData) {
    if (!requestData.address || !ethers.isAddress(requestData.address)) {
      throw new Error("无效的地址");
    }

    if (
      !requestData.bridgeAddress ||
      !ethers.isAddress(requestData.bridgeAddress)
    ) {
      throw new Error("无效的 Bridge 地址");
    }

    if (!requestData.srcToken || !requestData.srcToken.amount) {
      throw new Error("缺少源代币金额");
    }

    if (requestData.srcToken.chain !== this.supportChain[requestData.chain]) {
      throw new Error(`源链必须是 ${this.supportChain[requestData.chain]}`);
    }

    if (requestData.dstToken.chain !== this.supportChain[requestData.chain]) {
      throw new Error(`目标链必须是 ${this.supportChain[requestData.chain]}`);
    }

    if (BigInt(requestData.srcToken.amount) <= 0) {
      throw new Error("转账金额必须大于0");
    }

    // 检查最小转账金额 (0.001 ETH)
    const minAmount = ethers.parseEther("0.001");
    if (BigInt(requestData.srcToken.amount) < minAmount) {
      throw new Error("转账金额不能小于 0.001 ETH");
    }
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
