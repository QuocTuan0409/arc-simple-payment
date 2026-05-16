require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY?.trim();
const ARC_RPC_URL =
  process.env.ARC_RPC_URL?.trim() || "https://rpc.testnet.arc.network";

// Normalize private key (accept with or without 0x prefix).
const accounts =
  PRIVATE_KEY && PRIVATE_KEY.length > 0
    ? [PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`]
    : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    // Arc Testnet — Circle's L1 for internet-native finance.
    // Docs: https://docs.arc.io/arc/references/connect-to-arc
    arcTestnet: {
      url: ARC_RPC_URL,
      chainId: 5042002,
      accounts,
    },
  },
};
