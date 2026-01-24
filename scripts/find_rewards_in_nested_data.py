#!/usr/bin/env python3
"""
Find rewards in nested multicall response data
The values might be nested in structs or arrays within the return data
"""

import json
import sys
import re
from collections import defaultdict

def find_all_values_in_hex(hex_data, min_value=1e20, max_value=1e27):
    """Find all uint256 values in hex data that could be rewards"""
    values = []
    
    # Process in 64-char chunks (32 bytes = uint256)
    for i in range(0, len(hex_data) - 64, 2):
        chunk = hex_data[i:i+64]
        try:
            value = int(chunk, 16)
            if min_value < value < max_value:
                usd_value = value / 1e18
                if 100 < usd_value < 100000000:
                    values.append({
                        'position': i,
                        'raw': value,
                        'usd': usd_value
                    })
        except:
            pass
    
    return values

def find_addresses_near_values(hex_data, values):
    """Find pool addresses near reward values"""
    results = []
    
    # Known pool addresses
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
    
    for value_info in values:
        pos = value_info['position']
        
        # Look for addresses within 500 chars before the value
        search_start = max(0, pos - 500)
        search_area = hex_data[search_start:pos]
        
        # Find all addresses in search area
        for match in re.finditer(r'[0-9a-f]{40}', search_area):
            addr_hex = match.group()
            addr_full = '0x' + addr_hex
            
            if addr_hex in known_pools:
                # Found a known pool address near this value
                distance = pos - (search_start + match.end())
                results.append({
                    'pool': addr_full,
                    'value': value_info['usd'],
                    'raw_value': value_info['raw'],
                    'distance': distance,
                    'value_position': pos,
                    'address_position': search_start + match.start()
                })
    
    return results

def analyze_multicall_responses_for_rewards(log_file):
    """Analyze all multicall responses to find rewards near pool addresses"""
    print("="*80)
    print("FINDING REWARDS IN MULTICALL RESPONSES")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    print(f"\nAnalyzing {len(requests)} requests...\n")
    
    all_matches = []
    pool_to_values = defaultdict(list)
    
    for req_idx, req in enumerate(requests):
        response = req.get('responseBody', {})
        if isinstance(response, dict):
            result = response.get('result', '')
        else:
            result = str(response)
        
        if result and len(result) > 500:
            if result.startswith('0x'):
                hex_data = result[2:].lower()
            else:
                hex_data = result.lower()
            
            # Find all potential reward values
            values = find_all_values_in_hex(hex_data)
            
            if values:
                # Find pool addresses near these values
                matches = find_addresses_near_values(hex_data, values)
                
                if matches:
                    print(f"Request {req_idx}: Found {len(matches)} pool-value pairs")
                    for match in matches:
                        print(f"  {match['pool']}: ${match['value']:,.2f} (distance: {match['distance']})")
                        all_matches.append(match)
                        pool_to_values[match['pool'].lower()].append(match['value'])
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    if pool_to_values:
        print(f"\nFound values for {len(pool_to_values)} pools:\n")
        
        for pool, values in sorted(pool_to_values.items(), key=lambda x: -max(x[1]) if x[1] else 0)[:30]:
            if values:
                avg = sum(values) / len(values)
                max_val = max(values)
                print(f"  {pool}: max=${max_val:,.2f}, avg=${avg:,.2f} ({len(values)} values)")
        
        # Save
        output = {
            'total_matches': len(all_matches),
            'unique_pools': len(pool_to_values),
            'pools': {
                pool: {
                    'values': vals,
                    'max': max(vals),
                    'min': min(vals),
                    'avg': sum(vals)/len(vals)
                }
                for pool, vals in pool_to_values.items()
            }
        }
        
        output_file = "rewards_found_in_responses.json"
        with open(output_file, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"\n✓ Results saved to: {output_file}")
    else:
        print("\n⚠️  No pool-value pairs found")
    
    return pool_to_values

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T02_34_55.027Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    analyze_multicall_responses_for_rewards(log_file)
