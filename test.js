const { ethers } = require("ethers");

// L1 (Sepolia)
const L1_RPC = "https://sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876";
const L1Provider = new ethers.JsonRpcProvider(L1_RPC);

// L2 (Arbitrum Sepolia)
const L2_RPC =
  "https://arbitrum-sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876";
const L2Provider = new ethers.JsonRpcProvider(L2_RPC);

// 📍官方合约地址
const INBOX_ADDRESS = "0xaAe29B0366299461418F5324a79Afc425BE5ae21"; // Arbitrum Sepolia Inbox
const ARBSYS_ADDRESS = "0x0000000000000000000000000000000000000064"; // ArbSys 系统合约

// Inbox ABI (只需要事件)
const InboxABI = [
  "event InboxMessageDelivered(uint256 indexed messageNum, bytes data)",
];

// ArbSys ABI (只需要函数)
const ArbSysABI = [
  "function getTransactionHash(uint256 messageNum) external view returns (bytes32)",
];

async function main() {
  const inbox = new ethers.Contract(INBOX_ADDRESS, InboxABI, L1Provider);

  const l1TxHash =
    "0x1cc7a93a4415f8b994fd1d33f5ceeb1ca992dd42a64d54f0e7cadcd30472001a";

  // 1. 获取 L1 交易 receipt
  const receipt = await L1Provider.getTransactionReceipt(l1TxHash);

  // 2. 找到 Inbox 的事件
  let messageNum;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === INBOX_ADDRESS.toLowerCase()) {
      try {
        const parsed = inbox.interface.parseLog(log);
        if (parsed.name === "InboxMessageDelivered") {
          messageNum = parsed.args.messageNum;
          console.log("📩 找到 messageNum:", messageNum.toString());
        }
      } catch (err) {}
    }
  }

  if (!messageNum) {
    throw new Error("❌ 没有找到 InboxMessageDelivered 事件");
  }

  try {
    const arbsys = new ethers.Contract(ARBSYS_ADDRESS, ArbSysABI, L2Provider);

    // 3. 调用 ArbSys 查询 L2 txHash
    const l2TxHash = await arbsys.getTransactionHash(messageNum);
    console.log("✅ 对应的 L2 txHash:", l2TxHash);
    console.log(`🔗 L2 浏览器: https://sepolia.arbiscan.io/tx/${l2TxHash}`);
  } catch (error) {
    console.log(error);
  }
}

main();
