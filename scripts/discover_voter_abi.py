#!/usr/bin/env python3
"""
Discover the Voter contract ABI for the vote() function

This script:
1. Attempts to fetch verified contract ABI from Snowtrace
2. Analyzes recent vote transactions to extract function signature
3. Tests different vote function selectors
4. Determines weight format and scaling

Goal: Understand exact function signature and parameters for voter.vote()
"""

import requests
import json
from web3 import Web3
from typing import Optional, Dict, List

# Configuration
RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_CONTRACT = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"
SNOWTRACE_API = "https://api.snowtrace.io/api"
SNOWTRACE_API_KEY = ""  # Optional, but recommended for higher rate limits

# Initialize Web3
w3 = Web3(Web3.HTTPProvider(RPC_URL))
voter_address = Web3.to_checksum_address(VOTER_CONTRACT)

print("=" * 80)
print("VOTER CONTRACT ABI DISCOVERY")
print("=" * 80)
print(f"Voter Contract: {voter_address}")
print(f"RPC: {RPC_URL}")
print()


def fetch_contract_abi_from_snowtrace() -> Optional[Dict]:
    """
    Fetch verified contract ABI from Snowtrace API
    """
    print("[1] Fetching ABI from Snowtrace...")

    params = {
        'module': 'contract',
        'action': 'getabi',
        'address': VOTER_CONTRACT,
    }

    if SNOWTRACE_API_KEY:
        params['apikey'] = SNOWTRACE_API_KEY

    try:
        response = requests.get(SNOWTRACE_API, params=params, timeout=10)
        data = response.json()

        if data['status'] == '1' and data['message'] == 'OK':
            abi = json.loads(data['result'])
            print(f"✓ Found verified contract ABI with {len(abi)} functions")
            return abi
        else:
            print(f"✗ Contract not verified or ABI not available")
            print(f"  Message: {data.get('message', 'Unknown error')}")
            return None
    except Exception as e:
        print(f"✗ Error fetching from Snowtrace: {e}")
        return None


def extract_vote_functions(abi: List[Dict]) -> List[Dict]:
    """
    Extract vote-related functions from ABI
    """
    if not abi:
        return []

    vote_functions = []
    for item in abi:
        if item.get('type') == 'function':
            name = item.get('name', '')
            if 'vote' in name.lower() or 'reset' in name.lower() or 'poke' in name.lower():
                vote_functions.append(item)

    return vote_functions


def analyze_vote_function(func: Dict):
    """
    Analyze a vote function from ABI
    """
    print()
    print(f"Function: {func['name']}")
    print(f"  Type: {func.get('stateMutability', 'unknown')}")

    # Build function signature
    param_types = [p['type'] for p in func.get('inputs', [])]
    signature = f"{func['name']}({','.join(param_types)})"
    print(f"  Signature: {signature}")

    # Calculate selector
    selector = "0x" + w3.keccak(text=signature)[:4].hex()
    print(f"  Selector: {selector}")

    # Show parameters
    if func.get('inputs'):
        print("  Parameters:")
        for param in func['inputs']:
            param_name = param.get('name', 'unnamed')
            param_type = param['type']
            print(f"    - {param_name}: {param_type}")

    # Show returns
    if func.get('outputs'):
        print("  Returns:")
        for output in func['outputs']:
            output_name = output.get('name', 'unnamed')
            output_type = output['type']
            print(f"    - {output_name}: {output_type}")


def fetch_recent_vote_transactions() -> List[Dict]:
    """
    Fetch recent transactions to the voter contract from Snowtrace
    Focus on 'vote' transactions
    """
    print("\n[2] Fetching recent vote transactions from Snowtrace...")

    params = {
        'module': 'account',
        'action': 'txlist',
        'address': VOTER_CONTRACT,
        'startblock': 0,
        'endblock': 99999999,
        'page': 1,
        'offset': 100,  # Get last 100 transactions
        'sort': 'desc',
    }

    if SNOWTRACE_API_KEY:
        params['apikey'] = SNOWTRACE_API_KEY

    try:
        response = requests.get(SNOWTRACE_API, params=params, timeout=10)
        data = response.json()

        if data['status'] == '1':
            transactions = data['result']
            print(f"✓ Found {len(transactions)} recent transactions")

            # Filter for vote transactions (input data starts with vote selector)
            vote_txs = []
            for tx in transactions:
                input_data = tx.get('input', '')
                # Vote function typically has 4-byte selector
                if len(input_data) > 10:  # 0x + 8 hex chars = 10 chars minimum
                    vote_txs.append(tx)

            print(f"  {len(vote_txs)} non-trivial transactions (with input data)")
            return vote_txs
        else:
            print(f"✗ Failed to fetch transactions: {data.get('message', 'Unknown error')}")
            return []
    except Exception as e:
        print(f"✗ Error fetching transactions: {e}")
        return []


