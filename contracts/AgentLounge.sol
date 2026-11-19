// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal read interface for an ERC-721 style registry.
/// @dev Agent Lounge only ever needs one question answered: "does this
///      address hold at least one token in the registry?" The official
///      Agent ID registry is an ERC-721 contract, so `balanceOf` is the
///      canonical holding check described in the hackathon resources.
interface IERC721Balance {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title Agent Lounge — an Agent ID-gated clubhouse
/// @notice Agent Lounge is a members-only clubhouse. Membership is not
///         bought, minted, or assigned by an admin: it is proven on-chain
///         by holding an Agent ID. Every state-changing function in this
///         contract first checks the official Agent ID registry
///         (an ERC-721, "SPACE ID Agent ID") and reverts for any caller
///         whose registry balance is zero.
///
///         Members can:
///           - check in once per UTC day, building streaks and points;
///           - write short messages on a shared on-chain guest wall;
///           - claim badge levels earned through consistent check-ins.
///
/// @dev PERMISSIONS — NIL BY DESIGN.
///      This contract intentionally has:
///        - no owner and no admin roles of any kind;
///        - no payable functions and no way to receive, hold, or move
///          funds (no transfer / withdraw / sweep functions);
///        - no mint, pause, freeze, upgrade, or configuration functions;
///        - no function that can alter another member's data.
///      The Agent ID registry address is fixed immutably at deployment.
///      This is a deliberate transparency choice: after deployment nobody,
///      including the deployer, can change the rules or touch user data.
///      The only gate is the Agent ID holding check, applied uniformly to
///      every caller.
contract AgentLounge {
    /// @notice The official Agent ID registry (ERC-721) used for gating.
    /// @dev Set once in the constructor and immutable thereafter.
    IERC721Balance public immutable agentIdRegistry;

    /// @notice Points awarded for a base check-in, before the streak bonus.
    uint256 public constant BASE_POINTS = 10;

    /// @notice The streak bonus is capped at this many extra points, so a
    ///         check-in earns `BASE_POINTS + min(streak, MAX_STREAK_BONUS)`.
    uint256 public constant MAX_STREAK_BONUS = 7;

    /// @notice Maximum byte length of a guest-wall message.
    uint256 public constant MAX_MESSAGE_BYTES = 280;

    /// @notice Maximum number of messages returned by a single
    ///         `getMessages` call.
    uint256 public constant MAX_PAGE_SIZE = 50;

    /// @dev Per-member activity record.
    struct Member {
        uint256 totalCheckIns;    // lifetime number of check-ins
        uint256 currentStreak;    // consecutive UTC days checked in
        uint256 bestStreak;       // longest streak ever reached
        uint256 points;           // accumulated lounge points
        uint256 claimedBadge;     // highest badge level claimed (0 = none)
        uint256 lastCheckInDay;   // UTC day index of the last check-in
        bool hasCheckedIn;        // distinguishes "never" from day 0
    }

    /// @dev One guest-wall entry.
    struct Message {
        address author;
        uint256 timestamp;
        string text;
    }

    mapping(address => Member) private _members;
    Message[] private _messages;

    /// @notice Emitted on every successful check-in.
    /// @param member The member who checked in.
    /// @param day The UTC day index (block.timestamp / 86400).
    /// @param streak The member's streak after this check-in.
    /// @param points The member's total points after this check-in.
    event CheckedIn(address indexed member, uint256 day, uint256 streak, uint256 points);

    /// @notice Emitted when a message is added to the guest wall.
    /// @param index The message's index in the wall array.
    /// @param author The message author (an Agent ID holder).
    event MessagePosted(uint256 indexed index, address indexed author);

    /// @notice Emitted when a member claims a new badge level.
    /// @param member The member claiming the badge.
    /// @param level The badge level just claimed (1–4).
    event BadgeClaimed(address indexed member, uint256 level);

    /// @param agentIdRegistry_ Address of the Agent ID registry contract.
    constructor(address agentIdRegistry_) {
        require(agentIdRegistry_ != address(0), "Registry required");
        agentIdRegistry = IERC721Balance(agentIdRegistry_);
    }

    /// @dev The single membership gate used by every write function.
    ///      Holding is defined exactly as the hackathon documentation
    ///      describes: `balanceOf(caller) > 0` on the Agent ID registry.
    modifier onlyAgentHolder() {
        require(
            agentIdRegistry.balanceOf(msg.sender) > 0,
            "Agent ID required"
        );
        _;
    }

    /// @notice Check in for today. One check-in per member per UTC day.
    /// @dev Points formula (kept deliberately simple and auditable):
    ///        points += BASE_POINTS (10) + min(currentStreak, 7)
    ///      where `currentStreak` is the streak *after* this check-in is
    ///      counted. A streak continues when the previous check-in was
    ///      exactly yesterday; any longer gap restarts the streak at 1.
    function checkIn() external onlyAgentHolder {
        uint256 today = block.timestamp / 86400;
        Member storage m = _members[msg.sender];

        require(!m.hasCheckedIn || m.lastCheckInDay != today, "Already checked in today");

        if (m.hasCheckedIn && m.lastCheckInDay == today - 1) {
            m.currentStreak += 1;
        } else {
            m.currentStreak = 1;
        }
        if (m.currentStreak > m.bestStreak) {
            m.bestStreak = m.currentStreak;
        }

        uint256 bonus = m.currentStreak < MAX_STREAK_BONUS ? m.currentStreak : MAX_STREAK_BONUS;
        m.points += BASE_POINTS + bonus;
        m.totalCheckIns += 1;
        m.lastCheckInDay = today;
        m.hasCheckedIn = true;

        emit CheckedIn(msg.sender, today, m.currentStreak, m.points);
    }

    /// @notice Post a short message on the shared guest wall.
    /// @param text Message text, 1–280 bytes (measured in bytes, so
    ///        multi-byte UTF-8 characters count for more than one).
    function postMessage(string calldata text) external onlyAgentHolder {
        uint256 len = bytes(text).length;
        require(len > 0, "Message empty");
        require(len <= MAX_MESSAGE_BYTES, "Message too long");

        _messages.push(Message({
            author: msg.sender,
            timestamp: block.timestamp,
            text: text
        }));

        emit MessagePosted(_messages.length - 1, msg.sender);
    }

    /// @notice Claim the badge level earned by your total check-ins.
    /// @dev Levels: 1 at >= 3 check-ins, 2 at >= 7, 3 at >= 14,
    ///      4 at >= 30. A claim records the highest level currently
    ///      earned; a member's claimed level can only increase, and
    ///      claiming when no *new* level has been earned reverts.
    function claimBadge() external onlyAgentHolder {
        Member storage m = _members[msg.sender];
        uint256 earned = badgeLevel(msg.sender);
        require(earned > m.claimedBadge, "No new badge");

        m.claimedBadge = earned;
        emit BadgeClaimed(msg.sender, earned);
    }

    /// @notice The badge level an address has earned from its check-ins
    ///         (whether or not it has been claimed yet).
    /// @param user The address to evaluate.
    /// @return level Earned badge level, 0–4.
    function badgeLevel(address user) public view returns (uint256 level) {
        uint256 n = _members[user].totalCheckIns;
        if (n >= 30) return 4;
        if (n >= 14) return 3;
        if (n >= 7) return 2;
        if (n >= 3) return 1;
        return 0;
    }

    /// @notice Full activity snapshot for one address.
    /// @param user The address to inspect.
    /// @return totalCheckIns Lifetime check-ins.
    /// @return currentStreak Current consecutive-day streak.
    /// @return bestStreak Longest streak ever.
    /// @return points Accumulated points.
    /// @return earnedBadgeLevel Badge level earned (may be unclaimed).
    /// @return claimedBadgeLevel Highest badge level claimed so far.
    /// @return lastCheckInDay UTC day index of the last check-in
    ///         (0 if the member has never checked in).
    function memberStats(address user)
        external
        view
        returns (
            uint256 totalCheckIns,
            uint256 currentStreak,
            uint256 bestStreak,
            uint256 points,
            uint256 earnedBadgeLevel,
            uint256 claimedBadgeLevel,
            uint256 lastCheckInDay
        )
    {
        Member storage m = _members[user];
        return (
            m.totalCheckIns,
            m.currentStreak,
            m.bestStreak,
            m.points,
            badgeLevel(user),
            m.claimedBadge,
            m.hasCheckedIn ? m.lastCheckInDay : 0
        );
    }

    /// @notice Total number of messages on the guest wall.
    function messageCount() external view returns (uint256) {
        return _messages.length;
    }

    /// @notice Read the guest wall, newest message first.
    /// @param offset How many of the newest messages to skip.
    /// @param limit Maximum messages to return (capped at 50).
    /// @return slice The requested messages in reverse-chronological
    ///         order (index 0 of the result is the newest in the page).
    function getMessages(uint256 offset, uint256 limit)
        external
        view
        returns (Message[] memory slice)
    {
        uint256 total = _messages.length;
        if (offset >= total) {
            return new Message[](0);
        }
        uint256 capped = limit > MAX_PAGE_SIZE ? MAX_PAGE_SIZE : limit;
        uint256 available = total - offset;
        uint256 count = capped < available ? capped : available;

        slice = new Message[](count);
        for (uint256 i = 0; i < count; i++) {
            // Walk backwards from the newest message.
            slice[i] = _messages[total - 1 - offset - i];
        }
        return slice;
    }
}
