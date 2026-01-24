#!/usr/bin/env python3
"""
Classify identified pools as CL, vAMM, or sAMM
Uses multiple methods:
1. Check against known CL pools API
2. Check contract code/interface
3. Check factory contracts
"""

import json
import sys
import requests
from web3 import Web3
from typing import Dict, List, Set

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
CL_POOLS_API = "https://resources.blackhole.xyz/cl-pools-list/cl-pools.json"

# Known pools
KNOWN_VAMM = {
    "0x78f5a53731564894a7e4fff827a88e5fbf9cfcb6": "vAMM-GCROC/WAVAX",
}

KNOWN_SAMM = {
    "0xedcfa2d80cf06fb7642e956a1e95dbc37c75995b": "sAMM-CROC/WAVAX",
}

def get_cl_pools_from_api() -> Set[str]:
    """Get all CL pool addresses from the API"""
    try:
        response = requests.get(CL_POOLS_API, timeout=10)
        if response.status_code == 200:
            data = response.json()
            pools = data.get('pools', data.get('data', {}).get('pools', []))
            if isinstance(pools, list):
                cl_addresses = set()
                for pool in pools:
                    pool_id = pool.get('id', '')
                    if pool_id:
                        cl_addresses.add(pool_id.lower())
                return cl_addresses
    except Exception as e:
        print(f"Warning: Could not fetch CL pools API: {e}")
    return set()

def check_contract_interface(w3: Web3, address: str) -> Dict[str, bool]:
    """
    Check contract code for indicators of pool type
    Returns dict with flags for different pool types
    """
    result = {
        'has_cl_indicators': False,
        'has_vamm_indicators': False,
        'has_samm_indicators': False,
    }
    
    try:
        code = w3.eth.get_code(w3.to_checksum_address(address))
        code_hex = code.hex()
        
        # CL pool indicators (Uniswap V3 / Algebra style)
        cl_selectors = [
            '0x99fbab88',  # tickSpacing
            '0x128acb08',  # swap
            '0x0dfe1681',  # token0
            '0xd21220a7',  # token1
            '0x3850c7bd',  # slot0
        ]
        if any(sel in code_hex for sel in cl_selectors):
            result['has_cl_indicators'] = True
        
        # vAMM indicators (virtual pool functions)
        vamm_selectors = [
            '0x8a7c195f',  # crossTo (virtual pool)
            '0x4f8b3a04',  # virtualPool
        ]
        if any(sel in code_hex for sel in vamm_selectors):
            result['has_vamm_indicators'] = True
        
        # sAMM indicators (stable pool functions)
        # Stable pools often have specific math functions
        samm_keywords = [
            'stable', 'amplification', 'get_d',  # Curve-style stable pools
        ]
        code_lower = code_hex.lower()
        # This is less reliable, but we can check
        # Stable pools might have different function signatures
        
    except Exception as e:
        pass
    
    return result

def classify_pools(pools_file: str, output_file: str = None):
    """Classify pools by type"""
    print("="*80)
    print("CLASSIFYING POOL TYPES")
    print("="*80)
    
    # Load identified pools
    with open(pools_file, 'r') as f:
        data = json.load(f)
    
    pools = data.get('pools', [])
    print(f"\nLoaded {len(pools)} pools to classify\n")
    
    # Get CL pools from API
    print("Fetching CL pools from API...")
    cl_addresses = get_cl_pools_from_api()
    print(f"✓ Found {len(cl_addresses)} CL pools in API\n")
    
    # Initialize Web3
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("❌ Could not connect to RPC")
        return
    
    # Classify each pool
    classified = {
        'CL': [],
        'vAMM': [],
        'sAMM': [],
        'Unknown': []
    }
    
    print("Classifying pools...\n")
    
    for i, pool in enumerate(pools):
        addr = pool['address']
        addr_lower = addr.lower()
        
        if i % 20 == 0 and i > 0:
            print(f"  Progress: {i}/{len(pools)} classified...")
        
        pool_type = None
        classification_method = None
        
        # Method 1: Check known pools
        if addr_lower in KNOWN_VAMM:
            pool_type = 'vAMM'
            classification_method = 'known_pool'
        elif addr_lower in KNOWN_SAMM:
            pool_type = 'sAMM'
            classification_method = 'known_pool'
        # Method 2: Check CL API
        elif addr_lower in cl_addresses:
            pool_type = 'CL'
            classification_method = 'cl_api'
        # Method 3: Check contract interface
        else:
            interface = check_contract_interface(w3, addr)
            if interface['has_cl_indicators']:
                pool_type = 'CL'
                classification_method = 'contract_interface'
            elif interface['has_vamm_indicators']:
                pool_type = 'vAMM'
                classification_method = 'contract_interface'
            elif interface['has_samm_indicators']:
                pool_type = 'sAMM'
                classification_method = 'contract_interface'
            else:
                pool_type = 'Unknown'
                classification_method = 'unknown'
        
        pool_info = {
            'address': addr,
            'weight': pool.get('weight', 0),
            'type': pool_type,
            'classification_method': classification_method
        }
        
        classified[pool_type].append(pool_info)
    
    # Display results
    print("\n" + "="*80)
    print("CLASSIFICATION RESULTS")
    print("="*80)
    
    for pool_type in ['CL', 'vAMM', 'sAMM', 'Unknown']:
        pools_of_type = classified[pool_type]
        print(f"\n{pool_type} Pools: {len(pools_of_type)}")
        
        if pools_of_type:
            # Sort by weight
            pools_sorted = sorted(pools_of_type, key=lambda x: -x['weight'])
            
            print("  Top pools:")
            for pool in pools_sorted[:10]:
                method = pool['classification_method']
                print(f"    {pool['address']} - Weight: {pool['weight']:,.2f} (via {method})")
            
            if len(pools_sorted) > 10:
                print(f"    ... and {len(pools_sorted) - 10} more")
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    print(f"\nTotal pools: {len(pools)}")
    print(f"  CL: {len(classified['CL'])}")
    print(f"  vAMM: {len(classified['vAMM'])}")
    print(f"  sAMM: {len(classified['sAMM'])}")
    print(f"  Unknown: {len(classified['Unknown'])}")
    
    # Save results
    results = {
        'total_pools': len(pools),
        'classification': {
            'CL': len(classified['CL']),
            'vAMM': len(classified['vAMM']),
            'sAMM': len(classified['sAMM']),
            'Unknown': len(classified['Unknown'])
        },
        'pools_by_type': classified
    }
    
    if output_file:
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\n✓ Results saved to: {output_file}")
    
    # Next steps
    print("\n" + "="*80)
    print("NEXT STEPS")
    print("="*80)
    
    if classified['vAMM'] or classified['sAMM']:
        print("\n✓ Found vAMM/sAMM pools!")
        print("  - We can now query these pools directly")
        print("  - We can fetch their metadata (tokens, fees, etc.)")
        print("  - We can integrate them into the pool data provider")
    
    if classified['Unknown']:
        print(f"\n⚠ {len(classified['Unknown'])} pools could not be classified")
        print("  - May need to check factory contracts")
        print("  - Or cross-reference with DOM extraction")
        print("  - Or check pool creation events")
    
    return results

if __name__ == "__main__":
    pools_file = "identified_pools.json"
    if len(sys.argv) > 1:
        pools_file = sys.argv[1]
    
    output_file = "classified_pools.json"
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    
    try:
        classify_pools(pools_file, output_file)
    except FileNotFoundError:
        print(f"Error: File not found: {pools_file}")
        print("Run identify_pools_from_addresses.py first")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
