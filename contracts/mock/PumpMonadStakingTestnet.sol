// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../PumpMonadStaking.sol";

contract PumpMonadStakingTestnet is PumpMonadStaking {

    function _getPeriod() public override pure returns (uint256) {
        return 1 minutes;
    }
    
}