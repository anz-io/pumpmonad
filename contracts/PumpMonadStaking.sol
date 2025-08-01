// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PumpToken.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

using SafeERC20 for IERC20;
using SafeCast for uint256;

contract PumpMonadStaking is Ownable2StepUpgradeable, PausableUpgradeable {

    // ============================= Variables =============================
    uint8 constant public MAX_DATE_SLOT = 10;

    PumpToken public pumpMonad;
    IERC20 public asset;
    uint8 public assetDecimal;

    // all the following variables are in the same decimal as pumpMonad (18 decimal)
    int256 public totalStakingAmount;       // Current amount of staked amount
    uint256 public totalStakingCap;         // Upper limit of staking amount
    uint256 public totalRequestedAmount;    // Total requested balance
    uint256 public totalClaimableAmount;    // Total claimable balance
    uint256 public pendingStakeAmount;      // Today's pending staked amount
    uint256 public instantPoolAmount;       // Instant-unstake pool amount
    uint256 public collectedFee;            // Total collected fee

    address public operator;                // Operator address, for deposit and withdraw
    uint256 public normalUnstakeFee;        // Fee for normal unstake
    uint256 public instantUnstakeFee;       // Fee for instant unstake
    uint8 public featureFlags;              // Flags for allowing the functions or not

    // User => DateSlot => Unstake request time
    mapping(address => mapping(uint8 => uint256)) public pendingUnstakeTime;

    // User => DateSlot => Unstake amount
    mapping(address => mapping(uint8 => uint256)) public pendingUnstakeAmount;

    // Flags for unstake type
    uint8 private constant _NORMAL_UNSTAKE_FLAG = 1 << 0;       // 0b0001
    uint8 private constant _INSTANT_UNSTAKE_FLAG = 1 << 1;      // 0b0010
    uint8 private constant _CLAIM_FLAG = 1 << 2;            // 0b0100


    // =============================== Events ==============================
    event SetStakeAssetCap(uint256 oldTotalStakingCap, uint256 newTotalStakingCap);
    event SetNormalUnstakeFee(uint256 oldNormalUnstakeFee, uint256 newNormalUnstakeFee);
    event SetInstantUnstakeFee(uint256 oldInstantUnstakeFee, uint256 newInstantUnstakeFee);
    event SetOperator(address oldOperator, address newOperator);
    event SetAllowNormalUnstake(bool allowed);
    event SetAllowInstantUnstake(bool allowed);
    event SetAllowClaim(bool allowed);
    event FeeCollected(uint256 amount);

    event Stake(address indexed user, uint256 amount);
    event UnstakeRequest(address indexed user, uint256 amount, uint8 slot);
    event ClaimSlot(address indexed user, uint256 amount, uint8 slot);
    event ClaimAll(address indexed user, uint256 amount);
    event UnstakeInstant(address indexed user, uint256 amount);
    event AdminWithdraw(address indexed owner, uint256 amount);
    event AdminDeposit(address indexed owner, uint256 amount);
    event AdminWithdrawFromInstantPool(address indexed owner, uint256 amount);
    event AdminDepositToInstantPool(address indexed owner, uint256 amount);


    // ======================= Modifier & Initializer ======================

    modifier onlyOperator {
        require(_msgSender() == operator, "PumpMonad: caller is not the operator");
        _;
    }

    modifier allowNormalUnstake {
        require(featureFlags & _NORMAL_UNSTAKE_FLAG != 0, "PumpMonad: normal unstake is not allowed");
        _;
    }
    
    modifier allowInstantUnstake {
        require(featureFlags & _INSTANT_UNSTAKE_FLAG != 0, "PumpMonad: instant unstake is not allowed");
        _;
    }
    
    modifier allowClaim { 
        require(featureFlags & _CLAIM_FLAG != 0, "PumpMonad: claim is not allowed");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _pumpTokenAddress, address _assetTokenAddress) public initializer {
        asset = IERC20(_assetTokenAddress);
        assetDecimal = ERC20(_assetTokenAddress).decimals();
        require(assetDecimal == 18, "PumpMonad: invalid asset token");

        pumpMonad = PumpToken(_pumpTokenAddress);
        require(pumpMonad.decimals() == 18, "PumpMonad: invalid PumpMONAD token");

        normalUnstakeFee = 0;     // Means 0%
        instantUnstakeFee = 300;    // Means 3%
        featureFlags = 0;

        __Ownable_init(_msgSender());
        __Ownable2Step_init();
        __Pausable_init();
    }


    // ========================== Utils functions ==========================
    function _getPeriod() public virtual pure returns (uint256) {
        return 1 days;
    }

    function _getDateSlot(uint256 timestamp) public pure returns (uint8) {
        return uint8((timestamp + 8 hours) / _getPeriod() % MAX_DATE_SLOT);   // UTC+8 date slot
    }


    // ========================== Owner functions ==========================
    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function setStakeAssetCap(uint256 newTotalStakingCap) public onlyOwner {
        require(newTotalStakingCap.toInt256() >= totalStakingAmount, "PumpMonad: staking cap too small");

        emit SetStakeAssetCap(totalStakingCap, newTotalStakingCap);
        totalStakingCap = newTotalStakingCap;
    }

    function setNormalUnstakeFee(uint256 newNormalUnstakeFee) public onlyOwner {
        require(newNormalUnstakeFee < 10000, "PumpMonad: fee should be less than 100%");

        emit SetNormalUnstakeFee(normalUnstakeFee, newNormalUnstakeFee);
        normalUnstakeFee = newNormalUnstakeFee;
    }

    function setInstantUnstakeFee(uint256 newInstantUnstakeFee) public onlyOwner {
        require(newInstantUnstakeFee < 10000, "PumpMonad: fee should be less than 100%");

        emit SetInstantUnstakeFee(instantUnstakeFee, newInstantUnstakeFee);
        instantUnstakeFee = newInstantUnstakeFee;
    }

    function setOperator(address newOperator) public onlyOwner {
        emit SetOperator(operator, newOperator);
        operator = newOperator;
    }

    function setAllowNormalUnstake(bool allow) public onlyOwner {
        if (allow) {
            featureFlags |= _NORMAL_UNSTAKE_FLAG;
        } else {
            featureFlags &= ~_NORMAL_UNSTAKE_FLAG;
        }
        emit SetAllowNormalUnstake(allow);
    }

    function setAllowInstantUnstake(bool allow) public onlyOwner {
        if (allow) {
            featureFlags |= _INSTANT_UNSTAKE_FLAG;
        } else {
            featureFlags &= ~_INSTANT_UNSTAKE_FLAG;
        }
        emit SetAllowInstantUnstake(allow);
    }

    function setAllowClaim(bool allow) public onlyOwner {
        if (allow) {
            featureFlags |= _CLAIM_FLAG;
        } else {
            featureFlags &= ~_CLAIM_FLAG;
        }
        emit SetAllowClaim(allow);
    }

    function collectFee() public onlyOwner {
        uint256 oldCollectedFee = collectedFee;
        collectedFee = 0;
        emit FeeCollected(oldCollectedFee);

        asset.safeTransfer(_msgSender(), oldCollectedFee);
    }


    // ========================= Operator functions ========================
    /**
     * @dev Suppose that the total staking amount is X, total unstaking request amount is 
     *  Y, and total unstaking-instantly amount is Z. Then the admin should withdraw X-Z, 
     *  and then deposit X-Z to Babylon. Meanwhile, the admin should request withdraw Y
     *  from Babylon. `pendingStakeAmount` aims to record `X-Z`.
     */
    function withdraw() public onlyOperator {
        require(pendingStakeAmount > 0, "PumpMonad: no pending stake amount");

        uint256 oldPendingStakeAmount = pendingStakeAmount;
        pendingStakeAmount = 0;
        emit AdminWithdraw(_msgSender(), oldPendingStakeAmount);

        asset.safeTransfer(_msgSender(), oldPendingStakeAmount);
    }

    /**
     * @param amount records `Y` on day T-10.
     */
    function deposit(uint256 amount) public onlyOperator {
        require(amount > 0, "PumpMonad: amount should be greater than 0");

        totalClaimableAmount += amount;
        emit AdminDeposit(_msgSender(), amount);

        asset.safeTransferFrom(_msgSender(), address(this), amount);
    }

    /**
     * @dev Call `withdraw` and `deposit` in one function.
     */
    function withdrawAndDeposit(uint256 depositAmount) public onlyOperator {
        uint256 oldPendingStakeAmount = pendingStakeAmount;
        pendingStakeAmount = 0;
        totalClaimableAmount += depositAmount;

        emit AdminWithdraw(_msgSender(), oldPendingStakeAmount);
        emit AdminDeposit(_msgSender(), depositAmount);

        if (oldPendingStakeAmount > depositAmount) {
            asset.safeTransfer(_msgSender(), oldPendingStakeAmount - depositAmount);
        }
        else if (oldPendingStakeAmount < depositAmount){
            asset.safeTransferFrom(
                _msgSender(), address(this), depositAmount - oldPendingStakeAmount
            );
        }
    }

    /**
     * @dev Deposit to instant-unstake pool.
     */
    function depositToInstantPool(uint256 amount) public onlyOperator {
        require(amount > 0, "PumpMonad: amount should be greater than 0");
        
        instantPoolAmount += amount;
        emit AdminDepositToInstantPool(_msgSender(), amount);

        asset.safeTransferFrom(_msgSender(), address(this), amount);
    }

    /**
     * @dev Withdraw from instant-unstake pool.
     */
    function withdrawFromInstantPool(uint256 amount) public onlyOperator {
        require(amount > 0, "PumpMonad: amount should be greater than 0");
        require(amount <= instantPoolAmount, "PumpMonad: insufficient instant pool amount");
        
        instantPoolAmount -= amount;
        emit AdminWithdrawFromInstantPool(_msgSender(), amount);

        asset.safeTransfer(_msgSender(), amount);
    }


    // =========================== User functions ==========================
    function stake(uint256 amount) public whenNotPaused {
        require(amount > 0, "PumpMonad: amount should be greater than 0");
        require(
            totalStakingAmount + amount.toInt256() <= totalStakingCap.toInt256(), 
            "PumpMonad: exceed staking cap"
        );

        totalStakingAmount += amount.toInt256();
        pendingStakeAmount += amount;

        emit Stake(_msgSender(), amount);

        asset.safeTransferFrom(_msgSender(), address(this), amount);
        pumpMonad.mint(_msgSender(), amount);
    }


    function unstakeRequest(uint256 amount) public whenNotPaused allowNormalUnstake {
        address user = _msgSender();
        uint8 slot = _getDateSlot(block.timestamp);

        require(amount > 0, "PumpMonad: amount should be greater than 0");
        require(
            block.timestamp - pendingUnstakeTime[user][slot] < _getPeriod()
            || pendingUnstakeAmount[user][slot] == 0, "PumpMonad: claim the previous unstake first"
        );

        pendingUnstakeTime[user][slot] = block.timestamp;
        pendingUnstakeAmount[user][slot] += amount;
        totalStakingAmount -= amount.toInt256();
        totalRequestedAmount += amount;

        emit UnstakeRequest(user, amount, slot);

        pumpMonad.burn(user, amount);
    }

    function claimSlot(uint8 slot) public whenNotPaused allowClaim {
        address user = _msgSender();
        uint256 amount = pendingUnstakeAmount[user][slot];
        uint256 fee = amount * normalUnstakeFee / 10000;

        require(amount > 0, "PumpMonad: no pending unstake");
        require(
            block.timestamp - pendingUnstakeTime[user][slot] >= (MAX_DATE_SLOT - 1) * _getPeriod(),
            "PumpMonad: haven't reached the claimable time"
        );

        pendingUnstakeAmount[user][slot] = 0;
        totalClaimableAmount -= amount;
        totalRequestedAmount -= amount;
        collectedFee += fee;

        emit ClaimSlot(user, amount, slot);

        asset.safeTransfer(user, amount - fee);
    }

    function claimAll() public whenNotPaused allowClaim {
        address user = _msgSender();
        uint256 totalAmount = 0;
        uint256 pendingCount = 0;

        for(uint8 slot = 0; slot < MAX_DATE_SLOT; slot++) {
            uint256 amount = pendingUnstakeAmount[user][slot];
            bool readyToClaim = block.timestamp - pendingUnstakeTime[user][slot] >= (MAX_DATE_SLOT - 1) * _getPeriod();
            if (amount > 0) {
                pendingCount += 1;
                if (readyToClaim) {
                    totalAmount += amount;
                    pendingUnstakeAmount[user][slot] = 0;
                }
            }
        }
        uint256 fee = totalAmount * normalUnstakeFee / 10000;

        require(pendingCount > 0, "PumpMonad: no pending unstake");   
        require(totalAmount > 0, "PumpMonad: haven't reached the claimable time");

        totalClaimableAmount -= totalAmount;
        totalRequestedAmount -= totalAmount;
        collectedFee += fee;

        emit ClaimAll(user, totalAmount);

        asset.safeTransfer(user, totalAmount - fee);
    }

    function unstakeInstant(uint256 amount) public whenNotPaused allowInstantUnstake {
        address user = _msgSender();
        uint256 fee = amount * instantUnstakeFee / 10000;

        require(amount > 0, "PumpMonad: amount should be greater than 0");
        require(amount <= instantPoolAmount + pendingStakeAmount, "PumpMonad: insufficient liquidity");

        if (amount <= instantPoolAmount) {
            instantPoolAmount -= amount;
        } else {
            instantPoolAmount = 0;
            pendingStakeAmount -= amount - instantPoolAmount;
        }

        totalStakingAmount -= amount.toInt256();
        collectedFee += fee;

        emit UnstakeInstant(user, amount);

        pumpMonad.burn(user, amount);
        asset.safeTransfer(user, amount - fee);
    }

}