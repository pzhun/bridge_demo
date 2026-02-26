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
    rpc: "https://eth-sepolia.g.alchemy.com/v2/_EsmcL9t4r5YyrlZKpb9Wx7Tj7__cY3W",
  },
  optimism_sepolia: {
    chainId: 11155420,
    rpc: "https://opt-sepolia.g.alchemy.com/v2/_EsmcL9t4r5YyrlZKpb9Wx7Tj7__cY3W",
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
    const message = messages[0];

    let status = await messenger.getMessageStatus(message);
    console.log("MessageStatus:", status, MessageStatus[status]);

    if (status === MessageStatus.READY_TO_PROVE) {
      // 3 = READY_TO_PROVE，可提交 prove
      result.unsignedTx =
        await messenger.populateTransaction.proveMessage(message);
    }
    if (status === MessageStatus.READY_FOR_RELAY) {
      // 5 = READY_FOR_RELAY，可执行 finalize
      result.unsignedTx =
        await messenger.populateTransaction.finalizeMessage(message);
    }
    return result;
  } catch (error) {
    console.log(error);
    return result;
  }
}

async function sendL2ToL1Tx(amount) {
  const ABI = [
    "function bridgeETHTo(address _to, uint32 _l2Gas, bytes _extraData) payable",
  ];

  // ETH 在 OP L2 上的地址
  const L2_STANDARD_BRIDGE = bridgeInfo.testnet.optimism_sepolia.l2Address;

  const l2Network = networks.optimism_sepolia;
  const l2Provider = new ethers.providers.JsonRpcProvider(l2Network.rpc);

  const bridge = new ethers.Contract(L2_STANDARD_BRIDGE, ABI, l2Provider);

  const amountWei = ethers.utils.parseEther(amount);
  const l1Gas = 200000; // 可以写死

  const txRequest = await bridge.populateTransaction.bridgeETHTo(
    recipientAddress,
    l1Gas,
    "0x",
    { value: amountWei },
  );

  txRequest.from = userAddress;
  console.log(txRequest);
  const unsignedTx = await finalizeTransaction(txRequest, l2Network);
  const signedTx = await wallet.signTransaction(unsignedTx);
  const hash = await l2Provider.sendTransaction(signedTx);
  return hash;
}

async function main() {
  //   const hash =
  //     "0x74754fadc916ec1433beb3ad87e63209cee87690ff83b7a0f0bb5ea32c02f33c";
  //   const result = await waitForDeposit(hash);
  //   console.log(result);

  const hash = await sendL2ToL1Tx("0.0001");
  console.log(hash);
}

main();
