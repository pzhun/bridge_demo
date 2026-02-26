const { ethers } = require("ethers");
const axios = require("axios");
const UserWallet = require("./services/userWallet");
const config = require("./config/config");
const ERC20ABI = require("./config/erc20.json");

// ------- 配置区 -------
const PRIVATE_KEY = config.wallets.gasPayer.privateKey;

const host = "https://api.fxwallet.in";
const quoteApi = "/bridge/quote";
const executeApi = "/bridge/execute";
const txDetailApi = "/bridge/record";

const networks = {
  unichain: {
    chainId: 130,
    rpc: "https://unichain-mainnet.g.alchemy.com/v2/_EsmcL9t4r5YyrlZKpb9Wx7Tj7__cY3W",
  },
  arbitrum: {
    chainId: 42161,
    rpc: "https://arbitrum-mainnet.infura.io/v3/f0443451e6034c60830c9ca206431876",
  },
};

const wallet = new UserWallet(PRIVATE_KEY);
const userAddress = wallet.address;

const OFT_ABI = [
  'function quoteOFT(tuple(uint32,bytes32,uint256,uint256,bytes,bytes,bytes)) view returns (tuple(uint256,uint256), tuple(int256,string)[], tuple(uint256,uint256))',
  'function quoteSend(tuple(uint32,bytes32,uint256,uint256,bytes,bytes,bytes), bool) view returns (tuple(uint256,uint256))',
  'function send(tuple(uint32,bytes32,uint256,uint256,bytes,bytes,bytes), tuple(uint256,uint256), address) payable returns (tuple(bytes32,uint64,tuple(uint256,uint256)), tuple(uint256,uint256))',
];

const fromToken = {
  chain: "unichain",
  address: "0x9151434b16b9763660705744891fA906F660EcC5",
  oftAddress: "0xc07bE8994D035631c36fb4a89C918CeFB2f03EC3",
  lzId: 30320
};
const toToken = {
  chain: "arbitrum",
  address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // Arbitrum USDT0
  lzId: 30110
};

const bridgeName = "usdt0 bridge";

function getNetworkByChainName(chainName) {
  return networks[chainName] || networks.unichain;
}



async function main() {
  const requestData = {
    user_address: wallet.address,
    from_chain: fromToken.chain,
    from_token_address: fromToken.address,
    to_token_address: toToken.address,
    to_chain: toToken.chain,
    amount: "0.2",
    bridge: bridgeName,
  };

  // 准备跨链交易

  const network = getNetworkByChainName(requestData.from_chain);
  const bridgeData = await axios.post(`${host}${quoteApi}`, requestData);
  const bridgeTx = bridgeData.data.quotes[0].unsigned_tx[0];
  await approve(fromToken, bridgeTx.to, network);

  // 发送跨链交易
  const finalizedTx = await finalizeTransaction(bridgeTx, network);
  console.log(finalizedTx);
  const signedTx = await wallet.signTransaction(finalizedTx);
  const executeData = {
    bridge: bridgeName,
    user_address: userAddress,
    from_chain: requestData.from_chain,
    to_chain: requestData.to_chain,
    from_token_address: requestData.from_token_address,
    to_token_address: requestData.to_token_address,
    extra_data: bridgeData.data.quotes[0].extra_data,
    signed_tx: signedTx,
    type: "execute",
  };
  console.log(executeData);
  const executeTx = await axios.post(`${host}${executeApi}`, executeData);
  console.log(executeTx);



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




if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
