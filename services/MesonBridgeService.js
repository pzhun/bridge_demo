const axios = require("axios");
const { ethers } = require("ethers");

/**
 * meson API 跨链桥服务
 * 支持通过 meson.link API 进行跨链转账
 */
class mesonBridgeService {
  constructor(networks) {
    this.networks = networks;
    // this.mesonQuoteUrl = "https://api.meson.link/quote";
    this.mesonQuoteUrl = "https://testnet-relayer.meson.fi/api/v1";
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
      // 获取报价
      const quote = await this.getQuote(requestData);
      const fromToken = {};
      const toToken = {};

      // 构建 unsigned_tx 数组
      const unsignedTx = [quote.tx];

      // 构建 fee_info
      const feeInfo = {
        meson_bridge: {
          service_fee: quote.fees?.serviceFee || "0",
          lp_fee: quote.fees?.lpFee || "0",
          fee_token: fromToken,
        },
      };

      const to_amount =
        parseFloat(requestData.amount) -
        parseFloat(quote.fees?.totalFee || "0");

      // 构建结果对象
      const result = {
        bridge_id: 3, // meson bridge ID
        bridge: "meson bridge",
        bridge_address: quote.tx.to,
        bridge_icon: null,
        amount: requestData.amount,
        to_amount: to_amount,
        lock_period: 0, // meson 通常不需要锁定期
        waiting_period: 0,
        fee_info: feeInfo,
        is_need_claim: false, // meson 通常不需要手动 claim
        from_token: fromToken,
        to_token: toToken,
        unsigned_tx: unsignedTx,
      };

      // 如果只有一个交易，直接返回；如果有多个，返回数组
      return result;
    } catch (error) {
      console.error("❌ 创建 meson 跨链交易失败:", error.message);
      throw error;
    }
  }

  getFee(options) {
    // const { fees, fromToken } = options;
    // const { mesonerService, mesonerGas, app } = fees;

    // const feeInfo = {
    //   meson_bridge: {
    //     service_fee: mesonerService?.amountFormatted || "0",
    //     gas_fee: mesonerGas?.amountFormatted || "0",
    //     fromToken,
    //   },
    //   fx_service_fee: {
    //     fee: app?.amountFormatted || "0",
    //     fromToken,
    //   },
    // };

    return feeInfo;
  }

  /**
   * 从 meson API 获取报价
   */
  async getQuote(requestData) {
    try {
      const amount = requestData.amount;

      const fromTokenId = await this.findMesonId({
        chainName: requestData.from_chain,
        address: requestData.from_token_address,
      });
      const toTokenId = await this.findMesonId({
        chainName: requestData.to_chain,
        address: requestData.to_token_address,
      });

      let quoteRequest = {
        from: fromTokenId,
        to: toTokenId,
        amount: amount,
        fromAddress: requestData.user_address,
        recipient: requestData.user_address,
      };

      console.log(quoteRequest);

      quoteRequest = {
        from: "arb-sepolia:usdc",
        to: "sepolia:usdc",
        amount: "1",
        fromAddress: "0x565d4ba385fc4e3c1b07ce078682c84719475e76",
        recipient: "0x565d4ba385fc4e3c1b07ce078682c84719475e76",
      };

      const response = await axios.post(
        `${this.mesonQuoteUrl}/swap`,
        quoteRequest
      );

      console.log(response);

      if (!response.data) {
        throw new Error("meson API 返回空数据");
      }

      return response.data.result;
    } catch (error) {
      if (error.response) {
        throw new Error(
          `meson API 请求失败: ${error.response.status} - ${JSON.stringify(
            error.response.data
          )}`
        );
      }
      throw new Error(`获取 meson 报价失败: ${error.message}`);
    }
  }

  async findMesonId(token) {
    const data = [
      {
        id: 171,
        name: "arb_sepolia",
        symbol: "eth",
        chainId: 421614,
        nodeUrl:
          "https://arb-sepolia.g.alchemy.com/v2/_EsmcL9t4r5YyrlZKpb9Wx7Tj7__cY3W",
        icon: "https://file.test.fxwallet.com/token/1760001549070-arb.svg",
        tokens: [
          {
            name: "eth",
            symbol: "eth",
            address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
            unit: 18,
            extra_info: {
              meson_token_id: "arb-sepolia:eth",
            },
            isNativeCoin: true,
          },
          {
            name: "usdc",
            symbol: "usdc",
            address: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
            icon: null,
            unit: 6,
            extra_info: {
              meson_token_id: "arb-sepolia:usdc",
            },
            isNativeCoin: false,
          },
        ],
      },
      {
        id: 170,
        name: "sepolia",
        symbol: "eth",
        chainId: 11155111,
        nodeUrl:
          " https://sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876",
        icon: "https://file.test.fxwallet.com/token/1760001767069-eth.svg",
        tokens: [
          {
            name: "eth",
            symbol: "eth",
            address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
            unit: 18,
            extra_info: {
              meson_token_id: "sepolia:eth",
            },
            isNativeCoin: true,
          },
          {
            name: "usdc",
            symbol: "usdc",
            address: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
            icon: null,
            unit: 6,
            extra_info: {
              meson_token_id: "sepolia:usdc",
            },
            isNativeCoin: false,
          },
        ],
      },
    ];

    const chain = data.find((c) => c.name === token.chainName);
    const tokenInfo = chain.tokens.find(
      (t) => t.address.toLowerCase() === token.address.toLowerCase()
    );
    return tokenInfo.extra_info.meson_token_id;
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
   * meson API 通常不需要手动 claim，但我们可以监听交易状态
   */
  async listenBridgeResult(requestData) {
    try {
      const { requestId } = requestData;

      if (!requestId) {
        throw new Error("缺少 requestId");
      }

      const response = await axios.get(
        `${this.mesonQuoteUrl}/intents/status/v3`,
        {
          params: {
            requestId: requestId,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("监听 meson 跨链结果失败:", error.message);
      throw error;
    }
  }

  /**
   * meson API 通常不需要手动 claim
   * 但为了接口一致性，保留此方法
   */
  async claimBridgeResult(requestData) {
    throw new Error("meson API 桥接不需要手动 claim，跨链会自动完成");
  }

  /**
   * 生成交易ID
   */
  generateTransactionId() {
    return (
      "meson_bridge_" +
      Date.now() +
      "_" +
      Math.random().toString(36).substr(2, 9)
    );
  }
}

module.exports = mesonBridgeService;
