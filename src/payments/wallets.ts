/**
 * Circle Wallets API — Developer-Controlled Wallets
 *
 * Used for agent-owned wallets that don't require a user to hold a private key.
 * The Circle API manages key custody; your Entity Secret encrypts the key share.
 *
 * Docs: https://developers.circle.com/w3s/developer-controlled-wallets
 * SDK:  npm install @circle-fin/user-controlled-wallets
 */

// import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";
import { config } from "../config.js";

export interface CircleWallet {
  id: string;
  address: string;
  blockchain: "ARC";
  state: "LIVE" | "FROZEN";
  accountType: "SCA" | "EOA";
  createDate: string;
}

/**
 * CircleWalletsClient wraps the Circle Wallets API for Arc.
 *
 * For production agents, use developer-controlled wallets so the agent
 * can sign transactions without exposing a raw private key.
 */
export class CircleWalletsClient {
  private baseUrl = "https://api.circle.com/v1/w3s";
  private headers: Record<string, string>;

  constructor() {
    this.headers = {
      Authorization: `Bearer ${config.circle.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Create a new agent wallet on Arc Testnet.
   * SCA (Smart Contract Account) wallets get gas sponsored by Circle Gas Station.
   */
  async createWallet(name?: string): Promise<CircleWallet> {
    const res = await fetch(`${this.baseUrl}/developer/wallets`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        accountType: "SCA",
        blockchains: ["ARC"],
        metadata: name ? [{ name }] : undefined,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Circle API error creating wallet: ${err}`);
    }

    const data = await res.json();
    return data.data.wallets[0];
  }

  /**
   * List all developer-controlled wallets.
   */
  async listWallets(): Promise<CircleWallet[]> {
    const res = await fetch(`${this.baseUrl}/wallets?blockchain=ARC`, {
      headers: this.headers,
    });

    if (!res.ok) {
      throw new Error(`Circle API error listing wallets: ${await res.text()}`);
    }

    const data = await res.json();
    return data.data.wallets ?? [];
  }

  /**
   * Get USDC balance for a wallet by ID.
   */
  async getBalance(walletId: string): Promise<{ usdc: string }> {
    const res = await fetch(`${this.baseUrl}/wallets/${walletId}/balances`, {
      headers: this.headers,
    });

    if (!res.ok) {
      throw new Error(`Circle API error fetching balance: ${await res.text()}`);
    }

    const data = await res.json();
    const usdcToken = data.data.tokenBalances?.find(
      (t: { token: { symbol: string }; amount: string }) => t.token.symbol === "USDC"
    );

    return { usdc: usdcToken?.amount ?? "0" };
  }

  /**
   * Request testnet USDC from the faucet for a wallet.
   * Calls the Circle Faucet API — works on Arc Testnet only.
   */
  async requestFaucetTokens(walletAddress: string): Promise<void> {
    const res = await fetch("https://api.circle.com/v1/faucet/drips", {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        blockchain: "ARC",
        address: walletAddress,
      }),
    });

    if (!res.ok) {
      throw new Error(`Faucet request failed: ${await res.text()}`);
    }

    console.log(`✅ Faucet tokens requested for ${walletAddress}`);
  }
}
