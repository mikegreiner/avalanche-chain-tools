#!/usr/bin/env python3
"""
Discover how to query user's voting power

This script:
1. Queries veBLACK balance for a user address
2. Queries total weight (current allocated votes)
3. Calculates available voting power
4. Validates calculations match web UI

Goal: Implement JavaScript functions to get and display voting power
"""

import sys
from web3 import Web3
from typing import Optional

# Configuration
RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VE_BLACK_TOKEN = "0xEac562811cc6abDbB2c9EE88719eCA4eE79Ad763"
VOTER_CONTRACT = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"

# Initialize Web3
w3 = Web3(Web3.HTTPProvider(RPC_URL))

print("=" * 80)
print("VOTING POWER DISCOVERY")
print("=" * 80)
print(f"veBLACK Token: {VE_BLACK_TOKEN}")
print(f"Voter Contract: {VOTER_CONTRACT}")
print(f"RPC: {RPC_URL}")
print()


def keccak(sig: str) -> str:
    """Compute function selector"""
    return "0x" + w3.keccak(text=sig)[:4].hex()


def eth_call(to: str, data: str) -> Optional[bytes]:
    """Make eth_call"""
    try:
        return w3.eth.call({
            'to': Web3.to_checksum_address(to),
            'data': data
        })
    except Exception as e:
        print(f"  ✗ Call failed: {e}")
        return None


def decode_uint256(data: bytes) -> int:
    """Decode uint256 from bytes"""
    if not data or len(data) < 32:
        return 0
    return int.from_bytes(data[:32], byteorder='big')


def encode_address(address: str) -> str:
    """Encode address as bytes32"""
    addr = address.lower()
    if addr.startswith('0x'):
        addr = addr[2:]
    return addr.zfill(64)


def get_veblack_balance(user_address: str) -> float:
    """
    Get user's veBLACK balance
    veBLACK represents locked BLACK tokens (voting power)
    """
    print(f"\n[1] Querying veBLACK balance for {user_address}...")

    selector = keccak("balanceOf(address)")
    param = encode_address(user_address)
    data = selector + param

    result = eth_call(VE_BLACK_TOKEN, data)

    if result:
        balance_wei = decode_uint256(result)
        balance = balance_wei / 1e18
        print(f"  ✓ veBLACK balance: {balance:,.2f}")
        return balance
    else:
        print(f"  ✗ Failed to get veBLACK balance")
        return 0.0


def get_total_weight(user_address: str) -> float:
    """
    Get user's total allocated votes across all pools
    This is the sum of all votes the user has cast this epoch
    """
    print(f"\n[2] Querying total allocated votes for {user_address}...")

    # Try totalWeight() - might be for global, not user-specific
    selector = keccak("totalWeight()")
    result = eth_call(VOTER_CONTRACT, selector)

    if result:
        total_wei = decode_uint256(result)
        total = total_wei / 1e18
        print(f"  ℹ Global totalWeight: {total:,.2f}")

    # Try usedWeights(address) - user-specific allocated votes
    print("\n  Trying usedWeights(address)...")
    selector = keccak("usedWeights(address)")
    param = encode_address(user_address)
    data = selector + param

    result = eth_call(VOTER_CONTRACT, data)

    if result:
        used_wei = decode_uint256(result)
        used = used_wei / 1e18
        print(f"  ✓ User's allocated votes: {used:,.2f}")
        return used
    else:
        print(f"  ✗ Failed to get allocated votes")

    # Try votes(address) as alternative
    print("\n  Trying votes(address)...")
    selector = keccak("votes(address)")
    param = encode_address(user_address)
    data = selector + param

    result = eth_call(VOTER_CONTRACT, data)

    if result:
        votes_wei = decode_uint256(result)
        votes = votes_wei / 1e18
        print(f"  ✓ User's votes: {votes:,.2f}")
        return votes
    else:
        print(f"  ✗ Failed to get votes")
        return 0.0


def calculate_available_voting_power(veblack_balance: float, allocated_votes: float) -> float:
    """
    Calculate available voting power
    Formula: Available = veBLACK balance - Allocated votes
    """
    available = veblack_balance - allocated_votes

    print(f"\n[3] Calculating available voting power...")
    print(f"  veBLACK balance: {veblack_balance:,.2f}")
    print(f"  Allocated votes: {allocated_votes:,.2f}")
    print(f"  Available votes: {available:,.2f}")

    return available


def get_pool_votes(pool_address: str, user_address: str = None) -> float:
    """
    Get votes for a specific pool
    If user_address is provided, gets user's votes for that pool
    Otherwise, gets total votes for that pool
    """
    print(f"\n[4] Querying votes for pool {pool_address}...")

    selector = keccak("weights(address)")
    param = encode_address(pool_address)
    data = selector + param

    result = eth_call(VOTER_CONTRACT, data)

    if result:
        votes_wei = decode_uint256(result)
        votes = votes_wei / 1e18
        print(f"  ✓ Pool total votes: {votes:,.2f}")
        return votes
    else:
        print(f"  ✗ Failed to get pool votes")
        return 0.0


