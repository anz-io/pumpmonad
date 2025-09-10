import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    sepolia: {
      url: process.env.RPC_SEPOLIA,
      accounts: [
        process.env.PRIVATE_KEY_ADMIN!,
      ]
    },
    monadtest: {
      url: "https://testnet-rpc.monad.xyz/",
      accounts: [
        process.env.PRIVATE_KEY_ADMIN!,
      ]
    },
    hypetest: {
      url: "https://rpc.hyperliquid-testnet.xyz/evm",
      accounts: [
        process.env.PRIVATE_KEY_ADMIN!,
      ]
      // explorer: https://app.hyperliquid-testnet.xyz/explorer
    }
  },
  etherscan: {
    enabled: false
  },
  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify-api-monad.blockvision.org",
    browserUrl: "https://testnet.monadexplorer.com"
  }
};

export default config;
