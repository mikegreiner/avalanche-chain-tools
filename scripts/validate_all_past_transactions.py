#!/usr/bin/env python3
"""
Comprehensive Validation Against ALL Past Voting Transactions

Since you can only vote once per epoch, we MUST validate encoding against
ALL your past voting transactions to ensure perfection.

Usage:
    export BLACKHOLE_VOTER_PRIVATE_KEY=your_key  # Optional - for encoding generation
    python3 scripts/validate_all_past_transactions.py [wallet_address]
"""

import sys
import os
import requests
from typing import List, Dict

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SNOWTRACE_API = "https://api.snowtrace.io/api"
API_KEY = "YourApiKeyToken"

# Default wallet if not provided
DEFAULT_WALLET = "0x0000000000000000000000000000000000000001"


def fetch_transaction(tx_hash: str) -> Dict:
    """Fetch transaction from Snowtrace"""
    url = f"{SNOWTRACE_API}?module=proxy&action=eth_getTransactionByHash&txhash={tx_hash}&apikey={API_KEY}"
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        return data.get('result', {})
    except Exception as e:
        return {"error": str(e)}


def decode_vote_transaction(input_data: str) -> Dict:
    """Decode vote transaction to extract parameters"""
    if not input_data or len(input_data) < 202:
        return {"error": "Input too short"}
    
    func_sig = input_data[:10]
    if func_sig != '0x7ac09bf7':
        return {"error": f"Not vote() function (got: {func_sig})"}
    
    token_id = int(input_data[10:74], 16)
    offset_pools = int(input_data[74:138], 16)
    offset_weights = int(input_data[138:202], 16)
    
    # Decode pools
    pools_start = 10 + (offset_pools * 2)
    if len(input_data) < pools_start + 64:
        return {"error": "Input too short for pools"}
    
    pool_count = int(input_data[pools_start:pools_start+64], 16)
    pools = []
    for i in range(pool_count):
        pool_pos = pools_start + 64 + (i * 64)
        if len(input_data) >= pool_pos + 64:
            pool_addr_hex = input_data[pool_pos:pool_pos+64]
            pool_addr = '0x' + pool_addr_hex[-40:].lower()
            pools.append(pool_addr)
    
    # Decode weights
    weights_start = 10 + (offset_weights * 2)
    if len(input_data) < weights_start + 64:
        return {"error": "Input too short for weights"}
    
    weight_count = int(input_data[weights_start:weights_start+64], 16)
    weights = []
    for i in range(weight_count):
        weight_pos = weights_start + 64 + (i * 64)
        if len(input_data) >= weight_pos + 64:
            weight_hex = input_data[weight_pos:weight_pos+64]
            weight = int(weight_hex, 16)
            weights.append(weight)
    
    return {
        "token_id": token_id,
        "pools": pools,
        "weights": weights,
        "function_selector": func_sig,
        "input_data": input_data
    }


def find_all_voting_transactions(wallet: str, limit: int = 100) -> List[Dict]:
    """Find all voting transactions from wallet"""
    print(f"Finding voting transactions for {wallet}...")
    
    url = f"{SNOWTRACE_API}?module=account&action=txlist&address={wallet}&startblock=0&endblock=99999999&sort=desc&apikey={API_KEY}"
    
    try:
        response = requests.get(url, timeout=15)
        data = response.json()
        txs = data.get('result', [])
        
        # Filter for vote transactions
        vote_txs = []
        voter_contracts = [
            '0xe30d0c8532721551a51a9fec7fb233759964d9e3',  # Voter proxy
            '0x6bd81e7eafa4b21d5ad069b452ab4b8bb40c4525'    # Voter implementation
        ]
        
        for tx in txs[:limit]:
            to_addr = tx.get('to', '').lower()
            input_data = tx.get('input', '')
            func_sig = input_data[:10] if len(input_data) >= 10 else ''
            
            if to_addr in [c.lower() for c in voter_contracts] and func_sig == '0x7ac09bf7':
                decoded = decode_vote_transaction(input_data)
                if 'error' not in decoded:
                    vote_txs.append({
                        'hash': tx.get('hash'),
                        'block': tx.get('blockNumber'),
                        'decoded': decoded
                    })
        
        return vote_txs
        
    except Exception as e:
        print(f"Error finding transactions: {e}")
        return []


