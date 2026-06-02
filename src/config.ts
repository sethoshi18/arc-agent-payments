import { defineChain } from "viem";

// ─── Arc Testnet chain definition ───────────────────────────────────────────
// viem/chains also exports arcTestnet — use this for explicit control
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,
  },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
    public: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

// ─── Environment config ─────────────────────────────────────────────────────
export const config = {
  circle: {
    apiKey: process.env.CIRCLE_API_KEY ?? "",
    entitySecret: process.env.CIRCLE_ENTITY_SECRET ?? "",
  },
  arc: {
    rpcUrl: process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network",
    chainId: Number(process.env.ARC_CHAIN_ID ?? 5042002),
  },
  contracts: {
    agentIdentityRegistry: (process.env.AGENT_IDENTITY_REGISTRY_ADDRESS ?? "") as `0x${string}`,
    agentJobContract: (process.env.AGENT_JOB_CONTRACT_ADDRESS ?? "") as `0x${string}`,
    // Arc Testnet USDC — ERC-20 interface over the native asset (6 decimals)
    // Source: https://docs.arc.network/arc/references/contract-addresses
    usdc: "0x3600000000000000000000000000000000000000" as `0x${string}`,
  },
  wallet: {
    privateKey: (process.env.AGENT_PRIVATE_KEY ?? "") as `0x${string}`,
  },
  mcp: {
    port: Number(process.env.MCP_SERVER_PORT ?? 3000),
  },
} as const;

export function requireConfig() {
  const missing: string[] = [];
  if (!config.circle.apiKey) missing.push("CIRCLE_API_KEY");
  if (!config.circle.entitySecret) missing.push("CIRCLE_ENTITY_SECRET");
  if (!config.wallet.privateKey) missing.push("AGENT_PRIVATE_KEY");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        "Copy .env.example to .env and fill in the values."
    );
  }
}
