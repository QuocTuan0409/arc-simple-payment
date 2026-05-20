// End-to-end demo of AgentPay on Arc Testnet.
//
// What this script does:
//   1. Connects to the deployed AgentPay contract
//   2. Registers the deployer wallet as its own "agent" (single-wallet demo)
//   3. Whitelists a freshly-generated service address
//   4. Sends 3 successful agentPay() calls within budget
//   5. Prints final stats + arcscan links for every transaction
//
// Usage: npm run demo:agentpay
//   (or)  AGENTPAY_ADDRESS=0x... npx hardhat run scripts/demoAgentPay.js --network arcTestnet

const hre = require("hardhat");

const DEFAULT_CONTRACT =
  "0x1C0cf5a6d6b1EA6EDdF878Aef3e35c2b930f4D31"; // deployed earlier

function explorerTx(hash) {
  return `https://testnet.arcscan.app/tx/${hash}`;
}

function explorerAddr(addr) {
  return `https://testnet.arcscan.app/address/${addr}`;
}

function section(title) {
  console.log("\n" + "=".repeat(64));
  console.log(title);
  console.log("=".repeat(64));
}

async function main() {
  const [user] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  const contractAddress = process.env.AGENTPAY_ADDRESS || DEFAULT_CONTRACT;

  section("AgentPay end-to-end demo");
  console.log("Network         :", hre.network.name, `(chainId ${network.chainId})`);
  console.log("Contract        :", contractAddress);
  console.log("User (owner+agent):", user.address);

  const balance = await hre.ethers.provider.getBalance(user.address);
  console.log(
    "User balance    :",
    hre.ethers.formatUnits(balance, 18),
    "USDC"
  );

  const contract = await hre.ethers.getContractAt(
    "AgentPay",
    contractAddress,
    user
  );

  // Track every TX hash so we can print a final receipt block.
  const txHashes = [];

  // Generate a one-off "service" wallet just to receive payments in the demo.
  const mockService = hre.ethers.Wallet.createRandom();
  console.log("Mock service    :", mockService.address);
  console.log("                  (random address — receives USDC, no key needed off-chain)");

  // Demo budgets (small so the whole demo costs < 0.1 USDC of testnet funds).
  const dailyLimit = hre.ethers.parseUnits("0.1", 18); // 0.1 USDC / day
  const perTxLimit = hre.ethers.parseUnits("0.02", 18); // 0.02 USDC / tx

  // ─── Scenario 1: registerAgent ──────────────────────────────────────────
  section("Scenario 1: registerAgent (user wallet as both owner and agent)");

  // Check if agent is already registered (idempotent — safe to re-run script)
  const existingAgent = await contract.getAgent(user.address);
  let tx, receipt;
  if (existingAgent.registered) {
    console.log("  Agent already registered — skipping registerAgent.");
    console.log("    Existing owner:", existingAgent.owner);
    console.log(
      "    Existing dailyLimit:",
      hre.ethers.formatUnits(existingAgent.dailyLimit, 18),
      "USDC"
    );
    txHashes.push({ label: "1. registerAgent", hash: "(skipped - already registered)" });
  } else {
    console.log(
      "Calling registerAgent(",
      user.address,
      ",",
      hre.ethers.formatUnits(dailyLimit, 18),
      "USDC/day,",
      hre.ethers.formatUnits(perTxLimit, 18),
      "USDC/tx )"
    );

    tx = await contract.registerAgent(user.address, dailyLimit, perTxLimit);
    console.log("  Tx submitted:", tx.hash);
    receipt = await tx.wait();
    console.log("  Confirmed in block", receipt.blockNumber);
    console.log("  Explorer:", explorerTx(tx.hash));
    txHashes.push({ label: "1. registerAgent", hash: tx.hash });
  }

  // ─── Scenario 2: addAllowedService ──────────────────────────────────────
  section("Scenario 2: addAllowedService (whitelist mock service)");
  tx = await contract.addAllowedService(user.address, mockService.address);
  console.log("  Tx submitted:", tx.hash);
  receipt = await tx.wait();
  console.log("  Confirmed in block", receipt.blockNumber);
  console.log("  Explorer:", explorerTx(tx.hash));
  txHashes.push({ label: "2. addAllowedService", hash: tx.hash });

  const allowed = await contract.isServiceAllowed(
    user.address,
    mockService.address
  );
  console.log("  Service allowlisted? ", allowed);

  // ─── Scenarios 3-5: three agentPay() calls within budget ───────────────
  const payAmount = hre.ethers.parseUnits("0.01", 18); // 0.01 USDC each

  for (let i = 1; i <= 3; i++) {
    section(
      `Scenario ${2 + i}: agentPay #${i} (0.01 USDC, within limits)`
    );
    const memo = `demo-call-${i}-${Math.random().toString(36).slice(2, 8)}`;
    console.log("  Memo:", memo);

    tx = await contract.agentPay(mockService.address, memo, {
      value: payAmount,
    });
    console.log("  Tx submitted:", tx.hash);
    receipt = await tx.wait();
    console.log("  Confirmed in block", receipt.blockNumber);
    console.log("  Gas used:", receipt.gasUsed.toString());
    console.log("  Explorer:", explorerTx(tx.hash));
    txHashes.push({ label: `${2 + i}. agentPay #${i}`, hash: tx.hash });
  }

  // ─── Final stats ────────────────────────────────────────────────────────
  section("Final on-chain stats");
  const agentInfo = await contract.getAgent(user.address);
  const remaining = await contract.getRemainingDailyBudget(user.address);

  console.log(
    "  dailyLimit       :",
    hre.ethers.formatUnits(agentInfo.dailyLimit, 18),
    "USDC"
  );
  console.log(
    "  perTxLimit       :",
    hre.ethers.formatUnits(agentInfo.perTxLimit, 18),
    "USDC"
  );
  console.log(
    "  dailySpent       :",
    hre.ethers.formatUnits(agentInfo.dailySpent, 18),
    "USDC"
  );
  console.log(
    "  remainingDaily   :",
    hre.ethers.formatUnits(remaining, 18),
    "USDC"
  );
  console.log(
    "  totalSpent       :",
    hre.ethers.formatUnits(agentInfo.totalSpent, 18),
    "USDC"
  );
  console.log("  paymentCount     :", agentInfo.paymentCount.toString());
  console.log("  active           :", agentInfo.active);

  // ─── Receipt summary ────────────────────────────────────────────────────
  section("All transactions");
  for (const { label, hash } of txHashes) {
    console.log(`${label.padEnd(28)} ${hash}`);
  }

  console.log("\nContract on explorer:", explorerAddr(contractAddress));
  console.log(
    "Mock service on explorer:",
    explorerAddr(mockService.address)
  );

  console.log(
    "\nDemo complete. " +
      "Save the TX hashes above as on-chain proof that AgentPay works end-to-end."
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
