#!/usr/bin/env python3
"""
Identify which function calls in multicall requests return reward values
Match request function selectors with response values
"""

import json
import sys
from collections import defaultdict

def decode_multicall_request_manual(calldata):
    """Manually decode multicall request"""
    if not calldata.startswith('0x82ad56cb'):
        return None
    
    hex_data = calldata[10:]  # Remove selector
    
    try:
        # Get array offset
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
            # Each tuple: (address, bytes)
            # Address (32 bytes)
            addr_hex = hex_data[data_pos:data_pos+64]
            addr = '0x' + addr_hex[-40:]
            data_pos += 64
            
            # Bytes offset
            bytes_offset_hex = hex_data[data_pos:data_pos+64]
            bytes_offset = int(bytes_offset_hex, 16)
            data_pos += 64
            
            # Bytes length and data
            bytes_data_pos = bytes_offset * 2
            bytes_length_hex = hex_data[bytes_data_pos:bytes_data_pos+64]
            bytes_length = int(bytes_length_hex, 16)
            
            bytes_data_pos += 64
            bytes_data_len = ((bytes_length + 31) // 32) * 32
            bytes_data_hex = hex_data[bytes_data_pos:bytes_data_pos + (bytes_data_len * 2)]
            bytes_data = '0x' + bytes_data_hex[:bytes_length * 2]
            
            # Extract function selector (first 4 bytes = 8 hex chars)
            selector = bytes_data[:10] if len(bytes_data) >= 10 else bytes_data
            
            calls.append({
                'target': addr,
                'selector': selector,
                'calldata': bytes_data
            })
        
        return calls
    except:
        return None

def decode_multicall_response_manual(response_hex):
    """Manually decode multicall response"""
    if not response_hex or response_hex == '0x':
        return None
    
    if response_hex.startswith('0x'):
        hex_data = response_hex[2:]
    else:
        hex_data = response_hex
    
    try:
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
            actual_data_pos += 64
            
            # Round up to 32-byte boundary
            padded_length = ((data_length + 31) // 32) * 32
            data_hex = hex_data[actual_data_pos:actual_data_pos + (padded_length * 2)]
            data = '0x' + data_hex[:data_length * 2]
            
            return_data_list.append(data)
        
        return return_data_list
    except:
        return None

def extract_value_from_return_data(return_data):
    """Extract uint256 value from return data"""
    if not return_data or return_data == '0x':
        return None
    
    hex_data = return_data[2:] if return_data.startswith('0x') else return_data
    
    if len(hex_data) >= 64:
        try:
            value = int(hex_data[:64], 16)
            if 1e15 < value < 1e30:
                return value / 1e18
        except:
            pass
    
    return None

def match_functions_to_values(log_file):
    """Match function calls to their return values"""
    print("="*80)
    print("MATCHING FUNCTIONS TO RETURN VALUES")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    
    # Known selectors
    KNOWN_SELECTORS = {
        "0xa7cac846": "weights(address)",
        "0xcc56b2c5": "getGauge(address)",
        "0x0dfe1681": "token0()",
        "0xd21220a7": "token1()",
    }
    
    selector_to_values = defaultdict(list)
    
    for req in requests[:20]:  # Analyze first 20
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
                    calls = decode_multicall_request_manual(data_field)
                    
                    # Decode response
                    if isinstance(response, dict):
                        result = response.get('result', '')
                    else:
                        result = str(response)
                    
                    return_data_list = decode_multicall_response_manual(result)
                    
                    if calls and return_data_list and len(calls) == len(return_data_list):
                        for call, return_data in zip(calls, return_data_list):
                            selector = call['selector']
                            value = extract_value_from_return_data(return_data)
                            
                            if value and 100 < value < 100000000:
                                func_name = KNOWN_SELECTORS.get(selector, f"unknown({selector})")
                                selector_to_values[func_name].append({
                                    'target': call['target'],
                                    'value': value
                                })
    
    # Summary
    print("\n" + "="*80)
    print("FUNCTIONS RETURNING REWARD-LIKE VALUES")
    print("="*80)
    
    for func_name, values in selector_to_values.items():
        print(f"\n{func_name}: {len(values)} calls with values")
        if values:
            sample_values = [v['value'] for v in values[:10]]
            print(f"  Sample values: {[f'${v:,.2f}' for v in sample_values]}")
    
    return selector_to_values

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T02_34_55.027Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    try:
        match_functions_to_values(log_file)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
