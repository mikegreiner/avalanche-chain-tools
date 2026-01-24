#!/usr/bin/env python3
"""
Robust multicall decoder that properly matches request functions to response values
This will identify which functions return reward-like values
"""

import json
import sys
from collections import defaultdict
from typing import List, Dict, Optional, Tuple

def decode_multicall_request(calldata: str) -> Optional[List[Dict]]:
    """Decode Multicall3.aggregate() request"""
    if not calldata.startswith('0x82ad56cb'):
        return None
    
    hex_data = calldata[10:].lower()  # Remove selector
    
    try:
        # Structure: aggregate((address,bytes)[])
        # First 32 bytes = offset to array
        offset_hex = hex_data[:64]
        offset = int(offset_hex, 16)
        
        # Get array length
        length_pos = offset * 2
        if length_pos >= len(hex_data):
            return None
        
        length_hex = hex_data[length_pos:length_pos+64]
        length = int(length_hex, 16)
        
        calls = []
        data_pos = length_pos + 64
        
        for i in range(length):
            if data_pos >= len(hex_data):
                break
            
            # Each tuple: (address, bytes)
            # Address (32 bytes, right-aligned)
            addr_hex = hex_data[data_pos:data_pos+64]
            addr = '0x' + addr_hex[-40:]
            data_pos += 64
            
            # Bytes offset
            bytes_offset_hex = hex_data[data_pos:data_pos+64]
            bytes_offset = int(bytes_offset_hex, 16)
            data_pos += 64
            
            # Bytes data
            bytes_data_pos = (offset + bytes_offset) * 2
            if bytes_data_pos >= len(hex_data):
                break
            
            bytes_length_hex = hex_data[bytes_data_pos:bytes_data_pos+64]
            bytes_length = int(bytes_length_hex, 16)
            bytes_data_pos += 64
            
            # Round up to 32-byte boundary
            padded_length = ((bytes_length + 31) // 32) * 32
            if bytes_data_pos + (padded_length * 2) > len(hex_data):
                break
            
            bytes_data_hex = hex_data[bytes_data_pos:bytes_data_pos + (padded_length * 2)]
            bytes_data = '0x' + bytes_data_hex[:bytes_length * 2]
            
            # Extract function selector (first 4 bytes = 8 hex chars)
            selector = bytes_data[:10] if len(bytes_data) >= 10 else bytes_data
            
            # Extract arguments (if any)
            args = bytes_data[10:] if len(bytes_data) > 10 else ''
            
            calls.append({
                'index': i,
                'target': addr,
                'selector': selector,
                'calldata': bytes_data,
                'args': args
            })
        
        return calls
    except Exception as e:
        return None

def decode_multicall_response(response_hex: str) -> Optional[List[str]]:
    """Decode Multicall3.aggregate() response"""
    if not response_hex or response_hex == '0x':
        return None
    
    if response_hex.startswith('0x'):
        hex_data = response_hex[2:].lower()
    else:
        hex_data = response_hex.lower()
    
    try:
        # Structure: (uint256 blockNumber, bytes[] returnData)
        # First 32 bytes = offset to blockNumber
        # Next 32 bytes = blockNumber value
        # Next 32 bytes = offset to returnData array
        if len(hex_data) < 128:
            return None
        
        # Get returnData array offset
        return_data_offset_hex = hex_data[64:128]
        return_data_offset = int(return_data_offset_hex, 16)
        
        # Get returnData array length
        return_data_pos = return_data_offset * 2
        if return_data_pos >= len(hex_data):
            return None
        
        length_hex = hex_data[return_data_pos:return_data_pos+64]
        length = int(length_hex, 16)
        
        # Extract each returnData
        return_data_list = []
        data_pos = return_data_pos + 64
        
        for i in range(length):
            if data_pos >= len(hex_data):
                break
            
            # Each bytes has: offset (32 bytes) + length (32 bytes) + data
            # Get offset to this bytes data
            offset_hex = hex_data[data_pos:data_pos+64]
            offset = int(offset_hex, 16)
            data_pos += 64
            
            # Get the actual data
            actual_data_pos = (return_data_offset + offset) * 2
            if actual_data_pos >= len(hex_data):
                break
            
            length_hex = hex_data[actual_data_pos:actual_data_pos+64]
            data_length = int(length_hex, 16)
            actual_pos = actual_data_pos + 64
            
            # Round up to 32-byte boundary
            padded_length = ((data_length + 31) // 32) * 32
            if actual_pos + (padded_length * 2) > len(hex_data):
                break
            
            data_hex = hex_data[actual_pos:actual_pos + (padded_length * 2)]
            data = '0x' + data_hex[:data_length * 2]
            
            return_data_list.append(data)
        
        return return_data_list
    except Exception as e:
        return None

def extract_value_from_return_data(return_data: str) -> Optional[float]:
    """Extract uint256 value from return data and convert to USD"""
    if not return_data or return_data == '0x' or len(return_data) < 66:
        return None
    
    try:
        # First 32 bytes (64 hex chars) = uint256
        value_hex = return_data[2:66]
        value = int(value_hex, 16)
        
        # Filter for reasonable values (100 to 100M USD when divided by 1e18)
        if 1e20 < value < 1e27:
            usd_value = value / 1e18
            if 100 < usd_value < 100000000:
                return usd_value
    except:
        pass
    
    return None

def match_requests_to_responses(log_file: str) -> Dict:
    """Match multicall requests to responses and identify reward-returning functions"""
    print("="*80)
    print("ROBUST MULTICALL DECODER - MATCHING FUNCTIONS TO VALUES")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    print(f"\nAnalyzing {len(requests)} requests...\n")
    
    # Known function selectors
    KNOWN_SELECTORS = {
        "0xa7cac846": "weights(address)",
        "0xcc56b2c5": "getGauge(address)",
        "0x0dfe1681": "token0()",
        "0xd21220a7": "token1()",
        "0xedf59997": "tokens_per_week(uint256)",
        "0x7116c60c": "totalSupplyAtT(uint256)",
    }
    
    # Track which selectors return reward-like values
    selector_to_values = defaultdict(list)
    selector_to_targets = defaultdict(set)
    successful_matches = []
    
    for req_idx, req in enumerate(requests):
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
                data_field = params[0].get('data', '')
                
                if data_field and data_field.startswith('0x82ad56cb'):
                    # Decode request
                    calls = decode_multicall_request(data_field)
                    
                    # Decode response
                    if isinstance(response, dict):
                        result = response.get('result', '')
                    else:
                        result = str(response)
                    
                    return_data_list = decode_multicall_response(result)
                    
                    if calls and return_data_list and len(calls) == len(return_data_list):
                        # Match each call to its return value
                        for call, return_data in zip(calls, return_data_list):
                            value = extract_value_from_return_data(return_data)
                            
                            if value:
                                selector = call['selector']
                                target = call['target']
                                
                                selector_to_values[selector].append(value)
                                selector_to_targets[selector].add(target)
                                
                                func_name = KNOWN_SELECTORS.get(selector, f"unknown({selector})")
                                
                                successful_matches.append({
                                    'request_idx': req_idx,
                                    'target': target,
                                    'selector': selector,
                                    'function': func_name,
                                    'value': value
                                })
    
    # Summary
    print(f"✓ Successfully matched {len(successful_matches)} function calls to reward-like values\n")
    
    print("="*80)
    print("FUNCTIONS RETURNING REWARD-LIKE VALUES")
    print("="*80)
    
    if selector_to_values:
        for selector, values in sorted(selector_to_values.items(), key=lambda x: -len(x[1])):
            func_name = KNOWN_SELECTORS.get(selector, f"unknown({selector})")
            targets = selector_to_targets[selector]
            
            print(f"\n{selector} = {func_name}")
            print(f"  Called {len(values)} times")
            print(f"  On {len(targets)} different contracts")
            print(f"  Value range: ${min(values):,.2f} to ${max(values):,.2f}")
            print(f"  Average: ${sum(values)/len(values):,.2f}")
            
            # Show sample targets
            if len(targets) <= 5:
                print(f"  Targets: {', '.join(sorted(targets))}")
            else:
                print(f"  Targets: {len(targets)} contracts (e.g., {sorted(targets)[0]})")
    else:
        print("\n⚠️  No reward-like values found in matched calls")
    
    # Save results
    output = {
        'total_matches': len(successful_matches),
        'selectors': {
            sel: {
                'function': KNOWN_SELECTORS.get(sel, f"unknown({sel})"),
                'call_count': len(vals),
                'target_count': len(selector_to_targets[sel]),
                'min_value': min(vals),
                'max_value': max(vals),
                'avg_value': sum(vals)/len(vals),
                'targets': list(selector_to_targets[sel])
            }
            for sel, vals in selector_to_values.items()
        },
        'matches': successful_matches[:100]  # First 100
    }
    
    output_file = "multicall_function_matches.json"
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n✓ Results saved to: {output_file}")
    
    return output

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T02_34_55.027Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    match_requests_to_responses(log_file)
