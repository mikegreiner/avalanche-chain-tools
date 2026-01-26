#!/usr/bin/env python3
"""
Discover how to detect user's previous votes

This script:
1. Attempts to find a function that lists user's voted pools
2. Tests batch-checking weights for all known pools
3. Identifies pools with non-zero user votes
4. Determines epoch/period information

Goal: Implement JavaScript to show "Current Votes" in side panel
"""

import sys
import json
import requests
from web3 import Web3
from typing import List, Dict, Tuple

# Configuration
RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_CONTRACT = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"
CL_POOLS_URL = "https://resources.blackhole.xyz/cl-pools-list/cl-pools.json"

# Initialize Web3
w3 = Web3(Web3.HTTPProvider(RPC_URL))

print("=" * 80)
print("PREVIOUS VOTES DISCOVERY")
print("=" * 80)
print(f"Voter Contract: {VOTER_CONTRACT}")
print(f"RPC: {RPC_URL}")
print()


def keccak(sig: str) -> str:
    """Compute function selector"""
    return "0x" + w3.keccak(text=sig)[:4].hex()


def eth_call(to: str, data: str) -> bytes:
    """Make eth_call"""
    try:
        return w3.eth.call({
            'to': Web3.to_checksum_address(to),
            'data': data
        })
    except Exception as e:
        return b''


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


def fetch_all_pools() -> List[Dict]:
    """
    Fetch all pool addresses from CL pools API
    """
    print("[1] Fetching all pool addresses...")

    try:
        response = requests.get(CL_POOLS_URL, timeout=10)
        data = response.json()
        pools = data.get('pools', data)
        print(f"  ✓ Found {len(pools)} pools from API")
        return pools
    except Exception as e:
        print(f"  ✗ Error fetching pools: {e}")
        return []


def test_pool_vote_function(user_address: str):
    """
    Test if there's a function to get user's voted pools directly
    """
    print(f"\n[2] Testing poolVote functions for {user_address}...")

    # Common function signatures for getting user votes
    functions_to_test = [
        "poolVote(address,uint256)",  # poolVote(user, index) → pool address
        "userVotes(address,uint256)",  # userVotes(user, index) → pool address
        "votes(address,uint256)",     # votes(user, index) → pool address
        "getPoolVotes(address)",      # getPoolVotes(user) → pool addresses array
        "getUserPools(address)",      # getUserPools(user) → pool addresses array
        "poolsVotedFor(address)",     # poolsVotedFor(user) → pool addresses array
    ]

    for sig in functions_to_test:
        selector = keccak(sig)
        print(f"  Testing {sig}...")
        print(f"    Selector: {selector}")

        # Build call data
        if "uint256" in sig:
            # Function with index parameter - try index 0
            param_user = encode_address(user_address)
            param_index = "0" * 64  # uint256(0)
            data = selector + param_user + param_index
        else:
            # Function with just address parameter
            param = encode_address(user_address)
            data = selector + param

        result = eth_call(VOTER_CONTRACT, data)

        if result and result != b'\x00' * len(result):
            print(f"    ✓ Got response ({len(result)} bytes)")

            # Try to decode as address
            if len(result) >= 32:
                addr_hex = "0x" + result[12:32].hex()
                if addr_hex != "0x" + "0" * 40:
                    print(f"      Potential pool address: {addr_hex}")

            # Try to decode as array length (first 32 bytes)
            array_length = decode_uint256(result[:32])
            if 0 < array_length < 100:  # Reasonable array length
                print(f"      Potential array length: {array_length}")
        else:
            print(f"    ✗ Function not available or returned empty")


def get_user_votes_for_pool(user_address: str, pool_address: str) -> float:
    """
    Get user's votes for a specific pool
    Note: weights(address) returns TOTAL votes for pool, not user-specific
    We need to find user-specific votes function
    """
    # Try different function signatures for user-pool votes
    functions_to_test = [
        ("votes(address,address)", [user_address, pool_address]),  # votes(user, pool)
        ("poolVote(address,address)", [user_address, pool_address]),  # poolVote(user, pool)
        ("getUserVoteForPool(address,address)", [user_address, pool_address]),
    ]

    for sig, params in functions_to_test:
        selector = keccak(sig)
        param1 = encode_address(params[0])
        param2 = encode_address(params[1])
        data = selector + param1 + param2

        result = eth_call(VOTER_CONTRACT, data)

        if result and result != b'\x00' * 32:
            votes_wei = decode_uint256(result)
            if votes_wei > 0:
                votes = votes_wei / 1e18
                return votes

    return 0.0


def batch_check_pool_votes(user_address: str, pools: List[Dict]) -> List[Tuple[Dict, float]]:
    """
    Batch-check all pools to find which ones user has voted for
    This is the fallback if no direct function exists
    """
    print(f"\n[3] Batch-checking votes for all pools...")
    print(f"  Checking {len(pools)} pools for user {user_address}...")

    # We need to find user-specific votes, not pool totals
    # Try votes(user, pool) pattern
    voted_pools = []

    for i, pool in enumerate(pools):
        pool_address = pool.get('id', '')
        if not pool_address:
            continue

        # Try to get user's votes for this pool
        votes = get_user_votes_for_pool(user_address, pool_address)

        if votes > 0:
            token0_symbol = pool.get('token0', {}).get('symbol', '?')
            token1_symbol = pool.get('token1', {}).get('symbol', '?')
            pool_name = f"{token0_symbol}/{token1_symbol}"

            print(f"    ✓ Found vote: {pool_name} ({pool_address}): {votes:,.2f} votes")
            voted_pools.append((pool, votes))

        # Progress indicator every 10 pools
        if (i + 1) % 10 == 0:
            print(f"    Checked {i + 1}/{len(pools)} pools... ({len(voted_pools)} votes found)")

    print(f"  ✓ Found {len(voted_pools)} pools with votes")
    return voted_pools


