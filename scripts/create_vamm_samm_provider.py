#!/usr/bin/env python3
"""
Create a JSON file with vAMM/sAMM pool data that can be used by the pool data provider
Uses the discovered pools from our analysis
"""

import json
import sys
from web3 import Web3
from typing import Dict, List

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_PROXY = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"

# Token address to symbol mapping (common tokens)
COMMON_TOKENS = {
    "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7": "WAVAX",
    "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e": "USDC",
    "0xcd94a87696fac69edae3a70fe5725307ae1c43f6": "USDC.e",
    "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab": "WETH.e",
    "0x152b9d0fdc40c096757f570a51e494bd4b943e50": "WBTC.e",
}

def get_token_symbol(w3: Web3, token_address: str) -> str:
    """Get token symbol (simplified - just checks common tokens)"""
    addr_lower = token_address.lower()
    return COMMON_TOKENS.get(addr_lower, f"Token_{token_address[:8]}")

def create_vamm_samm_pool_list(pools_file: str, metadata_file: str, output_file: str):
    """Create a pool list file for vAMM/sAMM pools"""
    print("="*80)
    print("CREATING vAMM/sAMM POOL LIST")
    print("="*80)
    
    # Load pools
    with open(pools_file, 'r') as f:
        pools_data = json.load(f)
    
    # Load metadata
    with open(metadata_file, 'r') as f:
        metadata_list = json.load(f)
    
    # Create address -> metadata map
    metadata_map = {m['address'].lower(): m for m in metadata_list}
    
    # Get unknown pools (likely vAMM/sAMM)
    unknown_pools = pools_data.get('pools_by_type', {}).get('Unknown', [])
    vamm_pools = pools_data.get('pools_by_type', {}).get('vAMM', [])
    samm_pools = pools_data.get('pools_by_type', {}).get('sAMM', [])
    
    all_vamm_samm = vamm_pools + samm_pools + unknown_pools
    
    print(f"\nProcessing {len(all_vamm_samm)} vAMM/sAMM pools\n")
    
    # Initialize Web3 for token lookups if needed
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    
    # Create pool list
    pool_list = []
    
    for pool in all_vamm_samm:
        addr = pool['address']
        addr_lower = addr.lower()
        
        # Get metadata
        meta = metadata_map.get(addr_lower, {})
        
        token0 = meta.get('token0', '')
        token1 = meta.get('token1', '')
        
        # Determine pool type
        pool_type = pool.get('type', 'Unknown')
        if pool_type == 'Unknown':
            # Assume vAMM if we can't tell (most are vAMM based on MHTML)
            pool_type = 'vAMM'
        
        # Create pool entry
        pool_entry = {
            'id': addr,
            'type': pool_type,
            'weight': pool.get('weight', 0),
            'token0': {
                'address': token0,
                'symbol': get_token_symbol(w3, token0) if token0 else 'Unknown'
            },
            'token1': {
                'address': token1,
                'symbol': get_token_symbol(w3, token1) if token1 else 'Unknown'
            }
        }
        
        pool_list.append(pool_entry)
    
    # Save
    output_data = {
        'pools': pool_list,
        'total': len(pool_list),
        'vamm_count': len([p for p in pool_list if p['type'] == 'vAMM']),
        'samm_count': len([p for p in pool_list if p['type'] == 'sAMM']),
        'source': 'rpc_extraction',
        'note': 'Pools discovered via RPC multicall analysis and voter contract weights'
    }
    
    with open(output_file, 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print(f"✓ Created pool list with {len(pool_list)} pools")
    print(f"  vAMM: {output_data['vamm_count']}")
    print(f"  sAMM: {output_data['samm_count']}")
    print(f"  Saved to: {output_file}")
    
    return output_data

if __name__ == "__main__":
    pools_file = "classified_pools.json"
    metadata_file = "pool_metadata_all.json"
    output_file = "vamm_samm_pools.json"
    
    if len(sys.argv) > 1:
        pools_file = sys.argv[1]
    if len(sys.argv) > 2:
        metadata_file = sys.argv[2]
    if len(sys.argv) > 3:
        output_file = sys.argv[3]
    
    try:
        create_vamm_samm_pool_list(pools_file, metadata_file, output_file)
    except FileNotFoundError as e:
        print(f"Error: File not found: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
