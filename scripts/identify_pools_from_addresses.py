#!/usr/bin/env python3
"""
Take extracted contract addresses and identify which are pools
by querying the voter contract for weights
"""

import json
import sys
from web3 import Web3
from typing import Dict, List

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_PROXY = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"
WEIGHTS_SELECTOR = "0xa7cac846"

def get_pool_weight(w3: Web3, voter_address: str, pool_address: str) -> tuple[bool, float]:
    """Check if address has a weight in voter contract (indicates it's a pool)"""
    try:
        addr_clean = pool_address[2:].lower().zfill(64)
        data = WEIGHTS_SELECTOR + addr_clean
        
        result = w3.eth.call({
            'to': w3.to_checksum_address(voter_address),
            'data': data
        })
        
        if result and result != b'\x00' * 32:
            weight = int(result.hex(), 16)
            weight_formatted = weight / 1e18
            return True, weight_formatted
    except:
        pass
    return False, 0.0

def identify_pools_from_addresses(addresses_file: str, output_file: str = None):
    """Load extracted addresses and check which are pools"""
    print("="*80)
    print("IDENTIFYING POOLS FROM EXTRACTED ADDRESSES")
    print("="*80)
    
    # Load extracted addresses
    with open(addresses_file, 'r') as f:
        data = json.load(f)
    
    addresses = data.get('addresses', [])
    print(f"\nLoaded {len(addresses)} addresses to check\n")
    
    # Initialize Web3
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("❌ Could not connect to RPC")
        return
    
    print(f"✓ Connected to {RPC_URL}\n")
    print("Checking which addresses are pools (have weights in voter contract)...\n")
    
    pools = []
    not_pools = []
    
    # Process in batches
    batch_size = 50
    for i, addr_info in enumerate(addresses):
        addr = addr_info['address']
        
        if i % batch_size == 0 and i > 0:
            print(f"  Progress: {i}/{len(addresses)} checked, {len(pools)} pools found...")
        
        is_pool, weight = get_pool_weight(w3, VOTER_PROXY, addr)
        
        if is_pool:
            pools.append({
                'address': addr,
                'weight': weight,
                'occurrences': addr_info.get('occurrences', 0)
            })
        else:
            not_pools.append(addr)
    
    print(f"\n✓ Checked {len(addresses)} addresses")
    print(f"  Found {len(pools)} pools")
    print(f"  {len(not_pools)} are not pools\n")
    
    # Sort pools by weight
    pools_sorted = sorted(pools, key=lambda x: -x['weight'])
    
    # Display results
    print("="*80)
    print("IDENTIFIED POOLS")
    print("="*80)
    print(f"\nTotal pools found: {len(pools_sorted)}\n")
    
    print("Top pools by weight:")
    for i, pool in enumerate(pools_sorted[:30]):
        print(f"  {i+1:3d}. {pool['address']} - Weight: {pool['weight']:,.2f} (appears {pool['occurrences']}x)")
    
    # Check for known pools
    known_pools = {
        "0x9a6142ef0766915db02066f791d969c22eba1dca": "CL200-WAVAX/BLACK",
        "0x5e128ebc09c918ddae3ca1668d4ee9527dc00d78": "CL200-WETH.e/WAVAX",
        "0xa02ec3ba8d17887567672b2cdcaf525534636ea0": "CL1-WAVAX/USDC",
        "0x78f5a53731564894a7e4fff827a88e5fbf9cfcb6": "vAMM-GCROC/WAVAX",
        "0xedcfa2d80cf06fb7642e956a1e95dbc37c75995b": "sAMM-CROC/WAVAX",
    }
    
    print("\n" + "="*80)
    print("KNOWN POOLS VERIFICATION")
    print("="*80)
    
    found_known = []
    for pool in pools_sorted:
        addr_lower = pool['address'].lower()
        if addr_lower in known_pools:
            found_known.append((pool['address'], known_pools[addr_lower], pool['weight']))
    
    if found_known:
        print(f"\n✓ Found {len(found_known)} known pools:")
        for addr, name, weight in found_known:
            print(f"  {addr} - {name} (weight: {weight:,.2f})")
    
    # Save results
    results = {
        "total_addresses_checked": len(addresses),
        "pools_found": len(pools_sorted),
        "pools": pools_sorted,
        "known_pools_verified": [
            {"address": addr, "name": name, "weight": weight}
            for addr, name, weight in found_known
        ]
    }
    
    if output_file:
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\n✓ Results saved to: {output_file}")
    
    return results

if __name__ == "__main__":
    addresses_file = "extracted_contracts.json"
    if len(sys.argv) > 1:
        addresses_file = sys.argv[1]
    
    output_file = "identified_pools.json"
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    
    try:
        identify_pools_from_addresses(addresses_file, output_file)
    except FileNotFoundError:
        print(f"Error: File not found: {addresses_file}")
        print("Run extract_contracts_from_multicalls.py first")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
