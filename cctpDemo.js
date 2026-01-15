const { ethers } = require("ethers");
const BridgeService = require("./services/BridgeService");
const UserWallet = require("./services/userWallet");
const axios = require("axios");
const ERC20ABI = require("./config/erc20.json");

const { getChainConfig } = require("./config/cctp/testnet");

// const host = "http://127.0.0.1:14042";
const host = "https://api.fxwallet.in";
const quoteApi = "/bridge/quote";
const executeApi = "/bridge/execute";
const txDetailApi = "/bridge/record";

const serviceApi = "https://iris-api-sandbox.circle.com/v2";

const ABI = [
  {
    type: "function",
    name: "depositForBurn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "localDomain",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
  },

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

// ------- 配置区 -------
// 钱包私钥（测试用，千万不要把真实私钥提交到线上）
const PRIVATE_KEY =
  "0xcb28292e69f20f36a8eff9f848c935b44fa9d84f2de1f4f29990e2affb5f91c8";

// 网络配置
const networks = {
  arbTestnet: {
    chainId: 421614,
    rpc: "https://arbitrum-sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876",
    domain: 3,
  },
  ethTestnet: {
    chainId: 11155111,
    rpc: "https://sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876",
    domain: 0,
  },
  baseTestnet: {
    chainId: 84532,
    rpc: "https://base-sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876",
    domain: 6,
  },
};

const wallet = new UserWallet(PRIVATE_KEY);
const userAddress = wallet.address;
const recipientAddress = wallet.address; // 接收者地址

const baseUsdc = {
  chain: "base_sepolia",
  address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

const arbUsdc = {
  chain: "arb_sepolia",
  address: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
};

const ethUsdc = {
  chain: "sepolia",
  address: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
};

// 根据链名称获取对应的网络配置
function getNetworkByChainName(chainName) {
  const chainToNetwork = {
    sepolia: networks.ethTestnet,
    arb_sepolia: networks.arbTestnet,
    base_sepolia: networks.baseTestnet,
  };
  return chainToNetwork[chainName] || networks.ethTestnet;
}

function getChainIdByChainName(chainName) {
  const chainToId = {
    sepolia: networks.ethTestnet.chainId,
    arb_sepolia: networks.arbTestnet.chainId,
    base_sepolia: networks.baseTestnet.chainId,
  };
  return chainToId[chainName] || networks.ethTestnet.chainId;
}

// ----------------------

const fromToken = arbUsdc;

const toToken = baseUsdc;

const transferType = "fast";
const finalityThreshold = transferType === "fast" ? 1000 : 2000;
let bridgeName = "cctp testnet bridge";
if (transferType === "fast") {
  bridgeName = "cctp (fast) testnet bridge";
}

async function main() {
  const requestData = {
    user_address: wallet.address,
    from_chain: fromToken.chain,
    from_token_address: fromToken.address,
    to_token_address: toToken.address,
    to_chain: toToken.chain,
    amount: "1",
    bridge: bridgeName,
  };
  console.log(requestData);

  const cctpFromChainConfig = getChainConfig(
    getChainIdByChainName(requestData.from_chain)
  );

  const cctpToChainConfig = getChainConfig(
    getChainIdByChainName(toToken.chain)
  );

  const network = getNetworkByChainName(requestData.from_chain);

  const provider = new ethers.JsonRpcProvider(network.rpc);

  // // 准备跨链交易

  // const bridgeData = await axios.post(`${host}${quoteApi}`, requestData);
  // const bridgeTx = bridgeData.data.quotes[0].unsigned_tx[0];
  // console.log(bridgeTx);
  // await approve(fromToken, bridgeTx.to, network);

  // // 发送跨链交易
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

  // 领取
  const hash =
    "0x8f6d1d7df29d756c50f218a3a9cd8742e63aee3856b7a8e2a3c7bd81aae02212";
  const txDetail = await axios.get(`${host}${txDetailApi}`, {
    params: {
      user_address: userAddress,
      hash: hash,
    },
  });
  const claimTx = txDetail.data.record.unsigned_tx;
  console.log(claimTx);
  const claimNetwork = getNetworkByChainName(toToken.chain);
  const finalizedClaimTx = await finalizeTransaction(claimTx, claimNetwork);
  const signedClaimTx = await wallet.signTransaction(finalizedClaimTx);

  const claimData = {
    bridge: bridgeName,
    user_address: userAddress,
    from_hex: hash,
    signed_tx: signedClaimTx,
    from_chain: fromToken.chain,
    from_token_address: fromToken.address,
    to_token_address: toToken.address,
    to_chain: toToken.chain,
    type: "claim",
  };
  console.log(claimData);
  const claimTxResult = await axios.post(`${host}${executeApi}`, claimData);
  console.log(claimTxResult);
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

async function burnUSDC(requestData, provider) {
  const bridgeAddress = requestData.bridgeAddress;
  const domain = requestData.domain;
  const contract = new ethers.Contract(bridgeAddress, ABI, provider);

  // Bytes32 Formatted Parameters
  const DESTINATION_ADDRESS_BYTES32 = `0x000000000000000000000000${requestData.user_address.slice(
    2
  )}`;

  const DESTINATION_CALLER_BYTES32 =
    "0x0000000000000000000000000000000000000000000000000000000000000000"; // Empty bytes32 allows any address to call MessageTransmitterV2.receiveMessage()
  const amount = ethers.parseUnits(requestData.amount, 6);
  const maxFee = ethers.parseUnits("0.0001", 6); // 默认fee

  console.log([
    amount,
    domain,
    DESTINATION_ADDRESS_BYTES32,
    fromToken.address,
    DESTINATION_CALLER_BYTES32,
    maxFee,
    finalityThreshold, // minFinalityThreshold (1000 or less for Fast Transfer)
  ]);

  const data = contract.interface.encodeFunctionData("depositForBurn", [
    amount,
    domain,
    DESTINATION_ADDRESS_BYTES32,
    fromToken.address,
    DESTINATION_CALLER_BYTES32,
    maxFee,
    finalityThreshold, // minFinalityThreshold (1000 or less for Fast Transfer)
  ]);

  return {
    to: bridgeAddress,
    data: data,
    value: 0,
    from: userAddress,
  };
}

async function mintUSDC(attestation, contractAddress) {
  const contract = new ethers.Contract(contractAddress, ABI);
  const mintTx = {
    to: contractAddress,
    data: contract.interface.encodeFunctionData("receiveMessage", [
      attestation.message,
      attestation.attestation,
    ]),
    value: 0,
    from: userAddress,
  };
  return mintTx;
}

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

async function getFee(options) {
  const url = `${serviceApi}/burn/USDC/fees/${options.sourceDomainId}/${options.destDomainId}`;
  const response = await axios.get(url);
  return response.data;
}

// 如果直接运行此文件，则执行演示
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
