//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import { DeployClawdTipJar } from "./DeployClawdTipJar.s.sol";

contract DeployScript is ScaffoldETHDeploy {
  function run() external {
    DeployClawdTipJar deployTipJar = new DeployClawdTipJar();
    deployTipJar.run();
  }
}
