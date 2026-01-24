#!/usr/bin/env python3
"""
Improved Multicall3 Response Decoder
Properly decodes the aggregate() return data structure:
  aggregate((address,bytes)[]) returns (uint256 blockNumber, (bool success, bytes returnData)[])

This should match function calls to their return values correctly.
"""

import json
import sys
from web3 import Web3
# We'll decode manually - eth_abi is complex for nested structures
from typing import List, Dict, Tuple, Optional

# Multicall3 contract
MULTICALL3_ADDRESS = "0xca11bde05977b3631167028862be2a173976ca11"
AGGREGATE_SELECTOR = "0x82ad56cb"

# Known function selectors
KNOWN_SELECTORS = {
    "0xa7cac846": "weights(address)",
    "0xcc56b2c5": "getGauge(address)",
    "0x0dfe1681": "token0()",
    "0xd21220a7": "token1()",
    "0xddca3f43": "fee()",
    "0x1a686502": "liquidity()",
    "0x18160ddd": "totalSupply()",
    "0xedf59997": "tokens_per_week(uint256)",
    "0x7116c60c": "totalSupplyAtT(uint256)",
}

def decode_multicall_response(response_hex: str) -> Tuple[int, List[Tuple[bool, str]]]:
    """
    Decode Multicall3 aggregate() response
    Returns: (blockNumber, [(success, returnData), ...])
    """
    if not response_hex or response_hex == "0x":
        return 0, []
    
    # Remove 0x prefix
    hex_data = response_hex[2:] if response_hex.startswith("0x") else response_hex
    
    if len(hex_data) < 64:
        return 0, []
    
    try:
        # First 32 bytes: blockNumber (uint256)
        block_number_hex = hex_data[:64]
        block_number = int(block_number_hex, 16)
        
        # Rest: array of (bool, bytes)
        # Array encoding: offset (32 bytes) + length (32 bytes) + data
        offset_hex = hex_data[64:128]
        offset = int(offset_hex, 16)
        
        # Calculate where array data starts
        array_start = offset * 2  # offset is in bytes, hex_data is in hex chars
        
        if array_start >= len(hex_data):
            return block_number, []
        
        # Get array length
        length_hex = hex_data[array_start:array_start + 64]
        length = int(length_hex, 16)
        
        results = []
        current_pos = array_start + 64  # After length
        
        for i in range(length):
            # Each element is a tuple: (bool, bytes)
            # Tuple encoding: offset to tuple data (32 bytes) + tuple data
            
            # Get offset to this tuple
            tuple_offset_hex = hex_data[current_pos:current_pos + 64]
            tuple_offset = int(tuple_offset_hex, 16)
            tuple_start = (offset + tuple_offset) * 2
            
            if tuple_start >= len(hex_data):
                break
            
            # Decode tuple: (bool, bytes)
            # Bool is 32 bytes (padded)
            bool_hex = hex_data[tuple_start:tuple_start + 64]
            success = int(bool_hex, 16) != 0
            
            # Bytes: offset (32 bytes) + length (32 bytes) + data
            bytes_offset_hex = hex_data[tuple_start + 64:tuple_start + 128]
            bytes_offset = int(bytes_offset_hex, 16)
            bytes_data_start = tuple_start + (bytes_offset * 2)
            
            if bytes_data_start >= len(hex_data):
                return_data = ""
            else:
                # Get length
                bytes_length_hex = hex_data[bytes_data_start:bytes_data_start + 64]
                bytes_length = int(bytes_length_hex, 16)
                
                # Get data (padded to 32-byte boundary)
                bytes_data_hex = hex_data[bytes_data_start + 64:bytes_data_start + 64 + (bytes_length * 2)]
                return_data = "0x" + bytes_data_hex
            
            results.append((success, return_data))
            current_pos += 64  # Move to next tuple offset
            
            # If we've processed all tuples, break
            if len(results) >= length:
                break
        
        return block_number, results
        
    except Exception as e:
        print(f"Error decoding multicall response: {e}")
        import traceback
        traceback.print_exc()
        return 0, []

