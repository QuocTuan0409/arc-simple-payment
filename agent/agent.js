#!/usr/bin/env node
/**
 * AgentPay autonomous agent — demonstrates pay-per-call flow on Arc Testnet.
 *
 * Modes:
 *  - DEMO mode (default): uses a hardcoded plan of 3 API calls.
 *  - AI mode: if ANTHROPIC_API_KEY is set, Claude plans the calls dynamically.
 *
 * The script:
 *   1. Loads the agent's private key from .env
 *   2. Plans a sequence of mock "API calls" for a given task
 *   3. For each step: dry-run check → agentPay() → wait confirmation
 *   4. Prints TX hashes + agent stats
 *
 * Usage:
 *   node agent.js "Find trending Web3 projects"
 *   node agent.js "Write a haiku about stablecoins"
 *
 * Setup:
 *   1. cp .env.example .env  (then add AGENT_PRIVATE_KEY)
 *   2. From the project root: npm install (already done if you ran the contracts)
 *   3. (optional) export ANTHROPIC_API_KEY=sk-ant-... for AI planning
 */

const path = require("path");
// Load root .env first (so existing PRIVATE_KEY works) then agent/.env (can override).
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, ".env"), override: false });
const { ethers } = require("ethers");
const fs = require("fs");

// ─── Configuration ────────────────────────────────────────────────────────
const ARC_RPC = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;
const AGENTPAY_ADDRESS =
  process.env.AGENTPAY_ADDRESS ||
  "0x1C0cf5a6d6b1EA6EDdF878Aef3e35c2b930f4D31";
const EXPLORER = "https://testnet.arcscan.app";

// One mock service address we already whitelisted during the demo run.
// Override via .env if you want to use your own.
const MOCK_SERVICE =
  process.env.MOCK_SERVICE_ADDR ||
  "0x81bC647e375556Ee8Cae2a4422a33379904e3341";

// Accept AGENT_PRIVATE_KEY (preferred) or fall back to PRIVATE_KEY from root .env
const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY || process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error(
    "❌ No private key found.\n" +
      "   The script looks for AGENT_PRIVATE_KEY in agent/.env first,\n" +
      "   then falls back to PRIVATE_KEY in the project root .env.\n" +
      "   Set one of them and try again."
  );
  process.exit(1);
}

// Minimal ABI — only what the agent needs
const AGENTPAY_ABI = [
  "function agentPay(address to, string calldata memo) external payable",
  "function canPay(address agent, address to, uint256 amount) view returns (bool ok, string memory reason)",
  "function getAgent(address agent) view returns (tuple(address owner, uint256 dailyLimit, uint256 perTxLimit, uint256 dailySpent, uint256 lastResetDay, bool active, bool registered, uint256 totalSpent, uint256 paymentCount))",
  "function getRemainingDailyBudget(address agent) view returns (uint256)",
  "function isServiceAllowed(address agent, address service) view returns (bool)",
  "event PaymentExecuted(address indexed agent, address indexed to, uint256 amount, string memo, uint256 timestamp)",
];

