#!/usr/bin/env python3
"""
Tenaciously investigate gauge contracts to find how rewards/VAPR are fetched
"""

import json
import sys
from web3 import Web3
from typing import Dict, List, Optional

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_PROXY = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"

# Function selectors to try on gauge contracts
GAUGE_SELECTORS = {
    # Basic info
    "name()": "0x06fdde03",
    "symbol()": "0x95d89b41",
    "decimals()": "0x313ce567",
    
    # Reward-related
    "claimable()": "0x379607f5",
    "claimableReward()": "0x379607f5",
    "earned(address)": "0x3d18b912",
    "rewards(address)": "0x3a46b1a8",
    "rewardRate()": "0x7b9c3b7f",
    "rewardPerToken()": "0x40c10f19",
    "rewardPerTokenStored()": "0x8b32fa23",
    "lastUpdateTime()": "0x5c975abb",
    "periodFinish()": "0x0d5a0e5e",
    
    # Staking/balance
    "totalSupply()": "0x18160ddd",
    "balanceOf(address)": "0x70a08231",
    
    # Token info
    "token()": "0xfc0c546a",
    "stakingToken()": "0x83a48fbcfc991335314e74d0496aab6a1987e992",
    "rewardToken()": "0x16f0115b",
    
    # Pool-specific
    "pool()": "0x6e553f65",
    "poolAddress()": "0x6e553f65",
    
    # Fees/rewards
    "fees()": "0xddca3f43",
    "fees0()": "0xddca3f43",
    "fees1()": "0xddca3f43",
    "bribe()": "0x8d8e4c8e",
    "bribeAddress()": "0x8d8e4c8e",
    
    # Emission
    "emission()": "0x5c60da1b",
    "emissionRate()": "0x5c60da1b",
    "inflationRate()": "0x5c60da1b",
}

def get_gauge_address(w3, voter_address, pool_address):
    """Get gauge address for a pool"""
    addr_clean = pool_address[2:].lower().zfill(64)
    
    # Try getGauge(address)
    selector = "0xcc56b2c5"
    data = selector + addr_clean
    
    try:
        result = w3.eth.call({
            'to': w3.to_checksum_address(voter_address),
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
            'to': w3.to_checksum_address(voter_address),
            'data': data
        })
        
        if result and result != b'\x00' * 32:
            gauge_addr = '0x' + result.hex()[-40:]
            if gauge_addr != '0x' + '0' * 40:
                return w3.to_checksum_address(gauge_addr)
    except Exception as e:
        pass
    
    return None

def probe_gauge_contract(w3, gauge_address):
    """Probe gauge contract for available functions"""
    print(f"\n  Probing gauge: {gauge_address}")
    
    results = {}
    
    for func_name, selector in GAUGE_SELECTORS.items():
        # Skip functions that need arguments for now
        if 'address' in func_name and func_name != "balanceOf(address)":
            continue
        
        try:
            result = w3.eth.call({
                'to': gauge_address,
                'data': selector
            })
            
            if result and result != b'\x00' * 32:
                result_hex = result.hex()
                
                # Try to interpret
                interpretation = None
                if len(result_hex) >= 64:
                    # Try as uint256
                    try:
                        value = int(result_hex, 16)
                        if value > 0:
                            interpretation = f"uint256: {value}"
                            # If it's a reasonable timestamp or amount
                            if 1000000000 < value < 2000000000:
                                interpretation += f" (timestamp: {value})"
                            elif value > 1e15:
                                interpretation += f" (amount: {value / 1e18:.2f})"
                    except:
                        pass
                    
                    # Try as address (last 40 chars)
                    if len(result_hex) >= 40:
                        addr = '0x' + result_hex[-40:]
                        if addr != '0x' + '0' * 40:
                            try:
                                checksum_addr = w3.to_checksum_address(addr)
                                interpretation = f"address: {checksum_addr}"
                            except:
                                pass
                
                if interpretation:
                    results[func_name] = {
                        'selector': selector,
                        'result': result_hex,
                        'interpretation': interpretation
                    }
        except:
            pass
    
    return results

