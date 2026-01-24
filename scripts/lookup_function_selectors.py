#!/usr/bin/env python3
"""
Look up what functions these selectors correspond to
Use 4byte.directory or known function signatures
"""

# Common function signatures and their selectors
FUNCTION_SIGNATURES = {
    # Voter contract
    "weights(address)": "0xa7cac846",
    "totalWeight()": "0x96c82e57",
    "gauges(address)": "0x419074b2",
    "getGauge(address)": "0xcc56b2c5",
    
    # Pool contracts
    "token0()": "0x0dfe1681",
    "token1()": "0xd21220a7",
    "fee()": "0xddca3f43",
    "slot0()": "0x3850c7bd",
    "getReserves()": "0x0902f1ac",
    
    # Token contracts
    "symbol()": "0x95d89b41",
    "name()": "0x06fdde03",
    "decimals()": "0x313ce567",
    "balanceOf(address)": "0x70a08231",
    "totalSupply()": "0x18160ddd",
    
    # Reward-related (common patterns)
    "claimable()": "0x379607f5",
    "earned(address)": "0x3d18b912",
    "rewardRate()": "0x7b9c3b7f",
    "rewards(address)": "0x3a46b1a8",
    "totalRewards()": "0x5c60da1b",
    "emission()": "0x5c60da1b",
    "emissionRate()": "0x5c60da1b",
    
    # Bribe-related
    "bribe()": "0x8d8e4c8e",
    "bribes(address)": "0x8d8e4c8e",
    
    # Other common
    "owner()": "0x8da5cb5b",
    "factory()": "0xc45a0155",
}

# Reverse lookup: selector -> function name
SELECTOR_TO_FUNCTION = {v: k for k, v in FUNCTION_SIGNATURES.items()}

def identify_selectors_in_multicall(log_file):
    """Identify all function selectors used in multicalls"""
    import json
    import re
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    
    all_selectors = set()
    selector_contexts = defaultdict(list)
    
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
                data_field = params[0].get('data', '')
                
                if data_field and data_field.startswith('0x82ad56cb'):
                    # Extract selectors (8 hex chars after 0x)
                    hex_data = data_field[10:]
                    
                    # Find all 8-char sequences
                    for match in re.finditer(r'[0-9a-f]{8}', hex_data, re.IGNORECASE):
                        selector = '0x' + match.group().lower()
                        
                        # Filter out obvious padding
                        if selector not in ['0x00000000', '0xffffffff', '0x00000001']:
                            all_selectors.add(selector)
                            
                            # Get context (nearby data)
                            start = max(0, match.start() - 20)
                            end = min(len(hex_data), match.end() + 20)
                            context = hex_data[start:end]
                            selector_contexts[selector].append(context[:50])
    
    print("="*80)
    print("FUNCTION SELECTORS FOUND IN MULTICALLS")
    print("="*80)
    
    print(f"\nFound {len(all_selectors)} unique selectors\n")
    
    # Identify known selectors
    known = {}
    unknown = []
    
    for selector in sorted(all_selectors):
        func_name = SELECTOR_TO_FUNCTION.get(selector)
        if func_name:
            known[selector] = func_name
        else:
            unknown.append(selector)
    
    print("Known functions:")
    for selector, func_name in sorted(known.items()):
        count = len(selector_contexts[selector])
        print(f"  {selector} = {func_name} (appears {count} times)")
    
    print(f"\nUnknown selectors ({len(unknown)}):")
    for selector in sorted(unknown)[:30]:
        count = len(selector_contexts[selector])
        print(f"  {selector} (appears {count} times)")
        # Show sample context
        if selector_contexts[selector]:
            print(f"    Context: ...{selector_contexts[selector][0]}...")
    
    return known, unknown

if __name__ == "__main__":
    import sys
    from collections import defaultdict
    
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T02_34_55.027Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    identify_selectors_in_multicall(log_file)
