// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AgentPay
 * @notice On-chain budget controls for autonomous AI agents on Arc.
 *
 * Each user (owner) can register one or more `agent` addresses with hard
 * spending limits enforced by the contract itself:
 *
 *   - `perTxLimit`  — maximum native USDC the agent can move in one call
 *   - `dailyLimit`  — maximum native USDC the agent can spend per UTC day
 *   - allowed services — only addresses on the owner's allowlist can be paid
 *
 * Use cases:
 *   - Cap AI inference spend (Claude/OpenAI API budgets enforced on-chain).
 *   - Programmable freelancer / contractor payouts with per-payee limits.
 *   - Any autonomous workflow where a compromised key must not drain a wallet.
 *
 * Arc uses USDC as its native gas token (18 decimals), so `msg.value` here
 * is denominated in USDC — no ERC-20 approvals required.
 */
contract AgentPay {
    // ─────────────────────────────────────────────────────────────────────────
    // Errors (cheap reverts)
    // ─────────────────────────────────────────────────────────────────────────
    error AgentNotRegistered();
    error AgentAlreadyRegistered();
    error AgentInactive();
    error NotAgentOwner();
    error ExceedsDailyLimit(uint256 requested, uint256 remaining);
    error ExceedsPerTxLimit(uint256 requested, uint256 limit);
    error ServiceNotAllowed(address service);
    error ZeroAmount();
    error ZeroAddress();
    error InvalidLimits();
    error TransferFailed();

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────
    event AgentRegistered(
        address indexed agent,
        address indexed owner,
        uint256 dailyLimit,
        uint256 perTxLimit
    );
    event PaymentExecuted(
        address indexed agent,
        address indexed to,
        uint256 amount,
        string memo,
        uint256 timestamp
    );
    event LimitsUpdated(
        address indexed agent,
        uint256 newDailyLimit,
        uint256 newPerTxLimit
    );
    event ServiceAllowed(address indexed agent, address indexed service);
    event ServiceRevoked(address indexed agent, address indexed service);
    event AgentPaused(address indexed agent);
    event AgentUnpaused(address indexed agent);
    event AgentRevokedByOwner(address indexed agent);

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────
    struct Agent {
        address owner;          // who controls this agent
        uint256 dailyLimit;     // max USDC (wei) per UTC day
        uint256 perTxLimit;     // max USDC (wei) per single payment
        uint256 dailySpent;     // current day's spend
        uint256 lastResetDay;   // floor(block.timestamp / 1 day) of last reset
        bool active;            // false = paused (cannot pay)
        bool registered;        // distinguish unregistered from zero-init
        uint256 totalSpent;     // lifetime spend (analytics)
        uint256 paymentCount;   // lifetime count (analytics)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────────
    /// @notice agent address → its config
    mapping(address => Agent) private _agents;

    /// @notice agent => service => allowed?
    mapping(address => mapping(address => bool)) public allowedServices;

    /// @notice owner address → list of agents they own (for UI listing)
    mapping(address => address[]) private _agentsByOwner;

    uint256 public constant SECONDS_PER_DAY = 86_400;

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────
    modifier onlyAgentOwner(address agent) {
        if (!_agents[agent].registered) revert AgentNotRegistered();
        if (_agents[agent].owner != msg.sender) revert NotAgentOwner();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner functions — setup & management
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Register a new agent under the caller's ownership.
     * @param agent       The agent's wallet address (the caller of `agentPay`).
     * @param dailyLimit  Max USDC the agent can spend per UTC day (wei units).
     * @param perTxLimit  Max USDC the agent can spend in one tx (wei units).
     */
    function registerAgent(
        address agent,
        uint256 dailyLimit,
        uint256 perTxLimit
    ) external {
        if (agent == address(0)) revert ZeroAddress();
        if (_agents[agent].registered) revert AgentAlreadyRegistered();
        if (dailyLimit == 0 || perTxLimit == 0) revert InvalidLimits();
        if (perTxLimit > dailyLimit) revert InvalidLimits();

        _agents[agent] = Agent({
            owner: msg.sender,
            dailyLimit: dailyLimit,
            perTxLimit: perTxLimit,
            dailySpent: 0,
            lastResetDay: block.timestamp / SECONDS_PER_DAY,
            active: true,
            registered: true,
            totalSpent: 0,
            paymentCount: 0
        });

        _agentsByOwner[msg.sender].push(agent);

        emit AgentRegistered(agent, msg.sender, dailyLimit, perTxLimit);
    }

    /// @notice Update the daily and per-tx limits for an existing agent.
    function updateLimits(
        address agent,
        uint256 newDailyLimit,
        uint256 newPerTxLimit
    ) external onlyAgentOwner(agent) {
        if (newDailyLimit == 0 || newPerTxLimit == 0) revert InvalidLimits();
        if (newPerTxLimit > newDailyLimit) revert InvalidLimits();

        _agents[agent].dailyLimit = newDailyLimit;
        _agents[agent].perTxLimit = newPerTxLimit;

        emit LimitsUpdated(agent, newDailyLimit, newPerTxLimit);
    }

    /// @notice Whitelist a service address the agent is allowed to pay.
    function addAllowedService(address agent, address service)
        external
        onlyAgentOwner(agent)
    {
        if (service == address(0)) revert ZeroAddress();
        allowedServices[agent][service] = true;
        emit ServiceAllowed(agent, service);
    }

    /// @notice Remove a service from the agent's allowlist.
    function removeAllowedService(address agent, address service)
        external
        onlyAgentOwner(agent)
    {
        allowedServices[agent][service] = false;
        emit ServiceRevoked(agent, service);
    }

    /// @notice Pause an agent (cannot pay until unpaused).
    function pauseAgent(address agent) external onlyAgentOwner(agent) {
        _agents[agent].active = false;
        emit AgentPaused(agent);
    }

    /// @notice Resume a previously paused agent.
    function unpauseAgent(address agent) external onlyAgentOwner(agent) {
        _agents[agent].active = true;
        emit AgentUnpaused(agent);
    }

    /// @notice Permanently revoke an agent. Cannot be re-activated.
    function revokeAgent(address agent) external onlyAgentOwner(agent) {
        _agents[agent].registered = false;
        _agents[agent].active = false;
        emit AgentRevokedByOwner(agent);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Agent function — the actual payment call
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Agent calls this to pay an allowed service with USDC + memo.
     * @dev    `msg.sender` MUST be the registered agent address.
     *         `msg.value` is the USDC amount (Arc native gas token, 18 decimals).
     * @param to    The recipient (must be in agent's allowlist).
     * @param memo  Free-form memo string attached to the on-chain event.
     */
    function agentPay(address to, string calldata memo) external payable {
        Agent storage agent = _agents[msg.sender];

        // Existence / liveness checks
        if (!agent.registered) revert AgentNotRegistered();
        if (!agent.active) revert AgentInactive();
        if (msg.value == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();

        // Allowlist
        if (!allowedServices[msg.sender][to]) revert ServiceNotAllowed(to);

        // Per-tx cap
        if (msg.value > agent.perTxLimit) {
            revert ExceedsPerTxLimit(msg.value, agent.perTxLimit);
        }

        // Auto-reset daily counter on new UTC day
        uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
        if (currentDay > agent.lastResetDay) {
            agent.dailySpent = 0;
            agent.lastResetDay = currentDay;
        }

        // Daily cap
        uint256 remaining = agent.dailyLimit - agent.dailySpent;
        if (msg.value > remaining) {
            revert ExceedsDailyLimit(msg.value, remaining);
        }

        // State update (effects)
        agent.dailySpent += msg.value;
        unchecked {
            agent.totalSpent += msg.value;
            agent.paymentCount += 1;
        }

        // External call (interactions) — CEI pattern
        (bool ok, ) = to.call{value: msg.value}("");
        if (!ok) revert TransferFailed();

        emit PaymentExecuted(msg.sender, to, msg.value, memo, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Returns the full Agent struct.
    function getAgent(address agent) external view returns (Agent memory) {
        return _agents[agent];
    }

    /// @notice How much USDC the agent can still spend today.
    function getRemainingDailyBudget(address agent)
        external
        view
        returns (uint256)
    {
        Agent memory a = _agents[agent];
        if (!a.registered || !a.active) return 0;

        uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
        if (currentDay > a.lastResetDay) {
            return a.dailyLimit; // fresh day, full budget
        }
        return a.dailyLimit - a.dailySpent;
    }

    /// @notice Quick check whether a service is allowlisted for an agent.
    function isServiceAllowed(address agent, address service)
        external
        view
        returns (bool)
    {
        return allowedServices[agent][service];
    }

    /// @notice List of agents owned by `owner` (for dashboard listing).
    function getAgentsByOwner(address owner)
        external
        view
        returns (address[] memory)
    {
        return _agentsByOwner[owner];
    }

    /**
     * @notice Dry-run check: would this payment succeed right now?
     * @return ok       true if all checks pass.
     * @return reason   short human-readable reason on failure.
     * @dev    Useful for the frontend to disable buttons preemptively.
     */
    function canPay(
        address agent,
        address to,
        uint256 amount
    ) external view returns (bool ok, string memory reason) {
        Agent memory a = _agents[agent];
        if (!a.registered) return (false, "Agent not registered");
        if (!a.active) return (false, "Agent inactive");
        if (amount == 0) return (false, "Zero amount");
        if (to == address(0)) return (false, "Zero address");
        if (!allowedServices[agent][to]) return (false, "Service not allowed");
        if (amount > a.perTxLimit) return (false, "Exceeds per-tx limit");

        uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
        uint256 effectiveSpent = currentDay > a.lastResetDay ? 0 : a.dailySpent;
        if (amount > a.dailyLimit - effectiveSpent) {
            return (false, "Exceeds daily limit");
        }

        return (true, "");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reject plain transfers — force callers to use agentPay so we log + check
    // ─────────────────────────────────────────────────────────────────────────
    receive() external payable {
        revert("Use agentPay(address,string) so the call is logged and capped.");
    }
}