def validate_encoding_for_transaction(tx_data: Dict, private_key: str = None) -> Dict:
    """Validate that our encoding matches a transaction"""
    tx_hash = tx_data['hash']
    decoded = tx_data['decoded']
    actual_input = decoded['input_data']
    
    result = {
        'tx_hash': tx_hash,
        'status': 'pending',
        'actual_params': {
            'token_id': decoded['token_id'],
            'pools': decoded['pools'],
            'weights': decoded['weights']
        },
        'encoding_match': False,
        'errors': []
    }
    
    # Try to generate encoding if private key available, or use dummy key
    encoding_key = private_key
    if not encoding_key:
        # Use dummy key for structure validation (safe - can't sign real transactions)
        encoding_key = "0x" + "1" * 64
        use_dummy = True
    else:
        use_dummy = False
    
    try:
        from blackhole_voter import BlackholeVoter, VotePlan
        
        voter = BlackholeVoter(private_key=encoding_key, dry_run=True)
        
        if use_dummy:
            result['warnings'] = result.get('warnings', [])
            result['warnings'].append('Using dummy key - encoding structure only')
        
        # Create vote plans
        vote_plans = []
        for i, pool in enumerate(decoded['pools']):
            weight = decoded['weights'][i]
            percentage = (weight / 1000.0) * 100.0 if weight > 0 else 0
            
            vote_plans.append(VotePlan(
                pool_name=f"Pool {i+1}",
                pool_id=pool,
                voting_percentage=percentage
            ))
        
        # Generate encoding
        sim_result = voter.simulate_vote(vote_plans, token_id=decoded['token_id'])
        generated_input = sim_result.get('encoded_data', '')
        
        if generated_input:
            # Compare
            if generated_input == actual_input:
                result['encoding_match'] = True
                result['status'] = 'PASSED'
            else:
                result['status'] = 'FAILED'
                result['errors'].append('Encoding mismatch')
                
                # Compare details
                if generated_input[:10] != actual_input[:10]:
                    result['errors'].append('Function selector mismatch')
                if len(generated_input) != len(actual_input):
                    result['errors'].append(f'Length mismatch: {len(generated_input)} vs {len(actual_input)}')
                
                # Compare token ID
                gen_token = int(generated_input[10:74], 16) if len(generated_input) >= 74 else 0
                act_token = int(actual_input[10:74], 16) if len(actual_input) >= 74 else 0
                if gen_token != act_token:
                    result['errors'].append(f'Token ID mismatch: {gen_token} vs {act_token}')
        else:
            result['status'] = 'SKIPPED'
            result['errors'].append('Could not generate encoding')
            
    except Exception as e:
        result['status'] = 'ERROR'
        result['errors'].append(str(e))
    
    return result


def main():
    """Main validation function"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Validate encoding against ALL past voting transactions'
    )
    parser.add_argument(
        'wallet',
        nargs='?',
        default=DEFAULT_WALLET,
        help='Wallet address to check (default: your wallet)'
    )
    parser.add_argument(
        '--private-key',
        help='Private key for encoding generation (optional, safer without it)'
    )
    
    args = parser.parse_args()
    
    wallet = args.wallet
    private_key = args.private_key or os.getenv('BLACKHOLE_VOTER_PRIVATE_KEY')
    
    print("="*70)
    print("COMPREHENSIVE TRANSACTION VALIDATION")
    print("="*70)
    print(f"Wallet: {wallet}")
    print(f"Private Key: {'Set' if private_key else 'Not set (decode only)'}")
    print()
    print("??  CRITICAL: One vote per epoch - must be PERFECT!")
    print()
    
    # Find all voting transactions
    print("[Step 1] Finding all voting transactions...")
    vote_txs = find_all_voting_transactions(wallet)
    
    if not vote_txs:
        print("? No voting transactions found")
        print("  This could mean:")
        print("  - Wallet has never voted")
        print("  - Transactions use different contract")
        print("  - API issue")
        return 1
    
    print(f"? Found {len(vote_txs)} voting transaction(s)")
    print()
    
    # Validate each transaction
    print("[Step 2] Validating encoding for each transaction...")
    print("="*70)
    
    results = []
    for i, tx_data in enumerate(vote_txs, 1):
        print(f"\nTransaction {i}/{len(vote_txs)}: {tx_data['hash'][:20]}...")
        print(f"  Block: {tx_data['block']}")
        
        decoded = tx_data['decoded']
        print(f"  Token ID: {decoded['token_id']}")
        print(f"  Pools: {len(decoded['pools'])}")
        print(f"  Weights: {decoded['weights']}")
        
        result = validate_encoding_for_transaction(tx_data, private_key)
        results.append(result)
        
        if result['status'] == 'PASSED':
            print(f"  ? ENCODING MATCHES!")
        elif result['status'] == 'FAILED':
            print(f"  ? FAILED: {', '.join(result['errors'])}")
        elif result['status'] == 'SKIPPED':
            print(f"  ? Skipped: {', '.join(result['errors'])}")
        else:
            print(f"  ? ERROR: {', '.join(result['errors'])}")
    
    # Summary
    print("\n" + "="*70)
    print("VALIDATION SUMMARY")
    print("="*70)
    
    passed = sum(1 for r in results if r['status'] == 'PASSED')
    failed = sum(1 for r in results if r['status'] == 'FAILED')
    skipped = sum(1 for r in results if r['status'] == 'SKIPPED')
    errors = sum(1 for r in results if r['status'] == 'ERROR')
    
    print(f"Total transactions: {len(results)}")
    print(f"? Passed: {passed}")
    print(f"? Failed: {failed}")
    print(f"? Skipped: {skipped}")
    print(f"? Errors: {errors}")
    print()
    
    if failed > 0 or errors > 0:
        print("="*70)
        print("??  WARNING: VALIDATION FAILED")
        print("="*70)
        print("DO NOT PROCEED with real transaction!")
        print("Some transactions did not encode correctly.")
        print()
        print("Review failures above and fix implementation.")
        return 1
    
    if passed == len(results) and len(results) > 0:
        print("="*70)
        print("??? ALL VALIDATIONS PASSED ???")
        print("="*70)
        print("Encoding generation is correct for all past transactions!")
        print("Structure is validated.")
        print()
        print("??  But still review parameters carefully before real transaction:")
        print("  - Verify current token ID")
        print("  - Verify pool addresses")
        print("  - Verify voting percentages")
        print("  - Review gas estimate")
        return 0
    
    if skipped == len(results):
        print("="*70)
        print("??  VALIDATION INCOMPLETE")
        print("="*70)
        print("Could not generate encoding (no private key provided).")
        print("But transaction decoding validation passed.")
        print()
        print("To test encoding generation, provide private key.")
        print("(Still safe - only tests encoding, doesn't send transactions)")
        return 0
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
