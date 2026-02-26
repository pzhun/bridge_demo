const {
    CrossChainMessenger,
    MessageStatus
} = require("@eth-optimism/sdk")
const { ethers } = require("ethers");

const bridgeInfo = {
    "testnet": {
        "11155420": {
            "chainId": 11155420,
            "chainName": "Optimism Sepolia",
            "l1Address": "0xFBb0621E0B23b5478B630BD55a5f21f67730B0F1",
            "l2Address": "0x4200000000000000000000000000000000000010"
        }

    }
}

const privateKey = "0xcb28292e69f20f36a8eff9f848c935b44fa9d84f2de1f4f29990e2affb5f91c8";

const networks = {
    sepolia: {
        chainId: 11155111,
        rpc: "https://sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876"
    },
    optimism_sepolia: {
        chainId: 11155420,
        rpc: "https://optimism-sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876"
    },
    base_sepolia: {
        chainId: 84532,
        rpc: "https://base-sepolia.infura.io/v3/f0443451e6034c60830c9ca206431876"
    }
}

const UserWallet = require("./services/userWallet");
const wallet = new UserWallet(privateKey);
const userAddress = wallet.address;
const recipientAddress = wallet.address; // 接收者地址

async function waitForDeposit(txHash) {
    const result = {};

    try {
        const l1Network = networks.sepolia;
        const l2Network = networks.optimism_sepolia;
        const l1Provider = new ethers.providers.JsonRpcProvider(l1Network.rpc)
        const l2Provider = new ethers.providers.JsonRpcProvider(l2Network.rpc)

        const messenger = new CrossChainMessenger({
            l1ChainId: l1Network.chainId,
            l2ChainId: l2Network.chainId,
            l1SignerOrProvider: l1Provider,
            l2SignerOrProvider: l2Provider
        })

        const messages = await messenger.getMessagesByTransaction(txHash)

        if (!messages.length) return result
        const message = messages[0]

        // 2️⃣ 等待消息在 L2 被执行, 最多等待10s, 否则未到账
        const timeoutMs = 10_000
        await Promise.race([
            messenger.waitForMessageStatus(message, MessageStatus.RELAYED),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("等待超时(10s)，未到账")), timeoutMs)
            )
        ])

        // 3️⃣ 获取 L2 上执行该 message 的 receipt
        const receipt = await messenger.getMessageReceipt(message)
        result.hash = receipt.transactionReceipt.transactionHash
        result.status = "success"
        return result
    } catch (error) {
        return result
    }
}



async function main() {
    const hash = '0x419a2424794291df743561277f0ee2e06e3d7b333092ed9be832f9c49b817bea';
    const result = await waitForDeposit(hash);
    console.log(result);
}

main();