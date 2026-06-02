// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC-8004: Onchain AI Agent Identity
/// @notice ERC-8004 defines a registry for AI agent identities on Arc.
/// Each agent has a unique NFT-based identity with reputation and verifiable credentials.
interface IERC8004 {
    struct AgentIdentity {
        address owner;
        string name;
        string metadataURI;   // IPFS / HTTPS URI with agent capabilities JSON
        uint256 reputation;   // Accumulated reputation score (basis points, 0-10000)
        uint256 registeredAt;
        bool active;
    }

    event AgentRegistered(uint256 indexed tokenId, address indexed owner, string name);
    event ReputationUpdated(uint256 indexed tokenId, uint256 oldScore, uint256 newScore);
    event CredentialAdded(uint256 indexed tokenId, bytes32 credentialHash);
    event AgentDeactivated(uint256 indexed tokenId);

    /// @notice Register a new AI agent identity
    function registerAgent(string calldata name, string calldata metadataURI)
        external
        returns (uint256 tokenId);

    /// @notice Get agent identity details
    function getAgent(uint256 tokenId) external view returns (AgentIdentity memory);

    /// @notice Get all token IDs owned by an address
    function getAgentsByOwner(address owner) external view returns (uint256[] memory);

    /// @notice Add a verifiable credential hash to an agent
    function addCredential(uint256 tokenId, bytes32 credentialHash) external;

    /// @notice Check if a credential exists on an agent
    function hasCredential(uint256 tokenId, bytes32 credentialHash) external view returns (bool);

    /// @notice Update agent metadata URI
    function updateMetadata(uint256 tokenId, string calldata metadataURI) external;
}
