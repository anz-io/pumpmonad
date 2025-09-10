import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { PumpHypeStaking } from "../typechain-types";
import { parseEther, parseUnits } from "ethers";

const delta = parseEther("0.001")

describe("pumpHype Unit Test", function () {
  async function deployContracts() {
    const [_owner, operator] = await ethers.getSigners();

    const amount18 = parseUnits("100", 18);

    // Pump Hype related contracts
    const pumpHype = await ethers.deployContract("PumpToken");
    const pumpHypeStakingFactory = await ethers.getContractFactory("PumpHypeStaking");
    const pumpHypeStaking = (await upgrades.deployProxy(pumpHypeStakingFactory, [
      await pumpHype.getAddress(),
    ])) as unknown as PumpHypeStaking;
    const pumpHypeStakingAddress = await pumpHypeStaking.getAddress();

    await pumpHype.setMinter(pumpHypeStakingAddress, true);
    await pumpHypeStaking.setStakeAssetCap(amount18 * 3n);
    await pumpHypeStaking.setOperator(operator.address);

    return { pumpHype, pumpHypeStaking };
  }

  it("should deploy the contract correctly", async function () {
    await loadFixture(deployContracts);
  });

  // Initialize function test
  it("should initialize the contract correctly", async function () {
    const { pumpHypeStaking, pumpHype } = await loadFixture(deployContracts);
    const [owner] = await ethers.getSigners();

    const pumpHypeAddress = await pumpHypeStaking.pumpHype();

    expect(pumpHypeAddress).to.equal(await pumpHype.getAddress());
    expect(await pumpHypeStaking.instantUnstakeFee()).to.equal(300);
    expect(await pumpHypeStaking.owner()).to.equal(owner.address);
    expect(await pumpHypeStaking.paused()).to.equal(false);
  });

  it("should handle ownership transfer in two steps", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const [operator] = await ethers.getSigners();

    await pumpHypeStaking.transferOwnership(operator.address);
    expect(await pumpHypeStaking.pendingOwner()).to.equal(operator.address);

    await pumpHypeStaking.connect(operator).acceptOwnership();
    expect(await pumpHypeStaking.owner()).to.equal(operator.address);
  });

  // Utils functions test
  it("should return correct date slot", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);

    const timestamp1 = 0; // Epoch time
    const timestamp2 = 3600 * 12; // 12 hours from epoch
    const timestamp3 = 3600 * 24 * 5; // 5 days from epoch

    expect(await pumpHypeStaking._getDateSlot(timestamp1)).to.equal(0); // UTC+18 => still 0
    expect(await pumpHypeStaking._getDateSlot(timestamp2)).to.equal(0); // UTC+18 => still 0
    expect(await pumpHypeStaking._getDateSlot(timestamp3)).to.equal(5 % 10); // UTC+18 => 5 % 10 = 5
  });

  // Owner functions test
  it("should allow owner to pause and unpause the contract", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner] = await ethers.getSigners();

    await expect(pumpHypeStaking.connect(owner).pause()).to.emit(
      pumpHypeStaking,
      "Paused"
    );
    expect(await pumpHypeStaking.paused()).to.equal(true);

    await expect(pumpHypeStaking.connect(owner).unpause()).to.emit(
      pumpHypeStaking,
      "Unpaused"
    );
    expect(await pumpHypeStaking.paused()).to.equal(false);
  });

  it("should revert when non-owner tries to pause and unpause the contract", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const accounts = await ethers.getSigners();
    const attacker = accounts[4];

    await expect(
      pumpHypeStaking.connect(attacker).pause()
    ).to.be.revertedWithCustomError(pumpHypeStaking, "OwnableUnauthorizedAccount");

    await expect(
      pumpHypeStaking.connect(attacker).unpause()
    ).to.be.revertedWithCustomError(pumpHypeStaking, "OwnableUnauthorizedAccount");
  });

  it("should allow owner to set stake asset cap", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner] = await ethers.getSigners();

    const newCap = parseUnits("200", 18);

    await expect(pumpHypeStaking.connect(owner).setStakeAssetCap(newCap))
      .to.emit(pumpHypeStaking, "SetStakeAssetCap")
      .withArgs(await pumpHypeStaking.totalStakingCap(), newCap);

    expect(await pumpHypeStaking.totalStakingCap()).to.equal(newCap);
  });

  it("should revert when non-owner tries to set stake asset cap", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const accounts = await ethers.getSigners();
    const attacker = accounts[5];

    const newCap = parseUnits("200", 18);

    await expect(
      pumpHypeStaking.connect(attacker).setStakeAssetCap(newCap)
    ).to.be.revertedWithCustomError(pumpHypeStaking, "OwnableUnauthorizedAccount");
  });

  it("should allow owner to set instant unstake fee", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner] = await ethers.getSigners();

    const newFee = 500; // 5%

    await expect(pumpHypeStaking.connect(owner).setInstantUnstakeFee(newFee))
      .to.emit(pumpHypeStaking, "SetInstantUnstakeFee")
      .withArgs(await pumpHypeStaking.instantUnstakeFee(), newFee);

    expect(await pumpHypeStaking.instantUnstakeFee()).to.equal(newFee);
  });

  it("should revert when non-owner tries to set instant unstake fee", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const accounts = await ethers.getSigners();
    const attacker = accounts[5];
    const newFee = 500; // 5%

    await expect(
      pumpHypeStaking.connect(attacker).setInstantUnstakeFee(newFee)
    ).to.be.revertedWithCustomError(pumpHypeStaking, "OwnableUnauthorizedAccount");
  });

  it("should allow owner to set operator", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    await expect(pumpHypeStaking.connect(owner).setOperator(user1.address))
      .to.emit(pumpHypeStaking, "SetOperator")
      .withArgs(await pumpHypeStaking.operator(), user1.address);

    expect(await pumpHypeStaking.operator()).to.equal(user1.address);
  });

  it("should revert when non-owner tries to set operator", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    await expect(
      pumpHypeStaking.connect(user1).setOperator(user2.address)
    ).to.be.revertedWithCustomError(pumpHypeStaking, "OwnableUnauthorizedAccount");
  });

  it("should allow owner to collect fee", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    await pumpHypeStaking.setAllowInstantUnstake(true)

    const ownerBalanceBefore = await ethers.provider.getBalance(owner);

    await pumpHypeStaking.connect(user2).stake({ value: parseUnits("0.2", 18) });
    await pumpHypeStaking.connect(user2).unstakeInstant(parseUnits("0.2", 18));

    const collectFeeBefore = await pumpHypeStaking.collectedFee();

    await expect(pumpHypeStaking.connect(owner).collectFee()).to.emit(
      pumpHypeStaking,
      "FeeCollected"
    );

    const ownerBalanceAfter = await ethers.provider.getBalance(owner);

    expect(await pumpHypeStaking.collectedFee()).to.equal(0);
    expect(ownerBalanceAfter - ownerBalanceBefore).to.closeTo(collectFeeBefore, delta);
  });

  it("should revert when non-owner tries to collect fee", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const accounts = await ethers.getSigners();
    const user1 = accounts[2];

    await expect(
      pumpHypeStaking.connect(user1).collectFee()
    ).to.be.revertedWithCustomError(pumpHypeStaking, "OwnableUnauthorizedAccount");
  });

  // Operator functions test
  it("should allow operator to withdraw", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    const stakeAmount = parseUnits("1", 18);
    await pumpHypeStaking.connect(user1).stake({ value: stakeAmount });

    const operatorBalanceBefore = await ethers.provider.getBalance(operator.address);

    await expect(pumpHypeStaking.connect(operator).withdraw())
      .to.emit(pumpHypeStaking, "AdminWithdraw")
      .withArgs(operator.address, stakeAmount);

    const operatorBalanceAfter = await ethers.provider.getBalance(operator.address);
    expect(operatorBalanceAfter - operatorBalanceBefore).to.closeTo(stakeAmount, delta);
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(0);
  });

  it("should revert when non-operator tries to withdraw", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    const stakeAmount = parseUnits("1", 18);
    await pumpHypeStaking.connect(user1).stake({ value: stakeAmount });

    await expect(pumpHypeStaking.connect(user2).withdraw()).to.be.revertedWith(
      "PumpHype: caller is not the operator"
    );
  });

  it("should allow operator to deposit", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const accounts = await ethers.getSigners();
    const operator = accounts[1];

    const depositAmount = parseUnits("10", 18);
    const operatorBalanceBefore = await ethers.provider.getBalance(operator.address);

    await expect(pumpHypeStaking.connect(operator).deposit({ value: depositAmount }))
      .to.emit(pumpHypeStaking, "AdminDeposit")
      .withArgs(operator.address, depositAmount);

    const operatorBalanceAfter = await ethers.provider.getBalance(operator.address);
    expect(operatorBalanceBefore - operatorBalanceAfter).to.closeTo(depositAmount, delta);
    expect(await pumpHypeStaking.totalClaimableAmount()).to.equal(depositAmount);
  });

  it("should revert when non-operator tries to deposit", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const accounts = await ethers.getSigners();
    const user1 = accounts[2];
    const depositAmount = parseUnits("10", 18);
    await expect(
      pumpHypeStaking.connect(user1).deposit({ value: depositAmount })
    ).to.be.revertedWith("PumpHype: caller is not the operator");
  });

  it("should allow operator to withdraw and deposit", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    const stakeAmount = parseUnits("1", 18);
    await pumpHypeStaking.connect(user1).stake({ value: stakeAmount });

    const operatorBalanceBefore = await ethers.provider.getBalance(operator.address);

    const depositAmount = parseUnits("0.5", 18);
    await expect(
      pumpHypeStaking.connect(operator).withdrawAndDeposit({ value: depositAmount })
    )
      .to.emit(pumpHypeStaking, "AdminWithdraw")
      .withArgs(operator.address, stakeAmount)
      .and.to.emit(pumpHypeStaking, "AdminDeposit")
      .withArgs(operator.address, depositAmount);

    const operatorBalanceAfter = await ethers.provider.getBalance(operator.address);
    expect(operatorBalanceAfter - operatorBalanceBefore).to.closeTo(stakeAmount - depositAmount, delta);
    expect(await pumpHypeStaking.totalClaimableAmount()).to.equal(depositAmount);
  });

  it("should revert when non-operator tries to withdraw and deposit", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    const stakeAmount = parseUnits("1", 18);
    await pumpHypeStaking.connect(user1).stake({ value: stakeAmount });

    const depositAmount = parseUnits("0.5", 18);
    await expect(
      pumpHypeStaking.connect(user2).withdrawAndDeposit({ value: depositAmount })
    ).to.be.revertedWith("PumpHype: caller is not the operator");
  });

  // User functions test
  it("should allow user to stake tokens when not paused", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const accounts = await ethers.getSigners();
    const user1 = accounts[2];

    const stakeAmount = parseUnits("1", 18);

    const userBalanceBefore = await ethers.provider.getBalance(user1.address);

    await expect(pumpHypeStaking.connect(user1).stake({ value: stakeAmount }))
      .to.emit(pumpHypeStaking, "Stake")
      .withArgs(user1.address, stakeAmount);

    const userBalanceAfter = await ethers.provider.getBalance(user1.address);

    expect(userBalanceBefore - userBalanceAfter).to.closeTo(stakeAmount, delta);
    expect(await pumpHypeStaking.totalStakingAmount()).to.equal(stakeAmount);
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(stakeAmount);
  });

  it("should revert stake when contract is paused", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    await pumpHypeStaking.connect(owner).pause();

    const stakeAmount = parseUnits("1", 18);
    await expect(
      pumpHypeStaking.connect(user1).stake({ value: stakeAmount })
    ).to.be.revertedWithCustomError(pumpHypeStaking, "EnforcedPause");
  });

  it("should revert stake with zero amount", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const accounts = await ethers.getSigners();
    const user1 = accounts[2];

    await expect(pumpHypeStaking.connect(user1).stake({ value: 0 })).to.be.revertedWith(
      "PumpHype: amount should be greater than 0"
    );
  });

  it("should revert stake when exceeding the staking cap", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    const stakeAmount = await pumpHypeStaking.totalStakingCap();

    await pumpHypeStaking.connect(user1).stake({ value: stakeAmount });

    await expect(pumpHypeStaking.connect(user1).stake({ value: 1 })).to.be.revertedWith(
      "PumpHype: exceed staking cap"
    );
  });

  it("should allow user to request unstake", async function () {
    const { pumpHype, pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();
    
    await pumpHypeStaking.setAllowNormalUnstake(true)

    await pumpHypeStaking.connect(user1).stake({ value: parseUnits("1", 18) });
    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999", 18), delta);
    expect(await pumpHype.balanceOf(user1.address)).to.closeTo(parseUnits("1", 18), delta);
    expect(await pumpHypeStaking.totalStakingAmount()).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(parseUnits("1", 18));

    const block = await ethers.provider.getBlock("latest");
    if (block === null) {
      throw new Error("Failed to fetch the latest block");
    }

    const timestamp = block.timestamp;
    const slot = await pumpHypeStaking._getDateSlot(timestamp);

    await pumpHypeStaking.connect(user1).unstakeRequest(parseUnits("0.5", 18));

    const userPendingUnstakeAmount = await pumpHypeStaking.pendingUnstakeAmount(
      user1.address,
      slot
    );

    expect(userPendingUnstakeAmount).to.equal(parseUnits("0.5", 18));
    expect(await pumpHypeStaking.totalStakingAmount()).to.equal(
      parseUnits("0.5", 18)
    );
    expect(await pumpHypeStaking.totalRequestedAmount()).to.equal(
      parseUnits("0.5", 18)
    );
  });

  it("should revert PumpHype: claim the previous unstake first", async function () {
    const { pumpHype, pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    await pumpHypeStaking.setAllowNormalUnstake(true)

    await pumpHypeStaking.connect(user1).stake({ value: parseUnits("1", 18) });
    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999", 18), delta);
    expect(await pumpHype.balanceOf(user1.address)).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.totalStakingAmount()).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(parseUnits("1", 18));

    await expect(
      pumpHypeStaking.connect(user1).unstakeRequest(parseUnits("0.1", 18))
    );

    await time.increase(86400 * 7);
    await pumpHypeStaking.connect(user1).unstakeRequest(parseUnits("0.1", 18));

    await time.increase(86400 * 7);
    await pumpHypeStaking.connect(user1).unstakeRequest(parseUnits("0.2", 18));

    await time.increase(86400 * 3);
    await expect(
      pumpHypeStaking.connect(user1).unstakeRequest(parseUnits("0.1", 18))
    ).to.be.revertedWith("PumpHype: claim the previous unstake first");
  });

  it("should PumpHype: amount should be greater than 0", async function () {
    const { pumpHype, pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    await pumpHypeStaking.setAllowNormalUnstake(true)

    await pumpHypeStaking.connect(user1).stake({ value: parseUnits("1", 18) });
    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999", 18), delta);
    expect(await pumpHype.balanceOf(user1.address)).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.totalStakingAmount()).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(parseUnits("1", 18));

    await expect(
      pumpHypeStaking.connect(user1).unstakeRequest(parseUnits("0", 18))
    ).to.be.revertedWith("PumpHype: amount should be greater than 0");
  });

  it("should allow user to claim unstake amount after the claimable time", async function () {
    const { pumpHype, pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    await pumpHypeStaking.setAllowNormalUnstake(true)
    await pumpHypeStaking.setAllowClaim(true)

    await pumpHypeStaking.connect(user1).stake({ value: parseUnits("1", 18) });
    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999", 18), delta);
    expect(await pumpHype.balanceOf(user1.address)).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.totalStakingAmount()).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(parseUnits("1", 18));

    await pumpHypeStaking.connect(operator).deposit({ value: parseUnits("0.5", 18) });

    await pumpHypeStaking.connect(user1).unstakeRequest(parseUnits("0.5", 18));
    const block = await ethers.provider.getBlock("latest");
    if (block === null) {
      throw new Error("Failed to fetch the latest block");
    }
    const slot = await pumpHypeStaking._getDateSlot(block.timestamp);

    await time.increase(86400 * 9);
    expect(await pumpHypeStaking.connect(user1).claimSlot(slot))
      .to.emit(pumpHypeStaking, "ClaimSlot")
      .withArgs(user1.address, parseUnits("0.5", 18), slot);

    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999.5", 18), delta);
    expect(await pumpHypeStaking.totalClaimableAmount()).to.equal(0);
    expect(await pumpHypeStaking.totalRequestedAmount()).to.equal(0);
    expect(
      await pumpHypeStaking.pendingUnstakeAmount(user1.address, slot)
    ).to.equal(0);
  });

  it("should revert when there is no pending unstake", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const accounts = await ethers.getSigners();

    await pumpHypeStaking.setAllowClaim(true)

    const user1 = accounts[2];

    const block = await ethers.provider.getBlock("latest");
    if (block === null) {
      throw new Error("Failed to fetch the latest block");
    }
    const slot = await pumpHypeStaking._getDateSlot(block.timestamp);

    await expect(pumpHypeStaking.connect(user1).claimSlot(slot)).to.be.revertedWith(
      "PumpHype: no pending unstake"
    );
  });

  it("should revert when the claimable time has not been reached", async function () {
    const { pumpHype, pumpHypeStaking } = await loadFixture(deployContracts);
    const accounts = await ethers.getSigners();
    const user1 = accounts[2];

    await pumpHypeStaking.setAllowNormalUnstake(true)
    await pumpHypeStaking.setAllowClaim(true)

    await pumpHypeStaking.connect(user1).stake({ value: parseUnits("1", 18) });
    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999", 18), delta);
    expect(await pumpHype.balanceOf(user1.address)).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.totalStakingAmount()).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(parseUnits("1", 18));

    await pumpHypeStaking.connect(user1).unstakeRequest(parseUnits("0.5", 18));
    const block = await ethers.provider.getBlock("latest");
    if (block === null) {
      throw new Error("Failed to fetch the latest block");
    }
    const slot = await pumpHypeStaking._getDateSlot(block.timestamp);

    await time.increase(86400 * 2);

    await expect(pumpHypeStaking.connect(user1).claimSlot(slot)).to.be.revertedWith(
      "PumpHype: haven't reached the claimable time"
    );
  });

  it("should allow user to claim all unstake amounts after the claimable time", async function () {
    const { pumpHype, pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    await pumpHypeStaking.setAllowNormalUnstake(true)
    await pumpHypeStaking.setAllowClaim(true)

    await pumpHypeStaking.connect(user1).stake({ value: parseUnits("1", 18) });
    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999", 18), delta);
    expect(await pumpHype.balanceOf(user1.address)).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.totalStakingAmount()).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(parseUnits("1", 18));

    await pumpHypeStaking.connect(user1).unstakeRequest(parseUnits("0.3", 18));

    await pumpHypeStaking.connect(operator).deposit({ value: parseUnits("0.5", 18) });

    expect(await pumpHype.balanceOf(user1.address)).to.equal(
      parseUnits("0.7", 18)
    );
    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999", 18), delta);

    await time.increase(86400 * 9);
    await pumpHypeStaking.connect(user1).claimAll();

    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999.3", 18), delta);
    expect(await pumpHypeStaking.totalClaimableAmount()).to.equal(
      parseUnits("0.2", 18)
    );
    expect(await pumpHypeStaking.totalRequestedAmount()).to.equal(0);
  });

  it("should revert when there is no claimable amount", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const accounts = await ethers.getSigners();

    await pumpHypeStaking.setAllowClaim(true)

    const user1 = accounts[2];

    await expect(pumpHypeStaking.connect(user1).claimAll()).to.be.revertedWith(
      "PumpHype: no pending unstake"
    );
  });

  it("should revert when there is no claimable amount before the claimable time", async function () {
    const { pumpHype, pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    await pumpHypeStaking.setAllowNormalUnstake(true)
    await pumpHypeStaking.setAllowClaim(true)

    await pumpHypeStaking.connect(user1).stake({ value: parseUnits("1", 18) });
    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999", 18), delta);
    expect(await pumpHype.balanceOf(user1.address)).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.totalStakingAmount()).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(parseUnits("1", 18));

    await pumpHypeStaking.connect(user1).unstakeRequest(parseUnits("0.3", 18));

    await pumpHypeStaking.connect(operator).deposit({ value: parseUnits("0.5", 18) });

    expect(await pumpHype.balanceOf(user1.address)).to.equal(
      parseUnits("0.7", 18)
    );
    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999", 18), delta);

    await expect(pumpHypeStaking.connect(user1).claimAll()).to.be.revertedWith(
      "PumpHype: haven't reached the claimable time"
    );
  });

  it("should allow user to unstake instantly", async function () {
    const { pumpHype, pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    await pumpHypeStaking.setAllowInstantUnstake(true)

    await pumpHypeStaking.connect(user1).stake({ value: parseUnits("1", 18) });
    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999", 18), delta);
    expect(await pumpHype.balanceOf(user1.address)).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.totalStakingAmount()).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(parseUnits("1", 18));

    await pumpHypeStaking.connect(user1).unstakeInstant(parseUnits("0.5", 18));

    const fee = await pumpHypeStaking.collectedFee();
    const amountAfterFee = parseUnits("0.5", 18) - fee;

    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(
      parseUnits("9999", 18) + amountAfterFee, delta
    );
    expect(await pumpHype.balanceOf(user1.address)).to.equal(
      parseUnits("0.5", 18)
    );
    expect(await pumpHypeStaking.totalStakingAmount()).to.equal(
      parseUnits("0.5", 18)
    );
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(
      parseUnits("0.5", 18)
    );
    expect(await pumpHypeStaking.collectedFee()).to.equal(fee);
  });

  it("should revert when unstake amount is greater than pending stake amount", async function () {
    const { pumpHype, pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    await pumpHypeStaking.setAllowInstantUnstake(true)

    await pumpHypeStaking.connect(user1).stake({ value: parseUnits("0.5", 18) });
    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999.5", 18), delta);
    expect(await pumpHype.balanceOf(user1.address)).to.equal(
      parseUnits("0.5", 18)
    );
    expect(await pumpHypeStaking.totalStakingAmount()).to.equal(
      parseUnits("0.5", 18)
    );
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(
      parseUnits("0.5", 18)
    );

    await expect(
      pumpHypeStaking.connect(user1).unstakeInstant(parseUnits("1", 18))
    ).to.be.revertedWith("PumpHype: insufficient liquidity");
  });

  it("should revert when unstake amount is zero", async function () {
    const { pumpHypeStaking } = await loadFixture(deployContracts);
    const accounts = await ethers.getSigners();

    await pumpHypeStaking.setAllowInstantUnstake(true)
    
    const user1 = accounts[2];

    await expect(
      pumpHypeStaking.connect(user1).unstakeInstant(0)
    ).to.be.revertedWith("PumpHype: amount should be greater than 0");
  });

  // Finish user journey of staking test
  it("should finish user journey of staking", async function () {
    const { pumpHype, pumpHypeStaking } = await loadFixture(deployContracts);
    const [owner, operator, user1, user2] = await ethers.getSigners();

    await pumpHypeStaking.setAllowNormalUnstake(true)
    await pumpHypeStaking.setAllowInstantUnstake(true)
    await pumpHypeStaking.setAllowClaim(true)

    // Day 1: User1 stakes 1 WMONAD
    await pumpHypeStaking.connect(user1).stake({ value: parseUnits("1", 18) });
    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999", 18), delta);
    expect(await pumpHype.balanceOf(user1.address)).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.totalStakingAmount()).to.equal(parseUnits("1", 18));
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(parseUnits("1", 18));

    await pumpHypeStaking.connect(operator).withdraw();
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(parseUnits("0", 18));

    // Day 2: User2 stakes 2 WMONAD
    await time.increase(86400);
    await pumpHypeStaking.connect(user2).stake({ value: parseUnits("2", 18) });
    expect(await ethers.provider.getBalance(user2.address)).to.closeTo(parseUnits("9998", 18), delta);
    expect(await pumpHype.balanceOf(user2.address)).to.equal(parseUnits("2", 18));
    expect(await pumpHypeStaking.totalStakingAmount()).to.equal(parseUnits("3", 18));
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(parseUnits("2", 18));

    await pumpHypeStaking.connect(operator).withdraw();
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(parseUnits("0", 18));

    // Day 5: User1 unstake 0.3 WMONAD
    await time.increase(86400 * 3);
    await pumpHypeStaking.connect(user1).unstakeRequest(parseUnits("0.3", 18));

    // Day 12: User1 can't unstake yet, and request again
    await time.increase(86400 * 7);
    await expect(pumpHypeStaking.connect(user1).claimAll()).to.be.revertedWith(
      "PumpHype: haven't reached the claimable time"
    );
    await pumpHypeStaking.connect(user1).unstakeRequest(parseUnits("0.1", 18));

    // Day 15: User1 can't unstake again before claim
    await time.increase(86400 * 3);
    await pumpHypeStaking.connect(operator).deposit({ value: parseUnits("0.5", 18) });
    await expect(
      pumpHypeStaking.connect(user1).unstakeRequest(parseUnits("0.1", 18))
    ).to.be.revertedWith("PumpHype: claim the previous unstake first");

    // Day 15: User1 claim the unstake
    expect(await pumpHype.balanceOf(user1.address)).to.equal(
      parseUnits("0.6", 18)
    );
    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999", 18), delta);
    await pumpHypeStaking.connect(user1).claimAll();
    expect(await ethers.provider.getBalance(user1.address)).to.closeTo(parseUnits("9999.3", 18), delta);

    // Day 16: User2 unstake instantly
    await time.increase(86400);
    await expect(
      pumpHypeStaking.connect(user2).unstakeInstant(parseUnits("0.2", 18))
    ).to.be.revertedWith("PumpHype: insufficient liquidity");
    await pumpHypeStaking.connect(user1).stake({ value: parseUnits("0.5", 18) })
    await pumpHypeStaking.connect(operator).depositToInstantPool({ value: parseUnits("0.5", 18) });
    expect(await pumpHypeStaking.instantPoolAmount()).to.equal(parseUnits("0.5", 18));

    await pumpHypeStaking.connect(user2).unstakeInstant(parseUnits("0.2", 18)); // 0.2 * (1-3%) = 0.194
    expect(await pumpHype.balanceOf(user2.address)).to.equal(
      parseUnits("1.8", 18)
    );
    expect(await ethers.provider.getBalance(user2.address)).to.closeTo(
      parseUnits("9998.194", 18), delta
    );
    expect(await pumpHypeStaking.pendingStakeAmount()).to.equal(
      parseUnits("0.5", 18)
    );
    expect(await pumpHypeStaking.instantPoolAmount()).to.equal(
      parseUnits("0.3", 18)
    );

    // Day 16: Collect fees
    const balanceBefore = await ethers.provider.getBalance(owner.address);
    await pumpHypeStaking.collectFee();
    const balanceAfter = await ethers.provider.getBalance(owner.address);
    expect(balanceAfter - balanceBefore).to.closeTo(parseUnits("0.006", 18), delta);

    await pumpHypeStaking.connect(operator).withdrawFromInstantPool(
      parseUnits("0.3", 18)
    );
    expect(await pumpHypeStaking.instantPoolAmount()).to.equal(parseUnits("0", 18));
  });
});