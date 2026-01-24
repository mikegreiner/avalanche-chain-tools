#!/usr/bin/env python3
"""
Extract contract addresses and function selectors from multicall data
to see what the site is calling to get rewards/VAPR
"""

import json
import sys
import re
from collections import Counter

MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11"
AGGREGATE_SELECTOR = "0x82ad56cb"

# Known selectors
SELECTORS = {
    "0xa7cac846": "weights(address)",
    "0x96c82e57": "totalWeight()",
    "0x0dfe1681": "token0()",
    "0xd21220a7": "token1()",
    "0x3850c7bd": "slot0()",
    "0x0902f1ac": "getReserves()",
    "0x419074b2": "gauges(address)",
    "0xcc56b2c5": "getGauge(address)",
    "0x379607f5": "claimable()",
    "0x3d18b912": "earned(address)",
    "0x7b9c3b7f": "rewardRate()",
    "0x18160ddd": "totalSupply()",
    "0x70a08231": "balanceOf(address)",
    "0x3a46b1a8": "rewards(address)",
}

def extract_addresses_from_hex(hex_data):
    """Extract all addresses from hex data"""
    # Remove 0x prefix
    if hex_data.startswith('0x'):
        hex_data = hex_data[2:]
    
    # Find all 40-char hex sequences (addresses)
    addresses = re.findall(r'[0-9a-f]{40}', hex_data.lower())
    return ['0x' + addr for addr in addresses]

def extract_selectors_from_hex(hex_data):
    """Extract all 4-byte selectors from hex data"""
    if hex_data.startswith('0x'):
        hex_data = hex_data[2:]
    
    # Find all 8-char hex sequences (4-byte selectors)
    selectors = re.findall(r'[0-9a-f]{8}', hex_data.lower())
    return ['0x' + sel for sel in selectors]

def analyze_multicall_data(data):
    """Analyze multicall data to find contracts and functions"""
    # Remove selector
    if data.startswith(AGGREGATE_SELECTOR):
        calldata = data[len(AGGREGATE_SELECTOR):]
    else:
        calldata = data
    
    # Extract addresses and selectors
    addresses = extract_addresses_from_hex(calldata)
    selectors = extract_selectors_from_hex(calldata)
    
    # Count occurrences
    addr_counts = Counter(addresses)
    selector_counts = Counter(selectors)
    
    return {
        'addresses': addr_counts,
        'selectors': selector_counts
    }

def analyze_log_file(log_file):
    """Analyze multicall requests from log file"""
    print("="*80)
    print(f"ANALYZING MULTICALL CONTRACTS AND FUNCTIONS")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    print(f"\nFound {len(requests)} requests\n")
    
    # Find multicall requests
    multicalls = []
    for req in requests:
        body = req.get('requestBody', req.get('body', ''))
        
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except:
                continue
        
        if isinstance(body, dict):
            params = body.get('params', [])
            if params and isinstance(params[0], dict):
                to_addr = params[0].get('to', '')
                data_field = params[0].get('data', '')
                
                if to_addr and to_addr.lower() == MULTICALL3.lower():
                    if data_field and data_field.startswith(AGGREGATE_SELECTOR):
                        multicalls.append(data_field)
    
    print(f"Found {len(multicalls)} multicall requests\n")
    
    # Analyze all multicalls
    all_addresses = Counter()
    all_selectors = Counter()
    
    for data in multicalls:
        result = analyze_multicall_data(data)
        all_addresses.update(result['addresses'])
        all_selectors.update(result['selectors'])
    
    # Show most common contracts
    print("="*80)
    print("MOST COMMON CONTRACT ADDRESSES")
    print("="*80)
    print("\nTop 20 contracts called:")
    for addr, count in all_addresses.most_common(20):
        print(f"  {addr}: {count} calls")
    
    # Show most common function selectors
    print("\n" + "="*80)
    print("MOST COMMON FUNCTION SELECTORS")
    print("="*80)
    print("\nTop 20 functions called:")
    for sel, count in all_selectors.most_common(20):
        func_name = SELECTORS.get(sel, 'unknown')
        print(f"  {sel} ({func_name}): {count} calls")
    
    # Check for known contracts
    print("\n" + "="*80)
    print("KNOWN CONTRACTS")
    print("="*80)
    
    known = {
        "0xe30d0c8532721551a51a9fec7fb233759964d9e3": "Voter Proxy",
        "0xca11bde05977b3631167028862be2a173976ca11": "Multicall3",
    }
    
    for addr, name in known.items():
        count = all_addresses.get(addr.lower(), 0)
        if count > 0:
            print(f"  {name} ({addr}): {count} calls")
    
    # Look for reward-related functions
    print("\n" + "="*80)
    print("REWARD-RELATED FUNCTIONS")
    print("="*80)
    
    reward_funcs = {
        "0x379607f5": "claimable()",
        "0x3d18b912": "earned(address)",
        "0x7b9c3b7f": "rewardRate()",
        "0x3a46b1a8": "rewards(address)",
    }
    
    found_reward_funcs = False
    for sel, name in reward_funcs.items():
        count = all_selectors.get(sel, 0)
        if count > 0:
            print(f"  {name} ({sel}): {count} calls")
            found_reward_funcs = True
    
    if not found_reward_funcs:
        print("  ⚠️  No reward-related functions found in multicalls")
        print("  This suggests rewards might come from:")
        print("    - A separate API endpoint")
        print("    - Events/logs (not calls)")
        print("    - A different contract pattern")

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T01_52_45.591Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    try:
        analyze_log_file(log_file)
    except FileNotFoundError:
        print(f"Error: File not found: {log_file}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
