#!/usr/bin/env python3
"""
Final attempt to extract rewards from multicall responses
Look for complete pool addresses followed by reward values
"""

import json
import sys
import re
from collections import defaultdict

def find_complete_addresses_and_values(hex_data):
    """Find complete addresses and nearby values"""
    # Remove 0x prefix
    if hex_data.startswith('0x'):
        hex_data = hex_data[2:].lower()
    
    results = []
    
    # Known pool addresses to search for
    known_pools = set()
    try:
        with open('classified_pools.json', 'r') as f:
            pools_data = json.load(f)
            for pool_type, pools in pools_data.get('pools_by_type', {}).items():
                for pool in pools:
                    addr = pool.get('address', '').lower()
                    if addr.startswith('0x'):
                        known_pools.add(addr[2:])
    except:
        pass
    
    # Search for each known pool address
    for pool_addr in known_pools:
        if pool_addr in hex_data:
            pos = hex_data.find(pool_addr)
            
            # Look for values after the address (within 500 chars)
            search_area = hex_data[pos + 40:pos + 500]
            
            # Find 64-char chunks (uint256 values)
            for i in range(0, len(search_area) - 64, 64):
                chunk = search_area[i:i+64]
                try:
                    value = int(chunk, 16)
                    # Filter for reasonable reward/weight values
                    if 1e20 < value < 1e27:
                        usd_value = value / 1e18
                        if 100 < usd_value < 100000000:
                            results.append({
                                'pool': '0x' + pool_addr,
                                'value': usd_value,
                                'raw': value,
                                'offset': i
                            })
                            break  # Take first reasonable value
                except:
                    pass
    
    return results

def analyze_all_responses(log_file):
    """Analyze all multicall responses"""
    print("="*80)
    print("FINAL REWARD EXTRACTION FROM MULTICALL RESPONSES")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    print(f"\nAnalyzing {len(requests)} requests...\n")
    
    pool_rewards = defaultdict(list)
    
    for i, req in enumerate(requests):
        response = req.get('responseBody', {})
        if isinstance(response, dict):
            result = response.get('result', '')
        else:
            result = str(response)
        
        if result and len(result) > 200:
            pairs = find_complete_addresses_and_values(result)
            
            if pairs:
                print(f"Request {i}: Found {len(pairs)} pool-value pairs")
                for pair in pairs:
                    print(f"  {pair['pool']}: ${pair['value']:,.2f}")
                    pool_rewards[pair['pool']].append(pair['value'])
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    if pool_rewards:
        print(f"\nFound rewards for {len(pool_rewards)} pools:\n")
        
        for pool, rewards in sorted(pool_rewards.items(), key=lambda x: -max(x[1]) if x[1] else 0):
            if rewards:
                avg = sum(rewards) / len(rewards)
                max_reward = max(rewards)
                min_reward = min(rewards)
                print(f"  {pool}:")
                print(f"    Max: ${max_reward:,.2f}, Min: ${min_reward:,.2f}, Avg: ${avg:,.2f} ({len(rewards)} values)")
        
        # Save
        output = {
            'pools': {pool: {'values': rewards, 'max': max(rewards), 'min': min(rewards), 'avg': sum(rewards)/len(rewards)}
                     for pool, rewards in pool_rewards.items()}
        }
        
        output_file = "extracted_rewards_from_multicall.json"
        with open(output_file, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"\n✓ Results saved to: {output_file}")
    else:
        print("\n⚠️  No pool-reward pairs found")
    
    return pool_rewards

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T02_34_55.027Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    try:
        analyze_all_responses(log_file)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
