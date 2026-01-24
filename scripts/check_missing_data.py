#!/usr/bin/env python3
"""
Check what data we're missing for vAMM/sAMM pools
Compare with what CL pools have and what Pool class needs
"""

import json

# What Pool class needs (from pool.js)
REQUIRED_FIELDS = {
    'name': 'Pool name (e.g., "WAVAX/USDC")',
    'total_rewards': 'USD value of rewards (fees + bribes)',
    'vapr': 'VAPR percentage',
    'current_votes': 'Current voting weight',
    'pool_id': 'Pool address',
    'pool_type': 'vAMM, sAMM, CL200, etc.',
    'fee_percentage': 'Fee percentage (e.g., "0.05%")'
}

# What we have for vAMM/sAMM pools
with open('vamm_samm_pools.json', 'r') as f:
    vamm_samm = json.load(f)

print("="*80)
print("DATA COMPLETENESS CHECK")
print("="*80)

print("\nRequired fields for Pool class:")
for field, desc in REQUIRED_FIELDS.items():
    print(f"  - {field}: {desc}")

print(f"\n\nvAMM/sAMM pools ({len(vamm_samm['pools'])} total):")
print("\nWhat we HAVE:")
print("  ✅ pool_id (address)")
print("  ✅ pool_type (vAMM/sAMM)")
print("  ✅ current_votes (weight)")
print("  ⚠️  token0/token1 addresses (but not symbols)")
print("\nWhat we're MISSING:")
print("  ❌ total_rewards (USD value)")
print("  ❌ vapr (percentage)")
print("  ❌ fee_percentage")
print("  ❌ name (proper token symbols)")

print("\n" + "="*80)
print("HOW TO GET MISSING DATA")
print("="*80)

print("\n1. total_rewards & vapr:")
print("   - Extract from DOM (same as CL pools)")
print("   - pool-extractor.js already handles this")
print("   - Just need to ensure vAMM/sAMM pools are in DOM")

print("\n2. fee_percentage:")
print("   - Query pool contract for fee() or swapFee()")
print("   - Or extract from DOM if available")
print("   - vAMM/sAMM may have different fee structures")

print("\n3. name (token symbols):")
print("   - Query token contracts for symbol()")
print("   - Or use token list/registry")
print("   - Or extract from DOM (pool names)")

print("\n" + "="*80)
print("INTEGRATION STEPS")
print("="*80)

print("\n1. ✅ We have pool addresses and weights")
print("2. ✅ DOM extraction should work for vAMM/sAMM (same structure)")
print("3. ⚠️  Need to ensure vAMM/sAMM pools are discovered and matched")
print("4. ⚠️  Need to query token symbols for proper names")
print("5. ⚠️  Need to query fees (optional, may not be critical)")

print("\n" + "="*80)
print("NEXT STEPS")
print("="*80)

print("\nA. Update pool-data-provider.js to:")
print("   1. Load vAMM/sAMM pool addresses from vamm_samm_pools.json")
print("   2. Query weights for all pools")
print("   3. Query token symbols for proper names")
print("   4. Return pools with basic data (rewards/VAPR from DOM)")

print("\nB. Ensure pool-extractor.js handles vAMM/sAMM:")
print("   1. Check if it already extracts vAMM/sAMM pools from DOM")
print("   2. Match extracted pools with our discovered addresses")
print("   3. Combine data (addresses from RPC, rewards/VAPR from DOM)")

print("\nC. Test integration:")
print("   1. Load extension on Blackhole DEX")
print("   2. Check if vAMM/sAMM pools appear")
print("   3. Verify rewards/VAPR are extracted from DOM")
