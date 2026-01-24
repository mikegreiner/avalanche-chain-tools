#!/usr/bin/env python3
"""
Debug why recommendations dropped from 10 to 4
Check pool data and filtering logic
"""

import json

# Load pool data
with open('rpc_pool_data.json', 'r') as f:
    rpc_pools = json.load(f)

with open('rewards_map.json', 'r') as f:
    rewards = json.load(f)

print("="*80)
print("DEBUGGING RECOMMENDATIONS DROP")
print("="*80)

print(f"\nRPC Pools: {len(rpc_pools)}")
print(f"Pools with rewards: {len(rewards)}")

# Simulate what happens in merge
pools_with_rewards = 0
pools_without_rewards = 0

for pool in rpc_pools:
    pool_addr = pool['address'].lower()
    if pool_addr in rewards:
        pools_with_rewards += 1
    else:
        pools_without_rewards += 1

print(f"\nPools WITH rewards (from rewards_map.json): {pools_with_rewards}")
print(f"Pools WITHOUT rewards: {pools_without_rewards}")

# Check if minRewards filter would exclude many
print("\n" + "="*80)
print("FILTERING ANALYSIS")
print("="*80)

# Simulate recommendation with different minRewards
for min_rewards in [None, 0, 100, 1000, 5000]:
    eligible = 0
    for pool in rpc_pools:
        pool_addr = pool['address'].lower()
        reward = rewards.get(pool_addr, 0)
        
        if min_rewards is None or reward >= min_rewards:
            eligible += 1
    
    print(f"minRewards={min_rewards}: {eligible} pools eligible")

print("\n" + "="*80)
print("CONCLUSION")
print("="*80)
print("\nIssue: Only 51 pools have rewards in rewards_map.json")
print("If user has minRewards filter, many pools get excluded")
print("OR: Pools with 0 rewards get sorted to bottom")
print("\nSolution: Need to ensure DOM extraction gets rewards for all visible pools")
print("OR: Need to ensure RPC rewards provider intercepts multicall responses properly")
