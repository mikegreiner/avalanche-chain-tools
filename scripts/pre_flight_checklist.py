#!/usr/bin/env python3
"""
Pre-Flight Checklist for Voting Transaction

CRITICAL: You can only vote once per epoch. This checklist ensures
everything is PERFECT before sending your one vote.

Usage:
    export BLACKHOLE_VOTER_PRIVATE_KEY=your_key
    python3 scripts/pre_flight_checklist.py --token-id YOUR_TOKEN_ID --pools POOL1,POOL2 --weights W1,W2
"""

import sys
import os
import argparse
from typing import List

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from blackhole_voter import BlackholeVoter, VotePlan


def check_token_id(voter: BlackholeVoter, provided_token_id: int = None) -> tuple[bool, str, int]:
    """Check token ID is valid"""
    print("\n[Check 1] Token ID Validation")
    print("-" * 70)
    
    if provided_token_id:
        # Verify token ID exists
        try:
            # Try to query token details (this would need contract call)
            print(f"  Provided token ID: {provided_token_id}")
            print(f"  ? Verify on Snowtrace:")
            print(f"     https://snowtrace.io/nft/0xeac562811cc6abdbb2c9ee88719eca4ee79ad763/{provided_token_id}")
            return True, f"Token ID {provided_token_id} provided", provided_token_id
        except Exception as e:
            return False, f"Token ID validation failed: {e}", None
    else:
        # Get from contract
        token_ids = voter.get_lock_token_ids()
        if not token_ids:
            return False, "No token IDs found", None
        
        token_id = token_ids[0]
        print(f"  Found token ID: {token_id}")
        if len(token_ids) > 1:
            print(f"  ? Multiple token IDs available: {token_ids}")
            print(f"     Using first: {token_id}")
        
        return True, f"Token ID {token_id} valid", token_id


def check_pool_addresses(pool_addresses: List[str]) -> tuple[bool, str]:
    """Validate pool addresses"""
    print("\n[Check 2] Pool Address Validation")
    print("-" * 70)
    
    errors = []
    for i, addr in enumerate(pool_addresses):
        if not addr.startswith('0x'):
            errors.append(f"Pool {i+1}: Not a valid address (missing 0x)")
        elif len(addr) != 42:
            errors.append(f"Pool {i+1}: Invalid address length")
        else:
            print(f"  Pool {i+1}: {addr}")
            print(f"    ? Verify on Snowtrace: https://snowtrace.io/address/{addr}")
    
    if errors:
        return False, "; ".join(errors)
    
    return True, f"All {len(pool_addresses)} pool addresses valid"


def check_weights(weights: List[int], percentages: List[float]) -> tuple[bool, str]:
    """Validate weights and percentages"""
    print("\n[Check 3] Weight & Percentage Validation")
    print("-" * 70)
    
    total_percentage = sum(percentages)
    print(f"  Total percentage: {total_percentage}%")
    
    if total_percentage > 100.01:  # Allow small float error
        return False, f"Percentages sum to {total_percentage}% (must be ? 100%)"
    
    if total_percentage < 99.99:
        print(f"  ? Warning: Percentages sum to {total_percentage}% (will be normalized)")
    
    print(f"  Weights: {weights}")
    print(f"  Percentages: {percentages}")
    
    # Check weights are reasonable
    for w in weights:
        if w < 0:
            return False, f"Negative weight found: {w}"
        if w == 0:
            print(f"  ? Warning: Zero weight found")
    
    return True, "Weights and percentages valid"


def check_gas_estimate(voter: BlackholeVoter, vote_plans: List[VotePlan], token_id: int) -> tuple[bool, str, Dict]:
    """Check gas estimate is reasonable"""
    print("\n[Check 4] Gas Estimate Validation")
    print("-" * 70)
    
    try:
        result = voter.simulate_vote(vote_plans, token_id)
        tx_details = result['transaction']
        
        gas_limit = tx_details['estimated_gas']
        gas_price = tx_details['gas_price']
        total_cost = gas_limit * gas_price
        
        from web3 import Web3
        cost_avax = Web3.from_wei(total_cost, 'ether')
        
        print(f"  Gas Limit: {gas_limit:,}")
        print(f"  Gas Price: {Web3.from_wei(gas_price, 'gwei')} gwei")
        print(f"  Total Cost: {cost_avax} AVAX")
        
        # Reasonable checks
        if gas_limit > 1000000:
            return False, f"Gas limit very high: {gas_limit:,}", tx_details
        
        if gas_limit < 50000:
            return False, f"Gas limit suspiciously low: {gas_limit:,}", tx_details
        
        return True, f"Gas estimate reasonable ({gas_limit:,} gas)", tx_details
        
    except Exception as e:
        return False, f"Could not estimate gas: {e}", {}


def check_encoding_format(result: Dict) -> tuple[bool, str]:
    """Check encoding format is correct"""
    print("\n[Check 5] Encoding Format Validation")
    print("-" * 70)
    
    encoded_data = result.get('encoded_data', '')
    
    if not encoded_data:
        return False, "No encoded data generated"
    
    # Check function selector
    if encoded_data[:10] != '0x7ac09bf7':
        return False, f"Wrong function selector: {encoded_data[:10]} (expected 0x7ac09bf7)"
    
    print(f"  ? Function selector: {encoded_data[:10]}")
    print(f"  ? Length: {len(encoded_data)} hex chars")
    
    # Check length is reasonable
    if len(encoded_data) < 200:
        return False, f"Encoding too short: {len(encoded_data)} chars"
    
    if len(encoded_data) > 10000:
        return False, f"Encoding suspiciously long: {len(encoded_data)} chars"
    
    return True, "Encoding format valid"


