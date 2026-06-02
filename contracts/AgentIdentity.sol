// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC8004.sol";

/// @title AgentIdentity — ERC-8004 AI Agent Identity Registry
/// @notice Mint-once NFT per agent. Reputation updated by trusted job contracts.
contract AgentIdentity is IERC8004 {
    uint256 private _nextTokenId = 1;

    mapping(uint256 => AgentIdentity) private _agents;
    mapping(address => uint256[]) private _ownerTokens;
    mapping(uint256 => mapping(bytes32 => bool)) private _credentials;

    /// @dev Addresses authorised to update reputation (job contracts)
    mapping(address => bool) public trustedUpdaters;
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "AgentIdentity: not owner");
        _;
    }

    modifier onlyAgentOwner(uint256 tokenId) {
        require(_agents[tokenId].owner == msg.sender, "AgentIdentity: not agent owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ─── Admin ──────────────────────────────────────────────────────────────

    function setTrustedUpdater(address updater, bool trusted) external onlyOwner {
        trustedUpdaters[updater] = trusted;
    }

    // ─── IERC8004 ───────────────────────────────────────────────────────────

    function registerAgent(string calldata name, string calldata metadataURI)
        external
        override
        returns (uint256 tokenId)
    {
        tokenId = _nextTokenId++;
        _agents[tokenId] = AgentIdentity({
            owner: msg.sender,
            name: name,
            metadataURI: metadataURI,
            reputation: 5000, // Start at 50% (5000 bps)
            registeredAt: block.timestamp,
            active: true
        });
        _ownerTokens[msg.sender].push(tokenId);
        emit AgentRegistered(tokenId, msg.sender, name);
    }

    function getAgent(uint256 tokenId) external view override returns (AgentIdentity memory) {
        require(_agents[tokenId].registeredAt != 0, "AgentIdentity: not found");
        return _agents[tokenId];
    }

    function getAgentsByOwner(address _owner) external view override returns (uint256[] memory) {
        return _ownerTokens[_owner];
    }

    function addCredential(uint256 tokenId, bytes32 credentialHash)
        external
        override
        onlyAgentOwner(tokenId)
    {
        _credentials[tokenId][credentialHash] = true;
        emit CredentialAdded(tokenId, credentialHash);
    }

    function hasCredential(uint256 tokenId, bytes32 credentialHash)
        external
        view
        override
        returns (bool)
    {
        return _credentials[tokenId][credentialHash];
    }

    function updateMetadata(uint256 tokenId, string calldata metadataURI)
        external
        override
        onlyAgentOwner(tokenId)
    {
        _agents[tokenId].metadataURI = metadataURI;
    }

    // ─── Reputation (called by trusted job contracts) ───────────────────────

    /// @notice Called by AgentJob on job completion/dispute to adjust reputation
    /// @param delta Change in bps — positive increases, negative decreases
    function adjustReputation(uint256 tokenId, int256 delta) external {
        require(trustedUpdaters[msg.sender], "AgentIdentity: not trusted updater");
        AgentIdentity storage agent = _agents[tokenId];
        uint256 old = agent.reputation;
        int256 newScore = int256(old) + delta;
        // Clamp to [0, 10000]
        if (newScore < 0) newScore = 0;
        if (newScore > 10000) newScore = 10000;
        agent.reputation = uint256(newScore);
        emit ReputationUpdated(tokenId, old, agent.reputation);
    }
}
