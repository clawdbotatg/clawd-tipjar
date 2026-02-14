// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CLAWDTipJar {
    IERC20 public immutable clawdToken;
    address public owner;

    struct Tip {
        address tipper;
        uint256 amount;
        string message;
        uint256 timestamp;
    }

    Tip[] public tips;
    mapping(address => uint256) public totalTipped;
    uint256 public totalTips;

    event TipReceived(address indexed tipper, uint256 amount, string message);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(address _clawdToken) {
        clawdToken = IERC20(_clawdToken);
        owner = msg.sender;
    }

    function tip(uint256 amount, string calldata message) external {
        require(amount > 0, "Amount must be > 0");
        require(bytes(message).length <= 280, "Message too long");
        clawdToken.transferFrom(msg.sender, address(this), amount);
        tips.push(Tip(msg.sender, amount, message, block.timestamp));
        totalTipped[msg.sender] += amount;
        totalTips += amount;
        emit TipReceived(msg.sender, amount, message);
    }

    function withdraw(address to) external {
        require(msg.sender == owner, "Not owner");
        uint256 bal = clawdToken.balanceOf(address(this));
        require(bal > 0, "Nothing to withdraw");
        clawdToken.transfer(to, bal);
        emit Withdrawn(to, bal);
    }

    function getTipCount() external view returns (uint256) {
        return tips.length;
    }

    function getRecentTips(uint256 count) external view returns (Tip[] memory) {
        uint256 len = tips.length;
        if (count > len) count = len;
        Tip[] memory recent = new Tip[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = tips[len - count + i];
        }
        return recent;
    }
}