def test_locked_balance(user_address: str):
    """
    Test getting locked balance details from veBLACK
    veBLACK tokens represent locked BLACK with time-weighted voting power
    """
    print(f"\n[5] Querying locked balance details for {user_address}...")

    # Try locked(address) which typically returns a struct
    selector = keccak("locked(address)")
    param = encode_address(user_address)
    data = selector + param

    result = eth_call(VE_BLACK_TOKEN, data)

    if result:
        print(f"  ✓ Locked data returned ({len(result)} bytes)")

        # Try to decode struct: (int128 amount, uint256 end)
        if len(result) >= 64:
            amount_bytes = result[:32]
            end_bytes = result[32:64]

            # amount is int128, but stored in bytes32 (signed)
            amount_wei = int.from_bytes(amount_bytes, byteorder='big', signed=True)
            amount = amount_wei / 1e18

            # end is uint256 timestamp
            end_timestamp = int.from_bytes(end_bytes, byteorder='big')

            print(f"    Locked amount: {amount:,.2f} BLACK")
            print(f"    Lock end: {end_timestamp} (Unix timestamp)")

            if end_timestamp > 0:
                from datetime import datetime
                lock_end = datetime.fromtimestamp(end_timestamp)
                print(f"    Lock end date: {lock_end.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    else:
        print(f"  ✗ Failed to get locked balance")


def try_additional_functions(user_address: str):
    """
    Try additional functions that might exist on Voter or veBLACK contracts
    """
    print(f"\n[6] Testing additional functions...")

    functions_to_test = [
        ("balanceOfNFT(uint256)", "veBLACK"),  # Velodrome-style NFT balance
        ("votingPower(address)", "Voter"),  # Direct voting power getter
        ("getVotes(address)", "veBLACK"),  # ERC20Votes style
        ("getPastVotes(address,uint256)", "veBLACK"),  # Historical votes
    ]

    for sig, contract_name in functions_to_test:
        selector = keccak(sig)
        print(f"  Testing {sig} on {contract_name}...")

        # For functions with address parameter
        if "address" in sig:
            param = encode_address(user_address)
            data = selector + param
        else:
            data = selector

        contract_addr = VE_BLACK_TOKEN if contract_name == "veBLACK" else VOTER_CONTRACT
        result = eth_call(contract_addr, data)

        if result and result != b'\x00' * 32:
            value = decode_uint256(result)
            print(f"    ✓ Result: {value / 1e18:,.2f}")
        else:
            print(f"    ✗ Function not available or returned zero")


def main():
    if len(sys.argv) < 2:
        print("Usage: python discover_voting_power.py <user_address>")
        print("\nExample:")
        print("  python discover_voting_power.py 0x1234567890123456789012345678901234567890")
        print("\nTesting with a known voter address...")
        print("You can find voter addresses at: https://blackhole.xyz/vote")
        sys.exit(1)

    user_address = sys.argv[1]

    # Validate address
    if not Web3.is_address(user_address):
        print(f"✗ Invalid address: {user_address}")
        sys.exit(1)

    user_address = Web3.to_checksum_address(user_address)

    print(f"User address: {user_address}\n")

    # Step 1: Get veBLACK balance
    veblack_balance = get_veblack_balance(user_address)

    # Step 2: Get allocated votes
    allocated_votes = get_total_weight(user_address)

    # Step 3: Calculate available voting power
    available = calculate_available_voting_power(veblack_balance, allocated_votes)

    # Step 4: Test with a known pool (optional)
    print("\n" + "=" * 80)
    known_pools = [
        "0x9A6142eF0766915dB02066f791D969C22eba1dcA",  # CL200-WAVAX/BLACK
        "0x78F5A53731564894A7e4FfF827a88E5FbF9cfCb6",  # vAMM-GCROC/WAVAX
    ]

    for pool_addr in known_pools:
        get_pool_votes(pool_addr, user_address)

    # Step 5: Get locked balance details
    test_locked_balance(user_address)

    # Step 6: Try additional functions
    try_additional_functions(user_address)

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"veBLACK Balance:    {veblack_balance:>15,.2f}")
    print(f"Allocated Votes:    {allocated_votes:>15,.2f}")
    print(f"Available Votes:    {available:>15,.2f}")
    print()

    # JavaScript implementation
    print("=" * 80)
    print("JAVASCRIPT IMPLEMENTATION")
    print("=" * 80)
    print("""
// Add to blackhole-rpc-client.js or create new voting-power-client.js

async getVotingPower(userAddress) {
  const results = {};

  // Get veBLACK balance
  const balanceSelector = await this.keccak256('balanceOf(address)');
  const balanceParam = this.encodeAddress(userAddress);
  const balanceResult = await this.ethCall(this.CONTRACTS.VE_TOKEN, balanceSelector + balanceParam);
  results.veBlackBalance = Number(this.decodeUint256(balanceResult)) / 1e18;

  // Get allocated votes (usedWeights)
  const usedSelector = await this.keccak256('usedWeights(address)');
  const usedParam = this.encodeAddress(userAddress);
  const usedResult = await this.ethCall(this.CONTRACTS.VOTER, usedSelector + usedParam);
  results.allocatedVotes = Number(this.decodeUint256(usedResult)) / 1e18;

  // Calculate available
  results.availableVotes = results.veBlackBalance - results.allocatedVotes;

  return results;
}
""")

    print("\n✓ Discovery complete!")
    print("  Use the JavaScript code above to implement voting power display in the extension")


if __name__ == "__main__":
    main()
