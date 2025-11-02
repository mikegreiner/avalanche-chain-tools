#!/usr/bin/env python3
"""
Analyze Voting Transaction to Extract Contract Details

This script analyzes a voting transaction to extract:
- Voting contract address
- Function signature
- Pool addresses
- Voting weights
"""

import requests
import json
import sys

SNOWTRACE_API = "https://api.snowtrace.io/api"
API_KEY = "YourApiKeyToken"


def get_transaction(tx_hash: str) -> dict:
    """Get transaction details from Snowtrace"""
    url = f"{SNOWTRACE_API}?module=proxy&action=eth_getTransactionByHash&txhash={tx_hash}&apikey={API_KEY}"
    response = requests.get(url, timeout=10)
    data = response.json()
    return data.get('result', {})


def decode_function_signature(func_selector: str) -> str:
    """Try to identify function from selector"""
    # Common voting function signatures
    known_signatures = {
        '0x7715ee75': 'vote(address[],uint256[],address[],address[],uint256)',
        '0xd1c2babb': 'vote(address[],uint256[])',
        '0x204b5c0a': 'setPoolWeights(address[],uint256[])',
    }
    return known_signatures.get(func_selector.lower(), 'Unknown')


def decode_addresses_from_input(input_data: str) -> list:
    """Extract addresses from transaction input"""
    addresses = []
    # Addresses in ABI encoding start with 0x and are 42 chars (0x + 40 hex)
    # Look for patterns: 000000000000000000000000 + 40 hex chars
    pattern = '000000000000000000000000'
    idx = 0
    while True:
        pos = input_data.find(pattern, idx)
        if pos == -1:
            break
        # Extract address (42 chars after pattern)
        if pos + len(pattern) + 40 <= len(input_data):
            addr = '0x' + input_data[pos + len(pattern):pos + len(pattern) + 40]
            if addr not in addresses and addr != '0x0000000000000000000000000000000000000000':
                addresses.append(addr)
        idx = pos + 1
    return addresses


def get_contract_abi(address: str) -> list:
    """Get contract ABI"""
    url = f"{SNOWTRACE_API}?module=contract&action=getabi&address={address}&apikey={API_KEY}"
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        if data.get('status') == '1':
            return json.loads(data['result'])
    except Exception as e:
        print(f"Error getting ABI: {e}")
    return []


def analyze_transaction(tx_hash: str):
    """Analyze a voting transaction"""
    print("="*70)
    print(f"Analyzing Transaction: {tx_hash}")
    print("="*70)
    
    tx = get_transaction(tx_hash)
    if not tx:
        print("Transaction not found")
        return
    
    to_address = tx.get('to', '')
    input_data = tx.get('input', '')
    func_selector = input_data[:10] if len(input_data) >= 10 else ''
    
    print(f"\nContract Address: {to_address}")
    print(f"Function Selector: {func_selector}")
    print(f"Function Name: {decode_function_signature(func_selector)}")
    
    # Extract addresses from input
    addresses = decode_addresses_from_input(input_data)
    print(f"\nAddresses found in transaction input: {len(addresses)}")
    for i, addr in enumerate(addresses[:10], 1):
        print(f"  {i}. {addr}")
    
    # Get contract ABI
    print(f"\nFetching contract ABI...")
    abi = get_contract_abi(to_address)
    if abi:
        print(f"? ABI found ({len(abi)} items)")
        
        # Find voting function
        voting_funcs = []
        for item in abi:
            if item.get('type') == 'function':
                name = item.get('name', '').lower()
                if any(k in name for k in ['vote', 'pool', 'gauge', 'set', 'weight']):
                    voting_funcs.append(item)
        
        if voting_funcs:
            print(f"\nVoting-related functions found: {len(voting_funcs)}")
            for func in voting_funcs[:5]:
                inputs = func.get('inputs', [])
                input_types = [inp.get('type') for inp in inputs]
                print(f"  - {func.get('name')}({','.join(input_types)})")
    else:
        print("? ABI not available (contract may not be verified)")
        print(f"  Check: https://snowtrace.io/address/{to_address}")
    
    # Try to decode the transaction input
    print(f"\nAttempting to decode transaction input...")
    print(f"Input data: {input_data[:200]}...")
    
    return {
        'contract_address': to_address,
        'function_selector': func_selector,
        'addresses_in_input': addresses,
        'abi': abi
    }


def main():
    if len(sys.argv) > 1:
        tx_hash = sys.argv[1]
        analyze_transaction(tx_hash)
    else:
        print("Usage: python3 analyze_voting_transaction.py <tx_hash>")
        print("\nExample:")
        print("  python3 analyze_voting_transaction.py 0xc8f81aa5f0709d05836fabf8b13c7e31d73223ce86bf03319df7bcdaf5b3748c")


if __name__ == "__main__":
    main()