// ─── Setup ethers ────────────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(ARC_RPC);
const wallet = new ethers.Wallet(
  PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`,
  provider
);
const contract = new ethers.Contract(AGENTPAY_ADDRESS, AGENTPAY_ABI, wallet);

// ─── Pretty printing ─────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

function header(text) {
  console.log("\n" + c.bold + c.cyan + "═".repeat(64) + c.reset);
  console.log(c.bold + c.cyan + " " + text + c.reset);
  console.log(c.bold + c.cyan + "═".repeat(64) + c.reset);
}

function shortAddr(addr) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function fmtUsdc(wei) {
  return ethers.formatUnits(wei, 18);
}

// ─── Plan task: hardcoded for demo mode, Claude for AI mode ──────────────
const USE_AI =
  Boolean(process.env.ANTHROPIC_API_KEY) &&
  process.env.AGENT_MODE !== "demo";

async function planTaskHardcoded(task) {
  // Predictable 3-step plan for the demo. In a real product, Claude
  // would generate this dynamically based on the task.
  return [
    {
      service: "search",
      to: MOCK_SERVICE,
      costUsdc: "0.01",
      memo: `search:${task.slice(0, 40)}`,
      simulatedResult: () =>
        `Top 3 results for "${task}": project-A, project-B, project-C`,
    },
    {
      service: "search",
      to: MOCK_SERVICE,
      costUsdc: "0.01",
      memo: `search:related-${task.slice(0, 32)}`,
      simulatedResult: () =>
        `Related topics: stablecoins, agentic economy, USDC payments`,
    },
    {
      service: "summarize",
      to: MOCK_SERVICE,
      costUsdc: "0.01",
      memo: `summarize:${task.slice(0, 40)}`,
      simulatedResult: () =>
        `Summary: "${task}" maps to early-stage projects in the agentic economy space. ` +
        `Key signals: stablecoin-native payments, on-chain budgets, autonomous workflows.`,
    },
  ];
}

async function planTaskWithClaude(task) {
  // Lazy-load Anthropic SDK only when needed
  let Anthropic;
  try {
    Anthropic = require("@anthropic-ai/sdk").default;
  } catch (e) {
    console.warn(
      c.yellow +
        "[!] @anthropic-ai/sdk not installed. Falling back to hardcoded plan.\n" +
        "    Install with: npm install @anthropic-ai/sdk" +
        c.reset
    );
    return planTaskHardcoded(task);
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const sys = `You're an AI agent planner. Given a task, return a JSON array of 2-4 steps.
Each step uses one of these mock services:
- "search" (cost: 0.01 USDC) — gathers info
- "summarize" (cost: 0.01 USDC) — synthesizes input

Return ONLY valid JSON, no markdown. Example:
[
  {"service": "search", "memo": "find-defi-trends", "rationale": "..."},
  {"service": "summarize", "memo": "summarize-results", "rationale": "..."}
]`;
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: sys,
    messages: [{ role: "user", content: `Task: ${task}\n\nPlan it.` }],
  });
  const text = msg.content[0]?.text || "[]";
  let parsed;
  try {
    // Best-effort JSON extract
    const match = text.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch {
    console.warn(c.yellow + "[!] Failed to parse Claude plan, using fallback." + c.reset);
    return planTaskHardcoded(task);
  }
  return parsed.map((s, i) => ({
    service: s.service || "search",
    to: MOCK_SERVICE,
    costUsdc: "0.01",
    memo: (s.memo || `step-${i}`).slice(0, 60),
    rationale: s.rationale || "",
    simulatedResult: () =>
      `(${s.service}) ${s.rationale || "mock result for: " + task}`,
  }));
}

// ─── Execute one paid step ───────────────────────────────────────────────
async function executeStep(step, idx, total) {
  const amount = ethers.parseUnits(step.costUsdc, 18);
  console.log(
    `\n${c.bold}Step ${idx}/${total}: ${step.service}${c.reset} ` +
      `${c.dim}(${step.costUsdc} USDC)${c.reset}`
  );
  if (step.rationale) console.log(`  ${c.dim}rationale: ${step.rationale}${c.reset}`);
  console.log(`  ${c.dim}memo: "${step.memo}"${c.reset}`);

  // Dry-run
  try {
    const [ok, reason] = await contract.canPay(wallet.address, step.to, amount);
    if (!ok) {
      console.log(`  ${c.red}✗ canPay() says: ${reason}${c.reset}`);
      return { ok: false, reason };
    }
    console.log(`  ${c.green}✓ Dry-run pass${c.reset}`);
  } catch (e) {
    console.log(`  ${c.yellow}⚠ canPay() error: ${e.shortMessage || e.message}${c.reset}`);
  }

  // Submit
  try {
    const tx = await contract.agentPay(step.to, step.memo, { value: amount });
    process.stdout.write(`  ${c.dim}Submitted: ${tx.hash} ${c.reset}`);
    const receipt = await tx.wait();
    console.log(c.green + "✓" + c.reset);
    console.log(
      `  ${c.dim}Block ${receipt.blockNumber} · gas ${receipt.gasUsed.toString()} · ` +
        `${EXPLORER}/tx/${tx.hash}${c.reset}`
    );

    // Simulate the off-chain service response
    const simulated = step.simulatedResult();
    console.log(`  ${c.cyan}Service replied:${c.reset} ${simulated}`);
    return { ok: true, txHash: tx.hash, result: simulated };
  } catch (e) {
    console.log(`  ${c.red}✗ tx failed: ${e.shortMessage || e.message}${c.reset}`);
    return { ok: false, reason: e.shortMessage || e.message };
  }
}

// ─── Main agent loop ─────────────────────────────────────────────────────
async function main() {
  const task = process.argv.slice(2).join(" ") || "Find trending Web3 projects";

  header(`🤖 AgentPay Demo Agent`);
  console.log(`Task        : ${c.bold}${task}${c.reset}`);
  console.log(`Mode        : ${USE_AI ? "AI (Claude)" : "Demo (hardcoded plan)"}`);
  console.log(`Agent addr  : ${wallet.address}`);
  console.log(`Contract    : ${AGENTPAY_ADDRESS}`);
  console.log(`Mock service: ${MOCK_SERVICE} ${c.dim}(must be whitelisted)${c.reset}`);

  // Pre-checks
  const agentInfo = await contract.getAgent(wallet.address);
  if (!agentInfo.registered) {
    console.error(
      c.red +
        "\n❌ This wallet is not registered as an agent on the contract.\n" +
        "   Register it first via the frontend or by calling registerAgent()." +
        c.reset
    );
    process.exit(1);
  }
  if (!agentInfo.active) {
    console.error(
      c.red + "\n❌ Agent is paused. Unpause it via the frontend." + c.reset
    );
    process.exit(1);
  }
  const allowed = await contract.isServiceAllowed(wallet.address, MOCK_SERVICE);
  if (!allowed) {
    console.error(
      c.red +
        `\n❌ Mock service ${shortAddr(MOCK_SERVICE)} is not in this agent's allowlist.\n` +
        `   Whitelist it via the frontend (+ Allowed service button) before running.` +
        c.reset
    );
    process.exit(1);
  }

  // Plan
  header("📋 Planning");
  const plan = USE_AI ? await planTaskWithClaude(task) : await planTaskHardcoded(task);
  const totalCost = plan.reduce((s, x) => s + Number(x.costUsdc), 0);
  console.log(`Steps    : ${plan.length}`);
  console.log(`Est cost : ${totalCost.toFixed(4)} USDC + gas`);

  const remaining = await contract.getRemainingDailyBudget(wallet.address);
  console.log(`Remaining today: ${fmtUsdc(remaining)} USDC`);

  // Execute
  header("⚡ Executing");
  const results = [];
  for (let i = 0; i < plan.length; i++) {
    const r = await executeStep(plan[i], i + 1, plan.length);
    results.push(r);
    if (!r.ok) {
      console.log(`\n${c.yellow}Stopping after step ${i + 1} (failed).${c.reset}`);
      break;
    }
  }

  // Final stats
  header("📊 Final agent stats");
  const finalInfo = await contract.getAgent(wallet.address);
  const finalRemaining = await contract.getRemainingDailyBudget(wallet.address);
  console.log(`Lifetime payments : ${finalInfo.paymentCount.toString()}`);
  console.log(`Lifetime spent    : ${fmtUsdc(finalInfo.totalSpent)} USDC`);
  console.log(`Today spent       : ${fmtUsdc(finalInfo.dailySpent)} USDC`);
  console.log(`Remaining today   : ${fmtUsdc(finalRemaining)} USDC`);
  console.log(`Daily limit       : ${fmtUsdc(finalInfo.dailyLimit)} USDC`);
  console.log(`Per-tx limit      : ${fmtUsdc(finalInfo.perTxLimit)} USDC`);

  // Receipt summary
  const successCount = results.filter((r) => r.ok).length;
  header(`✅ Done: ${successCount}/${plan.length} steps confirmed on-chain`);
  results
    .filter((r) => r.ok)
    .forEach((r, i) => console.log(`  ${i + 1}. ${EXPLORER}/tx/${r.txHash}`));
  console.log(
    `\n${c.bold}Final answer (synthesized from service responses):${c.reset}`
  );
  console.log(
    results
      .filter((r) => r.ok)
      .map((r) => `  • ${r.result}`)
      .join("\n")
  );
  console.log();
}

main().catch((err) => {
  console.error(c.red + "\nAgent crashed:" + c.reset, err);
  process.exit(1);
});
