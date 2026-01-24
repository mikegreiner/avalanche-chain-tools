#!/usr/bin/env python3
"""
Properly decode multicall requests using web3.py to see what functions are called
"""

import json
import sys
from web3 import Web3
from collections import Counter

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11"

# Multicall3 ABI
MULTICALL3_ABI = [
    {
        "inputs": [
            {
                "components": [
                    {"name": "target", "type": "address"},
                    {"name": "callData", "type": "bytes"}
                ],
                "name": "calls",
                "type": "tuple[]"
            }
        ],
        "name": "aggregate",
        "outputs": [
            {"name": "blockNumber", "type": "uint256"},
            {"name": "returnData", "type": "bytes[]"}
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]

# Known function selectors
KNOWN_SELECTORS = {
    "0xa7cac846": "weights(address)",
    "0x96c82e57": "totalWeight()",
    "0x0dfe1681": "token0()",
    "0xd21220a7": "token1()",
    "0xcc56b2c5": "getGauge(address)",
    "0x419074b2": "gauges(address)",
    "0x3850c7bd": "slot0()",
    "0x0902f1ac": "getReserves()",
}

def decode_multicall_request_manual(calldata):
    """Manually decode multicall request by parsing hex"""
    # Remove selector
    if not calldata.startswith('0x82ad56cb'):
        return None
    
    hex_data = calldata[10:]  # Remove selector
    
    # ABI encoding for (address,bytes)[]
    # First 32 bytes = offset to array
    # Next 32 bytes = array length
    # Then array of (address, bytes) tuples
    
    try:
        # Get array offset (first 32 bytes)
        offset_hex = hex_data[:64]
        offset = int(offset_hex, 16)
        
        # Get array length (at offset position)
        length_pos = offset * 2
        if length_pos >= len(hex_data):
            return None
        
        length_hex = hex_data[length_pos:length_pos+64]
        length = int(length_hex, 16)
        
        calls = []
        data_pos = length_pos + 64  # After length
        
        for i in range(length):
            # Each tuple: (address, bytes)
            # Address is 32 bytes (64 hex chars)
            addr_hex = hex_data[data_pos:data_pos+64]
            addr = '0x' + addr_hex[-40:]  # Last 20 bytes
            
            data_pos += 64
            
            # Bytes offset (32 bytes)
            bytes_offset_hex = hex_data[data_pos:data_pos+64]
            bytes_offset = int(bytes_offset_hex, 16)
            data_pos += 64
            
            # Bytes length and data are at bytes_offset
            bytes_data_pos = bytes_offset * 2
            bytes_length_hex = hex_data[bytes_data_pos:bytes_data_pos+64]
            bytes_length = int(bytes_length_hex, 16)
            
            bytes_data_pos += 64
            # Round up to 32-byte boundary
            bytes_data_len = ((bytes_length + 31) // 32) * 32
            bytes_data_hex = hex_data[bytes_data_pos:bytes_data_pos + (bytes_data_len * 2)]
            bytes_data = '0x' + bytes_data_hex[:bytes_length * 2]
            
            calls.append((addr, bytes_data))
        
        return calls
    except Exception as e:
        return None

def decode_multicall_request(w3, calldata):
    """Decode multicall request - try manual first"""
    calls = decode_multicall_request_manual(calldata)
    if calls:
        return calls
    
    # Fallback to web3.py
    try:
        multicall = w3.eth.contract(address=Web3.to_checksum_address(MULTICALL3), abi=MULTICALL3_ABI)
        func_obj, func_params = multicall.decode_function_input(calldata)
        if func_obj.fn_name == "aggregate":
            return func_params['calls']
    except:
        pass
    
    return None

def analyze_call(target, calldata):
    """Analyze a single call"""
    selector = calldata[:10] if len(calldata) >= 10 else calldata
    
    func_name = KNOWN_SELECTORS.get(selector, f"unknown({selector})")
    
    # Extract address argument if present
    arg_address = None
    if len(calldata) >= 74:  # selector + address
        try:
            addr_hex = '0x' + calldata[34:74]
            arg_address = Web3.to_checksum_address(addr_hex)
        except:
            pass
    
    return {
        'target': target,
        'selector': selector,
        'function': func_name,
        'arg_address': arg_address
    }

def analyze_log_file(log_file):
    """Analyze multicall requests from log file"""
    print("="*80)
    print("PROPERLY DECODING MULTICALL REQUESTS")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    print(f"\nFound {len(requests)} requests\n")
    
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    
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
                    if data_field and data_field.startswith('0x82ad56cb'):
                        multicalls.append({
                            'request': body,
                            'data': data_field
                        })
    
    print(f"Found {len(multicalls)} multicall requests\n")
    
    # Analyze first few in detail
    all_calls = []
    target_counter = Counter()
    selector_counter = Counter()
    
    for i, item in enumerate(multicalls[:10]):
        print(f"\n{'='*80}")
        print(f"MULTICALL {i+1}")
        print(f"{'='*80}")
        
        calls = decode_multicall_request(w3, item['data'])
        if not calls:
            print("  Could not decode")
            continue
        
        print(f"  Decoded {len(calls)} calls:\n")
        
        for j, (target, calldata) in enumerate(calls):
            analysis = analyze_call(target, calldata)
            print(f"  Call {j+1}:")
            print(f"    Target: {analysis['target']}")
            print(f"    Function: {analysis['function']}")
            if analysis['arg_address']:
                print(f"    Argument: {analysis['arg_address']}")
            print()
            
            all_calls.append(analysis)
            target_counter[analysis['target'].lower()] += 1
            selector_counter[analysis['selector']] += 1
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    print(f"\nTotal calls analyzed: {len(all_calls)}")
    
    print(f"\nTop 10 target contracts:")
    for target, count in target_counter.most_common(10):
        print(f"  {target}: {count} calls")
    
    print(f"\nTop 10 function selectors:")
    for selector, count in selector_counter.most_common(10):
        func_name = KNOWN_SELECTORS.get(selector, 'unknown')
        print(f"  {selector} ({func_name}): {count} calls")
    
    # Look for reward-related patterns
    print(f"\n{'='*80}")
    print("REWARD-RELATED PATTERNS")
    print(f"{'='*80}")
    
    # Check if we're calling functions on pool contracts
    pool_contracts = [c for c in all_calls if c['function'] in ['token0()', 'token1()', 'getReserves()', 'slot0()']]
    if pool_contracts:
        print(f"\n✓ Found {len(pool_contracts)} calls to pool contracts")
        print("  These might be pool addresses we can query for fees/rewards")
    
    # Check for gauge calls
    gauge_calls = [c for c in all_calls if 'gauge' in c['function'].lower()]
    if gauge_calls:
        print(f"\n✓ Found {len(gauge_calls)} gauge-related calls")
        for call in gauge_calls[:5]:
            print(f"  {call['function']} on {call['target']}")

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
