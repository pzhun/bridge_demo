const { CrossChainMessenger, MessageStatus } = require("@eth-optimism/sdk");
const { ethers } = require("ethers");

const config = require("./config/config");

const bridgeInfo = {
  testnet: {
    optimism_sepolia: {
      chainId: 11155420,
      chainName: "Optimism Sepolia",
      l1Address: "0xFBb0621E0B23b5478B630BD55a5f21f67730B0F1",
      l2Address: "0x4200000000000000000000000000000000000010",
    },
  },
};

const privateKey = config.wallets.gasPayer.privateKey;

const networks = {
  sepolia: {
    chainId: 11155111,
    rpc: "https://sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876",
  },
  optimism_sepolia: {
    chainId: 11155420,
    rpc: "https://optimism-sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876",
  },
  base_sepolia: {
    chainId: 84532,
    rpc: "https://base-sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876",
  },
};

const UserWallet = require("./services/userWallet");
const wallet = new UserWallet(privateKey);
const userAddress = wallet.address;
const recipientAddress = wallet.address; // 接收者地址

async function finalizeTransaction(unsignedTx, network) {
  const provider = new ethers.providers.JsonRpcProvider(network.rpc);
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

async function waitForDeposit(txHash) {
  const result = {};

  try {
    const l1Network = networks.sepolia;
    const l2Network = networks.optimism_sepolia;
    const l1Provider = new ethers.providers.JsonRpcProvider(l1Network.rpc);
    const l2Provider = new ethers.providers.JsonRpcProvider(l2Network.rpc);

    const messenger = new CrossChainMessenger({
      l1ChainId: l1Network.chainId,
      l2ChainId: l2Network.chainId,
      l1SignerOrProvider: l1Provider,
      l2SignerOrProvider: l2Provider,
    });

    const messages = await messenger.getMessagesByTransaction(txHash);

    if (!messages.length) return result;
    const message = messages[0];

    // 2️⃣ 等待消息在 L2 被执行, 最多等待10s, 否则未到账
    const timeoutMs = 10_000;
    await Promise.race([
      messenger.waitForMessageStatus(message, MessageStatus.RELAYED),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("等待超时(10s)，未到账")), timeoutMs),
      ),
    ]);

    // 3️⃣ 获取 L2 上执行该 message 的 receipt
    const receipt = await messenger.getMessageReceipt(message);
    result.hash = receipt.transactionReceipt.transactionHash;
    result.status = "success";
    return result;
  } catch (error) {
    return result;
  }
}

async function sendL1ToL2Tx(amount) {
  const L1_STANDARD_BRIDGE = bridgeInfo.testnet.optimism_sepolia.l1Address;

  const ABI = [
    "function bridgeETHTo(address _to,uint32 _minGasLimit,bytes _extraData) payable",
  ];

  const network = networks.sepolia;
  const l1Provider = new ethers.providers.JsonRpcProvider(network.rpc);
  const contract = new ethers.Contract(L1_STANDARD_BRIDGE, ABI, l1Provider);

  const minGasLimit = 200000;

  // 构建交易（注意传入 _to）
  const txRequest = await contract.populateTransaction.bridgeETHTo(
    recipientAddress, // L2 接收地址
    minGasLimit,
    "0x",
    {
      value: ethers.utils.parseEther(amount),
    },
  );

  txRequest.from = userAddress;
  const unsignedTx = await finalizeTransaction(txRequest, network);
  const signedTx = await wallet.signTransaction(unsignedTx);
  const hash = await l1Provider.sendTransaction(signedTx);
  return hash;
}

async function main() {
  // const hash = await sendL1ToL2Tx('0.001');
  // console.log(hash);
  // const hash = '0xf12ac11725031ea6af9a9ef09b882325d8c67c20d16a3630a700742591cb1dae';
  // const result = await waitForDeposit(hash);
  // console.log(result);
}

main();
