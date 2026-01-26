#!/usr/bin/env python3
"""
Decode a vote transaction to understand the data format
"""

import requests
from web3 import Web3
from eth_abi import decode

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
w3 = Web3(Web3.HTTPProvider(RPC_URL))

# Recent vote transaction
TX_HASH = "0xc4f963f3f8edd6f241640e151f86b4d386594e1a043dd1f9f4ffaa105010387a"

print("=" * 80)
print("DECODING VOTE TRANSACTION")
print("=" * 80)
print(f"Transaction: {TX_HASH}\n")

# Get transaction
tx = w3.eth.get_transaction(TX_HASH)

print(f"From: {tx['from']}")
print(f"To: {tx['to']}")
print(f"Input length: {len(tx['input'])} bytes")
print()

# Parse input data
input_hex = tx['input'].hex()
print("Input data:")
print(f"Selector: {input_hex[:10]}")

# Remove 0x and selector (8 chars)
data = input_hex[10:]

print(f"\nData (without selector): {len(data)} chars ({len(data)//2} bytes)")
print()

# Decode parameters using Web3 ABI decoder
# Remove selector (first 4 bytes = 8 hex chars)
data_bytes = bytes.fromhex(data)

# Decode using ABI
# vote(uint256 tokenId, address[] poolVote, uint256[] weights)
try:
    decoded = decode(['uint256', 'address[]', 'uint256[]'], data_bytes)

    token_id = decoded[0]
    pools = decoded[1]
    weights_wei = decoded[2]

    print(f"Token ID: {token_id}")
    print(f"\nNumber of pools: {len(pools)}")
    print(f"\nPool addresses:")
    for i, addr in enumerate(pools):
        print(f"  {i+1}. {addr}")

    print(f"\nWeights:")
    weights = []
    total_weight = 0
    for i, weight_wei in enumerate(weights_wei):
        weight = weight_wei / 1e18
        weights.append(weight)
        total_weight += weight
        print(f"  {i+1}. {weight:,.2f} votes (wei: {weight_wei})")

except Exception as e:
    print(f"Error decoding: {e}")
    print("\nFalling back to manual decoding...")

    # Manual decode
    token_id_hex = data[:64]
    token_id = int(token_id_hex, 16)
    print(f"Token ID: {token_id}")

    # Just show the raw data for analysis
    print(f"\nRaw data (first 200 chars): {data[:200]}")
    pools = []
    weights = []
    total_weight = 0

print(f"\nTotal votes: {total_weight:,.2f}")

# Summary
print("\n" + "=" * 80)
print("SUMMARY")
print("=" * 80)
print(f"Token ID: {token_id}")
print(f"Pools: {pool_length}")
print(f"Total Votes: {total_weight:,.2f}")
print()

for i in range(pool_length):
    percentage = (weights[i] / total_weight * 100) if total_weight > 0 else 0
    print(f"{pools[i]}: {weights[i]:>10,.2f} votes ({percentage:>5.1f}%)")
