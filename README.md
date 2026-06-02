# arc-agent-payments

**AI Agentic Commerce & Payments on Arc** — built with Circle's App Kits and MCP.

Arc is Circle's Layer-1 blockchain where **USDC is the native gas token**. This repo implements the full agentic economy stack:

- **ERC-8004** — On-chain AI agent identity & reputation registry
- **ERC-8183** — Programmable job lifecycle with USDC escrow
- **Circle App Kits** — Send, Bridge, Swap, Unified Balance
- **Circle Wallets API** — Developer-controlled, gas-sponsored SCA wallets
- **MCP Server** — Expose Arc agent tools to Claude and any MCP client

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  MCP Client (Claude)                 │
│              arc_create_job / arc_accept_job...      │
└────────────────────┬────────────────────────────────┘
                     │ MCP (stdio / HTTP)
┌────────────────────▼────────────────────────────────┐
│              Arc Agent MCP Server                    │
│         src/mcp/server.ts — 12 tools                 │
└──────┬─────────────────────────────┬────────────────┘
       │                             │
┌──────▼──────┐             ┌────────▼──────────┐
│  Agent      │             │  Payments         │
│  Identity   │             │  App Kit          │
│  (ERC-8004) │             │  Wallets API      │
└──────┬──────┘             └────────┬──────────┘
       │                             │
┌──────▼─────────────────────────────▼──────────┐
│              Arc Testnet                       │
│    Chain ID 5042002 · USDC native gas          │
│    RPC: https://rpc.testnet.arc.network        │
└───────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────┐
│  Contracts (Solidity 0.8.24)                 │
│  AgentIdentity.sol — ERC-8004               │
│  AgentJob.sol      — ERC-8183               │
└─────────────────────────────────────────────┘
```

---

## Live Deployments

### Arc Testnet (Chain ID 5042002)

| Contract | Address | Standard |
|---|---|---|
| AgentIdentity | [`0x5Bef356f...3b8233`](https://testnet.arcscan.app/address/0x5Bef356f89425823FC7eebB3A6ED1A678F3b8233) | ERC-8004 |
| AgentJob | [`0xD698d15F...5094`](https://testnet.arcscan.app/address/0xD698d15F776279c0213444a779941e8E0Cbe5094) | ERC-8183 |
| USDC (native ERC-20) | [`0x3600...0000`](https://testnet.arcscan.app/address/0x3600000000000000000000000000000000000000) | ERC-20 |

Full deployment details: [`deployments/arc-testnet.json`](./deployments/arc-testnet.json)

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Where to get it |
|---|---|
| `CIRCLE_API_KEY` | [console.circle.com](https://console.circle.com) → API Keys |
| `CIRCLE_ENTITY_SECRET` | Generated once via Circle SDK setup |
| `AGENT_PRIVATE_KEY` | `cast wallet new` (Foundry) or Circle Wallets |
| `ARC_RPC_URL` | `https://rpc.testnet.arc.network` (default) |

### 3. Get testnet USDC

Visit **https://faucet.circle.com**, select **Arc Testnet**, paste your wallet address.

### 4. Deploy contracts

```bash
# Install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

This deploys `AgentIdentity` and `AgentJob`, then writes the addresses to your `.env`.

### 5. Run the demo

```bash
npm run dev
# or
npx tsx src/agent/index.ts
```

The demo:
1. Checks your USDC balance
2. Registers an AI agent identity on-chain (ERC-8004)
3. Posts a job with 1 USDC in escrow (ERC-8183)
4. Has the agent accept and submit a deliverable
5. Releases the USDC payment

---

## MCP Server

Run the MCP server to expose Arc tools to Claude:

```bash
npm run mcp
```

### Add to Claude Desktop

```json
{
  "mcpServers": {
    "arc-agent": {
      "command": "npx",
      "args": ["tsx", "/path/to/arc-agent-payments/src/mcp/server.ts"],
      "env": {
        "AGENT_PRIVATE_KEY": "0x...",
        "CIRCLE_API_KEY": "...",
        "AGENT_IDENTITY_REGISTRY_ADDRESS": "0x...",
        "AGENT_JOB_CONTRACT_ADDRESS": "0x..."
      }
    }
  }
}
```

### Add to Claude Code

```bash
claude mcp add --transport stdio arc-agent npx tsx src/mcp/server.ts
```

### Available MCP Tools

| Tool | Description |
|---|---|
| `arc_register_agent` | Register AI agent identity (ERC-8004) |
| `arc_get_agent` | Get agent details and reputation |
| `arc_my_agents` | List your agent token IDs |
| `arc_create_job` | Post a job with USDC escrow (ERC-8183) |
| `arc_accept_job` | Agent accepts a job |
| `arc_submit_deliverable` | Submit work with on-chain hash |
| `arc_complete_job` | Client accepts + releases USDC |
| `arc_get_job` | Get job status and details |
| `arc_balance` | Check USDC balance |
| `arc_send_usdc` | Send USDC on Arc |
| `arc_create_wallet` | Create Circle developer wallet |
| `arc_request_faucet` | Request testnet USDC |

---

## Testnet Resources

| Resource | URL |
|---|---|
| RPC | https://rpc.testnet.arc.network |
| Explorer | https://testnet.arcscan.app |
| Faucet | https://faucet.circle.com |
| Chain ID | 5042002 |
| Native currency | USDC (6 decimals) |

---

## Project Structure

```
arc-agent-payments/
├── contracts/
│   ├── interfaces/
│   │   ├── IERC8004.sol        # Agent identity interface
│   │   └── IERC8183.sol        # Job lifecycle interface
│   ├── AgentIdentity.sol       # ERC-8004 implementation
│   └── AgentJob.sol            # ERC-8183 implementation
├── src/
│   ├── agent/
│   │   ├── index.ts            # Demo entry point
│   │   ├── identity.ts         # ERC-8004 TypeScript client
│   │   └── commerce.ts         # ERC-8183 TypeScript client
│   ├── payments/
│   │   ├── appkit.ts           # Circle App Kit (Send/Bridge/Swap)
│   │   └── wallets.ts          # Circle Wallets API
│   ├── mcp/
│   │   └── server.ts           # MCP server (12 tools)
│   └── config.ts               # Environment + chain config
├── scripts/
│   └── deploy.sh               # Contract deployment script
├── foundry.toml
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Stack

- **Chain**: Arc Testnet (Circle, Chain ID 5042002)
- **Contracts**: Solidity 0.8.24, Foundry
- **SDK**: Viem v2, Circle App Kit, Circle Wallets API
- **MCP**: @modelcontextprotocol/sdk
- **Runtime**: Node.js 20+, TypeScript 5.4

## References

- [Arc Docs](https://docs.arc.io)
- [Arc Testnet Explorer](https://testnet.arcscan.app)
- [Circle Developer Console](https://console.circle.com)
- [Circle App Kit Docs](https://docs.arc.io/build/app-kits)
- [ERC-8004 Spec](https://docs.arc.io/build/agentic-economy/erc-8004)
- [ERC-8183 Spec](https://docs.arc.io/build/agentic-economy/erc-8183)
