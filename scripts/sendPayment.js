// Send a demo payment through a deployed SimplePayment contract.
// Usage:
//   CONTRACT_ADDRESS=0x... npx hardhat run scripts/sendPayment.js --network arcTestnet
//
// Set RECIPIENT_ADDRESS in .env (or it falls back to your own address).

const hre = require("hardhat");

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error(
      "Set CONTRACT_ADDRESS in the environment, e.g. " +
        "CONTRACT_ADDRESS=0x... npx hardhat run scripts/sendPayment.js --network arcTestnet"
    );
  }

  const [sender] = await hre.ethers.getSigners();
  const recipient = process.env.RECIPIENT_ADDRESS?.trim() || sender.address;
  const amount = hre.ethers.parseUnits("0.01", 18); // 0.01 USDC
  const memo = `Hello from ${sender.address.slice(0, 8)} — Arc Testnet demo`;

  console.log("=".repeat(60));
  console.log("Sending payment via SimplePayment");
  console.log("=".repeat(60));
  console.log("Contract :", contractAddress);
  console.log("From     :", sender.address);
  console.log("To       :", recipient);
  console.log("Amount   :", hre.ethers.formatUnits(amount, 18), "USDC");
  console.log("Memo     :", memo);

  const contract = await hre.ethers.getContractAt(
    "SimplePayment",
    contractAddress,
    sender
  );

  const tx = await contract.sendPayment(recipient, memo, { value: amount });
  console.log("\nTx submitted:", tx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt.blockNumber);
  console.log("Gas used         :", receipt.gasUsed.toString());
  console.log(
    "Explorer         :",
    `https://testnet.arcscan.app/tx/${tx.hash}`
  );

  // Decode PaymentSent event(s).
  const eventTopic = contract.interface.getEvent("PaymentSent").topicHash;
  const events = receipt.logs
    .filter((log) => log.topics[0] === eventTopic)
    .map((log) => contract.interface.parseLog(log));

  if (events.length > 0) {
    console.log("\nPaymentSent event:");
    for (const e of events) {
      console.log("  from     :", e.args.from);
      console.log("  to       :", e.args.to);
      console.log(
        "  amount   :",
        hre.ethers.formatUnits(e.args.amount, 18),
        "USDC"
      );
      console.log("  memo     :", e.args.memo);
      console.log(
        "  timestamp:",
        new Date(Number(e.args.timestamp) * 1000).toISOString()
      );
    }
  }

  // Print updated stats.
  const [count, volume] = await contract.stats();
  console.log("\nContract stats now:");
  console.log("  paymentCount :", count.toString());
  console.log(
    "  totalVolume  :",
    hre.ethers.formatUnits(volume, 18),
    "USDC"
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
