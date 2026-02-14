// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import "../contracts/CLAWDTipJar.sol";

contract DeployCLAWDTipJar is ScaffoldETHDeploy {
    // $CLAWD token on Base
    address constant CLAWD_TOKEN = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

    function run() external ScaffoldEthDeployerRunner {
        new CLAWDTipJar(CLAWD_TOKEN);
    }
}