def analyze_transaction_input(tx: Dict):
    """
    Analyze transaction input data to extract function selector and parameters
    """
    input_data = tx.get('input', '')
    tx_hash = tx.get('hash', 'unknown')

    if len(input_data) < 10:
        return

    # Extract selector (first 4 bytes = 8 hex chars + 0x)
    selector = input_data[:10]

    print(f"\nTransaction: {tx_hash}")
    print(f"  From: {tx.get('from', 'unknown')}")
    print(f"  Selector: {selector}")
    print(f"  Input length: {len(input_data)} chars ({(len(input_data) - 2) // 2} bytes)")
    print(f"  Block: {tx.get('blockNumber', 'unknown')}")
    print(f"  Timestamp: {tx.get('timeStamp', 'unknown')}")

    # Count unique selectors
    return selector


def test_vote_function_selectors():
    """
    Test different possible vote function selectors
    """
    print("\n[3] Testing possible vote function selectors...")

    # Common vote function signatures
    signatures = [
        "vote(address[],uint256[])",  # Most common in veToken systems
        "vote(address[],int256[])",   # Alternative with signed ints
        "vote(uint256,address[],uint256[])",  # With token ID (veCRV style)
        "castVote(address[],uint256[])",  # Alternative naming
        "submitVote(address[],uint256[])",  # Alternative naming
    ]

    for sig in signatures:
        selector = "0x" + w3.keccak(text=sig)[:4].hex()
        print(f"{sig:45} → {selector}")


def get_known_function_selectors():
    """
    Get function selectors we already know work
    """
    print("\n[4] Known working function selectors...")

    known_functions = {
        "weights(address)": "0xa7cac846",
        "totalWeight()": "0x96c82e57",
        "reset()": None,  # Unknown
        "poke(address)": None,  # Unknown
    }

    for sig, known_selector in known_functions.items():
        computed_selector = "0x" + w3.keccak(text=sig)[:4].hex()

        if known_selector:
            match = "✓" if computed_selector == known_selector else "✗"
            print(f"{sig:30} → {computed_selector} {match} (known: {known_selector})")
        else:
            print(f"{sig:30} → {computed_selector} (unknown)")


def main():
    # Step 1: Try to get ABI from Snowtrace
    abi = fetch_contract_abi_from_snowtrace()

    if abi:
        # Extract and analyze vote functions
        vote_functions = extract_vote_functions(abi)

        if vote_functions:
            print(f"\n{'=' * 80}")
            print(f"FOUND {len(vote_functions)} VOTE-RELATED FUNCTIONS:")
            print('=' * 80)

            for func in vote_functions:
                analyze_vote_function(func)
        else:
            print("\n✗ No vote-related functions found in ABI")

    # Step 2: Analyze recent transactions
    transactions = fetch_recent_vote_transactions()

    if transactions:
        print(f"\n{'=' * 80}")
        print("ANALYZING RECENT TRANSACTIONS:")
        print('=' * 80)

        # Analyze first 5 transactions
        selectors_found = {}
        for tx in transactions[:10]:
            selector = analyze_transaction_input(tx)
            if selector:
                selectors_found[selector] = selectors_found.get(selector, 0) + 1

        print(f"\n{'=' * 80}")
        print("SELECTOR FREQUENCY:")
        print('=' * 80)
        for selector, count in sorted(selectors_found.items(), key=lambda x: x[1], reverse=True):
            print(f"{selector}: {count} times")

    # Step 3: Test vote function selectors
    test_vote_function_selectors()

    # Step 4: Show known functions
    get_known_function_selectors()

    print("\n" + "=" * 80)
    print("DISCOVERY COMPLETE")
    print("=" * 80)
    print("\nNext steps:")
    print("1. If ABI was found, use the exact function signature from the ABI")
    print("2. If not, use transaction analysis to identify the vote selector")
    print("3. Test vote encoding with the discovered signature")
    print("4. Verify weight format (wei vs. absolute votes vs. percentage)")


if __name__ == "__main__":
    main()
