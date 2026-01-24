#!/usr/bin/env python3
"""
Query pool contracts directly to get metadata (tokens, fees, etc.)
This can help identify pool types and provide data for the pool data provider
"""

import json
import sys
from web3 import Web3
from typing import Dict, List, Optional

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"

# Common pool function selectors
POOL_SELECTORS = {
    "token0()": "0x0dfe1681",
    "token1()": "0xd21220a7",
    "fee()": "0xddca3f43",  # Uniswap V3 / Algebra
    "fee()": "0x22afcccb",  # Alternative
    "swapFee()": "0x3ddac953",  # Some pools
    "getReserves()": "0x0902f1ac",  # Uniswap V2 style
    "slot0()": "0x3850c7bd",  # Uniswap V3 / Algebra (returns tick, sqrtPriceX96, etc.)
}

def get_token0(w3: Web3, pool_address: str) -> Optional[str]:
    """Get token0 address from pool"""
    try:
        result = w3.eth.call({
            'to': w3.to_checksum_address(pool_address),
            'data': POOL_SELECTORS["token0()"]
        })
        if result and result != b'\x00' * 32:
            addr_hex = result.hex()[-40:]
            return '0x' + addr_hex
    except:
        pass
    return None

def get_token1(w3: Web3, pool_address: str) -> Optional[str]:
    """Get token1 address from pool"""
    try:
        result = w3.eth.call({
            'to': w3.to_checksum_address(pool_address),
            'data': POOL_SELECTORS["token1()"]
        })
        if result and result != b'\x00' * 32:
            addr_hex = result.hex()[-40:]
            return '0x' + addr_hex
    except:
        pass
    return None

def get_fee(w3: Web3, pool_address: str) -> Optional[int]:
    """Get fee from pool (tries multiple selectors)"""
    for selector in ["0xddca3f43", "0x22afcccb", "0x3ddac953"]:
        try:
            result = w3.eth.call({
                'to': w3.to_checksum_address(pool_address),
                'data': selector
            })
            if result and result != b'\x00' * 32:
                fee = int(result.hex(), 16)
                return fee
        except:
            continue
    return None

def get_pool_metadata(w3: Web3, pool_address: str) -> Dict:
    """Get all available metadata for a pool"""
    metadata = {
        'address': pool_address,
        'token0': None,
        'token1': None,
        'fee': None,
        'has_cl_interface': False,
        'has_v2_interface': False,
    }
    
    # Get tokens
    token0 = get_token0(w3, pool_address)
    token1 = get_token1(w3, pool_address)
    
    if token0:
        metadata['token0'] = token0
    if token1:
        metadata['token1'] = token1
    
    # Get fee
    fee = get_fee(w3, pool_address)
    if fee:
        metadata['fee'] = fee
        # CL pools typically have fees like 100, 500, 3000, 10000 (in basis points)
        if fee in [100, 500, 3000, 10000]:
            metadata['has_cl_interface'] = True
    
    # Check for CL interface (slot0)
    try:
        result = w3.eth.call({
            'to': w3.to_checksum_address(pool_address),
            'data': POOL_SELECTORS["slot0()"]
        })
        if result and result != b'\x00' * 32:
            metadata['has_cl_interface'] = True
    except:
        pass
    
    # Check for V2 interface (getReserves)
    try:
        result = w3.eth.call({
            'to': w3.to_checksum_address(pool_address),
            'data': POOL_SELECTORS["getReserves()"]
        })
        if result and result != b'\x00' * 32:
            metadata['has_v2_interface'] = True
    except:
        pass
    
    return metadata

def query_pools_metadata(pools_file: str, output_file: str = None, limit: int = None):
    """Query metadata for pools"""
    print("="*80)
    print("QUERYING POOL METADATA")
    print("="*80)
    
    # Load pools
    with open(pools_file, 'r') as f:
        data = json.load(f)
    
    pools = data.get('pools_by_type', {}).get('Unknown', [])
    if not pools:
        # Try alternative structure
        pools = data.get('pools', [])
    
    if limit:
        pools = pools[:limit]
    
    print(f"\nQuerying metadata for {len(pools)} pools\n")
    
    # Initialize Web3
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("❌ Could not connect to RPC")
        return
    
    print(f"✓ Connected to {RPC_URL}\n")
    
    # Query metadata
    results = []
    for i, pool in enumerate(pools):
        addr = pool.get('address', pool.get('address', ''))
        
        if i % 10 == 0 and i > 0:
            print(f"  Progress: {i}/{len(pools)}...")
        
        metadata = get_pool_metadata(w3, addr)
        metadata['weight'] = pool.get('weight', 0)
        results.append(metadata)
    
    # Analyze results
    print("\n" + "="*80)
    print("METADATA ANALYSIS")
    print("="*80)
    
    with_tokens = [p for p in results if p['token0'] and p['token1']]
    with_fees = [p for p in results if p['fee']]
    cl_likely = [p for p in results if p['has_cl_interface']]
    v2_likely = [p for p in results if p['has_v2_interface']]
    
    print(f"\nPools with token0/token1: {len(with_tokens)}")
    print(f"Pools with fee: {len(with_fees)}")
    print(f"Pools with CL interface (slot0): {len(cl_likely)}")
    print(f"Pools with V2 interface (getReserves): {len(v2_likely)}")
    
    # Show samples
    if with_tokens:
        print("\nSample pools with metadata:")
        for pool in with_tokens[:10]:
            fee_str = f", fee: {pool['fee']}" if pool['fee'] else ""
            cl_str = " (CL-like)" if pool['has_cl_interface'] else ""
            v2_str = " (V2-like)" if pool['has_v2_interface'] else ""
            print(f"  {pool['address']}")
            print(f"    token0: {pool['token0']}, token1: {pool['token1']}{fee_str}{cl_str}{v2_str}")
    
    # Save results
    if output_file:
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\n✓ Results saved to: {output_file}")
    
    return results

if __name__ == "__main__":
    pools_file = "classified_pools.json"
    if len(sys.argv) > 1:
        pools_file = sys.argv[1]
    
    output_file = "pool_metadata.json"
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    
    # Limit to first 50 unknown pools for testing
    limit = 50 if len(sys.argv) < 4 else int(sys.argv[3])
    
    try:
        query_pools_metadata(pools_file, output_file, limit)
    except FileNotFoundError:
        print(f"Error: File not found: {pools_file}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
