#!/usr/bin/env python3
"""
Debug multicall structure by examining actual request/response pairs
"""

import json
import sys

def analyze_single_multicall(calldata, response_hex):
    """Analyze a single multicall request/response pair in detail"""
    print("="*80)
    print("ANALYZING MULTICALL STRUCTURE")
    print("="*80)
    
    print(f"\nRequest calldata length: {len(calldata)}")
    print(f"Response length: {len(response_hex)}")
    
    # Decode request manually
    if not calldata.startswith('0x82ad56cb'):
        print("Not a multicall aggregate request")
        return
    
    hex_data = calldata[10:].lower()
    print(f"\nRequest hex (first 200 chars): {hex_data[:200]}")
    
    # Try to decode
    try:
        offset = int(hex_data[:64], 16)
        print(f"Array offset: {offset}")
        
        length_pos = offset * 2
        length = int(hex_data[length_pos:length_pos+64], 16)
        print(f"Array length: {length}")
        
        print(f"\nFirst call structure:")
        data_pos = length_pos + 64
        
        # First address
        addr_hex = hex_data[data_pos:data_pos+64]
        addr = '0x' + addr_hex[-40:]
        print(f"  Target: {addr}")
        data_pos += 64
        
        # Bytes offset
        bytes_offset_hex = hex_data[data_pos:data_pos+64]
        bytes_offset = int(bytes_offset_hex, 16)
        print(f"  Bytes offset: {bytes_offset}")
        data_pos += 64
        
        # Bytes data
        bytes_data_pos = (offset + bytes_offset) * 2
        bytes_length_hex = hex_data[bytes_data_pos:bytes_data_pos+64]
        bytes_length = int(bytes_length_hex, 16)
        print(f"  Bytes length: {bytes_length}")
        bytes_data_pos += 64
        
        bytes_data_hex = hex_data[bytes_data_pos:bytes_data_pos + (bytes_length * 2)]
        bytes_data = '0x' + bytes_data_hex
        print(f"  Calldata: {bytes_data[:100]}...")
        print(f"  Selector: {bytes_data[:10]}")
    except Exception as e:
        print(f"Error decoding request: {e}")
    
    # Decode response
    if response_hex.startswith('0x'):
        resp_hex = response_hex[2:].lower()
    else:
        resp_hex = response_hex.lower()
    
    print(f"\nResponse hex (first 200 chars): {resp_hex[:200]}")
    
    try:
        # Block number offset
        block_offset = int(resp_hex[:64], 16)
        print(f"Block number offset: {block_offset}")
        
        # Block number value
        block_pos = block_offset * 2
        block_num = int(resp_hex[block_pos:block_pos+64], 16)
        print(f"Block number: {block_num}")
        
        # Return data array offset
        return_data_offset_hex = resp_hex[64:128]
        return_data_offset = int(return_data_offset_hex, 16)
        print(f"Return data array offset: {return_data_offset}")
        
        # Return data array length
        return_data_pos = return_data_offset * 2
        length_hex = resp_hex[return_data_pos:return_data_pos+64]
        length = int(length_hex, 16)
        print(f"Return data array length: {length}")
        
        if length > 0:
            print(f"\nFirst return value:")
            data_pos = return_data_pos + 64
            
            # First return data offset
            offset_hex = resp_hex[data_pos:data_pos+64]
            offset = int(offset_hex, 16)
            print(f"  Offset: {offset}")
            
            # First return data
            actual_pos = (return_data_offset + offset) * 2
            length_hex = resp_hex[actual_pos:actual_pos+64]
            data_length = int(length_hex, 16)
            print(f"  Length: {data_length}")
            
            actual_pos += 64
            data_hex = resp_hex[actual_pos:actual_pos + (data_length * 2)]
            return_data = '0x' + data_hex
            print(f"  Data: {return_data[:100]}...")
            
            # Try to interpret as value
            if len(return_data) >= 66:
                value = int(return_data[2:66], 16)
                usd = value / 1e18
                print(f"  As uint256: {value:,}")
                print(f"  As USD (if token): ${usd:,.2f}")
    except Exception as e:
        print(f"Error decoding response: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T02_34_55.027Z.json"
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    # Find a multicall with substantial response
    for req in data['requests'][:20]:
        body = req.get('requestBody', '')
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
                    
                    if result and len(result) > 1000:
                        analyze_single_multicall(data_field, result)
                        break
