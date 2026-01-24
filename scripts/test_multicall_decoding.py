#!/usr/bin/env python3
"""
Test multicall decoding with actual data from logs
"""

import json
import sys

def decode_multicall_request_simple(calldata: str):
    """Simplified decoder based on robust_multicall_decoder.py"""
    if not calldata.startswith('0x82ad56cb'):
        return None
    
    hex_data = calldata[10:].lower()  # Remove selector
    
    try:
        # First 32 bytes = offset to array
        offset_hex = hex_data[:64]
        offset = int(offset_hex, 16)
        print(f"Array offset: {offset}")
        
        # Get array length
        length_pos = offset * 2
        if length_pos >= len(hex_data):
            return None
        
        length_hex = hex_data[length_pos:length_pos+64]
        length = int(length_hex, 16)
        print(f"Array length: {length}")
        
        calls = []
        data_pos = length_pos + 64
        
        for i in range(min(length, 5)):  # First 5 only
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
            
            calls.append({
                'index': i,
                'target': addr,
                'selector': selector,
                'calldata': bytes_data[:100] + '...' if len(bytes_data) > 100 else bytes_data
            })
        
        return calls
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T04_12_17.619Z.json"
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    # Get first multicall request
    for req in data['requests']:
        body = req.get('requestBody', '')
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
                    print("="*80)
                    print("TESTING MULTICALL DECODING")
                    print("="*80)
                    print(f"\nRequest length: {len(data_field)}")
                    
                    calls = decode_multicall_request_simple(data_field)
                    if calls:
                        print(f"\n✓ Decoded {len(calls)} calls (showing first 5):\n")
                        for call in calls:
                            print(f"  [{call['index']}] Target: {call['target']}")
                            print(f"      Selector: {call['selector']}")
                            print(f"      Calldata: {call['calldata']}")
                            print()
                    else:
                        print("\n❌ Failed to decode")
                    break
