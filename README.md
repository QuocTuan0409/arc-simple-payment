# SimplePayment on Arc

A minimal stablecoin payment relay built on [Arc Testnet](https://docs.arc.io) — Circle's L1 for internet-native finance. Every payment carries an on-chain memo and emits a structured event, turning a transfer into a programmable receipt.

Built as a learning project for the Build on Arc community.

## Why this project

Arc is unusual: **USDC is the native gas token** (18 decimals). That means `msg.value` in a payable function is denominated in USDC, and you can route stablecoin payments using the same primitives Ethereum uses for ETH — no ERC-20 approvals, no token contract addresses, no separate fee token.

This contract takes advantage of that by:

- Forwarding native USDC from sender to recipient in a single transaction.
- Attaching a free-form memo so each payment is searchable on-chain.
- Tracking per-address sent/received counts and global volume for analytics.
- Rejecting bare transfers (`receive()` reverts) so every payment is logged with a memo.

## Architecture

```
+----------+    sendPayment(to, memo) {value: amount}    +----------+
|  Sender  | -------------------------------------------> | Contract |
+----------+                                              +----------+
                                                                |
                                                                | forwards value
                                                                v
                                                          +----------+
                                                          | Recipient|
                                                          +----------+

                emits PaymentSent(from, to, amount, memo, timestamp)
```

The contract is intentionally small (~70 lines including comments). The goal is clarity, not feature surface.

## Contract: `SimplePayment.sol`

| Function | Description |
|---|---|
| `sendPayment(address to, string memo) payable` | Forward `msg.value` USDC to `to`, log a memo, emit `PaymentSent`. |
| `stats()` | Returns `(paymentCount, totalVolume)`. |
| `paymentCount` | Global counter. |
| `totalVolume` | Cumulative USDC volume (wei units, 18 decimals). |
| `sentCount(address)` | Per-address outbound count. |
| `receivedCount(address)` | Per-address inbound count. |

Events: `PaymentSent(address indexed from, address indexed to, uint256 amount, string memo, uint256 timestamp)`

Custom errors: `ZeroAmount`, `ZeroAddress`, `TransferFailed`.

## Setup

```bash
# 1. Install deps
npm install

# 2. Create your env file
cp .env.example .env
# Then fill PRIVATE_KEY with a testnet-only wallet.

# 3. Fund the deployer wallet
# Go to https://faucet.circle.com and select "Arc Testnet".
```

## Run locally

```bash
# Compile
npm run compile

# Run the test suite (uses Hardhat's local network)
npm test
```

## Deploy to Arc Testnet

```bash
npm run deploy:arc
```

Sample output:

```
============================================================
Deploying SimplePayment
============================================================
Network    : arcTestnet (chainId 5042002)
Deployer   : 0x...
Balance    : 5.0 USDC (native gas)

Deploying contract...

Deployment successful!
Contract   : 0x...
Tx hash    : 0x...
Explorer   : https://testnet.arcscan.app/tx/0x...
```

## Send a demo payment

Set the `CONTRACT_ADDRESS` environment variable, then run the send script.

**macOS / Linux:**

```bash
CONTRACT_ADDRESS=0xYourContract npm run send
```

**Windows (cmd):**

```cmd
set CONTRACT_ADDRESS=0xYourContract
npm run send
```

**Windows (PowerShell):**

```powershell
$env:CONTRACT_ADDRESS="0xYourContract"
npm run send
```

The script sends 0.01 USDC, decodes the `PaymentSent` event, and prints updated contract stats.

## Network reference

| Parameter | Value |
|---|---|
| Network | Arc Testnet |
| Chain ID | `5042002` |
| RPC URL | `https://rpc.testnet.arc.network` |
| Currency | USDC (native, 18 decimals) |
| Explorer | [testnet.arcscan.app](https://testnet.arcscan.app) |
| Faucet | [faucet.circle.com](https://faucet.circle.com) |

## Deployed on Arc Testnet

Live on-chain proof that the contract works end-to-end.

| Field | Value |
|---|---|
| **Contract address** | [`0x1702FE076796191c305839631fdC8a711072527d`](https://testnet.arcscan.app/address/0x1702FE076796191c305839631fdC8a711072527d) |
| **Deployment TX** | [View on arcscan](https://testnet.arcscan.app/tx/0x1fbfaccf0b1726d41f1ecaabd032a4bf0004258782ff68fba3caef23962d1f70) |
| **First demo payment TX** | [View on arcscan](https://testnet.arcscan.app/tx/0x98c65bf0705792440ed7869d1fc7df3e5350a8881f5213d8219a8287d8951510) |
| **Network** | Arc Testnet (chainId `5042002`) |
| **Deployed** | May 17, 2026 |

The demo payment routed 0.01 USDC through the contract with the memo `"Hello from 0xB7e49d — Arc Testnet demo"`, emitted the `PaymentSent` event, and updated the on-chain `paymentCount` and `totalVolume` counters. Inspect the contract on arcscan to read its current stats live.

## What's next

Things this repo deliberately does **not** include but would be natural extensions:

- Per-payment fee skim to a treasury address (would make this a tipping/escrow primitive).
- Batch payments (`sendPaymentBatch(address[] to, uint256[] amounts, string[] memos)`).
- Per-agent spending limits and daily budgets — see follow-up project **AgentPay**.
- A tiny React frontend using Arc App Kit to send payments from a connected wallet.
- A subgraph or simple indexer over `PaymentSent` for analytics.

PRs and feedback welcome.

## License

MIT
