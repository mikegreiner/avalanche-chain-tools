#!/usr/bin/env python3
"""
Create a working RPC-based pool data provider
Uses what we CAN get via RPC and provides a structure for rewards when found
"""

import json
import sys
from web3 import Web3
from typing import Dict, List

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_PROXY = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"

# Load discovered pools
def load_discovered_pools():
    """Load all discovered pools"""
    pools = []
    
    # Load from classified pools
    try:
        with open('classified_pools.json', 'r') as f:
            data = json.load(f)
            for pool_type, pool_list in data.get('pools_by_type', {}).items():
                for pool in pool_list:
                    pools.append({
                        'address': pool['address'],
                        'type': pool.get('type', pool_type),
                        'weight': pool.get('weight', 0)
                    })
    except:
        pass
    
    return pools

def get_pool_data_via_rpc(w3, pool_address):
    """Get all available pool data via RPC"""
    data = {
        'address': pool_address,
        'weight': None,
        'token0': None,
        'token1': None,
        'fee': None,
        'liquidity': None,
        'totalSupply': None,
    }
    
    # Get weight
    try:
        addr_clean = pool_address[2:].lower().zfill(64)
        result = w3.eth.call({
            'to': w3.to_checksum_address(VOTER_PROXY),
            'data': '0xa7cac846' + addr_clean
        })
        if result and result != b'\x00' * 32:
            data['weight'] = int(result.hex(), 16) / 1e18
    except:
        pass
    
    # Get pool metadata
    pool_checksum = w3.to_checksum_address(pool_address)
    
    # token0
    try:
        result = w3.eth.call({'to': pool_checksum, 'data': '0x0dfe1681'})
        if result and result != b'\x00' * 32:
            data['token0'] = '0x' + result.hex()[-40:]
    except:
        pass
    
    # token1
    try:
        result = w3.eth.call({'to': pool_checksum, 'data': '0xd21220a7'})
        if result and result != b'\x00' * 32:
            data['token1'] = '0x' + result.hex()[-40:]
    except:
        pass
    
    # fee (for CL pools)
    try:
        result = w3.eth.call({'to': pool_checksum, 'data': '0xddca3f43'})
        if result and result != b'\x00' * 32:
            fee = int(result.hex(), 16)
            if 0 < fee < 100000:
                data['fee'] = fee
    except:
        pass
    
    # liquidity/totalSupply
    for selector, key in [('0x1a686502', 'liquidity'), ('0x18160ddd', 'totalSupply')]:
        try:
            result = w3.eth.call({'to': pool_checksum, 'data': selector})
            if result and result != b'\x00' * 32:
                value = int(result.hex(), 16) / 1e18
                data[key] = value
        except:
            pass
    
    return data

def create_rpc_provider():
    """Create RPC-based pool data"""
    print("="*80)
    print("CREATING RPC-BASED POOL DATA PROVIDER")
    print("="*80)
    
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("❌ Could not connect to RPC")
        return
    
    print(f"✓ Connected to {RPC_URL}\n")
    
    # Load discovered pools
    pools = load_discovered_pools()
    print(f"Loaded {len(pools)} discovered pools\n")
    
    # Get RPC data for all pools
    print("Fetching RPC data for all pools...\n")
    pool_data = []
    
    for i, pool in enumerate(pools):
        if i % 20 == 0 and i > 0:
            print(f"  Progress: {i}/{len(pools)}...")
        
        data = get_pool_data_via_rpc(w3, pool['address'])
        data['type'] = pool.get('type', 'Unknown')
        pool_data.append(data)
    
    # Save
    output_file = "rpc_pool_data.json"
    with open(output_file, 'w') as f:
        json.dump(pool_data, f, indent=2)
    
    print(f"\n✓ Saved RPC data for {len(pool_data)} pools to: {output_file}")
    
    # Summary
    print("\n" + "="*80)
    print("DATA AVAILABILITY")
    print("="*80)
    
    with_weights = len([p for p in pool_data if p['weight']])
    with_tokens = len([p for p in pool_data if p['token0'] and p['token1']])
    with_fees = len([p for p in pool_data if p['fee']])
    
    print(f"\nPools with weights: {with_weights}/{len(pool_data)}")
    print(f"Pools with tokens: {with_tokens}/{len(pool_data)}")
    print(f"Pools with fees: {with_fees}/{len(pool_data)}")
    
    print("\n" + "="*80)
    print("WHAT WE CAN PROVIDE VIA RPC")
    print("="*80)
    print("\n✅ Available:")
    print("  - Pool addresses")
    print("  - Current votes (weights)")
    print("  - Token addresses (token0, token1)")
    print("  - Pool fees (for CL pools)")
    print("  - Pool liquidity/supply")
    print("\n❌ Not available (yet):")
    print("  - Total rewards (USD)")
    print("  - VAPR percentage")
    print("  - Bribe amounts")
    print("\n💡 Next steps:")
    print("  1. Identify which function returns rewards")
    print("  2. Decode multicall responses properly")
    print("  3. Match functions to return values")
    print("  4. Calculate VAPR from rewards + time")

if __name__ == "__main__":
    create_rpc_provider()
