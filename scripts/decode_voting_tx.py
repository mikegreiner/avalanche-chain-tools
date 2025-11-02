#!/usr/bin/env python3
"""
Decode a voting transaction to extract pools and weights

This script decodes the ABI-encoded transaction input to understand
the voting function signature and parameters.
"""

import requests
import sys
from web3 import Web3

SNOWTRACE_API = "https://api.snowtrace.io/api"
API_KEY = "YourApiKeyToken"


def get_transaction(tx_hash: str) -> dict:
    """Get transaction from Snowtrace"""
    url = f"{SNOWTRACE_API}?module=proxy&action=eth_getTransactionByHash&txhash={tx_hash}&apikey={API_KEY}"
    response = requests.get(url, timeout=10)
    data = response.json()
    return data.get('result', {})


def decode_voting_transaction(tx_hash: str):
    """Decode a voting transaction"""
    tx = get_transaction(tx_hash)
    if not tx:
        print(f"Transaction {tx_hash} not found")
        return
    
    input_data = tx.get('input', '')
    to_address = tx.get('to', '')
    
    print("="*70)
    print(f"Decoding Voting Transaction: {tx_hash}")
    print("="*70)
    print(f"Contract: {to_address}")
    print(f"Function Selector: {input_data[:10]}")
    print(f"Input Length: {len(input_data)} hex characters")
    
    # Try to decode using web3 if available
    try:
        w3 = Web3()
        
        # The function signature is likely: vote(address[],uint256[])
        # Function selector 0xd1c2babb should match this
        
        # Try decoding as vote(address[],uint256[])
        if input_data[:10].lower() == '0xd1c2babb':
            print("\n? Function selector matches expected vote function")
            
            # Decode the parameters
            # Skip function selector (10 chars = 0x + 8 hex)
            param_data = '0x' + input_data[10:]
            
            # Try to decode manually or with web3
            # For vote(address[],uint256[]), we have:
            # - offset to pools array (uint256)
            # - offset to weights array (uint256)
            
            if len(param_data) >= 66:  # 0x + 64 hex = 2 * 32 bytes
                # Get first offset (pools array)
                offset1_hex = param_data[2:66]  # Skip 0x
                offset1 = int(offset1_hex, 16)
                
                print(f"\nOffset to pools array: {offset1} bytes")
                
                # Get second offset if available
                if len(param_data) >= 130:  # 0x + 128 hex = 4 * 32 bytes
                    offset2_hex = param_data[66:130]
                    offset2 = int(offset2_hex, 16)
                    print(f"Offset to weights array: {offset2} bytes")
                    
                    # Calculate array start positions (in hex chars, not bytes)
                    # Each byte = 2 hex chars
                    pools_start = 2 + (offset1 * 2)  # Skip 0x, then offset * 2
                    weights_start = 2 + (offset2 * 2)
                    
                    print(f"\nPools array at hex position: {pools_start}")
                    print(f"Weights array at hex position: {weights_start}")
                    
                    # Read pool count
                    if len(param_data) >= pools_start + 64:
                        pool_count_hex = param_data[pools_start:pools_start+64]
                        pool_count = int(pool_count_hex, 16)
                        print(f"\n? Pool count: {pool_count}")
                        
                        # Extract pool addresses
                        pools = []
                        for i in range(pool_count):
                            addr_start = pools_start + 64 + (i * 64)
                            if len(param_data) >= addr_start + 64:
                                addr_hex = param_data[addr_start:addr_start+64]
                                # Address is last 40 chars (20 bytes)
                                addr = '0x' + addr_hex[-40:].lower()
                                pools.append(Web3.to_checksum_address(addr))
                        
                        print(f"\n? Pool addresses ({len(pools)}):")
                        for i, addr in enumerate(pools, 1):
                            print(f"  {i}. {addr}")
                        
                        # Read weights
                        if len(param_data) >= weights_start + 64:
                            weight_count_hex = param_data[weights_start:weights_start+64]
                            weight_count = int(weight_count_hex, 16)
                            print(f"\n? Weight count: {weight_count}")
                            
                            weights = []
                            for i in range(weight_count):
                                weight_start = weights_start + 64 + (i * 64)
                                if len(param_data) >= weight_start + 64:
                                    weight_hex = param_data[weight_start:weight_start+64]
                                    weight = int(weight_hex, 16)
                                    weights.append(weight)
                            
                            print(f"\n? Weights:")
                            total = sum(weights)
                            for i, (pool, weight) in enumerate(zip(pools, weights), 1):
                                pct = (weight / total * 100) if total > 0 else 0
                                print(f"  Pool {i} ({pool[:20]}...): {weight} ({pct:.2f}%)")
                    else:
                        print("?? Input data too short to decode pools")
                else:
                    print("?? Input data too short for second offset")
            else:
                print("?? Input data too short to decode")
        
        # Try alternative: vote(address[],uint256[],address[],address[],uint256)
        # This has 5 parameters including token addresses and token ID
        print("\n" + "="*70)
        print("Checking for alternative vote function signature...")
        print("Function might be: vote(address[],uint256[],address[],address[],uint256)")
        print("This would explain the longer input data")
        
    except ImportError:
        print("\n?? web3 not available - using manual decoding")
        print(f"Input data: {input_data[:200]}...")
    except Exception as e:
        print(f"\n?? Error decoding: {e}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        tx_hash = sys.argv[1]
        decode_voting_transaction(tx_hash)
    else:
        # Default to known voting transaction
        decode_voting_transaction("0xdef326742486f3c20e4590e0a194ac68b6dbcef487b187e887a719900a8f95d3")
