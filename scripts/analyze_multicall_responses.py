#!/usr/bin/env python3
"""
Analyze multicall RESPONSES to find gauge addresses and reward data
The responses might contain the data we need!
"""

import json
import sys
import re
from collections import Counter

def extract_addresses_from_response(response_hex):
    """Extract all valid addresses from response"""
    if not response_hex or response_hex == '0x':
        return []
    
    # Remove 0x prefix
    hex_data = response_hex[2:] if response_hex.startswith('0x') else response_hex
    
    # Find all 40-char hex sequences
    addresses = re.findall(r'[0-9a-f]{40}', hex_data.lower())
    
    # Filter out obviously invalid addresses (all zeros, all ones, etc.)
    valid_addresses = []
    for addr in addresses:
        addr_full = '0x' + addr
        # Skip if all zeros or all same char
        if len(set(addr)) > 1 and addr != '0' * 40:
            # Check if it looks like a real address (not padding)
            if not (addr.startswith('00000000') and addr.endswith('00000000')):
                valid_addresses.append(addr_full)
    
    return valid_addresses

def analyze_multicall_response(response_data):
    """Analyze a multicall response"""
    if isinstance(response_data, dict):
        result = response_data.get('result', '')
    else:
        result = str(response_data)
    
    if not result or result == '0x':
        return None
    
    # Extract addresses
    addresses = extract_addresses_from_response(result)
    
    # Look for patterns that might indicate rewards/amounts
    # Large numbers (64 chars = 32 bytes = uint256)
    hex_data = result[2:] if result.startswith('0x') else result
    
    # Find large numbers (potential reward amounts)
    large_numbers = []
    for i in range(0, len(hex_data) - 64, 2):
        chunk = hex_data[i:i+64]
        try:
            value = int(chunk, 16)
            # Filter for reasonable values (not too small, not too large)
            if 1e15 < value < 1e30:  # Rough range for token amounts
                large_numbers.append(value / 1e18)
        except:
            pass
    
    return {
        'addresses': addresses,
        'large_numbers': large_numbers[:10]  # First 10
    }

def analyze_log_file(log_file):
    """Analyze multicall responses from log file"""
    print("="*80)
    print("ANALYZING MULTICALL RESPONSES")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    print(f"\nFound {len(requests)} requests\n")
    
    # Find multicall responses
    multicall_responses = []
    for req in requests:
        body = req.get('requestBody', req.get('body', ''))
        response = req.get('responseBody', {})
        
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except:
                continue
        
        if isinstance(body, dict):
            params = body.get('params', [])
            if params and isinstance(params[0], dict):
                to_addr = params[0].get('to', '')
                
                if to_addr and 'ca11bde05977b3631167028862be2a173976ca11' in to_addr.lower():
                    if response:
                        multicall_responses.append({
                            'request': body,
                            'response': response
                        })
    
    print(f"Found {len(multicall_responses)} multicall responses\n")
    
    # Analyze responses
    all_addresses = Counter()
    all_large_numbers = []
    
    for i, item in enumerate(multicall_responses[:10]):  # Analyze first 10
        print(f"\n{'='*80}")
        print(f"MULTICALL RESPONSE {i+1}")
        print(f"{'='*80}")
        
        analysis = analyze_multicall_response(item['response'])
        if analysis:
            print(f"\nAddresses found: {len(analysis['addresses'])}")
            if analysis['addresses']:
                print("  Top addresses:")
                for addr in analysis['addresses'][:10]:
                    print(f"    {addr}")
            
            print(f"\nLarge numbers (potential rewards): {len(analysis['large_numbers'])}")
            if analysis['large_numbers']:
                print("  Sample values:")
                for val in analysis['large_numbers'][:5]:
                    print(f"    {val:,.2f}")
            
            all_addresses.update(analysis['addresses'])
            all_large_numbers.extend(analysis['large_numbers'])
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    print(f"\nUnique addresses across all responses: {len(all_addresses)}")
    print(f"\nTop 20 addresses:")
    for addr, count in all_addresses.most_common(20):
        print(f"  {addr}: appears {count} times")
    
    if all_large_numbers:
        print(f"\nLarge number values (potential rewards):")
        print(f"  Min: {min(all_large_numbers):,.2f}")
        print(f"  Max: {max(all_large_numbers):,.2f}")
        print(f"  Avg: {sum(all_large_numbers)/len(all_large_numbers):,.2f}")

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T01_52_45.591Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    try:
        analyze_log_file(log_file)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
