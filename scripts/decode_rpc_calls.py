#!/usr/bin/env python3
"""
Properly decode RPC calls from captured API logs
Uses eth-abi to decode ABI-encoded data in multicall requests
"""

import json
import sys
from typing import Dict, List, Optional

try:
    from eth_abi import decode as eth_abi_decode
    ETH_ABI_AVAILABLE = True
except ImportError:
    ETH_ABI_AVAILABLE = False

# Multicall3 contract address
MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11"

# Known function selectors
KNOWN_SELECTORS = {
    "0x82ad56cb": "Multicall3.aggregate((address,bytes)[])",
    "0xac9650d8": "Multicall3.tryAggregate(bool,(address,bytes)[])",
    "0xa7cac846": "weights(address)",  # Voter contract
    "0x96c82e57": "totalWeight()",
    "0x419074b2": "gauges(address)",
    "0x6430da65": "allPoolsLength()",
    "0x12065fe0": "allPools(uint256)",
    "0xcc56b2c5": "getGauge(address)",  # Appears in logs
}

def decode_multicall_aggregate(data_hex: str) -> List[Dict]:
    """
    Decode Multicall3.aggregate((address,bytes)[]) call data
    
    Function signature: aggregate((address,bytes)[]) returns (uint256,bytes[])
    """
    if not data_hex or not data_hex.startswith('0x'):
        return []
    
    # Remove function selector (first 4 bytes = 8 hex chars)
    if len(data_hex) < 10:  # 0x + 8 chars
        return []
    
    # Function selector is 0x82ad56cb
    if data_hex[:10] != '0x82ad56cb':
        return []
    
    # Get the parameter data (everything after selector)
    param_data = data_hex[10:]
    
    try:
        if ETH_ABI_AVAILABLE:
            # Use eth-abi to decode properly
            # The parameter is: (address,bytes)[]
            # We need to decode the ABI-encoded data
            param_bytes = bytes.fromhex(param_data)
            
            # Decode the dynamic array of tuples
            # Format: offset (32 bytes) -> length (32 bytes) -> [address (32), bytes_offset (32), ...]
            decoded = eth_abi_decode(['(address,bytes)[]'], param_bytes)
            calls_array = decoded[0]
            
            calls = []
            for i, (address, call_data) in enumerate(calls_array):
                # Extract function selector from call_data (first 4 bytes)
                if len(call_data) >= 4:
                    func_selector = '0x' + call_data[:4].hex()
                else:
                    func_selector = '0x00000000'
                
                calls.append({
                    'address': address,
                    'function_selector': func_selector,
                    'call_data_length': len(call_data),
                    'call_index': i
                })
            
            return calls
        else:
            # Manual decoding fallback (simpler approach)
            # ABI encoding for dynamic array of tuples:
            # - offset (32 bytes) = 0x20 (points to length)
            # - length (32 bytes) = number of elements
            # - For each tuple: address (32 bytes, left-padded), bytes offset (32 bytes)
            # - Then bytes data follows
            
            if len(param_data) < 64:
                return []
            
            # Read offset (should be 0x20 = 32)
            offset = int(param_data[:64], 16)
            
            if offset * 2 > len(param_data):
                return []
            
            # Read array length
            length_hex = param_data[offset * 2:(offset + 1) * 2]
            if not length_hex or len(length_hex) < 64:
                return []
            
            length = int(length_hex, 16)
            
            calls = []
            # Each tuple takes 64 bytes (address + bytes offset)
            # Then bytes data follows at calculated offsets
            tuple_start = (offset + 1) * 2  # Start after length
            
            for i in range(length):
                tuple_pos = tuple_start + (i * 128)  # Each tuple: 64 bytes address + 64 bytes offset
                
                if tuple_pos + 128 > len(param_data):
                    break
                
                # Read address (32 bytes, left-padded)
                addr_hex = param_data[tuple_pos:tuple_pos + 64]
                address = '0x' + addr_hex[-40:]  # Last 20 bytes
                
                # Read bytes offset
                bytes_offset_hex = param_data[tuple_pos + 64:tuple_pos + 128]
                bytes_offset = int(bytes_offset_hex, 16)
                
                # Calculate where bytes data starts (relative to start of param data)
                bytes_data_pos = bytes_offset * 2
                
                if bytes_data_pos + 64 > len(param_data):
                    break
                
                # Read bytes length
                bytes_length_hex = param_data[bytes_data_pos:bytes_data_pos + 64]
                bytes_length = int(bytes_length_hex, 16)
                
                # Read function selector (first 4 bytes of bytes data)
                func_data_pos = bytes_data_pos + 64
                if func_data_pos + 8 <= len(param_data):
                    func_selector = '0x' + param_data[func_data_pos:func_data_pos + 8]
                else:
                    func_selector = '0x00000000'
                
                calls.append({
                    'address': address,
                    'function_selector': func_selector,
                    'call_data_length': bytes_length,
                    'call_index': i
                })
            
            return calls
    
    except (ValueError, IndexError, Exception) as e:
        # Silently return empty on decode errors
        return []

