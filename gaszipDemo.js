const { ethers } = require("ethers");
const UserWallet = require("./services/userWallet");
const axios = require("axios");

// const host = "http://127.0.0.1:14042";
const host = "https://api.fxwallet.in";
const quoteApi = "/bridge/quote";
const executeApi = "/bridge/execute";
const txDetailApi = "/bridge/record";

const serviceApi = "https://backend.gas.zip/v2";

const config = require("./config/config");
const PRIVATE_KEY = config.wallets.gasPayer.privateKey;

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

  arbMainnet: {
    chainId: 42161,
    rpc: "https://arbitrum-mainnet.infura.io/v3/f0443451e6034c60830c9ca206431876",
    domain: 3,
  },
  ethMainnet: {
    chainId: 1,
    rpc: "https://mainnet.infura.io/v3/f0443451e6034c60830c9ca206431876",
  },
  baseMainnet: {
    chainId: 8453,
    rpc: "https://base-mainnet.infura.io/v3/f0443451e6034c60830c9ca206431876",
    domain: 6,
  },
};

const wallet = new UserWallet(PRIVATE_KEY);
const userAddress = wallet.address;
const recipientAddress = wallet.address; // 接收者地址

// 根据链名称获取对应的网络配置
function getNetworkByChainName(chainName) {
  const chainToNetwork = {
    sepolia: networks.ethTestnet,
    arb_sepolia: networks.arbTestnet,
    base_sepolia: networks.baseTestnet,
    arb_mainnet: networks.arbMainnet,
    eth_mainnet: networks.ethMainnet,
    base_mainnet: networks.baseMainnet,
  };
  return chainToNetwork[chainName] || networks.ethTestnet;
}

function getChainIdByChainName(chainName) {
  const chainToId = {
    arb_mainnet: networks.arbMainnet.chainId,
    eth_mainnet: networks.ethMainnet.chainId,
    base_mainnet: networks.baseMainnet.chainId,
  };
  return chainToId[chainName] || networks.ethTestnet.chainId;
}

// ----------------------

const fromToken = {
  chain: "arb_mainnet",
};
const toToken = {
  chain: "base_mainnet",
};

const bridgeName = "gaszip testnet bridge";

async function main() {
  const requestData = {
    user_address: wallet.address,
    from_chain: fromToken.chain,
    to_chain: toToken.chain,
    amount: "0.0001",
    bridge: bridgeName,
  };

  //   const quoteData = await getQuoteData(requestData);
  //   console.log(quoteData);

  //   const feeInfo = getFee(quoteData.quotes[0], requestData.amount);
  //   console.log(feeInfo);

  //   const unsigned_tx = quoteData.contractDepositTxn;
  //   unsigned_tx.from = userAddress;
  //   console.log(unsigned_tx);

  //   const network = getNetworkByChainName(requestData.from_chain);

  //   const provider = new ethers.JsonRpcProvider(network.rpc);

  //   const tx = await finalizeTransaction(unsigned_tx, network);
  //   const signedTx = await wallet.signTransaction(tx);
  //   const hash = await wallet.broadcastTransaction(network.rpc, signedTx);
  //   console.log(hash);

  const hash =
    "0xeb542e8758bf6b5196bf64e8ce9ac0a3f8dd955dd656b035ff78b9362b3c8178";
  const txDetail = await getTxDetail(hash);
  console.log(txDetail);
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

async function getQuote(requestData) {
  // https://backend.gas.zip/v2/quotes/<deposit_chain>/<deposit_wei>/<outbound_chains>

  const fromChainId = getChainIdByChainName(requestData.from_chain);
  const toChainId = getChainIdByChainName(requestData.to_chain);
  const amount = ethers.parseUnits(requestData.amount, 18);
  const url = `${serviceApi}/quotes/${fromChainId}/${amount}/${toChainId}`;
  const response = await axios.get(url);
  return response.data;
}

async function getQuoteData(requestData) {
  const fromChainId = getChainIdByChainName(requestData.from_chain);
  const toChainId = getChainIdByChainName(requestData.to_chain);
  const amount = ethers.parseUnits(requestData.amount, 18);
  const url = `${serviceApi}/quotes/${fromChainId}/${amount}/${toChainId}?to=${requestData.user_address}&from=${requestData.user_address}`;
  const response = await axios.get(url);
  return response.data;
}

function getFee(feeData, amountRaw) {
  const amountBn = ethers.parseUnits(amountRaw, 18);
  const gasFee = ethers.formatUnits(feeData.gas, feeData.decimals);

  // 将所有值转换为 BigInt 进行计算
  const expectedNativeBn = BigInt(feeData.expected);
  const gasBn = BigInt(feeData.gas);
  const serviceFeeBn = amountBn - expectedNativeBn - gasBn;

  const serviceFee = ethers.formatUnits(serviceFeeBn, 18);

  return {
    serviceFee: serviceFee,
    gasFee: gasFee,
  };
}

async function getTxDetail(hash) {
  // https://backend.gas.zip/v2/deposit/<hash>
  const url = `${serviceApi}/deposit/${hash}`;
  const response = await axios.get(url);
  return response.data;
}

// 如果直接运行此文件，则执行演示
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
