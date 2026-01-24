#!/usr/bin/env python3
"""
Decode multicall RESPONSES to extract reward data
Match rewards to pools by correlating requests and responses
"""

import json
import sys
from collections import defaultdict

def decode_multicall_response(response_hex):
    """Decode multicall response - returns array of returnData"""
    if not response_hex or response_hex == '0x':
        return None
    
    if response_hex.startswith('0x'):
        hex_data = response_hex[2:]
    else:
        hex_data = response_hex
    
    try:
        # Multicall3 aggregate returns: (uint256 blockNumber, bytes[] returnData)
        # First 32 bytes = offset to blockNumber
        # Next 32 bytes = blockNumber value
        # Next 32 bytes = offset to returnData array
        # Next 32 bytes = returnData array length
        # Then array of bytes (each with offset + length + data)
        
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
            # Each bytes has: offset (32 bytes) + length (32 bytes) + data
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
    except Exception as e:
        return None

def extract_reward_from_return_data(return_data):
    """Extract potential reward value from return data"""
    if not return_data or return_data == '0x':
        return None
    
    hex_data = return_data[2:] if return_data.startswith('0x') else return_data
    
    # Try to interpret as uint256
    if len(hex_data) >= 64:
        try:
            value = int(hex_data[:64], 16)
            # Filter for reasonable reward values (100 to 1M USD)
            if 1e20 < value < 1e27:  # 100 to 1M when divided by 1e18
                usd_value = value / 1e18
                if 100 < usd_value < 1000000:
                    return usd_value
        except:
            pass
    
    return None

def match_requests_to_responses(log_file):
    """Match multicall requests to responses and extract rewards"""
    print("="*80)
    print("DECODING MULTICALL RESPONSES FOR REWARDS")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    print(f"\nAnalyzing {len(requests)} requests...\n")
    
    # Find multicall requests and their responses
    multicall_pairs = []
    
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
                to_addr = params[0].get('to', '')
                data_field = params[0].get('data', '')
                
                if to_addr and 'ca11bde05977b3631167028862be2a173976ca11' in to_addr.lower():
                    if data_field and data_field.startswith('0x82ad56cb'):
                        if isinstance(response, dict):
                            result = response.get('result', '')
                        else:
                            result = str(response)
                        
                        if result:
                            multicall_pairs.append({
                                'request': data_field,
                                'response': result
                            })
    
    print(f"Found {len(multicall_pairs)} multicall request/response pairs\n")
    
    # Decode responses and extract rewards
    all_rewards = []
    
    for i, pair in enumerate(multicall_pairs[:20]):  # Analyze first 20
        print(f"\nMulticall {i+1}:")
        
        return_data_list = decode_multicall_response(pair['response'])
        if not return_data_list:
            print("  Could not decode response")
            continue
        
        print(f"  Decoded {len(return_data_list)} return values")
        
        # Extract rewards from each return value
        for j, return_data in enumerate(return_data_list):
            reward = extract_reward_from_return_data(return_data)
            if reward:
                print(f"    Return {j+1}: ${reward:,.2f} (potential reward)")
                all_rewards.append({
                    'multicall': i+1,
                    'return_index': j,
                    'reward': reward
                })
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    if all_rewards:
        print(f"\nFound {len(all_rewards)} potential reward values")
        
        # Group by value
        by_value = defaultdict(list)
        for r in all_rewards:
            rounded = round(r['reward'] / 100) * 100
            by_value[rounded].append(r)
        
        print("\nMost common reward values:")
        for value in sorted(by_value.keys(), reverse=True)[:20]:
            rewards = by_value[value]
            print(f"  ${value:,.0f}: appears {len(rewards)} times")
    else:
        print("\n⚠️  No reward values extracted")
        print("  This could mean:")
        print("    - Rewards are encoded differently")
        print("    - Rewards come from a different source")
        print("    - Need to decode function calls to match rewards to pools")
    
    return all_rewards

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T02_34_55.027Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    try:
        match_requests_to_responses(log_file)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