def analyze_rpc_request(request: Dict) -> Dict:
    """Analyze a single RPC request and extract information"""
    result = {
        'method': None,
        'contract': None,
        'function_selector': None,
        'is_multicall': False,
        'multicall_calls': []
    }
    
    request_body = request.get('requestBody', '')
    if not request_body:
        return result
    
    try:
        rpc_data = json.loads(request_body)
        result['method'] = rpc_data.get('method')
        
        params = rpc_data.get('params', [])
        if not params:
            return result
        
        # Get the call parameter
        call_param = params[0] if isinstance(params, list) else params
        if isinstance(call_param, dict):
            contract = call_param.get('to', '')
            data = call_param.get('data', '')
            
            result['contract'] = contract
            
            if data and len(data) >= 10:
                result['function_selector'] = data[:10]
                
                # Check if it's a multicall
                if (contract.lower() == MULTICALL3.lower() and 
                    result['function_selector'] == '0x82ad56cb'):
                    result['is_multicall'] = True
                    result['multicall_calls'] = decode_multicall_aggregate(data)
        
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        pass
    
    return result

def analyze_log_file(log_file: str) -> Dict:
    """Analyze API log file and decode RPC calls"""
    print("="*80)
    print("RPC CALL DECODER")
    print("="*80)
    
    if not ETH_ABI_AVAILABLE:
        print("\n⚠ Warning: eth-abi not available. Install with: pip install eth-abi")
        print("Basic analysis will still work, but multicall decoding will be limited.\n")
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    print(f"\nTotal requests: {len(requests)}")
    
    # Find RPC calls
    rpc_requests = []
    for req in requests:
        analysis = req.get('analysis', {}) or {}
        if analysis.get('isRpcCall'):
            rpc_requests.append(req)
    
    print(f"RPC calls found: {len(rpc_requests)}\n")
    
    # Analyze RPC calls
    all_contracts = set()
    all_selectors = set()
    contract_selector_pairs = {}
    multicall_requests = []
    
    for req in rpc_requests:
        decoded = analyze_rpc_request(req)
        
        if decoded['contract']:
            all_contracts.add(decoded['contract'])
        
        if decoded['function_selector']:
            all_selectors.add(decoded['function_selector'])
        
        if decoded['is_multicall']:
            multicall_requests.append({
                'request': req,
                'decoded': decoded
            })
            
            # Count contracts and selectors in multicall
            for call in decoded['multicall_calls']:
                addr = call['address']
                selector = call['function_selector']
                all_contracts.add(addr)
                all_selectors.add(selector)
                
                key = f"{addr}:{selector}"
                contract_selector_pairs[key] = contract_selector_pairs.get(key, 0) + 1
        else:
            # Single call
            if decoded['contract'] and decoded['function_selector']:
                key = f"{decoded['contract']}:{decoded['function_selector']}"
                contract_selector_pairs[key] = contract_selector_pairs.get(key, 0) + 1
    
    # Display results
    print("="*80)
    print("MULTICALL ANALYSIS")
    print("="*80)
    print(f"\nMulticall requests found: {len(multicall_requests)}\n")
    
    for i, mc in enumerate(multicall_requests[:5]):  # Show first 5
        decoded = mc['decoded']
        calls = decoded['multicall_calls']
        
        print(f"Multicall Request #{i+1}:")
        print(f"  Contains {len(calls)} individual calls\n")
        
        # Group by contract
        by_contract = {}
        for call in calls:
            addr = call['address']
            if addr not in by_contract:
                by_contract[addr] = []
            by_contract[addr].append(call)
        
        # Show top contracts
        sorted_contracts = sorted(by_contract.items(), key=lambda x: -len(x[1]))[:10]
        
        for addr, contract_calls in sorted_contracts:
            selectors = set(c['function_selector'] for c in contract_calls)
            print(f"  {addr}")
            print(f"    Calls: {len(contract_calls)}")
            print(f"    Functions: {', '.join(selectors)}")
            for sel in selectors:
                name = KNOWN_SELECTORS.get(sel, "Unknown")
                count = sum(1 for c in contract_calls if c['function_selector'] == sel)
                print(f"      - {sel} ({name}): {count}x")
        print()
    
    # Summary
    print("="*80)
    print("SUMMARY")
    print("="*80)
    print(f"\nUnique contracts called: {len(all_contracts)}")
    for addr in sorted(all_contracts)[:30]:
        print(f"  {addr}")
    
    print(f"\nUnique function selectors: {len(all_selectors)}")
    for selector in sorted(all_selectors):
        name = KNOWN_SELECTORS.get(selector, "Unknown")
        print(f"  {selector} - {name}")
    
    print(f"\nMost common contract:selector pairs:")
    for pair, count in sorted(contract_selector_pairs.items(), key=lambda x: -x[1])[:20]:
        addr, selector = pair.split(':')
        selector_name = KNOWN_SELECTORS.get(selector, "Unknown")
        print(f"  {count:4d}x {addr[:42]:42s} : {selector} ({selector_name})")
    
    # Check for Voter contract
    VOTER = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"
    voter_calls = [addr for addr in all_contracts if addr.lower() == VOTER.lower()]
    if voter_calls:
        print(f"\n✓ Voter contract ({VOTER}) is being called!")
        print("  This is likely how pool weights are fetched.")
    
    return {
        'contracts': list(all_contracts),
        'selectors': list(all_selectors),
        'pairs': contract_selector_pairs,
        'multicall_count': len(multicall_requests)
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        log_file = "ai-tmp/blackhole-api-logs-2026-01-20T01_52_45.591Z.json"
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
