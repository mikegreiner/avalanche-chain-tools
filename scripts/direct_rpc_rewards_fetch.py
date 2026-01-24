#!/usr/bin/env python3
"""
Direct RPC approach to fetch pool rewards
Try all possible methods to get rewards via RPC without DOM or interception
"""

import json
import sys
from web3 import Web3
from typing import Dict, List, Optional

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_PROXY = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"
MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11"

# Known reward-related selectors
REWARD_SELECTORS = {
    "tokens_per_week(uint256)": "0xedf59997",
    "totalSupplyAtT(uint256)": "0x7116c60c",
    "getGauge(address)": "0xcc56b2c5",
    "gauges(address)": "0x419074b2",
    "claimable()": "0x379607f5",
    "rewardRate()": "0x7b9c3b7f",
    "totalRewards()": "0x5c60da1b",
    "emission()": "0x5c60da1b",
    "bribe()": "0x8d8e4c8e",
}

def get_gauge_address(w3, pool_address):
    """Try to get gauge address for a pool"""
    addr_clean = pool_address[2:].lower().zfill(64)
    
    # Try getGauge(address) on voter
    selector = "0xcc56b2c5"
    data = selector + addr_clean
    
    try:
        result = w3.eth.call({
            'to': w3.to_checksum_address(VOTER_PROXY),
            'data': data
        })
        
        if result and result != b'\x00' * 32:
            gauge_addr = '0x' + result.hex()[-40:]
            if gauge_addr != '0x' + '0' * 40:
                return w3.to_checksum_address(gauge_addr)
    except Exception as e:
        pass
    
    # Try gauges(address)
    selector = "0x419074b2"
    data = selector + addr_clean
    
    try:
        result = w3.eth.call({
            'to': w3.to_checksum_address(VOTER_PROXY),
            'data': data
        })
        
        if result and result != b'\x00' * 32:
            gauge_addr = '0x' + result.hex()[-40:]
            if gauge_addr != '0x' + '0' * 40:
                return w3.to_checksum_address(gauge_addr)
    except Exception as e:
        pass
    
    return None

def try_reward_functions_on_contract(w3, contract_address, pool_address):
    """Try all reward-related functions on a contract"""
    results = {}
    
    # Try claimable()
    try:
        result = w3.eth.call({
            'to': contract_address,
            'data': REWARD_SELECTORS["claimable()"]
        })
        if result and result != b'\x00' * 32:
            value = int(result.hex(), 16)
            if value > 0:
                results['claimable'] = value / 1e18
    except:
        pass
    
    # Try rewardRate()
    try:
        result = w3.eth.call({
            'to': contract_address,
            'data': REWARD_SELECTORS["rewardRate()"]
        })
        if result and result != b'\x00' * 32:
            value = int(result.hex(), 16)
            if value > 0:
                results['rewardRate'] = value / 1e18
    except:
        pass
    
    # Try totalRewards()
    try:
        result = w3.eth.call({
            'to': contract_address,
            'data': REWARD_SELECTORS["totalRewards()"]
        })
        if result and result != b'\x00' * 32:
            value = int(result.hex(), 16)
            if value > 0:
                results['totalRewards'] = value / 1e18
    except:
        pass
    
    # Try tokens_per_week for current week
    try:
        import time
        current_week = int(time.time() / (7 * 24 * 3600))
        week_hex = hex(current_week)[2:].zfill(64)
        data = REWARD_SELECTORS["tokens_per_week(uint256)"] + week_hex
        
        result = w3.eth.call({
            'to': contract_address,
            'data': data
        })
        if result and result != b'\x00' * 32:
            value = int(result.hex(), 16)
            if value > 0:
                results['tokens_per_week'] = value / 1e18
    except:
        pass
    
    return results

def try_bribe_contract(w3, pool_address):
    """Try to get bribe contract and check for rewards"""
    # Try to get bribe address from voter
    addr_clean = pool_address[2:].lower().zfill(64)
    
    # This might be a different function - need to investigate
    # For now, try common patterns
    
    return None

def fetch_rewards_via_rpc(pool_addresses):
    """Try to fetch rewards for pools via RPC"""
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("❌ Could not connect to RPC")
        return {}
    
    print(f"✓ Connected to {RPC_URL}\n")
    print(f"Testing {len(pool_addresses)} pools...\n")
    
    results = {}
    
    for pool_addr in pool_addresses:
        pool_addr = w3.to_checksum_address(pool_addr)
        print(f"Pool: {pool_addr}")
        
        pool_results = {}
        
        # Method 1: Get gauge and try reward functions
        gauge_addr = get_gauge_address(w3, pool_addr)
        if gauge_addr:
            print(f"  ✓ Gauge: {gauge_addr}")
            pool_results['gauge'] = gauge_addr
            
            # Try reward functions on gauge
            gauge_rewards = try_reward_functions_on_contract(w3, gauge_addr, pool_addr)
            if gauge_rewards:
                print(f"  ✓ Gauge rewards: {gauge_rewards}")
                pool_results['gauge_rewards'] = gauge_rewards
        
        # Method 2: Try reward functions directly on pool
        pool_rewards = try_reward_functions_on_contract(w3, pool_addr, pool_addr)
        if pool_rewards:
            print(f"  ✓ Pool rewards: {pool_rewards}")
            pool_results['pool_rewards'] = pool_rewards
        
        # Method 3: Try voter contract with pool address
        voter_rewards = try_reward_functions_on_contract(w3, VOTER_PROXY, pool_addr)
        if voter_rewards:
            print(f"  ✓ Voter rewards: {voter_rewards}")
            pool_results['voter_rewards'] = voter_rewards
        
        if pool_results:
            results[pool_addr] = pool_results
        else:
            print(f"  ❌ No rewards found via RPC")
        
        print()
    
    return results

if __name__ == "__main__":
    # Test with known pools that have rewards
    test_pools = [
        "0x403822e6cfa57d10c32a4e910ed740f9ced8c615",  # Has rewards in static map
        "0x76eb2c0c8adabc6be513a1f3b6cc9191d017fac7",  # Has rewards in static map
        "0x4c33a727e3744009f7413d2d1fbbad77d7df207f",  # Large rewards
        "0xf2b0f7482685d5cf1f40a3de4abfa2665052fa14",  # Very large rewards
    ]
    
    if len(sys.argv) > 1:
        # Load from file
        with open(sys.argv[1], 'r') as f:
            data = json.load(f)
            if isinstance(data, dict):
                test_pools = list(data.keys())[:10]  # First 10 pools
            elif isinstance(data, list):
                test_pools = [p.get('pool_id', p.get('address', '')) for p in data[:10]]
    
    results = fetch_rewards_via_rpc(test_pools)
    
    # Save results
    output_file = "direct_rpc_rewards_results.json"
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\n✓ Results saved to: {output_file}")
    
    # Summary
    pools_with_rewards = len([r for r in results.values() if 'gauge_rewards' in r or 'pool_rewards' in r])
    print(f"\nSummary: {pools_with_rewards}/{len(test_pools)} pools have rewards via RPC")
