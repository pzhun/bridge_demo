const { ethers } = require("ethers");
const { EthBridger } = require("@arbitrum/sdk");
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
    this.ethBridger = new EthBridger(networks.arbitrum.chainId);
    this.abi = ["function depositEth() payable returns (uint256)"];
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
      const contract = new ethers.Contract(
        requestData.bridgeAddress,
        this.abi,
        this.arbitrumProvider
      );
      const amount = ethers.parseEther(requestData.srcToken.amount);
      let unsignedTx = {};

      switch (requestData.chain) {
        case this.supportChain.arbitrum:
          unsignedTx = await contract.depositEth.populateTransaction({
            value: amount,
          });
          unsignedTx.chainId = this.arbitrumChainId;
          break;
        case this.supportChain.ethereum:
          unsignedTx = await contract.depositEth.populateTransaction({
            value: amount,
          });
          unsignedTx.chainId = this.ethereumChainId;
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
      unsignedTx.maxFeePerGas = ethers.parseUnits("1.5", "gwei");
      unsignedTx.maxPriorityFeePerGas = ethers.parseUnits("1", "gwei");
      unsignedTx.from = requestData.userAddress;
      unsignedTx.gasLimit = 200000;

      return unsignedTx;
    } catch (error) {
      console.error("❌ 创建跨链交易失败:", error.message);
      throw error;
    }
  }

  // 监听跨链结果
  async listenBridgeResult(transactionHash) {
    const receipt = await this.ethBridger.listenBridgeResult(transactionHash);
    return receipt;
  }
  catch(error) {
    console.error("❌ 监听跨链结果失败:", error.message);
    throw error;
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
