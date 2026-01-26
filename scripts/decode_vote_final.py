#!/usr/bin/env python3
"""
Decode vote transaction properly
"""

from web3 import Web3
import sys

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
w3 = Web3(Web3.HTTPProvider(RPC_URL))

# Get transaction hash from command line or use default
TX_HASH = sys.argv[1] if len(sys.argv) > 1 else "0xc4f963f3f8edd6f241640e151f86b4d386594e1a043dd1f9f4ffaa105010387a"

print("=" * 80)
print("VOTE TRANSACTION DECODER")
print("=" * 80)
print(f"Transaction: {TX_HASH}\n")

tx = w3.eth.get_transaction(TX_HASH)

print(f"From: {tx['from']}")
print(f"To: {tx['to']}")
print(f"Block: {tx['blockNumber']}")
print()

# Parse input
input_hex = tx['input'].hex()

# Selector (first 4 bytes = 8 hex chars)
selector = "0x" + input_hex[:8]
print(f"Function selector: {selector}")

# Check if it's a vote transaction
if selector == "0x7ac09bf7":
    print("✓ This is a vote() transaction")
else:
    print(f"✗ Unknown function (expected 0x7ac09bf7)")
    sys.exit(1)

print()

# Parameters (skip selector)
params = input_hex[8:]

def read_chunk(hex_str, index):
    """Read 32-byte chunk at index"""
    start = index * 64
    end = start + 64
    if end > len(hex_str):
        return None
    chunk = hex_str[start:end]
    return int(chunk, 16) if chunk else 0

# Read parameters for vote(uint256 tokenId, address[] poolVote, uint256[] weights)
token_id = read_chunk(params, 0)
pools_offset = read_chunk(params, 1)
weights_offset = read_chunk(params, 2)

print(f"veBLACK NFT Token ID: {token_id}")
print(f"Pools array offset: {pools_offset} bytes")
print(f"Weights array offset: {weights_offset} bytes")
print()

# Read pools array
# Offset is in bytes from start of params, convert to chunk index
pools_offset_chunks = pools_offset // 32
pool_count = read_chunk(params, pools_offset_chunks)

print(f"Number of pools: {pool_count}")
print("\nPools:")

pools = []
for i in range(pool_count):
    chunk_index = pools_offset_chunks + 1 + i
    value = read_chunk(params, chunk_index)
    # Address is in last 20 bytes of uint256
    addr_hex = hex(value)[2:].zfill(64)
    address = "0x" + addr_hex[-40:]
    address_checksum = Web3.to_checksum_address(address)
    pools.append(address_checksum)
    print(f"  [{i+1}] {address_checksum}")

# Read weights array
weights_offset_chunks = weights_offset // 32
weight_count = read_chunk(params, weights_offset_chunks)

print(f"\nNumber of weights: {weight_count}")
print("\nWeights:")

weights = []
total_weight = 0
for i in range(weight_count):
    chunk_index = weights_offset_chunks + 1 + i
    weight_wei = read_chunk(params, chunk_index)
    weight = weight_wei / 1e18
    weights.append(weight)
    total_weight += weight
    print(f"  [{i+1}] {weight:,.2f} votes ({weight_wei} wei)")

# Summary
print("\n" + "=" * 80)
print("VOTE ALLOCATION SUMMARY")
print("=" * 80)
print(f"veBLACK NFT ID: {token_id}")
print(f"Total Votes: {total_weight:,.2f}")
print(f"Pools: {pool_count}")
print()

for i in range(len(pools)):
    percentage = (weights[i] / total_weight * 100) if total_weight > 0 else 0
    print(f"Pool {i+1}: {pools[i]}")
    print(f"  Votes: {weights[i]:>12,.2f} ({percentage:>5.1f}%)")
    print()

# JavaScript encoding example
print("=" * 80)
print("JAVASCRIPT ENCODING EXAMPLE")
print("=" * 80)
print("""
// To build this same transaction in JavaScript:

const tokenId = """ + str(token_id) + """;
const pools = [""")

for pool in pools:
    print(f'  "{pool}",')

print("""];
const weights = [""")

for weight in weights:
    print(f'  "{int(weight * 1e18)}",  // {weight:,.2f} votes')

print("""];

// Encode using ethers.js:
const contract = new ethers.Contract(voterAddress, abi, signer);
const tx = await contract.vote(tokenId, pools, weights);

// Or encode manually:
const abiCoder = new ethers.AbiCoder();
const encoded = abiCoder.encode(
  ['uint256', 'address[]', 'uint256[]'],
  [tokenId, pools, weights]
);
const calldata = '0x7ac09bf7' + encoded.slice(2);
""")

print("\n✓ Decoding complete!")
