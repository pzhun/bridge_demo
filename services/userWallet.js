const { ethers } = require("ethers");

// 提供签名方法
class UserWallet {
  constructor(privateKey) {
    this.privateKey = privateKey;
    this.wallet = new ethers.Wallet(privateKey);
  }

  async signTransaction(transaction) {
    return await this.wallet.signTransaction(transaction);
  }

  get address() {
    return this.wallet.address;
  }
}
module.exports = UserWallet;
