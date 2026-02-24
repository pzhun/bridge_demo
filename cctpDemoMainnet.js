const { ethers } = require("ethers");
const BridgeService = require("./services/BridgeService");
const UserWallet = require("./services/userWallet");
const axios = require("axios");
const ERC20ABI = require("./config/erc20.json");
const config = require("./config/config");

const { isMessageClaimedV2, findClaimTxHashByNonce } = require("./services/cctpClaimStatus");

// 目标链 CCTP MessageTransmitter 主网地址（仅依赖 attestation 时用）
const CCTP_MESSAGE_TRANSMITTER_MAINNET = {
  optimism: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
  arbitrum: "0x4D41f22c5e0e1a0c0e3e8f1a2b3c4d5e6f7a8b9c", // 按实际主网地址替换
  base: "0x4D41f22c5e0e1a0c0e3e8f1a2b3c4d5e6f7a8b9c",
};

// 主网用 https://iris-api.circle.com/v1 ，测试网用 https://iris-api-sandbox.circle.com/v2
const serviceApi = "https://iris-api.circle.com/v2";



// // ------- 配置区 -------
// // 钱包私钥（测试用，千万不要把真实私钥提交到线上）
// const PRIVATE_KEY =
//   "0xcb28292e69f20f36a8eff9f848c935b44fa9d84f2de1f4f29990e2affb5f91c8";

const PRIVATE_KEY = config.wallets.gasPayer.privateKey;

// 网络配置
const networks = {
  arb: {
    chainId: 42161,
    rpc: "https://arbitrum-mainnet.infura.io/v3/f0443451e6034c60830c9ca206431876",
  },
  opt: {
    chainId: 10,
    rpc: "https://opt-mainnet.g.alchemy.com/v2/_EsmcL9t4r5YyrlZKpb9Wx7Tj7__cY3W",
  },
};

const wallet = new UserWallet(PRIVATE_KEY);
const userAddress = wallet.address;
const recipientAddress = wallet.address; // 接收者地址



const arbUsdc = {
  chain: "arbitrum",
  address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
};

const optUsdc = {
  chain: "optimism",
  address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
};

// 根据链名称获取对应的网络配置
function getNetworkByChainName(chainName) {
  const chainToNetwork = {
    optimism: networks.opt,
    arbitrum: networks.arb,
  };
  return chainToNetwork[chainName] || networks.opt;
}

function getChainIdByChainName(chainName) {
  const chainToId = {
    optimism: networks.opt.chainId,
    arbitrum: networks.arb.chainId,
  };
  return chainToId[chainName] ?? networks.opt.chainId;
}

/** CCTP 主网 domain：源链 burn 所在链的 domain */
function getCctpDomainByChainName(chainName) {
  const domainByChain = {
    arbitrum: 3,
    optimism: 2,
    ethereum: 0,
    base: 6,
    avalanche: 1,
    polygon: 7,
  };
  return domainByChain[chainName] ?? null;
}

const RECEIVE_MESSAGE_ABI = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [],
  },
];

/** 用 message + attestation 构建 claim 交易（不依赖后端 unsigned_tx） */
function buildClaimTx(messageHex, attestationHex, messageTransmitterAddress, fromAddress) {
  const iface = new ethers.Interface(RECEIVE_MESSAGE_ABI);
  const data = iface.encodeFunctionData("receiveMessage", [messageHex, attestationHex]);
  return {
    to: messageTransmitterAddress,
    data,
    value: 0n,
    from: fromAddress,
  };
}

function getMessageTransmitterAddress(chainName) {
  return CCTP_MESSAGE_TRANSMITTER_MAINNET[chainName] || null;
}

async function getTxBlockTimestamp(provider, txHash) {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt?.blockNumber) {
    throw new Error(`源链交易未确认或未找到: ${txHash}`);
  }
  const block = await provider.getBlock(receipt.blockNumber);
  if (!block?.timestamp) {
    throw new Error(`无法获取源链区块时间: ${receipt.blockNumber}`);
  }
  return { blockNumber: receipt.blockNumber, timestamp: block.timestamp };
}

