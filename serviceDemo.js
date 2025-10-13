const axios = require("axios");
const { ethers } = require("ethers");
const UserWallet = require("./services/userWallet");

const host = "http://127.0.0.1:14042";
const quoteApi = "/bridge/quote";
const executeApi = "/bridge/execute";

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
  const response = await axios.post(`${host}${quoteApi}`, {
    userAddress: wallet.address,
    from_chain: "sepolia",
    to_chain: "arb_sepolia",
    amount: "0.001",
  });
  const quotes = response.data.quotes;
  const unsignedTx = quotes[0].unsigned_tx;

  const finalizedTx = await finalizeTransaction(unsignedTx);

  const signedTx = await wallet.signTransaction(finalizedTx);
  console.log(signedTx);

  //   const broadcastTx = await axios.post(`${host}${executeApi}`, {
  //     bridge: "arbitrum bridge",
  //     type: "execute",
  //     from_chain: "sepolia",
  //     signed_tx: signedTx,
  //   });
  //   console.log(broadcastTx);
}

async function finalizeTransaction(unsignedTx) {
  const provider = new ethers.JsonRpcProvider(networks.ethTestnet.rpc);
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
