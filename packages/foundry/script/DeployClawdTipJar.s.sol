// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import "../contracts/ClawdTipJar.sol";

contract DeployClawdTipJar is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        // CLAWD token on Base
        address clawdToken = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;
        // Dev wallet (clawdbotatg.eth)
        address devWallet = 0x11ce532845cE0eAcdA41f72FDc1C88c335981442;
        // 50% dev / 50% burn
        uint256 devShareBps = 5000;

        ClawdTipJar tipJar = new ClawdTipJar(clawdToken, devWallet, devShareBps);
        console.logString(string.concat("ClawdTipJar deployed at: ", vm.toString(address(tipJar))));
    }
}
