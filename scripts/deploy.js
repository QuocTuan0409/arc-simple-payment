// Deploy SimplePayment to Arc Testnet.
// Usage: npx hardhat run scripts/deploy.js --network arcTestnet
//
// Make sure .env has PRIVATE_KEY set and the deployer has testnet USDC
// from https://faucet.circle.com (Arc Testnet).

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("=".repeat(60));
  console.log("Deploying SimplePayment");
  console.log("=".repeat(60));
  console.log("Network    :", hre.network.name, `(chainId ${network.chainId})`);
  console.log("Deployer   :", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(
    "Balance    :",
    hre.ethers.formatUnits(balance, 18),
    "USDC (native gas)"
  );

  if (balance === 0n) {
    console.warn(
      "\n[!] Deployer has 0 USDC. Fund it at https://faucet.circle.com before deploying.\n"
    );
  }

  console.log("\nDeploying contract...");
  const SimplePayment = await hre.ethers.getContractFactory("SimplePayment");
  const contract = await SimplePayment.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const tx = contract.deploymentTransaction();

  console.log("\nDeployment successful!");
  console.log("Contract   :", address);
  if (tx) {
    console.log("Tx hash    :", tx.hash);
    console.log(
      "Explorer   :",
      `https://testnet.arcscan.app/tx/${tx.hash}`
    );
  }
  console.log(
    "Contract on explorer:",
    `https://testnet.arcscan.app/address/${address}`
  );
  console.log("\nSave the contract address — you'll need it for sendPayment.js.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
