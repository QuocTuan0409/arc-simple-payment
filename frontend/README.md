# AgentPay Frontend

Single-page dashboard for managing AgentPay agents on Arc Testnet — connect a wallet, register new agents, set spending limits, watch payment events, and pause from one place.

## Quick start

This is intentionally a no-build, single-file frontend. To run it locally:

```bash
# From the repo root
cd frontend

# Option A — Python's built-in HTTP server
python -m http.server 8080

# Option B — Node's http-server (one-off install)
npx http-server -p 8080
```

Then open <http://localhost:8080> in a browser that has MetaMask installed.

> Opening `index.html` directly from the filesystem (`file://`) usually works too, but a tiny static server avoids browser quirks around `window.ethereum` permissions in some setups.

## What's inside

- `index.html` — the whole app: HTML, Tailwind via CDN, ethers.js v6 via CDN, vanilla JS.

There's no bundler, no `node_modules`, no build step. Edit the file, refresh the browser, done.

## Features

- **Connect wallet** via MetaMask, with automatic detection of and a one-click switch to Arc Testnet.
- **Agents list** — every agent owned by the connected address, with daily spend progress bars, remaining-budget readouts, and pause/unpause buttons.
- **Create agent** modal — form-validated registration with sensible defaults (0.1 USDC/day, 0.02 USDC/tx) and a shortcut to register the connected wallet as its own agent.
- **Activity log** — last 20 `PaymentExecuted` events across all of the user's agents, with arcscan links.
- **Network guard** — yellow banner + one-click switch when the user is on the wrong chain.

## Configuration

Hardcoded at the top of the `<script>` block in `index.html`:

```js
const ARC_TESTNET = {
  chainId: 5042002,
  chainIdHex: "0x4cf0d2",
  rpc: "https://rpc.testnet.arc.network",
  explorer: "https://testnet.arcscan.app",
};

const AGENTPAY_ADDRESS = "0x1C0cf5a6d6b1EA6EDdF878Aef3e35c2b930f4D31";
```

To point the UI at a different deployment, edit `AGENTPAY_ADDRESS` and reload.

## Roadmap

A v2 React + Vite + TypeScript port is planned once the v1 feature set is locked in:

- Per-agent detail page with allowlist management (add/remove services).
- One-click agent funding (send USDC to the agent's wallet).
- Live event stream over WebSocket instead of block-range queries.
- Circle Wallets embedded UX so non-crypto users can sign up with email.
