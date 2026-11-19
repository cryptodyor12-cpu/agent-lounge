require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

/**
 * Hardhat configuration for Agent Lounge.
 *
 * Networks:
 *  - hardhat (default): in-process test network, no configuration needed.
 *  - bsc: BNB Chain mainnet (chainId 56). The deployer key is read from
 *    the DEPLOYER_PRIVATE_KEY environment variable at deploy time only.
 *    NEVER commit a real key to this repository — the empty fallback
 *    below exists solely so the config parses for compile/test runs.
 */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
    bsc: {
      url: "https://bsc-dataseed.binance.org",
      chainId: 56,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
  },
};