def decode_function_return(return_data: str, selector: str) -> Optional[any]:
    """
    Decode return data based on function selector
    """
    if not return_data or return_data == "0x":
        return None
    
    func_sig = KNOWN_SELECTORS.get(selector)
    if not func_sig:
        return None
    
    try:
        # Remove 0x prefix
        hex_data = return_data[2:] if return_data.startswith("0x") else return_data
        
        if func_sig == "weights(address)":
            # Returns uint256
            value = int(hex_data[:64], 16)
            return value / 1e18
        
        elif func_sig == "getGauge(address)":
            # Returns address
            addr = "0x" + hex_data[-40:]
            if addr == "0x" + "0" * 40:
                return None
            return addr
        
        elif func_sig in ["token0()", "token1()"]:
            # Returns address
            addr = "0x" + hex_data[-40:]
            if addr == "0x" + "0" * 40:
                return None
            return addr
        
        elif func_sig == "fee()":
            # Returns uint24 (padded to uint256)
            value = int(hex_data[:64], 16)
            return value
        
        elif func_sig in ["liquidity()", "totalSupply()"]:
            # Returns uint256
            value = int(hex_data[:64], 16)
            return value / 1e18
        
        elif func_sig == "tokens_per_week(uint256)":
            # Returns uint256
            value = int(hex_data[:64], 16)
            return value / 1e18
        
        else:
            # Unknown function, return raw hex
            return hex_data
            
    except Exception as e:
        print(f"Error decoding function return for {func_sig}: {e}")
        return None

