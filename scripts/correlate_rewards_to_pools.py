#!/usr/bin/env python3
"""
Correlate reward values in responses with pool addresses in requests
This will tell us which pools have which rewards!
"""

import json
import sys
import re
from collections import defaultdict

def extract_pool_addresses_from_request(request_data):
    """Extract pool addresses from multicall request"""
    if isinstance(request_data, str):
        try:
            request_data = json.loads(request_data)
        except:
            return []
    
    if isinstance(request_data, dict):
        params = request_data.get('params', [])
        if params and isinstance(params[0], dict):
            data_field = params[0].get('data', '')
            
            if data_field and data_field.startswith('0x82ad56cb'):
                # Extract addresses from calldata
                hex_data = data_field[10:]  # Remove selector
                
                # Find all 40-char hex sequences that look like addresses
                addresses = re.findall(r'[0-9a-f]{40}', hex_data.lower())
                
                # Filter valid addresses
                valid_addresses = []
                for addr in addresses:
                    addr_full = '0x' + addr
                    # Skip obviously invalid (all zeros, padding, etc.)
                    if addr != '0' * 40 and len(set(addr)) > 1:
                        # Check if it's not just padding
                        if not (addr.startswith('00000000') and addr.endswith('00000000')):
                            valid_addresses.append(addr_full)
                
                return list(set(valid_addresses))  # Remove duplicates
    
    return []

def extract_rewards_from_response(response_data):
    """Extract reward values from multicall response"""
    if isinstance(response_data, dict):
        result = response_data.get('result', '')
    else:
        result = str(response_data)
    
    if not result or result == '0x':
        return []
    
    hex_data = result[2:] if result.startswith('0x') else result
    
    rewards = []
    # Look for large numbers in 64-char chunks
    for i in range(0, len(hex_data) - 64, 64):
        chunk = hex_data[i:i+64]
        try:
            value = int(chunk, 16)
            # Filter for reasonable reward values
            if 1e20 < value < 1e27:
                usd_value = value / 1e18
                if 100 < usd_value < 1000000:
                    rewards.append({
                        'position': i // 64,
                        'value': usd_value,
                        'raw': value
                    })
        except:
            pass
    
    return rewards

def correlate_rewards_to_pools(log_file):
    """Correlate rewards in responses with pools in requests"""
    print("="*80)
    print("CORRELATING REWARDS TO POOLS")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    print(f"\nAnalyzing {len(requests)} requests...\n")
    
    # Process multicall pairs
    pool_rewards = defaultdict(list)
    
    for req in requests:
        body = req.get('requestBody', req.get('body', ''))
        response = req.get('responseBody', {})
        
        # Extract pool addresses from request
        pool_addresses = extract_pool_addresses_from_request(body)
        
        # Extract rewards from response
        rewards = extract_rewards_from_response(response)
        
        if pool_addresses and rewards:
            print(f"Found {len(pool_addresses)} pools and {len(rewards)} rewards")
            
            # Try to match - if same count, assume 1:1 mapping
            if len(pool_addresses) == len(rewards):
                for pool, reward in zip(pool_addresses, rewards):
                    pool_rewards[pool.lower()].append(reward['value'])
                    print(f"  {pool}: ${reward['value']:,.2f}")
            elif len(rewards) > 0:
                # If different counts, store all rewards for all pools
                avg_reward = sum(r['value'] for r in rewards) / len(rewards)
                for pool in pool_addresses:
                    pool_rewards[pool.lower()].extend([r['value'] for r in rewards])
                    print(f"  {pool}: multiple rewards (avg: ${avg_reward:,.2f})")
    
    # Summary
    print("\n" + "="*80)
    print("POOL-REWARD CORRELATIONS")
    print("="*80)
    
    if pool_rewards:
        print(f"\nFound rewards for {len(pool_rewards)} pools:\n")
        
        for pool, rewards in sorted(pool_rewards.items(), key=lambda x: -max(x[1]) if x[1] else 0)[:30]:
            if rewards:
                avg = sum(rewards) / len(rewards)
                max_reward = max(rewards)
                print(f"  {pool}:")
                print(f"    Max: ${max_reward:,.2f}, Avg: ${avg:,.2f}, Count: {len(rewards)}")
    else:
        print("\n⚠️  Could not correlate rewards to pools")
        print("  Need better decoding of multicall structure")
    
    return pool_rewards

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T02_34_55.027Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    try:
        correlate_rewards_to_pools(log_file)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
