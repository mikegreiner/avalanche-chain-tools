#!/usr/bin/env python3
"""
Find "safe" pools that consistently yield stable rewards across epochs.

Given that bots equalize rewards, we want pools that:
1. Consistently appear in top pools
2. Have low variance in estimated rewards
3. Stay near the ~$40 sweet spot that bots target
"""

import json
import sys
from collections import defaultdict
from statistics import mean, stdev, median
from pathlib import Path

def find_safe_pools():
    # Load all history files
    files = [
        'output/pool_tracking_2025-11-05_history.json',
        'output/pool_tracking_2025-11-12_history.json',
        'output/pool_tracking_2025-11-19_history.json'
    ]
    
    pool_stats = defaultdict(lambda: {'rewards': [], 'appearances': 0, 'snapshots': []})
    
    for file in files:
        try:
            filepath = Path(file)
            if filepath.exists():
                with open(filepath, 'r') as f:
                    history = json.load(f)
                    for snapshot in history:
                        for pool in snapshot.get('pools', []):
                            pool_id = pool.get('pool_id')
                            pool_name = pool.get('name')
                            est_reward = pool.get('estimated_reward')
                            
                            if pool_id and est_reward is not None:
                                pool_stats[pool_id]['rewards'].append(est_reward)
                                pool_stats[pool_id]['appearances'] += 1
                                pool_stats[pool_id]['snapshots'].append({
                                    'name': pool_name,
                                    'reward': est_reward,
                                    'timestamp': snapshot.get('timestamp')
                                })
                                if 'name' not in pool_stats[pool_id]:
                                    pool_stats[pool_id]['name'] = pool_name
        except FileNotFoundError:
            pass
        except Exception as e:
            print(f"Error loading {file}: {e}", file=sys.stderr)
    
    # Calculate statistics
    results = []
    for pool_id, stats in pool_stats.items():
        if len(stats['rewards']) >= 10:  # Need at least 10 data points
            avg_reward = mean(stats['rewards'])
            reward_stdev = stdev(stats['rewards']) if len(stats['rewards']) > 1 else 0
            cv = (reward_stdev / avg_reward * 100) if avg_reward > 0 else 0
            min_reward = min(stats['rewards'])
            max_reward = max(stats['rewards'])
            median_reward = median(stats['rewards'])
            
            # Score: high appearances, low CV, close to $40 target
            target_reward = 40.0
            reward_distance = abs(avg_reward - target_reward)
            
            # Consistency score: appearances / (1 + CV) * (1 / (1 + distance_from_target))
            consistency_score = (stats['appearances'] / (1 + cv)) * (1 / (1 + reward_distance / 10))
            
            results.append({
                'name': stats['name'],
                'pool_id': pool_id,
                'avg_reward': avg_reward,
                'median_reward': median_reward,
                'stdev': reward_stdev,
                'cv': cv,
                'min': min_reward,
                'max': max_reward,
                'range': max_reward - min_reward,
                'appearances': stats['appearances'],
                'consistency_score': consistency_score,
                'reward_distance_from_target': reward_distance
            })
    
    # Sort by consistency score
    results.sort(key=lambda x: x['consistency_score'], reverse=True)
    
    print("=" * 100)
    print("SAFE POOL ANALYSIS - Most Consistent Pools Across Epochs")
    print("=" * 100)
    print(f"\nAnalyzed {len(results)} pools with sufficient data (>= 10 snapshots)")
    print(f"\nTop 15 Most Consistent Pools:")
    print(f"{'Pool Name':<40} {'Avg':<8} {'Median':<8} {'StDev':<8} {'CV %':<7} {'Range':<8} {'Apps':<6} {'Score':<8}")
    print("-" * 100)
    
    for r in results[:15]:
        print(f"{r['name']:<40} ${r['avg_reward']:>6.2f} ${r['median_reward']:>6.2f} ${r['stdev']:>6.2f} "
              f"{r['cv']:>5.1f}% ${r['range']:>6.2f} {r['appearances']:>5} {r['consistency_score']:>7.2f}")
    
    # Filter for "safe" pools: low CV (< 30%), close to $40 target (< $10 away), high appearances
    safe_pools = [
        r for r in results 
        if r['cv'] < 30 and abs(r['avg_reward'] - 40) < 10 and r['appearances'] >= 20
    ]
    
    # Also look at pools that consistently appear in final snapshots (epoch-end convergence)
    # Load last snapshot from each epoch to see which pools end up near $40
    epoch_end_pools = defaultdict(list)
    for file in files:
        try:
            filepath = Path(file)
            if filepath.exists():
                with open(filepath, 'r') as f:
                    history = json.load(f)
                    if history:
                        # Get last snapshot
                        last_snapshot = history[-1]
                        for pool in last_snapshot.get('pools', []):
                            pool_id = pool.get('pool_id')
                            est_reward = pool.get('estimated_reward')
                            if pool_id and est_reward is not None:
                                epoch_end_pools[pool_id].append(est_reward)
        except:
            pass
    
    # Find pools that consistently end near $40
    consistent_end_pools = []
    for pool_id, end_rewards in epoch_end_pools.items():
        if len(end_rewards) >= 2:  # Appeared in at least 2 epoch ends
            avg_end_reward = mean(end_rewards)
            if 35 <= avg_end_reward <= 50:  # Near $40 target
                # Find pool name
                pool_name = next((r['name'] for r in results if r['pool_id'] == pool_id), f"Pool-{pool_id[:8]}")
                consistent_end_pools.append({
                    'name': pool_name,
                    'pool_id': pool_id,
                    'avg_end_reward': avg_end_reward,
                    'end_rewards': end_rewards,
                    'epoch_end_appearances': len(end_rewards)
                })
    
    consistent_end_pools.sort(key=lambda x: (x['epoch_end_appearances'], -abs(x['avg_end_reward'] - 40)), reverse=True)
    
    print(f"\n" + "=" * 100)
    print("RECOMMENDED SAFE POOLS (Low variance, near $40 target, high consistency)")
    print("=" * 100)
    
    if safe_pools:
        print(f"\nFound {len(safe_pools)} safe pools:")
        print(f"{'Pool Name':<40} {'Avg Reward':<12} {'CV %':<8} {'Range':<10} {'Appearances':<12}")
        print("-" * 90)
        for r in safe_pools[:10]:
            print(f"{r['name']:<40} ${r['avg_reward']:>10.2f} {r['cv']:>6.1f}% ${r['range']:>8.2f} {r['appearances']:>11}")
    
    if consistent_end_pools:
        print(f"\n" + "=" * 100)
        print("POOLS THAT CONSISTENTLY END NEAR $40 AT EPOCH CLOSE")
        print("=" * 100)
        print(f"{'Pool Name':<40} {'Avg End Reward':<15} {'Epoch Ends':<12} {'End Rewards':<30}")
        print("-" * 100)
        for p in consistent_end_pools[:10]:
            rewards_str = ", ".join([f"${r:.2f}" for r in p['end_rewards']])
            print(f"{p['name']:<40} ${p['avg_end_reward']:>13.2f} {p['epoch_end_appearances']:>11} {rewards_str}")
    
    print(f"\n" + "=" * 100)
    print("TOP 3 RECOMMENDATIONS:")
    print("=" * 100)
    
    # Combine safe pools and consistent end pools
    recommendations = []
    
    # Add safe pools first
    for pool in safe_pools[:3]:
        recommendations.append({
            'name': pool['name'],
            'pool_id': pool['pool_id'],
            'type': 'low_variance',
            'avg_reward': pool['avg_reward'],
            'median_reward': pool['median_reward'],
            'cv': pool['cv'],
            'range': pool['range'],
            'min': pool['min'],
            'max': pool['max'],
            'appearances': pool['appearances']
        })
    
    # Add consistent end pools that aren't already in recommendations
    for pool in consistent_end_pools[:3]:
        if not any(r['pool_id'] == pool['pool_id'] for r in recommendations):
            # Find full stats if available
            full_stats = next((r for r in results if r['pool_id'] == pool['pool_id']), None)
            recommendations.append({
                'name': pool['name'],
                'pool_id': pool['pool_id'],
                'type': 'consistent_epoch_end',
                'avg_reward': pool['avg_end_reward'],
                'median_reward': mean(pool['end_rewards']),
                'cv': (stdev(pool['end_rewards']) / mean(pool['end_rewards']) * 100) if len(pool['end_rewards']) > 1 else 0,
                'range': max(pool['end_rewards']) - min(pool['end_rewards']),
                'min': min(pool['end_rewards']),
                'max': max(pool['end_rewards']),
                'appearances': pool['epoch_end_appearances']
            })
    
    for i, pool in enumerate(recommendations[:3], 1):
        print(f"\n{i}. {pool['name']} ({pool['type']})")
        print(f"   Average Reward: ${pool['avg_reward']:.2f}")
        print(f"   Median Reward: ${pool['median_reward']:.2f}")
        print(f"   Coefficient of Variation: {pool['cv']:.1f}% (lower = more stable)")
        print(f"   Reward Range: ${pool['min']:.2f} - ${pool['max']:.2f} (${pool['range']:.2f} spread)")
        print(f"   Appearances: {pool['appearances']} snapshots")
        if pool['type'] == 'consistent_epoch_end':
            print(f"   ✓ Consistently appears near $40 at epoch close")
        else:
            print(f"   ✓ Low variance, stable across all snapshots")

if __name__ == '__main__':
    find_safe_pools()
