// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC-8183: Programmable AI Agent Job Lifecycle
/// @notice ERC-8183 defines a standard for autonomous job contracts between
/// AI agents and clients. Payment is held in USDC escrow and released on delivery.
interface IERC8183 {
    enum JobStatus {
        Open,         // Created, awaiting agent acceptance
        Accepted,     // Agent accepted, work in progress
        Submitted,    // Agent submitted deliverable hash
        Completed,    // Client accepted deliverable — USDC released
        Disputed,     // Client disputed deliverable
        Cancelled     // Job cancelled, USDC refunded
    }

    struct Job {
        uint256 id;
        address client;
        uint256 agentTokenId;       // ERC-8004 agent identity
        string description;
        bytes32 deliverableHash;    // keccak256 of deliverable (set at submission)
        uint256 paymentAmount;      // USDC (6 decimals)
        uint256 deadline;           // unix timestamp
        JobStatus status;
        uint256 createdAt;
        uint256 completedAt;
    }

    event JobCreated(uint256 indexed jobId, address indexed client, uint256 paymentAmount);
    event JobAccepted(uint256 indexed jobId, uint256 indexed agentTokenId);
    event DeliverableSubmitted(uint256 indexed jobId, bytes32 deliverableHash);
    event JobCompleted(uint256 indexed jobId, address indexed agentOwner, uint256 payout);
    event JobDisputed(uint256 indexed jobId, string reason);
    event JobCancelled(uint256 indexed jobId);

    /// @notice Create a new job with USDC payment held in escrow
    /// @param description Human/AI-readable task description
    /// @param paymentAmount USDC amount (6 decimals) locked in escrow
    /// @param deadline Unix timestamp deadline for completion
    function createJob(string calldata description, uint256 paymentAmount, uint256 deadline)
        external
        returns (uint256 jobId);

    /// @notice Agent accepts a job (locks agent in)
    function acceptJob(uint256 jobId, uint256 agentTokenId) external;

    /// @notice Agent submits deliverable content hash
    function submitDeliverable(uint256 jobId, bytes32 deliverableHash) external;

    /// @notice Client accepts deliverable — USDC released to agent owner
    function completeJob(uint256 jobId) external;

    /// @notice Client disputes deliverable
    function disputeJob(uint256 jobId, string calldata reason) external;

    /// @notice Cancel job and refund USDC to client (only while Open or Accepted)
    function cancelJob(uint256 jobId) external;

    /// @notice Get full job details
    function getJob(uint256 jobId) external view returns (Job memory);

    /// @notice Get all job IDs for a given client
    function getJobsByClient(address client) external view returns (uint256[] memory);

    /// @notice Get all job IDs accepted by a given agent
    function getJobsByAgent(uint256 agentTokenId) external view returns (uint256[] memory);
}
