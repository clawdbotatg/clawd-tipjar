//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import { DeployCLAWDTipJar } from "./DeployCLAWDTipJar.s.sol";

contract DeployScript is ScaffoldETHDeploy {
  function run() external {
    DeployCLAWDTipJar deployCLAWDTipJar = new DeployCLAWDTipJar();
    deployCLAWDTipJar.run();
  }
}
