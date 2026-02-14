// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/CLAWDTipJar.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockCLAWD is ERC20 {
    constructor() ERC20("CLAWD", "CLAWD") {
        _mint(msg.sender, 1_000_000 ether);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract CLAWDTipJarTest is Test {
    CLAWDTipJar public tipJar;
    MockCLAWD public token;
    address public owner;
    address public tipper1;
    address public tipper2;

    function setUp() public {
        owner = address(this);
        tipper1 = makeAddr("tipper1");
        tipper2 = makeAddr("tipper2");

        token = new MockCLAWD();
        tipJar = new CLAWDTipJar(address(token));

        // Give tippers some tokens
        token.transfer(tipper1, 10_000 ether);
        token.transfer(tipper2, 10_000 ether);
    }

    function test_constructor() public view {
        assertEq(address(tipJar.clawdToken()), address(token));
        assertEq(tipJar.owner(), owner);
        assertEq(tipJar.getTipCount(), 0);
        assertEq(tipJar.totalTips(), 0);
    }

    function test_tip() public {
        vm.startPrank(tipper1);
        token.approve(address(tipJar), 100 ether);
        tipJar.tip(100 ether, "Great work!");
        vm.stopPrank();

        assertEq(tipJar.getTipCount(), 1);
        assertEq(tipJar.totalTips(), 100 ether);
        assertEq(tipJar.totalTipped(tipper1), 100 ether);
        assertEq(token.balanceOf(address(tipJar)), 100 ether);
    }

    function test_tipEmitsEvent() public {
        vm.startPrank(tipper1);
        token.approve(address(tipJar), 50 ether);

        vm.expectEmit(true, false, false, true);
        emit CLAWDTipJar.TipReceived(tipper1, 50 ether, "Hello!");
        tipJar.tip(50 ether, "Hello!");
        vm.stopPrank();
    }

    function test_multipleTips() public {
        vm.startPrank(tipper1);
        token.approve(address(tipJar), 300 ether);
        tipJar.tip(100 ether, "Tip 1");
        tipJar.tip(200 ether, "Tip 2");
        vm.stopPrank();

        assertEq(tipJar.getTipCount(), 2);
        assertEq(tipJar.totalTips(), 300 ether);
        assertEq(tipJar.totalTipped(tipper1), 300 ether);
    }

    function test_multipleTippers() public {
        vm.prank(tipper1);
        token.approve(address(tipJar), 100 ether);
        vm.prank(tipper1);
        tipJar.tip(100 ether, "From tipper1");

        vm.prank(tipper2);
        token.approve(address(tipJar), 200 ether);
        vm.prank(tipper2);
        tipJar.tip(200 ether, "From tipper2");

        assertEq(tipJar.getTipCount(), 2);
        assertEq(tipJar.totalTips(), 300 ether);
        assertEq(tipJar.totalTipped(tipper1), 100 ether);
        assertEq(tipJar.totalTipped(tipper2), 200 ether);
    }

    function test_tipZeroAmountReverts() public {
        vm.prank(tipper1);
        vm.expectRevert("Amount must be > 0");
        tipJar.tip(0, "Should fail");
    }

    function test_tipMessageTooLongReverts() public {
        // 281 bytes
        bytes memory longMsg = new bytes(281);
        for (uint256 i = 0; i < 281; i++) longMsg[i] = "a";

        vm.startPrank(tipper1);
        token.approve(address(tipJar), 1 ether);
        vm.expectRevert("Message too long");
        tipJar.tip(1 ether, string(longMsg));
        vm.stopPrank();
    }

    function test_tipWithoutApprovalReverts() public {
        vm.prank(tipper1);
        vm.expectRevert();
        tipJar.tip(100 ether, "No approval");
    }

    function test_getRecentTips() public {
        vm.startPrank(tipper1);
        token.approve(address(tipJar), 600 ether);
        tipJar.tip(100 ether, "Tip 1");
        tipJar.tip(200 ether, "Tip 2");
        tipJar.tip(300 ether, "Tip 3");
        vm.stopPrank();

        CLAWDTipJar.Tip[] memory recent = tipJar.getRecentTips(2);
        assertEq(recent.length, 2);
        assertEq(recent[0].amount, 200 ether);
        assertEq(recent[1].amount, 300 ether);
    }

    function test_getRecentTipsMoreThanExists() public {
        vm.startPrank(tipper1);
        token.approve(address(tipJar), 100 ether);
        tipJar.tip(100 ether, "Only one");
        vm.stopPrank();

        CLAWDTipJar.Tip[] memory recent = tipJar.getRecentTips(10);
        assertEq(recent.length, 1);
    }

    function test_withdraw() public {
        vm.startPrank(tipper1);
        token.approve(address(tipJar), 500 ether);
        tipJar.tip(500 ether, "Big tip");
        vm.stopPrank();

        address recipient = makeAddr("recipient");
        tipJar.withdraw(recipient);
        assertEq(token.balanceOf(recipient), 500 ether);
        assertEq(token.balanceOf(address(tipJar)), 0);
    }

    function test_withdrawEmitsEvent() public {
        vm.startPrank(tipper1);
        token.approve(address(tipJar), 100 ether);
        tipJar.tip(100 ether, "Tip");
        vm.stopPrank();

        address recipient = makeAddr("recipient");
        vm.expectEmit(true, false, false, true);
        emit CLAWDTipJar.Withdrawn(recipient, 100 ether);
        tipJar.withdraw(recipient);
    }

    function test_withdrawNotOwnerReverts() public {
        vm.startPrank(tipper1);
        token.approve(address(tipJar), 100 ether);
        tipJar.tip(100 ether, "Tip");
        vm.stopPrank();

        vm.prank(tipper1);
        vm.expectRevert("Not owner");
        tipJar.withdraw(tipper1);
    }

    function test_withdrawNothingReverts() public {
        vm.expectRevert("Nothing to withdraw");
        tipJar.withdraw(owner);
    }

    function test_tipMaxMessage() public {
        // Exactly 280 bytes should work
        bytes memory maxMsg = new bytes(280);
        for (uint256 i = 0; i < 280; i++) maxMsg[i] = "a";

        vm.startPrank(tipper1);
        token.approve(address(tipJar), 1 ether);
        tipJar.tip(1 ether, string(maxMsg));
        vm.stopPrank();

        assertEq(tipJar.getTipCount(), 1);
    }
}
