#!/usr/bin/env python3
"""
Extract pool addresses and reward values from multicall responses
Look for patterns: pool addresses followed by large numbers (rewards/weights)
"""

import json
import sys
import re
from collections import defaultdict

def extract_valid_addresses(hex_data):
    """Extract valid Ethereum addresses from hex data"""
    # Find all 40-char hex sequences
    matches = re.finditer(r'[0-9a-f]{40}', hex_data.lower())
    
    valid_addresses = []
    for match in matches:
        addr = '0x' + match.group()
        
        # Filter invalid addresses
        if addr == '0x' + '0' * 40:
            continue
        if addr == '0x' + 'f' * 40:
            continue
        if len(set(addr[2:])) < 4:  # Too few unique chars
            continue
        
        # Check if it's not obviously padding
        # Valid addresses usually have some variation
        hex_part = addr[2:]
        if hex_part.count('0') > 35:  # Too many zeros
            continue
        
        valid_addresses.append((match.start(), addr))
    
    return valid_addresses

def extract_large_numbers(hex_data):
    """Extract large numbers that could be rewards/weights"""
    numbers = []
    
    # Process in 64-char chunks (32 bytes = uint256)
    for i in range(0, len(hex_data) - 64, 2):
        chunk = hex_data[i:i+64]
        try:
            value = int(chunk, 16)
            # Filter for reasonable values
            if 1e15 < value < 1e30:
                numbers.append((i, value))
        except:
            pass
    
    return numbers

def find_pool_reward_pairs(hex_data):
    """Find pairs of addresses followed by large numbers (likely pool + reward/weight)"""
    addresses = extract_valid_addresses(hex_data)
    numbers = extract_large_numbers(hex_data)
    
    pairs = []
    
    # Look for addresses followed by numbers within reasonable distance
    for addr_pos, addr in addresses:
        # Look for numbers within 200 bytes (50 hex chars * 4 = 200 bytes)
        for num_pos, num in numbers:
            distance = abs(num_pos - addr_pos)
            
            # If number is after address and within reasonable distance
            if num_pos > addr_pos and distance < 200:
                # Check if it's a reasonable reward/weight value
                usd_value = num / 1e18
                if 100 < usd_value < 100000000:  # 100 to 100M
                    pairs.append({
                        'address': addr,
                        'value': usd_value,
                        'raw': num,
                        'distance': distance
                    })
                    break  # Take first match
    
    return pairs

def analyze_multicall_responses(log_file):
    """Analyze all multicall responses"""
    print("="*80)
    print("EXTRACTING POOLS AND REWARDS FROM MULTICALL RESPONSES")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    print(f"\nAnalyzing {len(requests)} requests...\n")
    
    # Known pool addresses for validation
    known_pools = set()
    try:
        with open('classified_pools.json', 'r') as f:
            pools_data = json.load(f)
            for pool_type, pools in pools_data.get('pools_by_type', {}).items():
                for pool in pools:
                    known_pools.add(pool.get('address', '').lower())
    except:
        pass
    
    all_pairs = []
    pool_values = defaultdict(list)
    
    for i, req in enumerate(requests):
        response = req.get('responseBody', {})
        if isinstance(response, dict):
            result = response.get('result', '')
        else:
            result = str(response)
        
        if result and len(result) > 200:
            hex_data = result[2:] if result.startswith('0x') else result
            
            pairs = find_pool_reward_pairs(hex_data)
            
            if pairs:
                print(f"Request {i}: Found {len(pairs)} address-value pairs")
                
                for pair in pairs:
                    addr_lower = pair['address'].lower()
                    
                    # Check if it's a known pool
                    is_known = addr_lower in known_pools
                    marker = "✓" if is_known else "?"
                    
                    print(f"  {marker} {pair['address']}: ${pair['value']:,.2f}")
                    
                    all_pairs.append(pair)
                    pool_values[addr_lower].append(pair['value'])
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    print(f"\nFound {len(all_pairs)} address-value pairs")
    print(f"Unique addresses: {len(pool_values)}")
    
    # Show known pools with values
    known_with_values = {addr: vals for addr, vals in pool_values.items() if addr in known_pools}
    
    if known_with_values:
        print(f"\n✓ Known pools with values ({len(known_with_values)}):")
        for addr, vals in sorted(known_with_values.items(), key=lambda x: -max(x[1]) if x[1] else 0)[:20]:
            avg = sum(vals) / len(vals)
            max_val = max(vals)
            print(f"  {addr}: max=${max_val:,.2f}, avg=${avg:,.2f} ({len(vals)} values)")
    
    # Save results
    output = {
        'total_pairs': len(all_pairs),
        'unique_addresses': len(pool_values),
        'known_pools': {addr: {'values': vals, 'max': max(vals), 'avg': sum(vals)/len(vals)} 
                       for addr, vals in known_with_values.items()},
        'all_pairs': all_pairs[:100]  # First 100
    }
    
    output_file = "multicall_rewards_extracted.json"
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n✓ Results saved to: {output_file}")
    
    return output

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T02_34_55.027Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    try:
        analyze_multicall_responses(log_file)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
