// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SimplePayment
 * @notice A minimal payment relay for Arc Testnet.
 *
 * Arc uses USDC as its native gas token (18 decimals), so `msg.value`
 * in this contract is denominated in USDC. The contract forwards the
 * value from the sender to a recipient and records an on-chain memo,
 * giving every payment a searchable, programmable receipt.
 *
 * Designed as a learning/demo project for the Build on Arc community.
 */
contract SimplePayment {
    /// @notice Total number of payments routed through this contract.
    uint256 public paymentCount;

    /// @notice Cumulative USDC volume (in wei units, 18 decimals) routed through this contract.
    uint256 public totalVolume;

    /// @notice Per-address outbound payment count.
    mapping(address => uint256) public sentCount;

    /// @notice Per-address inbound payment count.
    mapping(address => uint256) public receivedCount;

    /**
     * @notice Emitted for every successful payment.
     * @param from      Sender address.
     * @param to        Recipient address.
     * @param amount    USDC amount in wei units (18 decimals on Arc).
     * @param memo      Free-form note attached to the payment.
     * @param timestamp Block timestamp at the time of the payment.
     */
    event PaymentSent(
        address indexed from,
        address indexed to,
        uint256 amount,
        string memo,
        uint256 timestamp
    );

    error ZeroAmount();
    error ZeroAddress();
    error TransferFailed();

    /**
     * @notice Send native USDC to `to` with an on-chain memo.
     * @dev    `msg.value` is the USDC amount because USDC is Arc's native gas token.
     * @param to   Recipient address (must be non-zero).
     * @param memo Free-form memo (kept short to save gas).
     */
    function sendPayment(address to, string calldata memo) external payable {
        if (msg.value == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();

        unchecked {
            paymentCount += 1;
            totalVolume += msg.value;
            sentCount[msg.sender] += 1;
            receivedCount[to] += 1;
        }

        (bool ok, ) = to.call{value: msg.value}("");
        if (!ok) revert TransferFailed();

        emit PaymentSent(msg.sender, to, msg.value, memo, block.timestamp);
    }

    /**
     * @notice Convenience view returning aggregated stats in one call.
     */
    function stats()
        external
        view
        returns (uint256 totalPayments, uint256 totalVolumeWei)
    {
        return (paymentCount, totalVolume);
    }

    /// @dev Reject plain ETH transfers — force everyone through `sendPayment` so we get a memo + event.
    receive() external payable {
        revert("Use sendPayment(address,string) so the payment is logged with a memo.");
    }
}
