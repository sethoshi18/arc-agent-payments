// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC8183.sol";
import "./AgentIdentity.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title AgentJob — ERC-8183 Programmable Job Lifecycle
/// @notice USDC is the native Arc token. Jobs are funded at creation and
/// payment is atomically released to the agent owner on completion.
contract AgentJob is IERC8183 {
    // ─── Arc Testnet USDC (ERC-20 interface over native asset) ───────────────
    // USDC is Arc's native gas token. This ERC-20 interface supports transferFrom,
    // approve, and allowance — affecting the same underlying native balance.
    // 6 decimals on ERC-20 interface, 18 decimals natively (gas accounting).
    // Source: https://docs.arc.network/arc/references/contract-addresses
    address public constant USDC = 0x3600000000000000000000000000000000000000;

    IERC20 private immutable _usdc;
    AgentIdentity public immutable identityRegistry;

    uint256 private _nextJobId = 1;
    mapping(uint256 => Job) private _jobs;
    mapping(address => uint256[]) private _clientJobs;
    mapping(uint256 => uint256[]) private _agentJobs; // agentTokenId → jobIds

    // Reputation deltas (in bps)
    int256 public constant REPUTATION_COMPLETE = 100;   // +1%
    int256 public constant REPUTATION_DISPUTE  = -200;  // -2%

    modifier onlyClient(uint256 jobId) {
        require(_jobs[jobId].client == msg.sender, "AgentJob: not client");
        _;
    }

    constructor(address _identityRegistry, address usdcAddress) {
        identityRegistry = AgentIdentity(_identityRegistry);
        _usdc = IERC20(usdcAddress);
    }

    // ─── IERC8183 ───────────────────────────────────────────────────────────

    function createJob(
        string calldata description,
        uint256 paymentAmount,
        uint256 deadline
    ) external override returns (uint256 jobId) {
        require(paymentAmount > 0, "AgentJob: zero payment");
        require(deadline > block.timestamp, "AgentJob: deadline in past");
        require(
            _usdc.transferFrom(msg.sender, address(this), paymentAmount),
            "AgentJob: USDC transfer failed"
        );

        jobId = _nextJobId++;
        _jobs[jobId] = Job({
            id: jobId,
            client: msg.sender,
            agentTokenId: 0,
            description: description,
            deliverableHash: bytes32(0),
            paymentAmount: paymentAmount,
            deadline: deadline,
            status: JobStatus.Open,
            createdAt: block.timestamp,
            completedAt: 0
        });
        _clientJobs[msg.sender].push(jobId);
        emit JobCreated(jobId, msg.sender, paymentAmount);
    }

    function acceptJob(uint256 jobId, uint256 agentTokenId) external override {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.Open, "AgentJob: not open");
        require(block.timestamp < job.deadline, "AgentJob: expired");

        // Verify caller owns the agent token
        AgentIdentity.AgentIdentity memory agent = identityRegistry.getAgent(agentTokenId);
        require(agent.owner == msg.sender, "AgentJob: not agent owner");
        require(agent.active, "AgentJob: agent not active");

        job.agentTokenId = agentTokenId;
        job.status = JobStatus.Accepted;
        _agentJobs[agentTokenId].push(jobId);
        emit JobAccepted(jobId, agentTokenId);
    }

    function submitDeliverable(uint256 jobId, bytes32 deliverableHash) external override {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.Accepted, "AgentJob: not accepted");

        // Verify caller owns the assigned agent
        AgentIdentity.AgentIdentity memory agent = identityRegistry.getAgent(job.agentTokenId);
        require(agent.owner == msg.sender, "AgentJob: not agent owner");

        job.deliverableHash = deliverableHash;
        job.status = JobStatus.Submitted;
        emit DeliverableSubmitted(jobId, deliverableHash);
    }

    function completeJob(uint256 jobId) external override onlyClient(jobId) {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.Submitted, "AgentJob: not submitted");

        job.status = JobStatus.Completed;
        job.completedAt = block.timestamp;

        // Release USDC to agent owner
        AgentIdentity.AgentIdentity memory agent = identityRegistry.getAgent(job.agentTokenId);
        require(_usdc.transfer(agent.owner, job.paymentAmount), "AgentJob: payout failed");

        // Boost agent reputation
        identityRegistry.adjustReputation(job.agentTokenId, REPUTATION_COMPLETE);

        emit JobCompleted(jobId, agent.owner, job.paymentAmount);
    }

    function disputeJob(uint256 jobId, string calldata reason) external override onlyClient(jobId) {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.Submitted, "AgentJob: not submitted");

        job.status = JobStatus.Disputed;

        // Penalise agent reputation
        identityRegistry.adjustReputation(job.agentTokenId, REPUTATION_DISPUTE);

        emit JobDisputed(jobId, reason);
        // Note: dispute resolution (arbitration / refund) is a governance action
        // outside this contract's scope. Add ArbitrationModule for production use.
    }

    function cancelJob(uint256 jobId) external override onlyClient(jobId) {
        Job storage job = _jobs[jobId];
        require(
            job.status == JobStatus.Open || job.status == JobStatus.Accepted,
            "AgentJob: cannot cancel"
        );

        job.status = JobStatus.Cancelled;
        require(_usdc.transfer(job.client, job.paymentAmount), "AgentJob: refund failed");
        emit JobCancelled(jobId);
    }

    function getJob(uint256 jobId) external view override returns (Job memory) {
        require(_jobs[jobId].createdAt != 0, "AgentJob: not found");
        return _jobs[jobId];
    }

    function getJobsByClient(address client) external view override returns (uint256[] memory) {
        return _clientJobs[client];
    }

    function getJobsByAgent(uint256 agentTokenId) external view override returns (uint256[] memory) {
        return _agentJobs[agentTokenId];
    }
}
