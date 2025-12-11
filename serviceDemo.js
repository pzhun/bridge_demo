const axios = require("axios");
const { ethers } = require("ethers");
const UserWallet = require("./services/userWallet");

const host = "http://127.0.0.1:14042";
// const host = "https://api.fxwallet.in";
const quoteApi = "/bridge/quote";
const executeApi = "/bridge/execute";
const txDetailApi = "/bridge/record";

const privateKey =
  "0xcb28292e69f20f36a8eff9f848c935b44fa9d84f2de1f4f29990e2affb5f91c8";
const wallet = new UserWallet(privateKey);

const networks = {
  arbTestnet: {
    chainId: 421614,
    rpc: "https://arbitrum-sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876",
  },
  ethTestnet: {
    chainId: 11155111,
    rpc: "https://sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876",
  },
};

async function main() {
  // 发送交易demo
  // const order = {
  //   user_address: wallet.address,
  //   from_chain: "arb_sepolia",
  //   to_chain: "sepolia",
  //   amount: "0.0001",
  // };
  // const response = await axios.post(`${host}${quoteApi}`, order);
  // const quotes = response.data.quotes;
  // const quote = quotes[0];
  // const unsignedTx = quote.unsigned_tx;
  // const finalizedTx = await finalizeTransaction(
  //   unsignedTx,
  //   networks.arbTestnet
  // );
  // const signedTx = await wallet.signTransaction(finalizedTx);
  // const broadcastData = {
  //   bridge: "arbitrum bridge",
  //   type: "execute",
  //   user_address: wallet.address,
  //   from_chain: "arb_sepolia",
  //   to_chain: "sepolia",
  //   signed_tx: signedTx,
  //   value: ethers.parseEther(order.amount).toString(), // 订单金额
  //   value_in_tx: unsignedTx.value, // 交易金额
  //   lock_time: quote.lock_period, //
  //   is_need_claim: quote.is_need_claim,
  // };
  // const broadcastTx = await axios.post(`${host}${executeApi}`, broadcastData);
  // const txHash = broadcastTx.data.tx_hash;
  // console.log(broadcastTx.data);
  // 交易详情demo
  // const txHash =
  //   "0xa9b9cc5c8699be8735b5895482ab189c92661be338c3b5169f4e20cecc96fca9";
  // const txDetail = await axios.get(`${host}${txDetailApi}`, {
  //   params: {
  //     user_address: wallet.address,
  //     hash: txHash,
  //   },
  // });
  // const unsigned_claim_tx = txDetail.data.record.unsigned_tx;
  // const finalizedTx = await finalizeTransaction(
  //   unsigned_claim_tx,
  //   networks.ethTestnet
  // );
  // const signedTx = await wallet.signTransaction(finalizedTx);
  // const claimBroadcastData = {
  //   bridge: "arbitrum bridge",
  //   type: "claim",
  //   user_address: wallet.address,
  //   from_chain: "arb_sepolia",
  //   to_chain: "sepolia",
  //   signed_tx: signedTx,
  //   from_hex: txHash,
  // };
  // const claimBroadcastTx = await axios.post(
  //   `${host}${executeApi}`,
  //   claimBroadcastData
  // );
  // const claimTxHash = claimBroadcastTx.data.txHash;
  // console.log("claimTxHash", claimTxHash);
}

async function ethToArbDemo() {
  // 发送交易demo
  // const order = {
  //   user_address: wallet.address,
  //   from_chain: "sepolia",
  //   to_chain: "arb_sepolia",
  //   amount: "0.0001",
  // };

  // const response = await axios.post(`${host}${quoteApi}`, order);
  // const quotes = response.data.quotes;
  // const unsignedTx = quotes[0].unsigned_tx;

  // const finalizedTx = await finalizeTransaction(unsignedTx);

  // const signedTx = await wallet.signTransaction(finalizedTx);

  // const broadcastData = {
  //   bridge: "arbitrum bridge",
  //   type: "execute",
  //   user_address: wallet.address,
  //   from_chain: "sepolia",
  //   to_chain: "arb_sepolia",
  //   signed_tx: signedTx,
  //   value: ethers.parseEther(order.amount).toString(), // 订单金额
  //   value_in_tx: unsignedTx.value, // 交易金额
  //   lock_time: 0,
  // };
  // const broadcastTx = await axios.post(`${host}${executeApi}`, broadcastData);
  // const txHash = broadcastTx.data.tx_hash;

  // 交易详情demo
  const txHash =
    "0x8101f1a4d4ac9f114e42f51ed22fd3bddcfcd907e68ea1cbb2b09119f0b3a7d8";

  const txDetail = await axios.get(`${host}${txDetailApi}`, {
    params: {
      user_address: wallet.address,
      hash: txHash,
    },
  });
  console.log(txDetail);
}

async function finalizeTransaction(unsignedTx, network) {
  const provider = new ethers.JsonRpcProvider(network.rpc);
  const nonce = await provider.getTransactionCount(unsignedTx.from);
  const gasLimit = await provider.estimateGas(unsignedTx);
  const gasPrice = await provider.getFeeData();
  const maxFeePerGas = gasPrice.maxFeePerGas;
  const maxPriorityFeePerGas = gasPrice.maxPriorityFeePerGas;
  return {
    ...unsignedTx,
    type: 2, // EIP-1559
    nonce,
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
}

main();
