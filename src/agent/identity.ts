import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, config } from "../config.js";

const AGENT_IDENTITY_ABI = parseAbi([
  "function registerAgent(string name, string metadataURI) returns (uint256 tokenId)",
  "function getAgent(uint256 tokenId) view returns ((address owner, string name, string metadataURI, uint256 reputation, uint256 registeredAt, bool active))",
  "function getAgentsByOwner(address owner) view returns (uint256[])",
  "function addCredential(uint256 tokenId, bytes32 credentialHash)",
  "function hasCredential(uint256 tokenId, bytes32 credentialHash) view returns (bool)",
  "function updateMetadata(uint256 tokenId, string metadataURI)",
  "event AgentRegistered(uint256 indexed tokenId, address indexed owner, string name)",
]);

export interface AgentMetadata {
  name: string;
  description: string;
  capabilities: string[];
  version: string;
}

export class AgentIdentityClient {
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

  // ─── Registration ──────────────────────────────────────────────────────

  /**
   * Register a new AI agent identity on Arc via ERC-8004.
   * Returns the on-chain token ID of the registered agent.
   */
  async registerAgent(
    name: string,
    metadata: AgentMetadata
  ): Promise<{ tokenId: bigint; txHash: `0x${string}` }> {
    const metadataURI = `data:application/json;base64,${Buffer.from(
      JSON.stringify(metadata)
    ).toString("base64")}`;

    const { request } = await this.publicClient.simulateContract({
      address: config.contracts.agentIdentityRegistry,
      abi: AGENT_IDENTITY_ABI,
      functionName: "registerAgent",
      args: [name, metadataURI],
      account: this.walletClient.account,
    });

    const txHash = await this.walletClient.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    // Extract tokenId from RegisteredAgent event log
    const log = receipt.logs[0];
    const tokenId = BigInt(log.topics[1] ?? "0x0");

    console.log(`✅ Agent registered: tokenId=${tokenId}, tx=${txHash}`);
    return { tokenId, txHash };
  }

  // ─── Queries ───────────────────────────────────────────────────────────

  async getAgent(tokenId: bigint) {
    return this.publicClient.readContract({
      address: config.contracts.agentIdentityRegistry,
      abi: AGENT_IDENTITY_ABI,
      functionName: "getAgent",
      args: [tokenId],
    });
  }

  async getMyAgents(): Promise<bigint[]> {
    return this.publicClient.readContract({
      address: config.contracts.agentIdentityRegistry,
      abi: AGENT_IDENTITY_ABI,
      functionName: "getAgentsByOwner",
      args: [this.address],
    });
  }

  // ─── Credentials ───────────────────────────────────────────────────────

  /**
   * Add a verifiable credential hash to the agent.
   * credential can be a hash of: "verified:kyc", "skill:code-review", etc.
   */
  async addCredential(tokenId: bigint, credentialLabel: string) {
    const credentialHash = `0x${Buffer.from(credentialLabel).toString("hex").padEnd(64, "0")}` as `0x${string}`;

    const { request } = await this.publicClient.simulateContract({
      address: config.contracts.agentIdentityRegistry,
      abi: AGENT_IDENTITY_ABI,
      functionName: "addCredential",
      args: [tokenId, credentialHash as `0x${string}`],
      account: this.walletClient.account,
    });

    const txHash = await this.walletClient.writeContract(request);
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`✅ Credential added: ${credentialLabel} → token ${tokenId}`);
    return txHash;
  }
}
