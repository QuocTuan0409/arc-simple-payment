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

## What's next

Things this repo deliberately does **not** include but would be natural extensions:

- Per-payment fee skim to a treasury address (would make this a tipping/escrow primitive).
- Batch payments (`sendPaymentBatch(address[] to, uint256[] amounts, string[] memos)`).
- A tiny React frontend using Arc App Kit to send payments from a connected wallet.
- A subgraph or simple indexer over `PaymentSent` for analytics.

PRs and feedback welcome.

## License

MIT
