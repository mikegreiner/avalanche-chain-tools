#!/usr/bin/env python3
"""
Analyze multicall RPC requests to discover which contracts and functions
are being called to fetch pool data (especially vAMM/sAMM pools)
"""

import json
import sys
from web3 import Web3

# Multicall3 contract address
MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11"

# Known function selectors
KNOWN_SELECTORS = {
    "0x82ad56cb": "Multicall3.aggregate() or tryAggregate()",
    "0xa7cac846": "weights(address)",  # Voter contract
    "0x96c82e57": "totalWeight()",
    "0x419074b2": "gauges(address)",
    "0x6430da65": "allPoolsLength()",
    "0x12065fe0": "allPools(uint256)",
}

def decode_multicall_data(data_hex):
    """Decode multicall data to extract individual calls"""
    if not data_hex or not data_hex.startswith('0x'):
        return []
    
    # Remove 0x prefix
    data = data_hex[2:]
    
    # The first 4 bytes are the function selector
    if len(data) < 8:
        return []
    
    selector = '0x' + data[:8]
    
    # If it's the aggregate function, decode the parameters
    if selector == '0x82ad56cb':
        # aggregate((address,bytes)[]) returns (uint256,bytes[])
        # The data after selector is ABI-encoded array
        # This is complex to decode manually, but we can try to extract addresses
        
        calls = []
        # Skip selector (8 chars = 4 bytes)
        param_data = data[8:]
        
        # Try to find addresses in the data (they appear as 40 hex chars)
        # Addresses in ABI encoding are padded to 32 bytes (64 hex chars)
        i = 0
        while i < len(param_data) - 64:
            # Look for potential address (starts with 0x, then 40 hex chars)
            # In ABI encoding, addresses are left-padded with zeros
            potential_addr = param_data[i:i+64]
            if potential_addr[:24] == '0' * 24:  # Left padding
                addr_hex = potential_addr[24:64]
                if all(c in '0123456789abcdef' for c in addr_hex):
                    addr = '0x' + addr_hex
                    # Check if this looks like a valid address
                    if len(addr) == 42:
                        # Try to find the function selector after this address
                        if i + 64 < len(param_data) - 8:
                            func_sel = '0x' + param_data[i+64:i+72]
                            calls.append({
                                'address': addr,
                                'function_selector': func_sel,
                                'offset': i
                            })
            i += 1
        
        return calls
    
    return []

def analyze_log_file(log_file):
    """Analyze the API log file for multicall patterns"""
    print("="*80)
    print("MULTICALL RPC ANALYSIS")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    
    print(f"\nTotal requests: {len(requests)}")
    
    # Find all multicall requests
    multicall_requests = []
    for req in requests:
        analysis = req.get('analysis', {}) or {}
        contract_addr = analysis.get('contractAddress', '') or ''
        func_sel = analysis.get('functionSelector', '')
        if (contract_addr and contract_addr.lower() == MULTICALL3.lower()) or func_sel == '0x82ad56cb':
            multicall_requests.append(req)
    
    print(f"Multicall requests found: {len(multicall_requests)}\n")
    
    # Analyze each multicall
    all_contracts = set()
    all_selectors = set()
    contract_selector_pairs = {}
    
    for i, req in enumerate(multicall_requests[:10]):  # Analyze first 10
        request_body = req.get('requestBody', '')
        
        if not request_body:
            continue
        
        try:
            rpc_data = json.loads(request_body)
            params = rpc_data.get('params', [])
            
            if params and len(params) > 0:
                call_param = params[0]
                if isinstance(call_param, dict):
                    call_data = call_param.get('data', '')
                    
                    # Decode the multicall
                    calls = decode_multicall_data(call_data)
                    
                    if calls:
                        print(f"Multicall Request #{i+1}:")
                        print(f"  Contains {len(calls)} individual calls")
                        
                        for call in calls[:5]:  # Show first 5
                            addr = call['address']
                            selector = call['function_selector']
                            
                            all_contracts.add(addr)
                            all_selectors.add(selector)
                            
                            key = f"{addr}:{selector}"
                            contract_selector_pairs[key] = contract_selector_pairs.get(key, 0) + 1
                            
                            selector_name = KNOWN_SELECTORS.get(selector, "Unknown")
                            print(f"    → {addr}")
                            print(f"      Function: {selector} ({selector_name})")
                        
                        if len(calls) > 5:
                            print(f"    ... and {len(calls) - 5} more calls")
                        print()
        except Exception as e:
            print(f"Error analyzing request {i+1}: {e}")
            continue
    
    # Summary
    print("="*80)
    print("SUMMARY")
    print("="*80)
    print(f"\nUnique contracts called: {len(all_contracts)}")
    for addr in sorted(all_contracts)[:20]:
        print(f"  {addr}")
    
    print(f"\nUnique function selectors: {len(all_selectors)}")
    for selector in sorted(all_selectors):
        name = KNOWN_SELECTORS.get(selector, "Unknown")
        print(f"  {selector} - {name}")
    
    print(f"\nMost common contract:selector pairs:")
    for pair, count in sorted(contract_selector_pairs.items(), key=lambda x: -x[1])[:10]:
        addr, selector = pair.split(':')
        selector_name = KNOWN_SELECTORS.get(selector, "Unknown")
        print(f"  {count:3d}x {addr[:20]}... : {selector} ({selector_name})")
    
    # Check if Voter contract is being called
    VOTER = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"
    voter_calls = [addr for addr in all_contracts if addr.lower() == VOTER.lower()]
    if voter_calls:
        print(f"\n✓ Voter contract ({VOTER}) is being called!")
        print("  This is likely how pool weights are fetched.")
    
    # Recommendations
    print("\n" + "="*80)
    print("RECOMMENDATIONS")
    print("="*80)
    print("\n1. The site uses Multicall3 to batch RPC calls efficiently")
    print("2. Pool data (including vAMM/sAMM) is likely fetched via RPC, not HTTP API")
    print("3. To discover vAMM/sAMM pools:")
    print("   - Look for factory contracts that create these pools")
    print("   - Check if there's a registry contract that lists all pools")
    print("   - Monitor RPC calls when vAMM/sAMM pools appear in the UI")
    print("   - Check the voter contract for pool registration")
    
    return {
        'contracts': list(all_contracts),
        'selectors': list(all_selectors),
        'pairs': contract_selector_pairs
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        log_file = "ai-tmp/blackhole-api-logs-2026-01-20T01_45_37.866Z.json"
        print(f"No file specified, using: {log_file}")
    else:
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
