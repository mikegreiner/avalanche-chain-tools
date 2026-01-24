#!/usr/bin/env python3
"""
Find which specific function calls in multicalls return the reward values
Match request selectors to response values
"""

import json
import sys
import re
from collections import defaultdict

def decode_multicall_structure(calldata, response_hex):
    """Decode multicall and match calls to responses"""
    if not calldata.startswith('0x82ad56cb'):
        return None
    
    hex_data = calldata[10:]
    
    # Extract calls from request
    calls = []
    try:
        # Get array offset
        offset = int(hex_data[:64], 16)
        length_pos = offset * 2
        length = int(hex_data[length_pos:length_pos+64], 16)
        
        data_pos = length_pos + 64
        for i in range(length):
            # Address (32 bytes)
            addr_hex = hex_data[data_pos:data_pos+64]
            addr = '0x' + addr_hex[-40:]
            data_pos += 64
            
            # Bytes offset
            bytes_offset = int(hex_data[data_pos:data_pos+64], 16)
            data_pos += 64
            
            # Bytes data
            bytes_data_pos = bytes_offset * 2
            bytes_length = int(hex_data[bytes_data_pos:bytes_data_pos+64], 16)
            bytes_data_pos += 64
            padded_length = ((bytes_length + 31) // 32) * 32
            bytes_data_hex = hex_data[bytes_data_pos:bytes_data_pos + (padded_length * 2)]
            bytes_data = '0x' + bytes_data_hex[:bytes_length * 2]
            
            # Extract selector
            selector = bytes_data[:10] if len(bytes_data) >= 10 else bytes_data
            
            calls.append({
                'index': i,
                'target': addr,
                'selector': selector,
                'calldata': bytes_data
            })
    except:
        return None
    
    # Decode response
    if response_hex.startswith('0x'):
        resp_hex = response_hex[2:]
    else:
        resp_hex = response_hex
    
    return_values = []
    try:
        # Get returnData array
        return_data_offset = int(resp_hex[64:128], 16)
        return_data_pos = return_data_offset * 2
        length = int(resp_hex[return_data_pos:return_data_pos+64], 16)
        
        data_pos = return_data_pos + 64
        for i in range(length):
            if data_pos >= len(resp_hex):
                break
            
            offset = int(resp_hex[data_pos:data_pos+64], 16)
            data_pos += 64
            
            actual_pos = (return_data_offset + offset) * 2
            if actual_pos >= len(resp_hex):
                break
            
            data_length = int(resp_hex[actual_pos:actual_pos+64], 16)
            actual_pos += 64
            padded_length = ((data_length + 31) // 32) * 32
            data_hex = resp_hex[actual_pos:actual_pos + (padded_length * 2)]
            return_data = '0x' + data_hex[:data_length * 2]
            
            # Extract value
            value = None
            if len(return_data) >= 66:  # 0x + 64 chars
                try:
                    raw_value = int(return_data[2:66], 16)
                    if 1e20 < raw_value < 1e27:
                        value = raw_value / 1e18
                except:
                    pass
            
            return_values.append({
                'index': i,
                'return_data': return_data,
                'value': value
            })
    except:
        pass
    
    # Match calls to return values
    matches = []
    for call, ret in zip(calls, return_values):
        matches.append({
            'target': call['target'],
            'selector': call['selector'],
            'value': ret['value']
        })
    
    return matches

def analyze_multicalls(log_file):
    """Analyze all multicalls to find reward-returning functions"""
    print("="*80)
    print("FINDING FUNCTIONS THAT RETURN REWARD VALUES")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    
    selector_to_values = defaultdict(list)
    
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
                data_field = params[0].get('data', '')
                
                if data_field and data_field.startswith('0x82ad56cb'):
                    if isinstance(response, dict):
                        result = response.get('result', '')
                    else:
                        result = str(response)
                    
                    matches = decode_multicall_structure(data_field, result)
                    if matches:
                        for match in matches:
                            if match['value'] and 100 < match['value'] < 100000000:
                                selector_to_values[match['selector']].append({
                                    'target': match['target'],
                                    'value': match['value']
                                })
    
    # Summary
    print(f"\nFound {len(selector_to_values)} selectors returning reward-like values:\n")
    
    KNOWN_SELECTORS = {
        "0xa7cac846": "weights(address)",
        "0xcc56b2c5": "getGauge(address)",
        "0xedf59997": "tokens_per_week(uint256)",
        "0x7116c60c": "totalSupplyAtT(uint256)",
    }
    
    for selector, values in sorted(selector_to_values.items(), key=lambda x: -len(x[1])):
        func_name = KNOWN_SELECTORS.get(selector, f"unknown({selector})")
        print(f"{selector} ({func_name}): {len(values)} calls")
        if values:
            sample = [v['value'] for v in values[:5]]
            print(f"  Sample values: {[f'${v:,.2f}' for v in sample]}")
            print()
    
    return selector_to_values

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T02_34_55.027Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    from collections import defaultdict
    analyze_multicalls(log_file)
