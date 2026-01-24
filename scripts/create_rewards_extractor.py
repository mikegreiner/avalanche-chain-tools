#!/usr/bin/env python3
"""
Create a working rewards extractor from multicall responses
This will be used in the extension to get rewards via RPC
"""

import json
import sys
import re
from typing import Dict, List, Optional

def extract_rewards_from_multicall_response(response_hex: str, known_pools: set) -> Dict[str, float]:
    """
    Extract rewards from a multicall response by finding pool addresses
    and nearby reward values.
    
    Returns: dict mapping pool address (lowercase) to reward value
    """
    if not response_hex or response_hex == '0x':
        return {}
    
    if response_hex.startswith('0x'):
        hex_data = response_hex[2:].lower()
    else:
        hex_data = response_hex.lower()
    
    rewards = {}
    
    # Find all pool addresses in the response
    for pool_addr in known_pools:
        pool_hex = pool_addr[2:] if pool_addr.startswith('0x') else pool_addr
        
        if pool_hex in hex_data:
            pos = hex_data.find(pool_hex)
            
            # Look for values after the address (within 500 chars)
            search_area = hex_data[pos + 40:pos + 500]
            
            # Find 64-char chunks (uint256 values)
            for i in range(0, len(search_area) - 64, 64):
                chunk = search_area[i:i+64]
                try:
                    value = int(chunk, 16)
                    # Filter for reasonable reward values
                    if 1e20 < value < 1e27:
                        usd_value = value / 1e18
                        if 100 < usd_value < 100000000:
                            # Found a potential reward value
                            pool_key = pool_addr.lower()
                            if pool_key not in rewards or usd_value > rewards[pool_key]:
                                rewards[pool_key] = usd_value
                            break  # Take first reasonable value
                except:
                    pass
    
    return rewards

def load_known_pools() -> set:
    """Load all known pool addresses"""
    pools = set()
    
    try:
        with open('classified_pools.json', 'r') as f:
            data = json.load(f)
            for pool_type, pool_list in data.get('pools_by_type', {}).items():
                for pool in pool_list:
                    addr = pool.get('address', '').lower()
                    if addr:
                        pools.add(addr)
    except:
        pass
    
    return pools

def create_rewards_map(log_file: str) -> Dict[str, float]:
    """
    Create a map of pool addresses to rewards by analyzing all multicall responses
    """
    print("="*80)
    print("CREATING REWARDS MAP FROM MULTICALL RESPONSES")
    print("="*80)
    
    known_pools = load_known_pools()
    print(f"Loaded {len(known_pools)} known pools\n")
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    print(f"Analyzing {len(requests)} requests...\n")
    
    all_rewards = {}  # pool -> list of values
    
    for req_idx, req in enumerate(requests):
        response = req.get('responseBody', {})
        if isinstance(response, dict):
            result = response.get('result', '')
        else:
            result = str(response)
        
        if result and len(result) > 500:
            rewards = extract_rewards_from_multicall_response(result, known_pools)
            
            if rewards:
                if req_idx % 20 == 0:
                    print(f"  Request {req_idx}: Found rewards for {len(rewards)} pools")
                
                for pool, value in rewards.items():
                    if pool not in all_rewards:
                        all_rewards[pool] = []
                    all_rewards[pool].append(value)
    
    # Take max value for each pool (most recent/accurate)
    final_rewards = {}
    for pool, values in all_rewards.items():
        final_rewards[pool] = max(values)
    
    print(f"\n✓ Found rewards for {len(final_rewards)} pools")
    
    # Save
    output_file = "rewards_map.json"
    with open(output_file, 'w') as f:
        json.dump(final_rewards, f, indent=2)
    
    print(f"✓ Saved to: {output_file}")
    
    # Summary
    if final_rewards:
        values_list = list(final_rewards.values())
        print(f"\nReward range: ${min(values_list):,.2f} to ${max(values_list):,.2f}")
        print(f"Average: ${sum(values_list)/len(values_list):,.2f}")
    
    return final_rewards

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T02_34_55.027Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    create_rewards_map(log_file)
