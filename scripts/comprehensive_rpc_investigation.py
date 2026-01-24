#!/usr/bin/env python3
"""
Comprehensive investigation of all RPC/API methods to get complete pool data
This is the tenacious deep dive!
"""

import json
import sys
from web3 import Web3
from collections import defaultdict

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_PROXY = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"

def get_pool_complete_data(w3, pool_address):
    """Get ALL available data for a pool via RPC"""
    print(f"\n{'='*80}")
    print(f"COMPREHENSIVE DATA FOR POOL: {pool_address}")
    print(f"{'='*80}")
    
    data = {
        'pool_address': pool_address,
        'voter_data': {},
        'pool_contract_data': {},
        'gauge_data': {},
        'bribe_data': {},
    }
    
    # 1. Get weight from voter
    try:
        addr_clean = pool_address[2:].lower().zfill(64)
        result = w3.eth.call({
            'to': w3.to_checksum_address(VOTER_PROXY),
            'data': '0xa7cac846' + addr_clean
        })
        if result and result != b'\x00' * 32:
            weight = int(result.hex(), 16) / 1e18
            data['voter_data']['weight'] = weight
            print(f"✓ Weight: {weight:,.2f}")
    except Exception as e:
        print(f"✗ Weight error: {e}")
    
    # 2. Try to get gauge
    try:
        addr_clean = pool_address[2:].lower().zfill(64)
        result = w3.eth.call({
            'to': w3.to_checksum_address(VOTER_PROXY),
            'data': '0xcc56b2c5' + addr_clean
        })
        if result and result != b'\x00' * 32:
            gauge_addr = '0x' + result.hex()[-40:]
            if gauge_addr != '0x' + '0' * 40:
                gauge_addr = w3.to_checksum_address(gauge_addr)
                data['gauge_address'] = gauge_addr
                print(f"✓ Gauge: {gauge_addr}")
                
                # Probe gauge
                gauge_funcs = [
                    ('totalSupply()', '0x18160ddd'),
                    ('rewardRate()', '0x7b9c3b7f'),
                    ('periodFinish()', '0x0d5a0e5e'),
                ]
                
                for func_name, selector in gauge_funcs:
                    try:
                        result = w3.eth.call({
                            'to': gauge_addr,
                            'data': selector
                        })
                        if result and result != b'\x00' * 32:
                            value = int(result.hex(), 16)
                            if 'Rate' in func_name or 'Supply' in func_name:
                                value = value / 1e18
                            data['gauge_data'][func_name] = value
                            print(f"  ✓ {func_name}: {value}")
                    except:
                        pass
    except Exception as e:
        print(f"✗ Gauge error: {e}")
    
    # 3. Get pool contract data
    pool_funcs = [
        ('token0()', '0x0dfe1681'),
        ('token1()', '0xd21220a7'),
        ('fee()', '0xddca3f43'),
        ('liquidity()', '0x1a686502'),
        ('totalSupply()', '0x18160ddd'),
    ]
    
    for func_name, selector in pool_funcs:
        try:
            result = w3.eth.call({
                'to': w3.to_checksum_address(pool_address),
                'data': selector
            })
            if result and result != b'\x00' * 32:
                value = int(result.hex(), 16)
                if 'token' in func_name:
                    # These are addresses
                    addr = '0x' + result.hex()[-40:]
                    data['pool_contract_data'][func_name] = addr
                    print(f"✓ {func_name}: {addr}")
                elif 'fee' in func_name:
                    data['pool_contract_data'][func_name] = value
                    print(f"✓ {func_name}: {value} ({value/100}%)")
                else:
                    value = value / 1e18
                    data['pool_contract_data'][func_name] = value
                    print(f"✓ {func_name}: {value:,.2f}")
        except Exception as e:
            pass
    
    return data

def investigate_all_methods():
    """Investigate all possible methods"""
    print("="*80)
    print("COMPREHENSIVE RPC INVESTIGATION")
    print("="*80)
    
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("❌ Could not connect to RPC")
        return
    
    print(f"✓ Connected to {RPC_URL}\n")
    
    # Test pools
    test_pools = [
        "0x9a6142ef0766915db02066f791d969c22eba1dca",  # CL
        "0x78f5a53731564894a7e4fff827a88e5fbf9cfcb6",  # vAMM
        "0xedcfa2d80cf06fb7642e956a1e95dbc37c75995b",  # sAMM
    ]
    
    results = {}
    for pool in test_pools:
        results[pool] = get_pool_complete_data(w3, pool)
    
    # Save results
    output_file = "comprehensive_pool_data.json"
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n{'='*80}")
    print("SUMMARY")
    print(f"{'='*80}")
    print("\nWhat we CAN get via RPC:")
    print("  ✓ Pool weights (current_votes)")
    print("  ✓ Token addresses (token0, token1)")
    print("  ✓ Pool fees (swap fees)")
    print("  ✓ Pool liquidity/supply")
    print("  ⚠️  Gauge addresses (if they exist)")
    print("\nWhat we CANNOT get via RPC (yet):")
    print("  ✗ Total rewards (USD value)")
    print("  ✗ VAPR percentage")
    print("  ✗ Bribe amounts")
    print("\nConclusion:")
    print("  Rewards/VAPR likely come from:")
    print("    1. A separate API endpoint (not found yet)")
    print("    2. Client-side calculation from emission rates")
    print("    3. Events/logs (not direct RPC calls)")
    print(f"\n✓ Results saved to: {output_file}")

if __name__ == "__main__":
    investigate_all_methods()
