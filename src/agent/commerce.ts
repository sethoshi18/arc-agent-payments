import { createWalletClient, createPublicClient, http, parseAbi, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, config } from "../config.js";

const JOB_ABI = parseAbi([
  "function createJob(string description, uint256 paymentAmount, uint256 deadline) returns (uint256 jobId)",
  "function acceptJob(uint256 jobId, uint256 agentTokenId)",
  "function submitDeliverable(uint256 jobId, bytes32 deliverableHash)",
  "function completeJob(uint256 jobId)",
  "function disputeJob(uint256 jobId, string reason)",
  "function cancelJob(uint256 jobId)",
  "function getJob(uint256 jobId) view returns ((uint256 id, address client, uint256 agentTokenId, string description, bytes32 deliverableHash, uint256 paymentAmount, uint256 deadline, uint8 status, uint256 createdAt, uint256 completedAt))",
  "function getJobsByClient(address client) view returns (uint256[])",
  "function getJobsByAgent(uint256 agentTokenId) view returns (uint256[])",
  "event JobCreated(uint256 indexed jobId, address indexed client, uint256 paymentAmount)",
  "event JobCompleted(uint256 indexed jobId, address indexed agentOwner, uint256 payout)",
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

export const JOB_STATUS = {
  0: "Open",
  1: "Accepted",
  2: "Submitted",
  3: "Completed",
  4: "Disputed",
  5: "Cancelled",
} as const;

export class AgentCommerceClient {
  private walletClient;
  private publicClient;

  constructor() {
    const account = privateKeyToAccount(config.wallet.privateKey);

    this.publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(config.arc.rpcUrl),
    });

    this.walletClient = createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(config.arc.rpcUrl),
    });
  }

  get address() {
    return this.walletClient.account.address;
  }

  // ─── Client-side: post and manage jobs ────────────────────────────────

  /**
   * Post a new job with USDC payment held in escrow.
   * USDC approval is handled automatically if needed.
   */
  async createJob(
    description: string,
    paymentUsdc: bigint,
    deadlineSeconds: number
  ): Promise<{ jobId: bigint; txHash: `0x${string}` }> {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

    // Approve USDC spend if needed
    const allowance = await this.publicClient.readContract({
      address: config.contracts.usdc,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [this.address, config.contracts.agentJobContract],
    });

    if (allowance < paymentUsdc) {
      console.log("⏳ Approving USDC spend...");
      const { request } = await this.publicClient.simulateContract({
        address: config.contracts.usdc,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [config.contracts.agentJobContract, paymentUsdc],
        account: this.walletClient.account,
      });
      const approveTx = await this.walletClient.writeContract(request);
      await this.publicClient.waitForTransactionReceipt({ hash: approveTx });
      console.log(`✅ USDC approved: ${approveTx}`);
    }

    const { request } = await this.publicClient.simulateContract({
      address: config.contracts.agentJobContract,
      abi: JOB_ABI,
      functionName: "createJob",
      args: [description, paymentUsdc, deadline],
      account: this.walletClient.account,
    });

    const txHash = await this.walletClient.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    const log = receipt.logs[0];
    const jobId = BigInt(log.topics[1] ?? "0x0");

    console.log(`✅ Job created: id=${jobId}, payment=${paymentUsdc / 1_000_000n} USDC`);
    return { jobId, txHash };
  }

  async completeJob(jobId: bigint) {
    const { request } = await this.publicClient.simulateContract({
      address: config.contracts.agentJobContract,
      abi: JOB_ABI,
      functionName: "completeJob",
      args: [jobId],
      account: this.walletClient.account,
    });
    const txHash = await this.walletClient.writeContract(request);
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`✅ Job ${jobId} completed — USDC released to agent`);
    return txHash;
  }

  async disputeJob(jobId: bigint, reason: string) {
    const { request } = await this.publicClient.simulateContract({
      address: config.contracts.agentJobContract,
      abi: JOB_ABI,
      functionName: "disputeJob",
      args: [jobId, reason],
      account: this.walletClient.account,
    });
    return this.walletClient.writeContract(request);
  }

  // ─── Agent-side: accept and fulfill jobs ──────────────────────────────

  /**
   * Agent accepts an open job.
   */
  async acceptJob(jobId: bigint, agentTokenId: bigint) {
    const { request } = await this.publicClient.simulateContract({
      address: config.contracts.agentJobContract,
      abi: JOB_ABI,
      functionName: "acceptJob",
      args: [jobId, agentTokenId],
      account: this.walletClient.account,
    });
    const txHash = await this.walletClient.writeContract(request);
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`✅ Job ${jobId} accepted by agent ${agentTokenId}`);
    return txHash;
  }

  /**
   * Submit a deliverable hash. The hash should be keccak256 of the
   * actual deliverable content (a URL, a JSON blob, an IPFS CID, etc.)
   */
  async submitDeliverable(jobId: bigint, deliverableContent: string) {
    const deliverableHash = keccak256(toHex(deliverableContent));

    const { request } = await this.publicClient.simulateContract({
      address: config.contracts.agentJobContract,
      abi: JOB_ABI,
      functionName: "submitDeliverable",
      args: [jobId, deliverableHash],
      account: this.walletClient.account,
    });
    const txHash = await this.walletClient.writeContract(request);
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`✅ Deliverable submitted for job ${jobId}: hash=${deliverableHash}`);
    return { txHash, deliverableHash };
  }

  // ─── Queries ───────────────────────────────────────────────────────────

  async getJob(jobId: bigint) {
    const job = await this.publicClient.readContract({
      address: config.contracts.agentJobContract,
      abi: JOB_ABI,
      functionName: "getJob",
      args: [jobId],
    });
    return {
      ...job,
      statusLabel: JOB_STATUS[job.status as keyof typeof JOB_STATUS],
    };
  }

  async getMyJobs() {
    return this.publicClient.readContract({
      address: config.contracts.agentJobContract,
      abi: JOB_ABI,
      functionName: "getJobsByClient",
      args: [this.address],
    });
  }

  async getUsdcBalance(address?: `0x${string}`) {
    const target = address ?? this.address;
    const raw = await this.publicClient.readContract({
      address: config.contracts.usdc,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [target],
    });
    return {
      raw,
      formatted: Number(raw) / 1_000_000,
    };
  }
}
