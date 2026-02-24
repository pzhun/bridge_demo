/**
 * CCTP V2 消息领取状态查询（仅保留 V2 + 是否已 claim）
 */

const { ethers } = require("ethers");

const MESSAGE_TRANSMITTER_ABI = [
  "function usedNonces(bytes32) view returns (uint256)",
  "event MessageReceived(address indexed caller, uint32 sourceDomain, bytes32 indexed nonce, bytes32 sender, uint32 indexed finalityThresholdExecuted, bytes messageBody)",
];

/**
 * 仅用 API 返回的 decodedMessage（含 sourceDomain、nonce）检查是否已被 claim（V2）
 * @param {object} params
 * @param {ethers.Provider} params.provider - 目标链 provider
 * @param {string} params.messageTransmitterAddress - 目标链 MessageTransmitter 合约地址
 * @param {{ sourceDomain: string|number, nonce: string }} params.decodedMessage - API 的 decodedMessage
 * @returns {Promise<boolean>} 是否已被 claim
 */
async function isMessageClaimedV2({ provider, messageTransmitterAddress, nonce }) {
  const contract = new ethers.Contract(
    messageTransmitterAddress,
    MESSAGE_TRANSMITTER_ABI,
    provider
  );
  // V2: 使用 nonce(bytes32) 作为 usedNonces key
  const used = await contract.usedNonces(nonce);
  return used !== 0n;
}

/**
 * 根据 nonce 精准查询 claim 交易 hash（V2 MessageReceived 事件）
 * @param {object} params
 * @param {ethers.Provider} params.provider
 * @param {string} params.messageTransmitterAddress
 * @param {string} params.nonce - bytes32
 * @param {number} params.fromBlock
 * @param {number} params.toBlock
 * @returns {Promise<string|null>}
 */
async function findClaimTxHashByNonce({
  provider,
  messageTransmitterAddress,
  nonce,
  fromBlock,
  toBlock,
  maxBlockRange = 10,
}) {
  const contract = new ethers.Contract(
    messageTransmitterAddress,
    MESSAGE_TRANSMITTER_ABI,
    provider
  );
  const nonceTopic = nonce.startsWith("0x") ? nonce : `0x${nonce}`;
  const filter = contract.filters.MessageReceived(null, null, nonceTopic, null, null);
  let start = fromBlock;
  let end = toBlock;
  while (start <= end) {
    const chunkEnd = Math.min(start + maxBlockRange, end);
    try {
      const events = await contract.queryFilter(filter, start, chunkEnd);
      if (events.length) {
        return events[events.length - 1].transactionHash;
      }
    } catch (err) {
      const msg = err?.error?.message || err?.message || "";
      // 处理免费节点限制：强制使用更小区间
      if (msg.includes("eth_getLogs requests with up to a 10 block range")) {
        const suggested = msg.match(/\[(0x[0-9a-fA-F]+), (0x[0-9a-fA-F]+)\]/);
        if (suggested) {
          const suggestedStart = Number(suggested[1]);
          const suggestedEnd = Number(suggested[2]);
          const events = await contract.queryFilter(
            filter,
            suggestedStart,
            suggestedEnd
          );
          if (events.length) {
            return events[events.length - 1].transactionHash;
          }
          start = suggestedEnd + 1;
          continue;
        }
      }
      throw err;
    }
    start = chunkEnd + 1;
  }
  return null;
}

module.exports = {
  isMessageClaimedV2,
  findClaimTxHashByNonce,
};