def check_balance(voter: BlackholeVoter) -> tuple[bool, str]:
    """Check wallet has sufficient balance"""
    print("\n[Check 6] Wallet Balance Check")
    print("-" * 70)
    
    try:
        balance = voter.get_balance()
        print(f"  Balance: {balance} AVAX")
        
        if balance < 0.001:
            return False, f"Insufficient balance: {balance} AVAX"
        
        if balance < 0.01:
            print(f"  ? Warning: Low balance may cause transaction failures")
        
        return True, f"Balance sufficient: {balance} AVAX"
        
    except Exception as e:
        return False, f"Could not check balance: {e}"


def run_pre_flight_checks(token_id: int = None, pool_addresses: List[str] = None, 
                          percentages: List[float] = None, private_key: str = None):
    """Run all pre-flight checks"""
    print("="*70)
    print("PRE-FLIGHT CHECKLIST")
    print("="*70)
    print("??  CRITICAL: One vote per epoch - must be PERFECT!")
    print()
    
    if not private_key:
        private_key = os.getenv('BLACKHOLE_VOTER_PRIVATE_KEY')
    
    if not private_key:
        print("? No private key provided")
        print("  Set BLACKHOLE_VOTER_PRIVATE_KEY environment variable")
        return False
    
    # Initialize voter
    voter = BlackholeVoter(private_key=private_key, dry_run=True)
    
    # Create vote plans
    if not pool_addresses or not percentages:
        print("? Pool addresses and percentages required")
        return False
    
    if len(pool_addresses) != len(percentages):
        print("? Pool addresses and percentages must match in count")
        return False
    
    vote_plans = []
    for addr, pct in zip(pool_addresses, percentages):
        vote_plans.append(VotePlan(
            pool_name=f"Pool {addr[:10]}...",
            pool_id=addr,
            voting_percentage=pct
        ))
    
    # Calculate weights
    total_pct = sum(percentages)
    weights = []
    for pct in percentages:
        weight = int((pct / total_pct) * 1000) if total_pct > 0 else 0
        if weight == 0 and pct > 0:
            weight = 1
        weights.append(weight)
    
    # Run checks
    all_passed = True
    
    # Check 1: Token ID
    token_valid, token_msg, actual_token_id = check_token_id(voter, token_id)
    if not token_valid:
        print(f"? {token_msg}")
        all_passed = False
    else:
        print(f"? {token_msg}")
        token_id = actual_token_id
    
    # Check 2: Pool addresses
    pools_valid, pools_msg = check_pool_addresses(pool_addresses)
    if not pools_valid:
        print(f"? {pools_msg}")
        all_passed = False
    else:
        print(f"? {pools_msg}")
    
    # Check 3: Weights
    weights_valid, weights_msg = check_weights(weights, percentages)
    if not weights_valid:
        print(f"? {weights_msg}")
        all_passed = False
    else:
        print(f"? {weights_msg}")
    
    # Check 4: Gas estimate
    gas_valid, gas_msg, tx_details = check_gas_estimate(voter, vote_plans, token_id)
    if not gas_valid:
        print(f"? {gas_msg}")
        all_passed = False
    else:
        print(f"? {gas_msg}")
    
    # Check 5: Encoding format
    result = voter.simulate_vote(vote_plans, token_id)
    encoding_valid, encoding_msg = check_encoding_format(result)
    if not encoding_valid:
        print(f"? {encoding_msg}")
        all_passed = False
    else:
        print(f"? {encoding_msg}")
    
    # Check 6: Balance
    balance_valid, balance_msg = check_balance(voter)
    if not balance_valid:
        print(f"? {balance_msg}")
        all_passed = False
    else:
        print(f"? {balance_msg}")
    
    # Final verdict
    print("\n" + "="*70)
    if all_passed:
        print("??? ALL CHECKS PASSED ???")
        print("="*70)
        print("All pre-flight checks passed.")
        print()
        print("??  CRITICAL REMINDERS:")
        print(f"  - You can only vote ONCE per epoch (week)")
        print(f"  - No second chances this week")
        print(f"  - Review transaction details carefully")
        print(f"  - Double-check all parameters")
        print()
        print("If ready, proceed with:")
        print(f"  python3 blackhole_voter.py --pools-json ... --confirm")
    else:
        print("??? CHECKS FAILED ???")
        print("="*70)
        print("DO NOT PROCEED - Fix issues above first!")
    
    return all_passed


def main():
    parser = argparse.ArgumentParser(
        description='Pre-flight checklist for voting transaction'
    )
    parser.add_argument('--token-id', type=int, help='Token ID to vote with')
    parser.add_argument('--pools', required=True, help='Comma-separated pool addresses')
    parser.add_argument('--percentages', required=True, help='Comma-separated percentages')
    parser.add_argument('--private-key', help='Private key (or use env var)')
    
    args = parser.parse_args()
    
    pool_addresses = [addr.strip() for addr in args.pools.split(',')]
    percentages = [float(pct.strip()) for pct in args.percentages.split(',')]
    
    success = run_pre_flight_checks(
        token_id=args.token_id,
        pool_addresses=pool_addresses,
        percentages=percentages,
        private_key=args.private_key
    )
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
