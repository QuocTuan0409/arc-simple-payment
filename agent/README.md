# AgentPay Demo Agent

An autonomous Node.js script that demonstrates the **pay-per-call** flow on the
deployed `AgentPay` contract. Each "service call" the agent makes is settled
on-chain via `agentPay()`, with the contract enforcing daily + per-tx caps and
the service allowlist.

> **What this proves end-to-end:** an off-chain process holding the agent key can
> orchestrate work, but a compromised key, a runaway loop, or a typo in the plan
> still can't move more than `dailyLimit` USDC out of the wallet.

## Quick start

From the repo root:

```bash
# 1. (one-time) Install dependencies
npm install

# 2. (one-time) Make sure the demo service is whitelisted for your agent
#    - Open the frontend (https://arc-simple-payment.vercel.app)
#    - Connect the same wallet you'll use as the agent
#    - Click "+ Allowed service" on the agent card
#    - Add address: 0x81bC647e375556Ee8Cae2a4422a33379904e3341
#    - (or any other receiver address you want to use)

# 3. (one-time) Configure the agent
cd agent
cp .env.example .env
# Edit .env and paste your AGENT_PRIVATE_KEY (testnet only!)

# 4. Run a demo task
cd ..
node agent/agent.js "Find trending Web3 projects"
```

## What you'll see

```
════════════════════════════════════════════════════════════════
 🤖 AgentPay Demo Agent
════════════════════════════════════════════════════════════════
Task        : Find trending Web3 projects
Mode        : Demo (hardcoded plan)
Agent addr  : 0xB7e49df0A434cFB2C5666F846c5Bb322fbEf5807
Contract    : 0x1C0cf5a6d6b1EA6EDdF878Aef3e35c2b930f4D31
Mock service: 0x81bC647e375556Ee8Cae2a4422a33379904e3341 (must be whitelisted)

════════════════════════════════════════════════════════════════
 📋 Planning
════════════════════════════════════════════════════════════════
Steps    : 3
Est cost : 0.0300 USDC + gas
Remaining today: 0.1 USDC

════════════════════════════════════════════════════════════════
 ⚡ Executing
════════════════════════════════════════════════════════════════

Step 1/3: search (0.01 USDC)
  memo: "search:Find trending Web3 projects"
  ✓ Dry-run pass
  Submitted: 0x... ✓
  Block 42955123 · gas 76421 · https://testnet.arcscan.app/tx/0x...
  Service replied: Top 3 results for "Find trending Web3 projects": ...

Step 2/3: search ...

Step 3/3: summarize ...

════════════════════════════════════════════════════════════════
 📊 Final agent stats
════════════════════════════════════════════════════════════════
Lifetime payments : 6
Lifetime spent    : 0.06 USDC
Today spent       : 0.03 USDC
Remaining today   : 0.07 USDC
Daily limit       : 0.1 USDC
Per-tx limit      : 0.02 USDC

════════════════════════════════════════════════════════════════
 ✅ Done: 3/3 steps confirmed on-chain
════════════════════════════════════════════════════════════════
  1. https://testnet.arcscan.app/tx/0x...
  2. https://testnet.arcscan.app/tx/0x...
  3. https://testnet.arcscan.app/tx/0x...
```

## How the script works

1. **Pre-checks** — Verifies the agent is registered, active, and that the mock
   service is in its allowlist. Aborts with a clear error if any check fails.
2. **Plan** — Builds a list of `{service, memo, cost}` steps. In **demo mode**
   the plan is hardcoded; in **AI mode** Claude generates it from the task.
3. **Execute** — For each step:
   - Calls the contract's `canPay(agent, to, amount)` view function as a free
     dry-run. Aborts cleanly if it would revert.
   - Sends the `agentPay(to, memo) payable` transaction.
   - Waits for the receipt.
   - "Simulates" the off-chain service work (a real service would return real
     data here).
4. **Recap** — Prints lifetime + today's stats and clickable arcscan links for
   every successful payment.

## Two modes

### Demo mode (default)

Hardcoded 3-step plan. Works without any AI keys. Useful for verifying the
on-chain flow works end-to-end, and for demos where you want predictable
output.

### AI mode

If `ANTHROPIC_API_KEY` is set in `.env`, the script switches to AI mode and asks
Claude (Haiku) to generate the step list based on the input task. The plan is
JSON-parsed and executed the same way.

To enable:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

Then install the SDK and run:

```bash
npm install @anthropic-ai/sdk
node agent/agent.js "Write a paragraph about stablecoin payments"
```

The script falls back to demo mode automatically if the SDK isn't installed.

## Why this is interesting

A typical bot or agent today either:

- **Has no spend control** — the script owns the wallet, full stop. Any bug
  drains the wallet.
- **Has off-chain limits** — e.g. a rate limit in code. But the same code holds
  the key, so a compromise or refactor can quietly bypass the limit.

`AgentPay` moves the cap **into the contract**, where it's enforced regardless
of what the off-chain agent does. The agent can still be entirely autonomous;
it just operates inside a sandbox the owner defined.

This demo is intentionally small (3 calls, 0.01 USDC each), but the same
contract scales to:

- AI inference budgets per feature / per team
- Cross-border contractor payouts with per-payee caps
- Subscription auto-renewal with category allowlists
- Multi-agent treasury allocation under a DAO

## Files

- `agent.js` — the script
- `.env.example` — template for the local config
- `.env` — your local config (gitignored)
- `README.md` — this file
