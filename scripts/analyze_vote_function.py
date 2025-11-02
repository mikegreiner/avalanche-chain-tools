#!/usr/bin/env python3
"""
Analyze the vote function signature and how it works

From source code analysis, found:
vote(uint256 _tokenId, address[] calldata _poolVote, uint256[] calldata _weights)

This function:
1. Takes a lock token ID (_tokenId)
2. Takes an array of pool addresses (_poolVote)
3. Takes an array of weights (_weights)
4. Is likely on the VOTER contract, not VotingEscrow directly
"""

import requests
import json
from web3 import Web3

SNOWTRACE_API = "https://api.snowtrace.io/api"
API_KEY = "YourApiKeyToken"
VOTING_ESCROW = "0xeac562811cc6abdbb2c9ee88719eca4ee79ad763"


def calculate_function_selector(func_sig: str) -> str:
    """Calculate keccak256 function selector"""
    if not hasattr(Web3, 'keccak'):
        return None
    keccak_hash = Web3.keccak(text=func_sig)
    return '0x' + keccak_hash.hex()[:8]


def get_voter_contract():
    """Get voter contract address from VotingEscrow"""
    # Function selector for voter() - 0x3e3f156f
    url = f"{SNOWTRACE_API}?module=proxy&action=eth_call&to={VOTING_ESCROW}&data=0x3e3f156f&tag=latest&apikey={API_KEY}"
    response = requests.get(url, timeout=10)
    data = response.json()
    
    result = data.get('result', '')
    if result and result != '0x' and len(result) >= 42:
        voter_addr = '0x' + result[-40:].lower()
        return voter_addr
    return None


def analyze_transaction(tx_hash: str):
    """Analyze a voting transaction to understand the function"""
    url = f"{SNOWTRACE_API}?module=proxy&action=eth_getTransactionByHash&txhash={tx_hash}&apikey={API_KEY}"
    response = requests.get(url, timeout=10)
    tx = response.json().get('result', {})
    
    if not tx:
        print(f"Transaction {tx_hash} not found")
        return
    
    to_address = tx.get('to', '').lower()
    input_data = tx.get('input', '')
    func_selector = input_data[:10]
    
    print("="*70)
    print(f"Analyzing Transaction: {tx_hash}")
    print("="*70)
    print(f"To: {to_address}")
    print(f"Function Selector: {func_selector}")
    
    # Calculate what function this selector corresponds to
    possible_functions = [
        "vote(uint256,address[],uint256[])",
        "vote(uint256 _tokenId, address[] calldata _poolVote, uint256[] calldata _weights)",
    ]
    
    print("\nPossible Function Signatures:")
    for func_sig in possible_functions:
        # Clean signature (remove parameter names, just types)
        clean_sig = func_sig.split('(')[0] + '(' + ','.join([p.strip().split()[-1] for p in func_sig.split('(')[1].split(')')[0].split(',')]) + ')'
        print(f"  - {func_sig}")
        print(f"    Clean: {clean_sig}")
        
        selector = calculate_function_selector(clean_sig)
        if selector:
            match = "? MATCHES" if selector.lower() == func_selector.lower() else "? No match"
            print(f"    Selector: {selector} {match}")
    
    # Check if this goes to VotingEscrow or voter contract
    if to_address == VOTING_ESCROW.lower():
        print("\n? Transaction goes directly to VotingEscrow")
        print("  This suggests vote() is on VotingEscrow, not a separate voter contract")
    else:
        print(f"\n? Transaction goes to: {to_address}")
        print("  This might be the voter contract")


def main():
    # Check voter contract
    print("Finding Voter Contract...")
    print("="*70)
    voter_addr = get_voter_contract()
    
    if voter_addr and voter_addr != '0x0000000000000000000000000000000000000000':
        print(f"? Voter contract found: {voter_addr}")
        
        # Get ABI for voter contract
        url = f"{SNOWTRACE_API}?module=contract&action=getabi&address={voter_addr}&apikey={API_KEY}"
        response = requests.get(url, timeout=10)
        data = response.json()
        
        if data.get('status') == '1':
            abi = json.loads(data['result'])
            print(f"? Voter contract ABI found ({len(abi)} items)")
            
            # Look for vote function
            for item in abi:
                if item.get('type') == 'function' and 'vote' in item.get('name', '').lower():
                    name = item.get('name')
                    inputs = item.get('inputs', [])
                    input_types = [inp.get('type') for inp in inputs]
                    print(f"\n? Found vote function: {name}({','.join(input_types)})")
        else:
            print(f"? Voter contract ABI not available")
    else:
        print("? No voter contract address returned")
        print("  Vote function might be on VotingEscrow directly")
    
    print("\n" + "="*70)
    print("Analyzing Known Voting Transaction")
    print("="*70)
    analyze_transaction("0xdef326742486f3c20e4590e0a194ac68b6dbcef487b187e887a719900a8f95d3")


if __name__ == "__main__":
    main()
