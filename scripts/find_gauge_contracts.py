#!/usr/bin/env python3
"""
Find gauge contracts and how rewards/VAPR are fetched
Gauges typically have functions like:
- claimable() - claimable rewards
- earned() - earned rewards
- rewardRate() - emission rate
- totalSupply() - total staked
"""

import json
import sys
from web3 import Web3

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_PROXY = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"

# Gauge function selectors
GAUGE_SELECTORS = {
    "gauges(address)": "0x419074b2",
    "getGauge(address)": "0xcc56b2c5",
    "claimable()": "0x379607f5",
    "earned(address)": "0x3d18b912",
    "rewardRate()": "0x7b9c3b7f",
    "totalSupply()": "0x18160ddd",
    "balanceOf(address)": "0x70a08231",
    "rewards(address)": "0x3a46b1a8",
}

def get_gauge_address(w3, voter_address, pool_address):
    """Get gauge address for a pool"""
    # Try gauges(address)
    try:
        addr_clean = pool_address[2:].lower().zfill(64)
        data = GAUGE_SELECTORS["gauges(address)"] + addr_clean
        
        result = w3.eth.call({
            'to': w3.to_checksum_address(voter_address),
            'data': data
        })
        
        if result and result != b'\x00' * 32:
            gauge_addr = '0x' + result.hex()[-40:]
            return gauge_addr
    except:
        pass
    
    # Try getGauge(address)
    try:
        addr_clean = pool_address[2:].lower().zfill(64)
        data = GAUGE_SELECTORS["getGauge(address)"] + addr_clean
        
        result = w3.eth.call({
            'to': w3.to_checksum_address(voter_address),
            'data': data
        })
        
        if result and result != b'\x00' * 32:
            gauge_addr = '0x' + result.hex()[-40:]
            return gauge_addr
    except:
        pass
    
    return None

def check_gauge_functions(w3, gauge_address):
    """Check what functions are available on gauge"""
    available = {}
    
    for name, selector in GAUGE_SELECTORS.items():
        if 'address' in name and name != "gauges(address)" and name != "getGauge(address)":
            continue  # Skip functions that need arguments for now
        
        try:
            result = w3.eth.call({
                'to': w3.to_checksum_address(gauge_address),
                'data': selector
            })
            
            if result and result != b'\x00' * 32:
                available[name] = result.hex()
        except:
            pass
    
    return available

def analyze_pool_rewards(pool_address):
    """Analyze how rewards are fetched for a pool"""
    print(f"\nAnalyzing pool: {pool_address}")
    
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("❌ Could not connect to RPC")
        return
    
    # Get gauge address
    gauge_addr = get_gauge_address(w3, VOTER_PROXY, pool_address)
    if not gauge_addr:
        print("  ❌ No gauge found")
        return
    
    print(f"  ✓ Gauge: {gauge_addr}")
    
    # Check gauge functions
    functions = check_gauge_functions(w3, gauge_addr)
    if functions:
        print(f"  ✓ Available functions:")
        for name, result in functions.items():
            print(f"    - {name}: {result[:20]}...")
    else:
        print("  ⚠️  No standard gauge functions found")

if __name__ == "__main__":
    # Test with known pools
    test_pools = [
        "0x9a6142ef0766915db02066f791d969c22eba1dca",  # CL pool
        "0x78f5a53731564894a7e4fff827a88e5fbf9cfcb6",  # vAMM pool
        "0xedcfa2d80cf06fb7642e956a1e95dbc37c75995b",  # sAMM pool
    ]
    
    print("="*80)
    print("FINDING GAUGE CONTRACTS FOR REWARDS")
    print("="*80)
    
    for pool in test_pools:
        analyze_pool_rewards(pool)
