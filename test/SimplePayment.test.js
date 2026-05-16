const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("SimplePayment", function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const SimplePayment = await ethers.getContractFactory("SimplePayment");
    const contract = await SimplePayment.deploy();
    await contract.waitForDeployment();
    return { contract, owner, alice, bob };
  }

  it("starts with zero counters", async function () {
    const { contract } = await deployFixture();
    expect(await contract.paymentCount()).to.equal(0n);
    expect(await contract.totalVolume()).to.equal(0n);
  });

  it("forwards value and emits PaymentSent with memo", async function () {
    const { contract, alice, bob } = await deployFixture();
    const amount = ethers.parseUnits("1", 18);

    const balBefore = await ethers.provider.getBalance(bob.address);

    await expect(
      contract.connect(alice).sendPayment(bob.address, "coffee", {
        value: amount,
      })
    )
      .to.emit(contract, "PaymentSent")
      .withArgs(alice.address, bob.address, amount, "coffee", anyValue);

    const balAfter = await ethers.provider.getBalance(bob.address);
    expect(balAfter - balBefore).to.equal(amount);

    expect(await contract.paymentCount()).to.equal(1n);
    expect(await contract.totalVolume()).to.equal(amount);
    expect(await contract.sentCount(alice.address)).to.equal(1n);
    expect(await contract.receivedCount(bob.address)).to.equal(1n);
  });

  it("rejects zero-value payments", async function () {
    const { contract, alice, bob } = await deployFixture();
    await expect(
      contract.connect(alice).sendPayment(bob.address, "x", { value: 0 })
    ).to.be.revertedWithCustomError(contract, "ZeroAmount");
  });

  it("rejects zero-address recipients", async function () {
    const { contract, alice } = await deployFixture();
    await expect(
      contract.connect(alice).sendPayment(ethers.ZeroAddress, "x", {
        value: ethers.parseUnits("0.1", 18),
      })
    ).to.be.revertedWithCustomError(contract, "ZeroAddress");
  });

  it("rejects bare ETH transfers (no memo)", async function () {
    const { contract, alice } = await deployFixture();
    await expect(
      alice.sendTransaction({
        to: await contract.getAddress(),
        value: ethers.parseUnits("0.1", 18),
      })
    ).to.be.reverted;
  });
});
