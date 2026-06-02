/**
 * Arc Agent — main entry point
 *
 * Demonstrates the full agentic commerce flow:
 * 1. Register an AI agent identity (ERC-8004)
 * 2. Check USDC balance
 * 3. Post a job with USDC escrow (ERC-8183)
 * 4. Accept and complete the job
 *
 * Run: npx tsx src/agent/index.ts
 */

import "dotenv/config";
import { requireConfig } from "../config.js";
import { AgentIdentityClient } from "./identity.js";
import { AgentCommerceClient } from "./commerce.js";
import { AppKitClient } from "../payments/appkit.js";

async function main() {
  requireConfig();

  const identityClient = new AgentIdentityClient();
  const commerceClient = new AgentCommerceClient();
  const appKitClient = new AppKitClient();

  console.log("🌐 Arc Agent Demo — Arc Testnet (Chain ID 5042002)");
  console.log(`📍 Wallet: ${identityClient.address}\n`);

  // ─── Step 1: Check balance ───────────────────────────────────────────────
  const balance = await appKitClient.getBalance();
  console.log(`💰 USDC Balance: ${balance.usdc} USDC`);

  if (balance.raw === 0n) {
    console.log(`\n🚰 No testnet USDC found. Get some from: ${appKitClient.getFaucetUrl()}`);
    console.log("   Select 'Arc Testnet' and paste your wallet address.");
    process.exit(0);
  }

  // ─── Step 2: Register agent identity (ERC-8004) ──────────────────────────
  console.log("\n🤖 Registering agent identity...");
  const myAgents = await identityClient.getMyAgents();

  let agentTokenId: bigint;

  if (myAgents.length > 0) {
    agentTokenId = myAgents[0];
    const agent = await identityClient.getAgent(agentTokenId);
    console.log(`✅ Existing agent found: tokenId=${agentTokenId}, name="${agent.name}", reputation=${Number(agent.reputation) / 100}%`);
  } else {
    const { tokenId } = await identityClient.registerAgent("Arc Demo Agent", {
      name: "Arc Demo Agent",
      description: "An AI agent that accepts USDC-paid tasks on Arc",
      capabilities: ["text-generation", "data-analysis", "code-review"],
      version: "1.0.0",
    });
    agentTokenId = tokenId;
  }

  // ─── Step 3: Post a job (ERC-8183) ──────────────────────────────────────
  console.log("\n📋 Creating a test job (1 USDC escrow)...");
  const { jobId } = await commerceClient.createJob(
    "Summarise the Arc whitepaper in 3 bullet points",
    1_000_000n, // 1 USDC
    3600         // 1 hour deadline
  );

  // ─── Step 4: Accept the job ──────────────────────────────────────────────
  console.log(`\n🤝 Agent ${agentTokenId} accepting job ${jobId}...`);
  await commerceClient.acceptJob(jobId, agentTokenId);

  // ─── Step 5: Submit deliverable ──────────────────────────────────────────
  const deliverable = JSON.stringify({
    summary: [
      "Arc is Circle's Layer-1 blockchain where USDC is the native gas token.",
      "ERC-8004 provides on-chain AI agent identity and reputation via NFT registry.",
      "ERC-8183 enables autonomous job contracts with USDC escrow, enabling verifiable AI commerce.",
    ],
  });

  console.log(`\n📦 Submitting deliverable for job ${jobId}...`);
  const { deliverableHash } = await commerceClient.submitDeliverable(jobId, deliverable);

  // ─── Step 6: Complete and release payment ────────────────────────────────
  console.log(`\n✅ Completing job ${jobId} — releasing USDC to agent owner...`);
  await commerceClient.completeJob(jobId);

  const finalBalance = await appKitClient.getBalance();
  console.log(`\n🎉 Demo complete!`);
  console.log(`   Job ID: ${jobId}`);
  console.log(`   Deliverable hash: ${deliverableHash}`);
  console.log(`   Final balance: ${finalBalance.usdc} USDC`);
  console.log(`\n   Explorer: https://testnet.arcscan.app`);
}

main().catch(console.error);
