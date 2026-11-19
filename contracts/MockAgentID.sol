// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockAgentID — test double for the Agent ID registry
/// @notice A minimal stand-in for the official Agent ID ERC-721 registry,
///         used only in tests. It implements the single `balanceOf`
///         function Agent Lounge depends on, backed by a plain mapping
///         that tests can flip with `setHolder`.
/// @dev This contract is never deployed to a live network as part of the
///      project; production deployments point Agent Lounge at the real
///      registry address instead.
contract MockAgentID {
    mapping(address => bool) private _holders;

    /// @notice Mark or unmark an address as an Agent ID holder.
    /// @param account The address to configure.
    /// @param holds True if the address should count as a holder.
    function setHolder(address account, bool holds) external {
        _holders[account] = holds;
    }

    /// @notice Mirrors the ERC-721 holding check: 1 for holders, else 0.
    function balanceOf(address owner) external view returns (uint256) {
        return _holders[owner] ? 1 : 0;
    }
}