def get_pool_rewards_from_gauge(w3, gauge_address, pool_address=None):
    """Try to get reward data from gauge"""
    rewards_data = {}
    
    # Try claimable()
    try:
        result = w3.eth.call({
            'to': gauge_address,
            'data': GAUGE_SELECTORS["claimable()"]
        })
        if result and result != b'\x00' * 32:
            value = int(result.hex(), 16)
            rewards_data['claimable'] = value / 1e18
    except:
        pass
    
    # Try rewardRate()
    try:
        result = w3.eth.call({
            'to': gauge_address,
            'data': GAUGE_SELECTORS["rewardRate()"]
        })
        if result and result != b'\x00' * 32:
            value = int(result.hex(), 16)
            rewards_data['rewardRate'] = value / 1e18
    except:
        pass
    
    # Try totalSupply() (staked amount)
    try:
        result = w3.eth.call({
            'to': gauge_address,
            'data': GAUGE_SELECTORS["totalSupply()"]
        })
        if result and result != b'\x00' * 32:
            value = int(result.hex(), 16)
            rewards_data['totalStaked'] = value / 1e18
    except:
        pass
    
    return rewards_data

def investigate_pools(pool_addresses):
    """Investigate multiple pools"""
    print("="*80)
    print("GAUGE INVESTIGATION")
    print("="*80)
    
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("❌ Could not connect to RPC")
        return
    
    print(f"✓ Connected to {RPC_URL}\n")
    
    results = {}
    
    for pool_addr in pool_addresses:
        print(f"\n{'='*80}")
        print(f"Pool: {pool_addr}")
        print(f"{'='*80}")
        
        # Get gauge
        gauge_addr = get_gauge_address(w3, VOTER_PROXY, pool_addr)
        if not gauge_addr:
            print("  ❌ No gauge found")
            results[pool_addr] = {'gauge': None}
            continue
        
        print(f"  ✓ Gauge: {gauge_addr}")
        results[pool_addr] = {'gauge': gauge_addr}
        
        # Probe gauge
        gauge_functions = probe_gauge_contract(w3, gauge_addr)
        if gauge_functions:
            print(f"  ✓ Found {len(gauge_functions)} working functions:")
            for func_name, data in gauge_functions.items():
                print(f"    - {func_name}: {data['interpretation']}")
            results[pool_addr]['functions'] = gauge_functions
        
        # Try to get rewards
        rewards = get_pool_rewards_from_gauge(w3, gauge_addr, pool_addr)
        if rewards:
            print(f"  ✓ Reward data:")
            for key, value in rewards.items():
                print(f"    - {key}: {value}")
            results[pool_addr]['rewards'] = rewards
    
    return results

if __name__ == "__main__":
    # Test with known pools
    test_pools = [
        "0x9a6142ef0766915db02066f791d969c22eba1dca",  # CL pool
        "0xa02ec3ba8d17887567672b2cdcaf525534636ea0",  # CL pool
        "0x78f5a53731564894a7e4fff827a88e5fbf9cfcb6",  # vAMM pool
        "0xedcfa2d80cf06fb7642e956a1e95dbc37c75995b",  # sAMM pool
        "0x403822e6cfa57d10c32a4e910ed740f9ced8c615",  # Unknown (likely vAMM)
    ]
    
    if len(sys.argv) > 1:
        # Load from file
        with open(sys.argv[1], 'r') as f:
            data = json.load(f)
            if 'pools' in data:
                test_pools = [p.get('id', p.get('address', '')) for p in data['pools']]
            elif isinstance(data, list):
                test_pools = [p.get('id', p.get('address', '')) for p in data]
    
    results = investigate_pools(test_pools)
    
    # Save results
    output_file = "gauge_investigation.json"
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\n✓ Results saved to: {output_file}")
