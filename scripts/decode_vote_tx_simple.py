#!/usr/bin/env python3
"""
Simple vote transaction decoder
"""

from web3 import Web3

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
w3 = Web3(Web3.HTTPProvider(RPC_URL))

# Recent vote transaction
TX_HASH = "0xc4f963f3f8edd6f241640e151f86b4d386594e1a043dd1f9f4ffaa105010387a"

print("=" * 80)
print("DECODING VOTE TRANSACTION")
print("=" * 80)

tx = w3.eth.get_transaction(TX_HASH)
input_data = tx['input'].hex()[2:]  # Remove 0x

print(f"Transaction: {TX_HASH}")
print(f"From: {tx['from']}")
print()

# Extract selector
selector = input_data[:8]
print(f"Selector: 0x{selector}")

# Extract parameters (remove selector)
params = input_data[8:]

def read_uint256(data, offset):
    """Read uint256 at byte offset"""
    start = offset * 2  # Convert to hex chars
    value_hex = data[start:start+64]
    return int(value_hex, 16)

def read_address(data, offset):
    """Read address at byte offset"""
    start = offset * 2
    addr_hex = data[start:start+64]
    # Address is in last 20 bytes (40 hex chars)
    return "0x" + addr_hex[-40:]

# Read parameters
# vote(uint256 tokenId, address[] poolVote, uint256[] weights)

token_id = read_uint256(params, 0)
print(f"\nToken ID (veBLACK NFT): {token_id}")

pool_offset = read_uint256(params, 32)
weights_offset = read_uint256(params, 64)
print(f"\nArray offsets: pools at {pool_offset}, weights at {weights_offset}")

# Read pool array
pool_length = read_uint256(params, pool_offset)
print(f"\nNumber of pools: {pool_length}")

pools = []
print("\nPools:")
for i in range(pool_length):
    addr = read_address(params, pool_offset + 32 + (i * 32))
    pools.append(addr)
    print(f"  {i+1}. {addr}")

# Read weights array
weights_length = read_uint256(params, weights_offset)
print(f"\nNumber of weights: {weights_length}")

weights = []
total_weight = 0
print("\nWeights:")
for i in range(weights_length):
    weight_wei = read_uint256(params, weights_offset + 32 + (i * 32))
    weight = weight_wei / 1e18
    weights.append(weight)
    total_weight += weight
    print(f"  {i+1}. {weight:,.2f} votes")

# Summary
print("\n" + "=" * 80)
print("VOTE ALLOCATION")
print("=" * 80)
print(f"veBLACK NFT ID: {token_id}")
print(f"Total Votes: {total_weight:,.2f}")
print()

for i in range(len(pools)):
    percentage = (weights[i] / total_weight * 100) if total_weight > 0 else 0
    print(f"{pools[i]}")
    print(f"  {weights[i]:>10,.2f} votes ({percentage:>5.1f}%)")
    print()
