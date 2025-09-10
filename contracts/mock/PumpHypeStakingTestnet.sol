// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../PumpHypeStaking.sol";

contract PumpHypeStakingTestnet is PumpHypeStaking {

    function _getPeriod() public override pure returns (uint256) {
        return 1 minutes;
    }
    
}