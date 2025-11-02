#!/usr/bin/env python3
"""
Safe Read-Only Testing Script

Tests read-only operations on mainnet contracts. ZERO RISK - no transactions sent.

Usage:
    export BLACKHOLE_VOTER_PRIVATE_KEY=your_key_here
    python3 scripts/safe_read_only_test.py
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_read_only_operations():
    """Test read-only contract operations"""
    print("="*70)
    print("SAFE READ-ONLY TESTING")
    print("="*70)
    print("Risk Level: ZERO - No transactions will be sent")
    print()
    
    private_key = os.getenv('BLACKHOLE_VOTER_PRIVATE_KEY')
    if not private_key:
        print("? BLACKHOLE_VOTER_PRIVATE_KEY not set")
        print("  Set it to test read-only operations:")
        print("  export BLACKHOLE_VOTER_PRIVATE_KEY=your_key_here")
        return False
    
    try:
        from blackhole_voter import BlackholeVoter
        
        print("[Test 1] Initializing voter (dry-run mode)...")
        voter = BlackholeVoter(private_key=private_key, dry_run=True)
        print(f"? Connected to: {voter.rpc_url}")
        print(f"? Wallet: {voter.wallet_address}")
        
        print("\n[Test 2] Checking AVAX balance...")
        try:
            balance = voter.get_balance()
            print(f"? Balance: {balance} AVAX")
            if balance < 0.01:
                print("  ? Low balance - transactions may fail")
        except Exception as e:
            print(f"? Failed: {e}")
            return False
        
        print("\n[Test 3] Querying lock token IDs...")
        try:
            token_ids = voter.get_lock_token_ids()
            if not token_ids:
                print("? No token IDs found")
                print("  This is normal if you don't have any locks")
                print("  Cannot test voting without a lock token ID")
                return False
            
            print(f"? Found {len(token_ids)} token ID(s): {token_ids}")
            
            # Use first token ID for remaining tests
            test_token_id = token_ids[0]
            print(f"  Using token ID {test_token_id} for tests")
            
        except Exception as e:
            print(f"? Failed: {e}")
            return False
        
        print("\n[Test 4] Checking voting power...")
        try:
            voting_power = voter.get_voting_power()
            if voting_power is None:
                print("? Could not get voting power")
                print("  This may be normal if contract not fully configured")
            else:
                print(f"? Voting power: {voting_power} veBLACK")
        except Exception as e:
            print(f"? Could not get voting power: {e}")
            print("  May be OK if contract not fully configured")
        
        print("\n" + "="*70)
        print("READ-ONLY TEST SUMMARY")
        print("="*70)
        print("? Connected to blockchain")
        print("? Query operations work correctly")
        print(f"? Token ID {test_token_id} available for testing")
        
        print("\nNext Steps:")
        print("  1. Review token ID and verify on Snowtrace:")
        print(f"     https://snowtrace.io/address/{voter.wallet_address}")
        print("  2. If all checks pass ? Safe to try dry-run encoding test")
        print("  3. See SAFE_TESTING_GUIDE.md for next testing levels")
        
        return True
        
    except Exception as e:
        print(f"\n? Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main test function"""
    success = test_read_only_operations()
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
