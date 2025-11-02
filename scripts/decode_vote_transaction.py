#!/usr/bin/env python3
"""
Decode vote() transaction to extract pools and weights

This script decodes the actual vote() transaction call to understand
how pools and weights are encoded.
"""

import requests
import sys

SNOWTRACE_API = "https://api.snowtrace.io/api"
API_KEY = "YourApiKeyToken"


def decode_vote_transaction(tx_hash: str):
    """Decode a vote() transaction"""
    url = f"{SNOWTRACE_API}?module=proxy&action=eth_getTransactionByHash&txhash={tx_hash}&apikey={API_KEY}"
    response = requests.get(url, timeout=10)
    tx = response.json().get('result', {})
    
    if not tx:
        print(f"Transaction {tx_hash} not found")
        return
    
    input_data = tx.get('input', '')
    func_sig = input_data[:10]
    
    print("="*70)
    print(f"Decoding vote() Transaction: {tx_hash}")
    print("="*70)
    print(f"To: {tx.get('to')}")
    print(f"Function: vote(uint256,address[],uint256[])")
    print(f"Selector: {func_sig}")
    print(f"Input Length: {len(input_data)} hex chars")
    print()
    
    # Decode parameters
    # Format: selector + tokenId + offset_pools + offset_weights + pool_data + weight_data
    
    token_id_hex = input_data[10:74]
    token_id = int(token_id_hex, 16)
    
    offset_pools_hex = input_data[74:138]
    offset_pools = int(offset_pools_hex, 16)
    
    offset_weights_hex = input_data[138:202]
    offset_weights = int(offset_weights_hex, 16)
    
    print(f"Token ID: {token_id} (0x{token_id:x})")
    print(f"Offset to pools: {offset_pools} bytes")
    print(f"Offset to weights: {offset_weights} bytes")
    print()
    
    # Calculate array positions (offsets are in bytes, input is hex so multiply by 2)
    pools_start = 10 + (offset_pools * 2)
    weights_start = 10 + (offset_weights * 2)
    
    print(f"Pools array at hex position: {pools_start}")
    print(f"Weights array at hex position: {weights_start}")
    print()
    
    # Read pool count and addresses
    if len(input_data) >= pools_start + 64:
        pool_count_hex = input_data[pools_start:pools_start+64]
        pool_count = int(pool_count_hex, 16)
        print(f"Pool Count: {pool_count}")
        
        pools = []
        for i in range(pool_count):
            pool_pos = pools_start + 64 + (i * 64)
            if len(input_data) >= pool_pos + 64:
                pool_addr_hex = input_data[pool_pos:pool_pos+64]
                # Address is in last 40 chars (skip padding)
                pool_addr = '0x' + pool_addr_hex[-40:].lower()
                pools.append(pool_addr)
        
        print(f"\nPool Addresses ({len(pools)}):")
        for i, addr in enumerate(pools, 1):
            print(f"  {i}. {addr}")
    else:
        print("? Input data too short to decode pools")
        return
    
    # Read weight count and values
    if len(input_data) >= weights_start + 64:
        weight_count_hex = input_data[weights_start:weights_start+64]
        weight_count = int(weight_count_hex, 16)
        print(f"\nWeight Count: {weight_count}")
        
        if weight_count != pool_count:
            print(f"? WARNING: Weight count ({weight_count}) != pool count ({pool_count})")
        
        weights = []
        for i in range(weight_count):
            weight_pos = weights_start + 64 + (i * 64)
            if len(input_data) >= weight_pos + 64:
                weight_hex = input_data[weight_pos:weight_pos+64]
                weight = int(weight_hex, 16)
                weights.append(weight)
        
        print(f"\nWeights ({len(weights)}):")
        total = sum(weights)
        for i, (pool, weight) in enumerate(zip(pools, weights), 1):
            pct = (weight / total * 100) if total > 0 else 0
            weight_formatted = weight / 1e18 if weight > 1e15 else weight
            print(f"  Pool {i} ({pool[:20]}...): {weight:,} ({pct:.2f}%) [raw: {weight_formatted}]")
        
        print(f"\nTotal Weight: {total:,}")
        print(f"Normalized: {total / 1e18 if total > 1e15 else total}")
    else:
        print("? Input data too short to decode weights")
    
    return {
        'token_id': token_id,
        'pools': pools,
        'weights': weights
    }


if __name__ == "__main__":
    if len(sys.argv) > 1:
        tx_hash = sys.argv[1]
    else:
        # Default to known vote transaction
        tx_hash = "0x4d7488026056bf83b3a0a2cd292b2d009708be76c47681630dfdf88f29cf7ac8"
    
    decode_vote_transaction(tx_hash)
