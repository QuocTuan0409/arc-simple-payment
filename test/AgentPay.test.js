const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AgentPay", function () {
  // ──────────────────────────────────────────────────────────────────────────
  // Fixture: fresh contract + named signers for every test
  // ──────────────────────────────────────────────────────────────────────────
  async function deployFixture() {
    const [owner, agent, otherAgent, service, otherService, stranger] =
      await ethers.getSigners();

    const AgentPay = await ethers.getContractFactory("AgentPay");
    const contract = await AgentPay.deploy();
    await contract.waitForDeployment();

    return {
      contract,
      owner,
      agent,
      otherAgent,
      service,
      otherService,
      stranger,
    };
  }

  const ONE_USDC = ethers.parseUnits("1", 18);
  const DAILY_LIMIT = ethers.parseUnits("10", 18); // 10 USDC/day
  const PER_TX_LIMIT = ethers.parseUnits("1", 18); // 1 USDC/tx

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Registration
  // ──────────────────────────────────────────────────────────────────────────
  describe("registerAgent", function () {
    it("registers a new agent with limits and emits event", async function () {
      const { contract, owner, agent } = await deployFixture();

      await expect(
        contract.connect(owner).registerAgent(
          agent.address,
          DAILY_LIMIT,
          PER_TX_LIMIT
        )
      )
        .to.emit(contract, "AgentRegistered")
        .withArgs(agent.address, owner.address, DAILY_LIMIT, PER_TX_LIMIT);

      const a = await contract.getAgent(agent.address);
      expect(a.owner).to.equal(owner.address);
      expect(a.dailyLimit).to.equal(DAILY_LIMIT);
      expect(a.perTxLimit).to.equal(PER_TX_LIMIT);
      expect(a.active).to.equal(true);
      expect(a.registered).to.equal(true);
      expect(a.dailySpent).to.equal(0n);
    });

    it("reverts when registering the same agent twice", async function () {
      const { contract, owner, agent } = await deployFixture();
      await contract
        .connect(owner)
        .registerAgent(agent.address, DAILY_LIMIT, PER_TX_LIMIT);

      await expect(
        contract
          .connect(owner)
          .registerAgent(agent.address, DAILY_LIMIT, PER_TX_LIMIT)
      ).to.be.revertedWithCustomError(contract, "AgentAlreadyRegistered");
    });

    it("reverts on zero address", async function () {
      const { contract, owner } = await deployFixture();
      await expect(
        contract
          .connect(owner)
          .registerAgent(ethers.ZeroAddress, DAILY_LIMIT, PER_TX_LIMIT)
      ).to.be.revertedWithCustomError(contract, "ZeroAddress");
    });

    it("reverts when perTxLimit > dailyLimit", async function () {
      const { contract, owner, agent } = await deployFixture();
      await expect(
        contract
          .connect(owner)
          .registerAgent(agent.address, PER_TX_LIMIT, DAILY_LIMIT) // swapped
      ).to.be.revertedWithCustomError(contract, "InvalidLimits");
    });

    it("supports multiple agents per owner", async function () {
      const { contract, owner, agent, otherAgent } = await deployFixture();

      await contract
        .connect(owner)
        .registerAgent(agent.address, DAILY_LIMIT, PER_TX_LIMIT);
      await contract
        .connect(owner)
        .registerAgent(otherAgent.address, DAILY_LIMIT, PER_TX_LIMIT);

      const list = await contract.getAgentsByOwner(owner.address);
      expect(list.length).to.equal(2);
      expect(list).to.include(agent.address);
      expect(list).to.include(otherAgent.address);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Allowlist management
  // ──────────────────────────────────────────────────────────────────────────
  describe("allowed services", function () {
    it("owner can add and remove allowed service", async function () {
      const { contract, owner, agent, service } = await deployFixture();
      await contract
        .connect(owner)
        .registerAgent(agent.address, DAILY_LIMIT, PER_TX_LIMIT);

      await expect(
        contract
          .connect(owner)
          .addAllowedService(agent.address, service.address)
      )
        .to.emit(contract, "ServiceAllowed")
        .withArgs(agent.address, service.address);
      expect(
        await contract.isServiceAllowed(agent.address, service.address)
      ).to.equal(true);

      await expect(
        contract
          .connect(owner)
          .removeAllowedService(agent.address, service.address)
      )
        .to.emit(contract, "ServiceRevoked")
        .withArgs(agent.address, service.address);
      expect(
        await contract.isServiceAllowed(agent.address, service.address)
      ).to.equal(false);
    });

    it("non-owner cannot modify allowlist", async function () {
      const { contract, owner, agent, service, stranger } =
        await deployFixture();
      await contract
        .connect(owner)
        .registerAgent(agent.address, DAILY_LIMIT, PER_TX_LIMIT);

      await expect(
        contract
          .connect(stranger)
          .addAllowedService(agent.address, service.address)
      ).to.be.revertedWithCustomError(contract, "NotAgentOwner");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Pause / unpause / revoke
  // ──────────────────────────────────────────────────────────────────────────
  describe("pause and revoke", function () {
    it("owner can pause and unpause", async function () {
      const { contract, owner, agent } = await deployFixture();
      await contract
        .connect(owner)
        .registerAgent(agent.address, DAILY_LIMIT, PER_TX_LIMIT);

      await expect(contract.connect(owner).pauseAgent(agent.address))
        .to.emit(contract, "AgentPaused")
        .withArgs(agent.address);
      expect((await contract.getAgent(agent.address)).active).to.equal(false);

      await expect(contract.connect(owner).unpauseAgent(agent.address))
        .to.emit(contract, "AgentUnpaused")
        .withArgs(agent.address);
      expect((await contract.getAgent(agent.address)).active).to.equal(true);
    });

    it("revoked agent stays unregistered", async function () {
      const { contract, owner, agent } = await deployFixture();
      await contract
        .connect(owner)
        .registerAgent(agent.address, DAILY_LIMIT, PER_TX_LIMIT);

      await expect(contract.connect(owner).revokeAgent(agent.address))
        .to.emit(contract, "AgentRevokedByOwner")
        .withArgs(agent.address);

      const a = await contract.getAgent(agent.address);
      expect(a.registered).to.equal(false);
      expect(a.active).to.equal(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. agentPay — happy path & all reverts
  // ──────────────────────────────────────────────────────────────────────────
  describe("agentPay", function () {
    async function setupActiveAgent() {
      const f = await deployFixture();
      const { contract, owner, agent, service } = f;
      await contract
        .connect(owner)
        .registerAgent(agent.address, DAILY_LIMIT, PER_TX_LIMIT);
      await contract
        .connect(owner)
        .addAllowedService(agent.address, service.address);
      return f;
    }

    it("forwards USDC to allowed service and emits event", async function () {
      const { contract, agent, service } = await setupActiveAgent();
      const amount = ethers.parseUnits("0.5", 18);
      const memo = "claude-api-call";

      const balBefore = await ethers.provider.getBalance(service.address);

      await expect(
        contract
          .connect(agent)
          .agentPay(service.address, memo, { value: amount })
      )
        .to.emit(contract, "PaymentExecuted")
        .withArgs(agent.address, service.address, amount, memo, anyValue);

      const balAfter = await ethers.provider.getBalance(service.address);
      expect(balAfter - balBefore).to.equal(amount);

      const a = await contract.getAgent(agent.address);
      expect(a.dailySpent).to.equal(amount);
      expect(a.totalSpent).to.equal(amount);
      expect(a.paymentCount).to.equal(1n);
    });

    it("reverts when agent is not registered", async function () {
      const { contract, agent, service } = await deployFixture();
      await expect(
        contract
          .connect(agent)
          .agentPay(service.address, "x", { value: ONE_USDC })
      ).to.be.revertedWithCustomError(contract, "AgentNotRegistered");
    });

    it("reverts when agent is paused", async function () {
      const { contract, owner, agent, service } = await setupActiveAgent();
      await contract.connect(owner).pauseAgent(agent.address);

      await expect(
        contract
          .connect(agent)
          .agentPay(service.address, "x", { value: ONE_USDC })
      ).to.be.revertedWithCustomError(contract, "AgentInactive");
    });

    it("reverts when paying a non-allowed service", async function () {
      const { contract, agent, otherService } = await setupActiveAgent();

      await expect(
        contract
          .connect(agent)
          .agentPay(otherService.address, "x", { value: ONE_USDC })
      )
        .to.be.revertedWithCustomError(contract, "ServiceNotAllowed")
        .withArgs(otherService.address);
    });

    it("reverts when payment exceeds perTxLimit", async function () {
      const { contract, agent, service } = await setupActiveAgent();
      const tooBig = ethers.parseUnits("2", 18); // perTxLimit is 1

      await expect(
        contract
          .connect(agent)
          .agentPay(service.address, "big", { value: tooBig })
      )
        .to.be.revertedWithCustomError(contract, "ExceedsPerTxLimit")
        .withArgs(tooBig, PER_TX_LIMIT);
    });

    it("reverts when cumulative daily spend exceeds dailyLimit", async function () {
      const { contract, agent, service } = await setupActiveAgent();
      // Spend exactly 10 × 1 USDC = 10 USDC (dailyLimit)
      for (let i = 0; i < 10; i++) {
        await contract
          .connect(agent)
          .agentPay(service.address, `call-${i}`, { value: PER_TX_LIMIT });
      }
      // 11th call must revert
      await expect(
        contract
          .connect(agent)
          .agentPay(service.address, "call-11", { value: PER_TX_LIMIT })
      ).to.be.revertedWithCustomError(contract, "ExceedsDailyLimit");
    });

    it("auto-resets dailySpent on a new UTC day", async function () {
      const { contract, agent, service } = await setupActiveAgent();

      // Spend 1 USDC today
      await contract
        .connect(agent)
        .agentPay(service.address, "today", { value: PER_TX_LIMIT });
      expect((await contract.getAgent(agent.address)).dailySpent).to.equal(
        PER_TX_LIMIT
      );

      // Advance 25 hours so block.timestamp lands on a new UTC day
      await time.increase(25 * 60 * 60);

      // Spend again — auto-reset should kick in
      await contract
        .connect(agent)
        .agentPay(service.address, "tomorrow", { value: PER_TX_LIMIT });
      // After the reset, only the new payment should count in dailySpent
      expect((await contract.getAgent(agent.address)).dailySpent).to.equal(
        PER_TX_LIMIT
      );
      // Lifetime totalSpent should be 2 USDC
      expect((await contract.getAgent(agent.address)).totalSpent).to.equal(
        PER_TX_LIMIT * 2n
      );
    });

    it("rejects plain ETH transfers (must use agentPay)", async function () {
      const { contract, agent } = await deployFixture();
      await expect(
        agent.sendTransaction({
          to: await contract.getAddress(),
          value: ONE_USDC,
        })
      ).to.be.reverted;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. View helpers
  // ──────────────────────────────────────────────────────────────────────────
  describe("view helpers", function () {
    it("canPay returns (true,'') on a valid payment", async function () {
      const { contract, owner, agent, service } = await deployFixture();
      await contract
        .connect(owner)
        .registerAgent(agent.address, DAILY_LIMIT, PER_TX_LIMIT);
      await contract
        .connect(owner)
        .addAllowedService(agent.address, service.address);

      const [ok, reason] = await contract.canPay(
        agent.address,
        service.address,
        PER_TX_LIMIT
      );
      expect(ok).to.equal(true);
      expect(reason).to.equal("");
    });

    it("canPay returns a useful reason on failure", async function () {
      const { contract, agent, service } = await deployFixture();
      const [ok, reason] = await contract.canPay(
        agent.address,
        service.address,
        ONE_USDC
      );
      expect(ok).to.equal(false);
      expect(reason).to.equal("Agent not registered");
    });

    it("getRemainingDailyBudget reflects spend and reset", async function () {
      const { contract, owner, agent, service } = await deployFixture();
      await contract
        .connect(owner)
        .registerAgent(agent.address, DAILY_LIMIT, PER_TX_LIMIT);
      await contract
        .connect(owner)
        .addAllowedService(agent.address, service.address);

      expect(
        await contract.getRemainingDailyBudget(agent.address)
      ).to.equal(DAILY_LIMIT);

      await contract
        .connect(agent)
        .agentPay(service.address, "spend", { value: PER_TX_LIMIT });
      expect(
        await contract.getRemainingDailyBudget(agent.address)
      ).to.equal(DAILY_LIMIT - PER_TX_LIMIT);
    });
  });
});
