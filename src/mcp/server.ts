/**
 * Arc Agent MCP Server
 *
 * Exposes Arc agentic commerce tools to any MCP-compatible AI client
 * (Claude Desktop, Claude Code, custom agents).
 *
 * Add to Claude Desktop config:
 *   {
 *     "mcpServers": {
 *       "arc-agent": {
 *         "command": "npx",
 *         "args": ["tsx", "/path/to/arc-agent-payments/src/mcp/server.ts"],
 *         "env": { "AGENT_PRIVATE_KEY": "...", ... }
 *       }
 *     }
 *   }
 *
 * Or run as HTTP server (port 3000) and add:
 *   claude mcp add --transport http arc-agent http://localhost:3000/mcp
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { AgentIdentityClient } from "../agent/identity.js";
import { AgentCommerceClient, JOB_STATUS } from "../agent/commerce.js";
import { AppKitClient } from "../payments/appkit.js";
import { CircleWalletsClient } from "../payments/wallets.js";
import "dotenv/config";

const identityClient = new AgentIdentityClient();
const commerceClient = new AgentCommerceClient();
const appKitClient = new AppKitClient();
const walletsClient = new CircleWalletsClient();

const server = new Server(
  { name: "arc-agent-payments", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// ─── Tool definitions ──────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // Identity tools
    {
      name: "arc_register_agent",
      description:
        "Register a new AI agent identity on Arc (ERC-8004). Returns the on-chain token ID.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Agent name" },
          description: { type: "string", description: "What this agent does" },
          capabilities: {
            type: "array",
            items: { type: "string" },
            description: "List of capability tags e.g. ['code-review', 'data-analysis']",
          },
        },
        required: ["name", "description", "capabilities"],
      },
    },
    {
      name: "arc_get_agent",
      description: "Get on-chain identity details for an Arc agent by token ID.",
      inputSchema: {
        type: "object",
        properties: {
          tokenId: { type: "number", description: "ERC-8004 agent token ID" },
        },
        required: ["tokenId"],
      },
    },
    {
      name: "arc_my_agents",
      description: "List all Arc agent token IDs owned by the current wallet.",
      inputSchema: { type: "object", properties: {} },
    },
    // Commerce / job tools
    {
      name: "arc_create_job",
      description:
        "Post a new job on Arc with USDC payment held in escrow (ERC-8183). " +
        "The USDC is locked until the client accepts the deliverable.",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string", description: "Task description for the agent" },
          paymentUsdc: { type: "number", description: "USDC payment amount (e.g. 10.5)" },
          deadlineHours: {
            type: "number",
            description: "Hours from now until the job deadline",
            default: 24,
          },
        },
        required: ["description", "paymentUsdc"],
      },
    },
    {
      name: "arc_accept_job",
      description: "Accept an open job as an AI agent. Locks the agent into the job.",
      inputSchema: {
        type: "object",
        properties: {
          jobId: { type: "number" },
          agentTokenId: { type: "number", description: "Your ERC-8004 agent token ID" },
        },
        required: ["jobId", "agentTokenId"],
      },
    },
    {
      name: "arc_submit_deliverable",
      description:
        "Submit a deliverable for a job. The content is hashed on-chain (keccak256).",
      inputSchema: {
        type: "object",
        properties: {
          jobId: { type: "number" },
          deliverable: {
            type: "string",
            description: "Deliverable content or URL/CID to hash",
          },
        },
        required: ["jobId", "deliverable"],
      },
    },
    {
      name: "arc_complete_job",
      description:
        "Accept a submitted deliverable and release USDC payment to the agent (client only).",
      inputSchema: {
        type: "object",
        properties: { jobId: { type: "number" } },
        required: ["jobId"],
      },
    },
    {
      name: "arc_get_job",
      description: "Get full details and status of a job by ID.",
      inputSchema: {
        type: "object",
        properties: { jobId: { type: "number" } },
        required: ["jobId"],
      },
    },
    // Payments tools
    {
      name: "arc_balance",
      description: "Get USDC balance on Arc Testnet for an address.",
      inputSchema: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "Wallet address (defaults to current wallet)",
          },
        },
      },
    },
    {
      name: "arc_send_usdc",
      description: "Send USDC to an address on Arc Testnet.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient address" },
          amount: { type: "number", description: "USDC amount" },
        },
        required: ["to", "amount"],
      },
    },
    {
      name: "arc_create_wallet",
      description:
        "Create a new Circle developer-controlled wallet on Arc (SCA, gas-sponsored).",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Optional label for the wallet" },
        },
      },
    },
    {
      name: "arc_request_faucet",
      description: "Request testnet USDC from the Circle faucet for a wallet address.",
      inputSchema: {
        type: "object",
        properties: {
          address: { type: "string", description: "Wallet address to fund" },
        },
        required: ["address"],
      },
    },
  ],
}));

// ─── Tool execution ─────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    switch (name) {
      case "arc_register_agent": {
        const { name: agentName, description, capabilities } = args as {
          name: string;
          description: string;
          capabilities: string[];
        };
        const result = await identityClient.registerAgent(agentName, {
          name: agentName,
          description,
          capabilities,
          version: "1.0.0",
        });
        return {
          content: [
            {
              type: "text",
              text: `Agent registered!\n- Token ID: ${result.tokenId}\n- Tx: ${result.txHash}\n- Explorer: https://testnet.arcscan.app/tx/${result.txHash}`,
            },
          ],
        };
      }

      case "arc_get_agent": {
        const { tokenId } = args as { tokenId: number };
        const agent = await identityClient.getAgent(BigInt(tokenId));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { ...agent, reputation: `${Number(agent.reputation) / 100}%` },
                null,
                2
              ),
            },
          ],
        };
      }

      case "arc_my_agents": {
        const ids = await identityClient.getMyAgents();
        return {
          content: [
            {
              type: "text",
              text: ids.length === 0
                ? "No agents registered yet. Use arc_register_agent to create one."
                : `Your agents: ${ids.map(String).join(", ")}`,
            },
          ],
        };
      }

      case "arc_create_job": {
        const { description, paymentUsdc, deadlineHours = 24 } = args as {
          description: string;
          paymentUsdc: number;
          deadlineHours?: number;
        };
        const paymentRaw = BigInt(Math.round(paymentUsdc * 1_000_000));
        const result = await commerceClient.createJob(
          description,
          paymentRaw,
          deadlineHours * 3600
        );
        return {
          content: [
            {
              type: "text",
              text: `Job created!\n- Job ID: ${result.jobId}\n- Payment: ${paymentUsdc} USDC (in escrow)\n- Tx: ${result.txHash}\n- Explorer: https://testnet.arcscan.app/tx/${result.txHash}`,
            },
          ],
        };
      }

      case "arc_accept_job": {
        const { jobId, agentTokenId } = args as { jobId: number; agentTokenId: number };
        const txHash = await commerceClient.acceptJob(BigInt(jobId), BigInt(agentTokenId));
        return {
          content: [{ type: "text", text: `Job ${jobId} accepted by agent ${agentTokenId}. Tx: ${txHash}` }],
        };
      }

      case "arc_submit_deliverable": {
        const { jobId, deliverable } = args as { jobId: number; deliverable: string };
        const result = await commerceClient.submitDeliverable(BigInt(jobId), deliverable);
        return {
          content: [
            {
              type: "text",
              text: `Deliverable submitted for job ${jobId}.\n- Hash: ${result.deliverableHash}\n- Tx: ${result.txHash}`,
            },
          ],
        };
      }

      case "arc_complete_job": {
        const { jobId } = args as { jobId: number };
        const txHash = await commerceClient.completeJob(BigInt(jobId));
        return {
          content: [{ type: "text", text: `Job ${jobId} completed. USDC released. Tx: ${txHash}` }],
        };
      }

      case "arc_get_job": {
        const { jobId } = args as { jobId: number };
        const job = await commerceClient.getJob(BigInt(jobId));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ...job,
                  paymentUsdc: `${Number(job.paymentAmount) / 1_000_000} USDC`,
                  deadline: new Date(Number(job.deadline) * 1000).toISOString(),
                  statusLabel: JOB_STATUS[job.status as keyof typeof JOB_STATUS],
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "arc_balance": {
        const { address } = (args ?? {}) as { address?: string };
        const balance = await appKitClient.getBalance(address as `0x${string}` | undefined);
        return {
          content: [{ type: "text", text: `Balance: ${balance.usdc} USDC` }],
        };
      }

      case "arc_send_usdc": {
        const { to, amount } = args as { to: string; amount: number };
        const txHash = await appKitClient.sendUsdc(to as `0x${string}`, amount);
        return {
          content: [{ type: "text", text: `Sent ${amount} USDC to ${to}. Tx: ${txHash}` }],
        };
      }

      case "arc_create_wallet": {
        const { name: walletName } = (args ?? {}) as { name?: string };
        const wallet = await walletsClient.createWallet(walletName);
        return {
          content: [
            {
              type: "text",
              text: `Wallet created!\n- ID: ${wallet.id}\n- Address: ${wallet.address}\n- Type: ${wallet.accountType} (gas-sponsored)`,
            },
          ],
        };
      }

      case "arc_request_faucet": {
        const { address } = args as { address: string };
        await walletsClient.requestFaucetTokens(address);
        return {
          content: [
            {
              type: "text",
              text: `Faucet tokens requested for ${address}.\nCheck balance at: https://testnet.arcscan.app/address/${address}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ─── Start server ────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Arc Agent MCP server running on stdio");
