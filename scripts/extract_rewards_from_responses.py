#!/usr/bin/env python3
"""
Extract potential reward values from multicall responses
Look for patterns that match reward amounts
"""

import json
import sys
from collections import defaultdict

def extract_large_numbers(hex_data):
    """Extract large numbers from hex data"""
    if not hex_data or hex_data == '0x':
        return []
    
    if hex_data.startswith('0x'):
        hex_data = hex_data[2:]
    
    numbers = []
    # Process in 64-char chunks (32 bytes = uint256)
    for i in range(0, len(hex_data) - 64, 64):
        chunk = hex_data[i:i+64]
        try:
            value = int(chunk, 16)
            # Filter for reasonable token amounts (1e15 to 1e30)
            if 1e15 < value < 1e30:
                numbers.append(value)
        except:
            pass
    
    return numbers

def analyze_responses(log_file):
    """Analyze multicall responses for reward patterns"""
    print("="*80)
    print("EXTRACTING REWARD DATA FROM RESPONSES")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    print(f"\nAnalyzing {len(requests)} requests...\n")
    
    # Find multicall responses
    reward_candidates = []
    
    for i, req in enumerate(requests):
        response = req.get('responseBody', {})
        if isinstance(response, dict):
            result = response.get('result', '')
        else:
            result = str(response)
        
        if result and len(result) > 200:  # Substantial response
            numbers = extract_large_numbers(result)
            
            # Filter for values that could be USD rewards (100 to 1M)
            for num in numbers:
                usd_value = num / 1e18
                if 100 < usd_value < 1000000:
                    reward_candidates.append({
                        'request': i,
                        'url': req.get('url', '')[:80],
                        'value': usd_value,
                        'raw': num
                    })
    
    print(f"Found {len(reward_candidates)} potential reward values\n")
    
    if reward_candidates:
        print("Top 30 potential rewards:")
        # Group by value (round to nearest 100)
        by_value = defaultdict(list)
        for candidate in reward_candidates:
            rounded = round(candidate['value'] / 100) * 100
            by_value[rounded].append(candidate)
        
        # Show most common values
        for value in sorted(by_value.keys(), reverse=True)[:30]:
            candidates = by_value[value]
            print(f"\n  ${value:,.0f} (appears {len(candidates)} times):")
            for c in candidates[:3]:  # Show first 3
                print(f"    Request {c['request']}: {c['url']}")
            if len(candidates) > 3:
                print(f"    ... and {len(candidates) - 3} more")
    
    return reward_candidates

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T02_34_55.027Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    try:
        analyze_responses(log_file)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
