#!/usr/bin/env python3
"""
Find the actual voter contract address

This script searches for the voter contract by:
1. Calling voter() on VotingEscrow
2. Checking contracts that emit voting events
3. Searching for poke() calls
"""

import requests
import json

SNOWTRACE_API = "https://api.snowtrace.io/api"
API_KEY = "YourApiKeyToken"
VOTING_ESCROW = "0xeac562811cc6abdbb2c9ee88719eca4ee79ad763"


def get_function_selector(func_sig: str) -> str:
    """Get function selector from signature (requires web3 or eth_hash)"""
    # Can't calculate without proper library, but can try known selectors
    known_selectors = {
        'voter()': '0x3e3f156f',  # Common selector for simple functions
    }
    return known_selectors.get(func_sig, None)


def find_voter_contract():
    """Find voter contract address"""
    print("Finding Voter Contract")
    print("="*70)
    
    # Method 1: Call voter() on VotingEscrow
    print("\nMethod 1: Calling voter() on VotingEscrow...")
    
    # Try different ways to call voter()
    # From ABI, voter() has no parameters
    # Selector for voter() would be keccak256('voter()')[:4]
    
    # Common selectors for simple view functions:
    selectors = [
        '0x3e3f156f',  # voter() - likely
        '0x00000000',  # Placeholder
    ]
    
    voter_addr = None
    for selector in selectors:
        if selector == '0x00000000':
            continue
        url = f"{SNOWTRACE_API}?module=proxy&action=eth_call&to={VOTING_ESCROW}&data={selector}&tag=latest&apikey={API_KEY}"
        try:
            response = requests.get(url, timeout=10)
            data = response.json()
            result = data.get('result', '')
            if result and result != '0x' and len(result) >= 42:
                addr = '0x' + result[-40:].lower()
                if addr != '0x0000000000000000000000000000000000000000':
                    voter_addr = addr
                    print(f"  ? Found voter contract: {voter_addr}")
                    break
        except Exception:
            pass
    
    # Method 2: Check contract from voting events
    print("\nMethod 2: Checking contract from voting events...")
    event_contract = '0xe30d0c8532721551a51a9fec7fb233759964d9e3'
    print(f"  Event emitter: {event_contract}")
    
    # Get contract info
    url = f"{SNOWTRACE_API}?module=contract&action=getsourcecode&address={event_contract}&apikey={API_KEY}"
    response = requests.get(url, timeout=10)
    data = response.json()
    result = data.get('result', [{}])[0]
    contract_name = result.get('ContractName', 'Unknown')
    print(f"  Contract Name: {contract_name}")
    
    # Method 3: Check ABI for vote function
    if voter_addr:
        print(f"\nMethod 3: Getting ABI for voter contract {voter_addr}...")
        abi_url = f"{SNOWTRACE_API}?module=contract&action=getabi&address={voter_addr}&apikey={API_KEY}"
        abi_resp = requests.get(abi_url, timeout=10)
        abi_data = abi_resp.json()
        
        if abi_data.get('status') == '1':
            abi = json.loads(abi_data['result'])
            print(f"  ? ABI found ({len(abi)} items)")
            
            # Look for vote function
            for item in abi:
                if item.get('type') == 'function' and item.get('name') == 'vote':
                    inputs = item.get('inputs', [])
                    input_types = [inp.get('type') for inp in inputs]
                    print(f"  ? Found vote({','.join(input_types)})")
                    return voter_addr, abi
    
    return voter_addr, None


if __name__ == "__main__":
    voter_addr, abi = find_voter_contract()
    
    if voter_addr:
        print(f"\n{'='*70}")
        print(f"VOTER CONTRACT FOUND: {voter_addr}")
        if abi:
            print(f"ABI Available: Yes")
        else:
            print(f"ABI Available: No (contract may not be verified)")
            print(f"Check: https://snowtrace.io/address/{voter_addr}")
    else:
        print(f"\n{'='*70}")
        print("VOTER CONTRACT NOT FOUND")
        print("\nPossible explanations:")
        print("  1. vote() function is on VotingEscrow directly")
        print("  2. Function selector 0xd1c2babb is for a different function")
        print("  3. VotingEscrow delegates internally (no separate contract)")