async function findBlockByTimestamp(provider, targetTimestamp) {
  const latest = await provider.getBlock("latest");
  let low = 0;
  let high = latest.number;
  let best = latest.number;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const blk = await provider.getBlock(mid);
    if (!blk) break;
    if (blk.timestamp === targetTimestamp) {
      return mid;
    }
    if (blk.timestamp < targetTimestamp) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

// ----------------------

const fromToken = arbUsdc;

const toToken = optUsdc;

const transferType = "fast";
let bridgeName = "cctp bridge";
if (transferType === "fast") {
  bridgeName = "cctp (fast) bridge";
}

async function main() {
  const requestData = {
    user_address: wallet.address,
    from_chain: fromToken.chain,
    from_token_address: fromToken.address,
    to_token_address: toToken.address,
    to_chain: toToken.chain,
    amount: "0.1",
    bridge: bridgeName,
  };
  console.log(requestData);



  // // 准备跨链交易

  // const network = getNetworkByChainName(requestData.from_chain);
  // const bridgeData = await axios.post(`${host}${quoteApi}`, requestData);
  // const bridgeTx = bridgeData.data.quotes[0].unsigned_tx[0];
  // console.log(bridgeTx);
  // await approve(fromToken, bridgeTx.to, network);

  // 发送跨链交易
  // const finalizedTx = await finalizeTransaction(bridgeTx, network);
  // const signedTx = await wallet.signTransaction(finalizedTx);
  // const executeData = {
  //   bridge: bridgeName,
  //   user_address: userAddress,
  //   from_chain: requestData.from_chain,
  //   to_chain: requestData.to_chain,
  //   from_token_address: requestData.from_token_address,
  //   to_token_address: requestData.to_token_address,
  //   extra_data: bridgeData.data.quotes[0].extra_data,
  //   signed_tx: signedTx,
  //   type: "execute",
  // };
  // console.log(executeData);
  // const executeTx = await axios.post(`${host}${executeApi}`, executeData);
  // console.log(executeTx);

  // 领取：仅依赖 attestation API，不请求后端 record/unsigned_tx
  const depositTxHash =
    "0x1632919760d7642cbb68f4c88e2a9a1e00d4567ebff2e1b3524e0c01d84670cf";

  // 获取 attention
  const sourceDomainId = getCctpDomainByChainName(fromToken.chain);
  const attestationPayload = await getAttention(sourceDomainId, depositTxHash);

  const claimNetwork = getNetworkByChainName(toToken.chain);
  const provider = new ethers.JsonRpcProvider(claimNetwork.rpc);
  const messageTransmitterAddress =
    getMessageTransmitterAddress(toToken.chain);

  // 判断是否已 claim
  const status = await isMessageClaimedV2({
    provider,
    messageTransmitterAddress,
    nonce: attestationPayload.eventNonce,
  });

  if (status) {
    console.log("该消息已在目标链领取过，无需重复提交。");
    // 用源链 tx 时间戳映射到目标链区块，缩小查询范围
    const sourceProvider = new ethers.JsonRpcProvider(
      getNetworkByChainName(fromToken.chain).rpc
    );
    const { timestamp: sourceTs } = await getTxBlockTimestamp(
      sourceProvider,
      depositTxHash
    );
    const nearBlock = await findBlockByTimestamp(provider, sourceTs);
    const fromBlock = Math.max(nearBlock, 0);
    const toBlock = nearBlock + 2000;
    const claimTxHash = await findClaimTxHashByNonce({
      provider,
      messageTransmitterAddress,
      nonce: attestationPayload.eventNonce,
      fromBlock,
      toBlock,
    });
    console.log("claim 交易 hash:", claimTxHash);
    return;
  }
}

async function sendUnsignedTx(tx, chain) {
  const network = getNetworkByChainName(chain);
  const unsignedTx = await finalizeTransaction(tx, network);
  const signedTx = await wallet.signTransaction(unsignedTx);
  const hash = await wallet.broadcastTransaction(network.rpc, signedTx);
  return hash;
}

async function finalizeTransaction(unsignedTx, network) {
  const provider = new ethers.JsonRpcProvider(network.rpc);
  const nonce = await provider.getTransactionCount(unsignedTx.from);

  // 确保 chainId 正确设置
  const txWithChainId = {
    ...unsignedTx,
    chainId: network.chainId,
  };

  const gasLimit = await provider.estimateGas(txWithChainId);
  const gasPrice = await provider.getFeeData();
  const maxFeePerGas = gasPrice.maxFeePerGas;
  const maxPriorityFeePerGas = gasPrice.maxPriorityFeePerGas;
  return {
    ...txWithChainId,
    type: 2, // EIP-1559
    nonce,
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
}

// 查询是否approve
async function approve(fromToken, contractAddress, network) {
  const provider = new ethers.JsonRpcProvider(network.rpc);
  const erc20Contract = new ethers.Contract(
    fromToken.address,
    ERC20ABI,
    provider
  );

  const allowance = await erc20Contract.allowance(userAddress, contractAddress);
  if (allowance <= 0) {
    const data = erc20Contract.interface.encodeFunctionData("approve", [
      contractAddress,
      ethers.MaxUint256,
    ]);
    const tx = {
      from: userAddress,
      to: fromToken.address,
      data: data,
    };
    const unsignedTx = await finalizeTransaction(tx, network);
    const signedTx = await wallet.signTransaction(unsignedTx);
    const hash = await wallet.broadcastTransaction(network.rpc, signedTx);
    console.log(hash);
  }
}

/**
 * 从 Circle attestation API 获取该笔 deposit 的 message 与 attestation
 * @param {number} sourceDomainId - 源链 CCTP domain（如 Arbitrum=3, Optimism=2）
 * @param {string} hash - 源链 deposit/burn 交易 hash
 * @returns {Promise<{ message: string, attestation: string, eventNonce?: string } | null>} 含 message、attestation，可用于 getClaimStatus 与构建 claim 交易
 */
async function getAttention(sourceDomainId, hash) {
  const url = `${serviceApi}/messages/${sourceDomainId}`;

  const response = await axios.get(url, {
    params: {
      transactionHash: hash,
    },
  });
  const messages = response.data?.messages || [];
  return messages.length > 0 ? messages[0] : null;
}


// 如果直接运行此文件，则执行演示
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
