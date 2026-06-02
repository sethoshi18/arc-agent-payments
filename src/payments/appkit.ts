/**
 * Arc App Kit integration — Send, Bridge, Swap, Unified Balance
 *
 * App Kit wraps Circle's CCTP + Gateway protocols behind a type-safe API.
 * Adapters: Viem v2, Ethers v6, Solana, Circle Wallets.
 *
 * Install: npm install @circle-fin/app-kit
 * Docs: https://docs.arc.io/build/app-kits
 */

// NOTE: @circle-fin/app-kit package name may differ — verify on release.
// The import below follows the docs.arc.io quickstart.
// import { AppKit, SendKit, BridgeKit, SwapKit } from "@circle-fin/app-kit";

import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, config } from "../config.js";

/**
 * AppKitClient provides a simple interface over Arc App Kits.
 * For production use, initialise with Circle Wallets for non-custodial UX.
 */
export class AppKitClient {
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

  /**
   * Send USDC to an address on Arc.
   * USDC is the native gas token so this is a direct native transfer.
   */
  async sendUsdc(to: `0x${string}`, amountUsdc: number): Promise<`0x${string}`> {
    const value = parseUnits(String(amountUsdc), 6); // USDC has 6 decimals

    const txHash = await this.walletClient.sendTransaction({
      to,
      value,
      // On Arc, USDC is the native currency — no ERC-20 call needed
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`✅ Sent ${amountUsdc} USDC to ${to}: ${txHash}`);
    return txHash;
  }

  /**
   * Get Arc testnet USDC from the faucet.
   * Opens the faucet URL — user needs to complete the request manually.
   */
  getFaucetUrl(): string {
    return "https://faucet.circle.com";
  }

  /**
   * Unified Balance — get USDC balance on Arc Testnet.
   */
  async getBalance(address?: `0x${string}`): Promise<{ usdc: string; raw: bigint }> {
    const target = address ?? this.walletClient.account.address;
    // On Arc, USDC is native — use getBalance, not ERC-20 balanceOf
    const raw = await this.publicClient.getBalance({ address: target });
    return {
      raw,
      usdc: (Number(raw) / 1e6).toFixed(6),
    };
  }

  /**
   * Bridge USDC cross-chain via Circle CCTP.
   * Requires App Kit BridgeKit — stubbed for now.
   *
   * @param destinationChainId Target chain (e.g. 1 = Ethereum, 8453 = Base)
   * @param amountUsdc Amount to bridge in USDC (6 decimals)
   */
  async bridgeUsdc(
    destinationChainId: number,
    amountUsdc: number
  ): Promise<void> {
    // TODO: Initialise BridgeKit from @circle-fin/app-kit with Circle API key
    // const bridge = new BridgeKit({ apiKey: config.circle.apiKey });
    // const result = await bridge.transfer({ destinationChainId, amount: parseUnits(String(amountUsdc), 6) });
    console.warn(
      `bridgeUsdc stub — destination chain ${destinationChainId}, ${amountUsdc} USDC. ` +
        "Implement with @circle-fin/app-kit BridgeKit."
    );
  }

  /**
   * Swap tokens on Arc (only Arc Testnet supports Swap via App Kit).
   */
  async swap(
    tokenIn: `0x${string}`,
    tokenOut: `0x${string}`,
    amountIn: bigint
  ): Promise<void> {
    // TODO: Initialise SwapKit from @circle-fin/app-kit
    console.warn("swap stub — implement with @circle-fin/app-kit SwapKit.");
  }
}
