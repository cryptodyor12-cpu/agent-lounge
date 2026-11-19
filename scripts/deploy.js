// Deploys Agent Lounge against the official Agent ID registry.
//
// Usage:
//   AGENT_ID_REGISTRY=0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F \
//   DEPLOYER_PRIVATE_KEY=<deployer key, env only> \
//   npx hardhat run scripts/deploy.js --network bsc
//
// The registry address defaults to the official Agent ID registry on
// BNB Chain mainnet. The deployer key is taken from the environment and
// is never written to disk by this script.
const hre = require("hardhat");

const OFFICIAL_AGENT_ID_REGISTRY = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";

async function main() {
  const registry = process.env.AGENT_ID_REGISTRY || OFFICIAL_AGENT_ID_REGISTRY;

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:        ", deployer.address);
  console.log("Agent ID registry:", registry);

  const Lounge = await hre.ethers.getContractFactory("AgentLounge");
  const lounge = await Lounge.deploy(registry);
  await lounge.waitForDeployment();

  console.log("AgentLounge deployed to:", await lounge.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