def decode_multicall_request(request_hex: str) -> List[Tuple[str, str, str]]:
    """
    Decode Multicall3 aggregate() request
    Returns: [(target, selector, args), ...]
    """
    if not request_hex or not request_hex.startswith(AGGREGATE_SELECTOR):
        return []
    
    # Remove selector
    hex_data = request_hex[10:]  # Remove "0x82ad56cb"
    
    try:
        # Array encoding: offset (32 bytes) + length (32 bytes) + data
        offset_hex = hex_data[:64]
        offset = int(offset_hex, 16)
        
        # Calculate where array data starts
        array_start = offset * 2
        
        if array_start >= len(hex_data):
            return []
        
        # Get array length
        length_hex = hex_data[array_start:array_start + 64]
        length = int(length_hex, 16)
        
        calls = []
        current_pos = array_start + 64
        
        for i in range(length):
            # Each element is a tuple: (address, bytes)
            # Get offset to this tuple
            tuple_offset_hex = hex_data[current_pos:current_pos + 64]
            tuple_offset = int(tuple_offset_hex, 16)
            tuple_start = (offset + tuple_offset) * 2
            
            if tuple_start >= len(hex_data):
                break
            
            # Decode tuple: (address, bytes)
            # Address is 32 bytes (padded)
            addr_hex = hex_data[tuple_start + 24:tuple_start + 64]  # Last 20 bytes
            target = "0x" + addr_hex
            
            # Bytes: offset (32 bytes) + length (32 bytes) + data
            bytes_offset_hex = hex_data[tuple_start + 64:tuple_start + 128]
            bytes_offset = int(bytes_offset_hex, 16)
            bytes_data_start = tuple_start + (bytes_offset * 2)
            
            if bytes_data_start >= len(hex_data):
                break
            
            # Get length
            bytes_length_hex = hex_data[bytes_data_start:bytes_data_start + 64]
            bytes_length = int(bytes_length_hex, 16)
            
            # Get data (padded to 32-byte boundary)
            padded_length = ((bytes_length + 31) // 32) * 32
            bytes_data_hex = hex_data[bytes_data_start + 64:bytes_data_start + 64 + (padded_length * 2)]
            call_data = "0x" + bytes_data_hex[:bytes_length * 2]
            
            # Extract selector (first 4 bytes = 8 hex chars)
            selector = call_data[:10] if len(call_data) >= 10 else ""
            args = call_data[10:] if len(call_data) > 10 else ""
            
            calls.append((target, selector, args))
            current_pos += 64
            
            if len(calls) >= length:
                break
        
        return calls
        
    except Exception as e:
        print(f"Error decoding multicall request: {e}")
        import traceback
        traceback.print_exc()
        return []

def match_calls_to_returns(requests: List[Tuple[str, str, str]], 
                          returns: List[Tuple[bool, str]]) -> List[Dict]:
    """
    Match function calls to their return values
    """
    matched = []
    
    for i, ((target, selector, args), (success, return_data)) in enumerate(zip(requests, returns)):
        func_name = KNOWN_SELECTORS.get(selector, f"unknown({selector})")
        
        decoded_value = None
        if success and return_data:
            decoded_value = decode_function_return(return_data, selector)
        
        matched.append({
            'index': i,
            'target': target,
            'selector': selector,
            'function': func_name,
            'args': args,
            'success': success,
            'return_data': return_data,
            'decoded_value': decoded_value
        })
    
    return matched

def analyze_multicall_from_log(log_file: str):
    """
    Analyze a multicall from API logs
    """
    print("="*80)
    print("IMPROVED MULTICALL DECODER")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    
    multicall_requests = []
    multicall_responses = []
    
    # Find multicall requests and responses
    for req in requests:
        body = req.get('requestBody', req.get('body', ''))
        response = req.get('responseBody', req.get('response', ''))
        
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except:
                continue
        
        if isinstance(response, str):
            try:
                response = json.loads(response)
            except:
                continue
        
        # Check if it's a multicall request
        if isinstance(body, dict):
            params = body.get('params', [])
            if params and isinstance(params[0], dict):
                data_field = params[0].get('data', '')
                if data_field and data_field.startswith(AGGREGATE_SELECTOR):
                    multicall_requests.append(data_field)
        
        # Check if it's a multicall response
        if isinstance(response, dict):
            result = response.get('result', '')
            if result and isinstance(result, str) and result.startswith('0x') and len(result) > 1000:
                multicall_responses.append(result)
    
    print(f"\nFound {len(multicall_requests)} multicall requests")
    print(f"Found {len(multicall_responses)} multicall responses\n")
    
    if not multicall_requests or not multicall_responses:
        print("❌ No multicall data found")
        return
    
    # Decode first matching pair
    request_hex = multicall_requests[0]
    response_hex = multicall_responses[0]
    
    print("Decoding request...")
    calls = decode_multicall_request(request_hex)
    print(f"✓ Decoded {len(calls)} function calls\n")
    
    print("Decoding response...")
    block_number, returns = decode_multicall_response(response_hex)
    print(f"✓ Decoded {len(returns)} return values (block: {block_number})\n")
    
    if len(calls) != len(returns):
        print(f"⚠️  Warning: {len(calls)} calls but {len(returns)} returns")
    
    # Match calls to returns
    matched = match_calls_to_returns(calls, returns)
    
    # Find reward-related calls
    print("\n" + "="*80)
    print("REWARD-RELATED CALLS")
    print("="*80)
    
    reward_calls = []
    for match in matched:
        if match['function'] in ['getGauge(address)', 'tokens_per_week(uint256)', 'totalSupplyAtT(uint256)']:
            reward_calls.append(match)
        elif match['decoded_value'] and isinstance(match['decoded_value'], (int, float)) and match['decoded_value'] > 1e18:
            # Large value that could be a reward
            reward_calls.append(match)
    
    print(f"\nFound {len(reward_calls)} potentially reward-related calls:\n")
    for call in reward_calls[:20]:  # Show first 20
        print(f"  [{call['index']}] {call['function']}")
        print(f"      Target: {call['target']}")
        if call['success']:
            print(f"      Return: {call['decoded_value']}")
        else:
            print(f"      Failed")
        print()
    
    # Save results
    output_file = "improved_multicall_decoded.json"
    with open(output_file, 'w') as f:
        json.dump({
            'block_number': block_number,
            'total_calls': len(matched),
            'calls': matched[:100],  # First 100
            'reward_calls': reward_calls
        }, f, indent=2)
    
    print(f"\n✓ Results saved to: {output_file}")

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T04_12_17.619Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    analyze_multicall_from_log(log_file)