def test_vote_events(user_address: str):
    """
    Test if we can get Vote events for the user
    This requires event logs, which may not be available without archive node
    """
    print(f"\n[4] Testing Vote event logs for {user_address}...")

    # Vote event signature: Vote(address indexed voter, address indexed pool, uint256 weight)
    vote_event_sig = "Vote(address,address,uint256)"
    vote_topic = "0x" + w3.keccak(text=vote_event_sig).hex()

    print(f"  Event signature: {vote_event_sig}")
    print(f"  Event topic: {vote_topic}")

    # Try to get logs (may fail if not archive node)
    try:
        # Get recent blocks only (last 1000 blocks)
        latest_block = w3.eth.block_number
        from_block = latest_block - 1000

        # User address as indexed topic (padded to 32 bytes)
        user_topic = "0x" + encode_address(user_address)

        logs = w3.eth.get_logs({
            'address': Web3.to_checksum_address(VOTER_CONTRACT),
            'topics': [vote_topic, user_topic],
            'fromBlock': from_block,
            'toBlock': 'latest'
        })

        print(f"  ✓ Found {len(logs)} Vote events in last 1000 blocks")

        for log in logs[:5]:  # Show first 5
            # Decode pool address from topics[2] (second indexed param)
            if len(log['topics']) >= 3:
                pool_addr = "0x" + log['topics'][2].hex()[24:]  # Remove padding
                weight_hex = log['data'].hex()
                weight_wei = int(weight_hex, 16)
                weight = weight_wei / 1e18

                print(f"    Pool: {pool_addr}, Weight: {weight:,.2f}")

    except Exception as e:
        print(f"  ✗ Failed to get events (likely not an archive node): {e}")


def test_epoch_functions():
    """
    Test epoch/period related functions to understand voting periods
    """
    print("\n[5] Testing epoch/period functions...")

    functions_to_test = [
        "epoch()",
        "currentEpoch()",
        "getEpoch()",
        "getPeriod()",
        "minter()",  # Minter contract might have epoch info
    ]

    for sig in functions_to_test:
        selector = keccak(sig)
        result = eth_call(VOTER_CONTRACT, selector)

        if result and result != b'\x00' * 32:
            value = decode_uint256(result)
            print(f"  {sig:30} → {value}")
        else:
            print(f"  {sig:30} → Not available")


def main():
    if len(sys.argv) < 2:
        print("Usage: python discover_previous_votes.py <user_address>")
        print("\nExample:")
        print("  python discover_previous_votes.py 0x1234567890123456789012345678901234567890")
        sys.exit(1)

    user_address = sys.argv[1]

    # Validate address
    if not Web3.is_address(user_address):
        print(f"✗ Invalid address: {user_address}")
        sys.exit(1)

    user_address = Web3.to_checksum_address(user_address)
    print(f"User address: {user_address}\n")

    # Step 1: Fetch all pools
    pools = fetch_all_pools()

    # Step 2: Test direct pool vote functions
    test_pool_vote_function(user_address)

    # Step 3: Batch-check all pools (fallback method)
    if pools:
        voted_pools = batch_check_pool_votes(user_address, pools[:20])  # Test with first 20 pools

        if voted_pools:
            print("\n" + "=" * 80)
            print("CURRENT VOTES SUMMARY")
            print("=" * 80)
            total_votes = 0
            for pool, votes in voted_pools:
                token0_symbol = pool.get('token0', {}).get('symbol', '?')
                token1_symbol = pool.get('token1', {}).get('symbol', '?')
                pool_name = f"{token0_symbol}/{token1_symbol}"
                print(f"{pool_name:30} {votes:>12,.2f} votes")
                total_votes += votes

            print("-" * 80)
            print(f"{'TOTAL':30} {total_votes:>12,.2f} votes")

    # Step 4: Test vote events
    test_vote_events(user_address)

    # Step 5: Test epoch functions
    test_epoch_functions()

    # JavaScript implementation
    print("\n" + "=" * 80)
    print("JAVASCRIPT IMPLEMENTATION")
    print("=" * 80)
    print("""
// Add to extension/lib/vote-state-manager.js

async getUserCurrentVotes(userAddress) {
  const currentVotes = [];

  // Get all known pools
  const pools = await this.fetchAllPools();

  // Batch-check each pool for user's votes
  // Try votes(user, pool) function
  const votesSelector = await this.keccak256('votes(address,address)');

  for (const pool of pools) {
    const param1 = this.encodeAddress(userAddress);
    const param2 = this.encodeAddress(pool.id);
    const data = votesSelector + param1 + param2;

    const result = await this.ethCall(this.VOTER_CONTRACT, data);
    const votes = Number(this.decodeUint256(result)) / 1e18;

    if (votes > 0) {
      currentVotes.push({
        pool: pool,
        votes: votes,
        percentage: 0  // Calculate after getting total
      });
    }
  }

  // Calculate percentages
  const totalVotes = currentVotes.reduce((sum, v) => sum + v.votes, 0);
  currentVotes.forEach(v => {
    v.percentage = (v.votes / totalVotes) * 100;
  });

  return currentVotes;
}
""")

    print("\n✓ Discovery complete!")
    print("\nNOTE: If direct function doesn't exist, we'll need to batch-check all pools")
    print("      This is slower but reliable. We can optimize with:")
    print("      1. Only check pools user has interacted with before (track in storage)")
    print("      2. Use multicall to batch multiple checks in one RPC call")
    print("      3. Cache results and refresh periodically")


if __name__ == "__main__":
    main()
