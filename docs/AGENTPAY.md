# AgentPay — On-chain Budget Controls for Autonomous Agents

A second contract in this repo that extends the `SimplePayment` concept with **per-agent spending limits**, **service allowlists**, and **pause/revoke controls** — turning native USDC into a gated, programmable spend rail for AI agents and outsourced workflows on Arc.

> **Status:** Deployed and tested on Arc Testnet.
> **Contract:** [`0x1C0cf5a6d6b1EA6EDdF878Aef3e35c2b930f4D31`](https://testnet.arcscan.app/address/0x1C0cf5a6d6b1EA6EDdF878Aef3e35c2b930f4D31)

---

## Why this exists

The first project in this repo, [`SimplePayment`](../contracts/SimplePayment.sol), shows that USDC-as-native-gas on Arc lets you build a payment relay in ~70 lines of Solidity. That works for "user pays user", but it opens an obvious follow-on question:

> *If an AI agent (or any automation) holds the key, what stops a bug or a compromised key from draining the wallet?*

`AgentPay` answers that question by moving the budget controls **on-chain**, where they can't be bypassed by application bugs or rogue scripts.

### Two concrete use cases

**1. AI inference cost control for engineering teams**
A SaaS company runs 5 AI features (chatbot, fraud detection, content moderation, data extraction, recommendations). Each is its own agent on AgentPay with a daily budget and a per-call cap. A runaway prompt or a leaked API key can lose at most one day's budget — not the entire treasury.

**2. Programmable freelancer / contractor payouts**
A Vietnam-based agency pays 50 global freelancers. Each freelancer's wallet is whitelisted on a single payout agent with a per-tx cap matching their tier. Payments settle in seconds on Arc with `~$0.001` of gas — versus Wise's 24h delay and 1–3% fee.

Same contract, two demos, identical primitives.

---

## Design

### Data model

```solidity
struct Agent {
    address owner;          // who controls this agent
    uint256 dailyLimit;     // max USDC (wei) per UTC day
    uint256 perTxLimit;     // max USDC (wei) per single payment
    uint256 dailySpent;     // current day's spend (auto-resets)
    uint256 lastResetDay;   // floor(timestamp / 1 day) of last reset
    bool    active;         // false = paused
    bool    registered;     // distinguish unregistered from zero-init
    uint256 totalSpent;     // lifetime stats
    uint256 paymentCount;   // lifetime stats
}

mapping(address => Agent)                          private _agents;
mapping(address => mapping(address => bool))      public  allowedServices;
mapping(address => address[])                      private _agentsByOwner;
```

### Function surface

**Owner-only setup** (caller becomes the agent's owner on register):
- `registerAgent(agent, dailyLimit, perTxLimit)`
- `updateLimits(agent, newDailyLimit, newPerTxLimit)`
- `addAllowedService(agent, service)` / `removeAllowedService(agent, service)`
- `pauseAgent(agent)` / `unpauseAgent(agent)`
- `revokeAgent(agent)` — permanent

**Agent action**:
- `agentPay(to, memo) payable` — only the registered agent can call; checks allowlist, per-tx cap, and daily cap before forwarding `msg.value` USDC to `to`.

**Views**:
- `getAgent(agent)`, `getRemainingDailyBudget(agent)`, `isServiceAllowed(agent, service)`, `getAgentsByOwner(owner)`, `canPay(agent, to, amount)` (dry-run, returns reason on failure).

### Safety properties

| Property | How enforced |
|---|---|
| Agent can't pay outside the allowlist | `if (!allowedServices[msg.sender][to]) revert ServiceNotAllowed(to)` |
| Agent can't exceed `perTxLimit` in a single call | `if (msg.value > perTxLimit) revert ExceedsPerTxLimit(...)` |
| Agent can't exceed `dailyLimit` over 24h | Daily counter with auto-reset on new UTC day |
| Compromised key → bounded loss | Max loss/day = `dailyLimit` (set by owner) |
| Reentrancy | Strict Check-Effects-Interactions ordering in `agentPay` |
| Plain ETH transfers are silently lost | `receive()` reverts, forcing all payments through `agentPay` |

### Why no approval workflow?

The first version of this design considered a "manager approves transactions above $X" flow (like a corporate card). It was cut for the hackathon because:

1. Track 4 (Agentic Economy) explicitly asks for **autonomous** agents — every approval step is one more place to break that contract.
2. Limits already bound the worst-case outcome to one day's budget.
3. The added complexity (pending state, expiration windows, approval/reject UX) burns time that's better spent on the AI backend and frontend.

Approvals are a natural follow-up after the hackathon.

---

## Deployed instance (Arc Testnet)

| Field | Value |
|---|---|
| **Contract** | [`0x1C0cf5a6d6b1EA6EDdF878Aef3e35c2b930f4D31`](https://testnet.arcscan.app/address/0x1C0cf5a6d6b1EA6EDdF878Aef3e35c2b930f4D31) |
| **Deployment TX** | [`0x24a273c9...c993`](https://testnet.arcscan.app/tx/0x24a273c92fed830d22c6ca1aca262fdde35098fa4896fc93052c6bab5089c993) |
| **Network** | Arc Testnet (chainId `5042002`) |
| **Compiler** | Solidity 0.8.24, optimizer 200 runs |

## End-to-end demo on-chain

Running `npm run demo:agentpay` against the deployed instance executes the full lifecycle and produces five live transactions:

| Step | Action | Tx |
|---|---|---|
| 1 | `registerAgent` (caller is both owner and agent for the demo) | [`0x778c367a...0c35`](https://testnet.arcscan.app/tx/0x778c367a20088d55f1797ab9d2b63b1a5bc39c775b84a2e7ad29c2f15d2d0c35) |
| 2 | `addAllowedService` (whitelist a freshly-generated mock service) | [`0x6686cb3f...e47f`](https://testnet.arcscan.app/tx/0x6686cb3f78e7b0339dd636a49d639df93a89da500ade6e5999daeb27f892e47f) |
| 3 | `agentPay` #1 (0.01 USDC, memo `demo-call-1`) | [`0x1239dfcd...85e8b`](https://testnet.arcscan.app/tx/0x1239dfcdb5635bd2e89cf50659eb8bcbd63f597f831d1375ab524b9f59d85e8b) |
| 4 | `agentPay` #2 (0.01 USDC, memo `demo-call-2`) | `0x9b0905ff...3eee7` |
| 5 | `agentPay` #3 (0.01 USDC, memo `demo-call-3`) | [`0xf8a950c3...59dd`](https://testnet.arcscan.app/tx/0xf8a950c3a82262121d2c491a44ce9c364f6e499da59d60238fbd4789741159dd) |

End state on the contract after the demo: `paymentCount = 3`, `totalSpent = 0.03 USDC`, `remainingDailyBudget = 0.07 USDC`.

Re-running the script is idempotent — it skips `registerAgent` if the agent is already registered.

## How to run it yourself

```bash
# 1. Compile and run the unit tests (25 cases across both contracts)
npm install
npm test

# 2. Deploy your own instance (needs .env with PRIVATE_KEY and testnet USDC)
npm run deploy:agentpay

# 3. Run the end-to-end demo against the deployed instance
#    (override AGENTPAY_ADDRESS if you deployed your own)
npm run demo:agentpay
```

## Tests

`test/AgentPay.test.js` covers 20 cases organised into five groups:

1. **registerAgent** — happy path, duplicate guard, zero-address, invalid limit ordering, multi-agent per owner
2. **Allowed services** — add / remove, non-owner rejection
3. **Pause and revoke** — pause/unpause cycle, permanent revoke
4. **agentPay** — happy path, all five revert paths, daily auto-reset across UTC days, plain transfer rejection
5. **View helpers** — `canPay` returns useful reasons, `getRemainingDailyBudget` reflects spend and reset

All 25 tests across `SimplePayment` and `AgentPay` pass in under 1s on the local Hardhat network.

## What's next

- **AI agent backend** — Python service that uses Claude to plan API calls and pays each one through `agentPay`. Demonstrates Track 4's autonomous-economic-experience requirement end-to-end.
- **Frontend (React + Circle Wallets)** — Embedded wallet UX so non-crypto users can spin up an agent in two minutes.
- **Nanopayments integration** — Sub-cent per-call billing for high-frequency streams.
- **Manager approval extension** — Optional pending state for payments above a configurable threshold (post-hackathon).

## License

MIT — see [LICENSE](../LICENSE).
