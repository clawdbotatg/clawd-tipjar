// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ClawdTipJar
/// @notice A tip jar that splits CLAWD tips between the dev wallet and a burn address
/// @dev 50/50 split by default, configurable by admin. Tracks tips, burns, and leaderboard.
contract ClawdTipJar is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Constants ---
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant MAX_BPS = 10000;

    // --- State ---
    IERC20 public immutable clawdToken;
    address public devWallet;
    uint256 public devShareBps; // basis points for dev (e.g., 5000 = 50%)

    // Stats
    uint256 public totalTipped;
    uint256 public totalBurned;
    uint256 public totalDevReceived;
    uint256 public tipCount;

    // Leaderboard
    mapping(address => uint256) public tipperTotal;
    address[] public tippers; // unique tippers list
    mapping(address => bool) public isTipper;

    // --- Events ---
    event TipReceived(
        address indexed sender,
        uint256 amount,
        uint256 devShare,
        uint256 burnShare
    );
    event DevWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event DevShareUpdated(uint256 oldBps, uint256 newBps);

    // --- Constructor ---
    constructor(
        address _clawdToken,
        address _devWallet,
        uint256 _devShareBps
    ) Ownable(msg.sender) {
        require(_clawdToken != address(0), "Invalid token");
        require(_devWallet != address(0), "Invalid dev wallet");
        require(_devShareBps <= MAX_BPS, "Invalid bps");

        clawdToken = IERC20(_clawdToken);
        devWallet = _devWallet;
        devShareBps = _devShareBps;
    }

    // --- Core ---

    /// @notice Tip CLAWD tokens. Must approve this contract first.
    /// @param amount The amount of CLAWD to tip (in wei)
    function tip(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");

        // Calculate splits
        uint256 devAmount = (amount * devShareBps) / MAX_BPS;
        uint256 burnAmount = amount - devAmount;

        // Transfer from sender
        clawdToken.safeTransferFrom(msg.sender, devWallet, devAmount);
        clawdToken.safeTransferFrom(msg.sender, BURN_ADDRESS, burnAmount);

        // Update stats
        totalTipped += amount;
        totalBurned += burnAmount;
        totalDevReceived += devAmount;
        tipCount++;

        // Update leaderboard
        tipperTotal[msg.sender] += amount;
        if (!isTipper[msg.sender]) {
            isTipper[msg.sender] = true;
            tippers.push(msg.sender);
        }

        emit TipReceived(msg.sender, amount, devAmount, burnAmount);
    }

    // --- Admin ---

    function setDevWallet(address _devWallet) external onlyOwner {
        require(_devWallet != address(0), "Invalid address");
        address old = devWallet;
        devWallet = _devWallet;
        emit DevWalletUpdated(old, _devWallet);
    }

    function setDevShareBps(uint256 _bps) external onlyOwner {
        require(_bps <= MAX_BPS, "Invalid bps");
        uint256 old = devShareBps;
        devShareBps = _bps;
        emit DevShareUpdated(old, _bps);
    }

    // --- View ---

    /// @notice Get the number of unique tippers
    function getTipperCount() external view returns (uint256) {
        return tippers.length;
    }

    /// @notice Get top N tippers sorted by total amount (descending)
    /// @param n Max number of tippers to return
    function getTopTippers(uint256 n) external view returns (address[] memory, uint256[] memory) {
        uint256 len = tippers.length;
        if (n > len) n = len;

        // Copy to memory for sorting
        address[] memory sorted = new address[](len);
        uint256[] memory amounts = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            sorted[i] = tippers[i];
            amounts[i] = tipperTotal[tippers[i]];
        }

        // Simple selection sort for top N
        for (uint256 i = 0; i < n; i++) {
            uint256 maxIdx = i;
            for (uint256 j = i + 1; j < len; j++) {
                if (amounts[j] > amounts[maxIdx]) {
                    maxIdx = j;
                }
            }
            if (maxIdx != i) {
                (sorted[i], sorted[maxIdx]) = (sorted[maxIdx], sorted[i]);
                (amounts[i], amounts[maxIdx]) = (amounts[maxIdx], amounts[i]);
            }
        }

        // Trim to n
        address[] memory topAddrs = new address[](n);
        uint256[] memory topAmts = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            topAddrs[i] = sorted[i];
            topAmts[i] = amounts[i];
        }

        return (topAddrs, topAmts);
    }
}
