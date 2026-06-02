#!/usr/bin/env bash
# Deploy AgentIdentity and AgentJob contracts to Arc Testnet
# Usage: ./scripts/deploy.sh
#
# Prerequisites:
#   1. Copy .env.example to .env and fill in AGENT_PRIVATE_KEY + ARC_RPC_URL
#   2. Fund wallet with testnet USDC from https://faucet.circle.com
#   3. Install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup

set -e

source .env

echo "🌐 Deploying to Arc Testnet (Chain ID 5042002)"
echo "📍 Deployer: $(cast wallet address $AGENT_PRIVATE_KEY)"
echo ""

# ─── Deploy AgentIdentity ─────────────────────────────────────────────────
echo "📋 Deploying AgentIdentity (ERC-8004)..."
IDENTITY_ADDRESS=$(forge create \
  contracts/AgentIdentity.sol:AgentIdentity \
  --rpc-url "$ARC_RPC_URL" \
  --private-key "$AGENT_PRIVATE_KEY" \
  --broadcast \
  --json | jq -r '.deployedTo')

echo "✅ AgentIdentity deployed: $IDENTITY_ADDRESS"

# ─── Deploy AgentJob ──────────────────────────────────────────────────────
echo ""
echo "📋 Deploying AgentJob (ERC-8183)..."

# Arc Testnet USDC address — verify on https://testnet.arcscan.app
USDC_ADDRESS="0x3600000000000000000000000000000000000000"

JOB_ADDRESS=$(forge create \
  contracts/AgentJob.sol:AgentJob \
  --rpc-url "$ARC_RPC_URL" \
  --private-key "$AGENT_PRIVATE_KEY" \
  --constructor-args "$IDENTITY_ADDRESS" "$USDC_ADDRESS" \
  --broadcast \
  --json | jq -r '.deployedTo')

echo "✅ AgentJob deployed: $JOB_ADDRESS"

# ─── Authorise AgentJob to update reputation ─────────────────────────────
echo ""
echo "🔗 Authorising AgentJob as trusted reputation updater..."
cast send "$IDENTITY_ADDRESS" \
  "setTrustedUpdater(address,bool)" \
  "$JOB_ADDRESS" true \
  --rpc-url "$ARC_RPC_URL" \
  --private-key "$AGENT_PRIVATE_KEY"

echo "✅ Trusted updater set"

# ─── Update .env with deployed addresses ─────────────────────────────────
echo ""
echo "📝 Updating .env with deployed addresses..."
sed -i.bak "s|AGENT_IDENTITY_REGISTRY_ADDRESS=.*|AGENT_IDENTITY_REGISTRY_ADDRESS=$IDENTITY_ADDRESS|" .env
sed -i.bak "s|AGENT_JOB_CONTRACT_ADDRESS=.*|AGENT_JOB_CONTRACT_ADDRESS=$JOB_ADDRESS|" .env
rm .env.bak 2>/dev/null || true

echo ""
echo "🎉 Deployment complete!"
echo "   AgentIdentity: $IDENTITY_ADDRESS"
echo "   AgentJob:      $JOB_ADDRESS"
echo ""
echo "   View on ArcScan:"
echo "   https://testnet.arcscan.app/address/$IDENTITY_ADDRESS"
echo "   https://testnet.arcscan.app/address/$JOB_ADDRESS"
