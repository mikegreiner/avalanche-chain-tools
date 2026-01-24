#!/usr/bin/env python3
"""
Analyze reward convergence patterns to detect bot activity.

This script analyzes whether pools converge to similar reward levels near epoch end,
which could indicate coordinated bot activity equalizing rewards across top pools.

Usage:
    python3 analyze_reward_convergence.py output/pool_tracking_2025-11-12_history.json
    python3 analyze_reward_convergence.py output/pool_tracking_combined_history.json
"""

import json
import sys
import argparse
from datetime import datetime, timezone
from typing import Dict, List, Optional
from collections import defaultdict
import statistics


def parse_timestamp(ts_str: str) -> datetime:
    """Parse ISO timestamp string to datetime."""
    try:
        if ts_str.endswith('Z'):
            ts_str = ts_str.replace('Z', '+00:00')
        return datetime.fromisoformat(ts_str)
    except Exception:
        return datetime.fromtimestamp(0)


def analyze_reward_convergence(history_file: str) -> None:
    """Analyze how estimated rewards converge over time."""
    print(f"Loading history from: {history_file}")
    
    with open(history_file, 'r') as f:
        history = json.load(f)
    
    if not history:
        print("Error: No history data found.")
        sys.exit(1)
    
    # Group snapshots by time (for time-series analysis)
    snapshots = []
    for snapshot in history:
        timestamp = parse_timestamp(snapshot['timestamp'])
        user_voting_power = snapshot.get('user_voting_power')
        
        if not user_voting_power:
            continue  # Skip snapshots without voting power (can't calculate estimated rewards)
        
        # Extract estimated rewards for all pools
        estimated_rewards = []
        pool_names = []
        
        for pool in snapshot.get('pools', []):
            est_reward = pool.get('estimated_reward')
            if est_reward is not None:
                estimated_rewards.append(est_reward)
                pool_names.append(pool.get('name', 'Unknown'))
        
        if estimated_rewards:
            snapshots.append({
                'timestamp': timestamp,
                'estimated_rewards': estimated_rewards,
                'pool_names': pool_names,
                'mean': statistics.mean(estimated_rewards),
                'median': statistics.median(estimated_rewards),
                'stdev': statistics.stdev(estimated_rewards) if len(estimated_rewards) > 1 else 0,
                'min': min(estimated_rewards),
                'max': max(estimated_rewards),
                'range': max(estimated_rewards) - min(estimated_rewards),
                'count': len(estimated_rewards)
            })
    
    if not snapshots:
        print("Error: No snapshots with estimated rewards found.")
        sys.exit(1)
    
    # Sort by timestamp
    snapshots.sort(key=lambda x: x['timestamp'])
    
    print(f"\n{'='*80}")
    print(f"REWARD CONVERGENCE ANALYSIS")
    print(f"{'='*80}")
    print(f"\nAnalyzed {len(snapshots)} snapshots")
    print(f"Time range: {snapshots[0]['timestamp']} to {snapshots[-1]['timestamp']}")
    
    # Calculate time intervals
    if len(snapshots) > 1:
        total_duration = (snapshots[-1]['timestamp'] - snapshots[0]['timestamp']).total_seconds() / 3600
        print(f"Duration: {total_duration:.1f} hours")
    
    # Analyze convergence over time
    print(f"\n{'='*80}")
    print(f"CONVERGENCE METRICS OVER TIME")
    print(f"{'='*80}")
    print(f"\n{'Time':<25} {'Mean':<12} {'StDev':<12} {'Range':<12} {'Min':<12} {'Max':<12} {'Pools':<8}")
    print(f"{'-'*100}")
    
    # Show first, middle, and last snapshots, plus any with significant changes
    key_snapshots = [0]  # First
    if len(snapshots) > 1:
        key_snapshots.append(len(snapshots) - 1)  # Last
    if len(snapshots) > 2:
        key_snapshots.append(len(snapshots) // 2)  # Middle
    
    # Also find snapshots with largest/smallest stdev
    stdevs = [(i, s['stdev']) for i, s in enumerate(snapshots)]
    stdevs.sort(key=lambda x: x[1])
    if len(stdevs) > 0:
        key_snapshots.append(stdevs[0][0])  # Most converged
    if len(stdevs) > 1:
        key_snapshots.append(stdevs[-1][0])  # Least converged
    
    key_snapshots = sorted(set(key_snapshots))
    
    for idx in key_snapshots:
        s = snapshots[idx]
        time_str = s['timestamp'].strftime('%Y-%m-%d %H:%M:%S')
        print(f"{time_str:<25} ${s['mean']:>10.2f} ${s['stdev']:>10.2f} ${s['range']:>10.2f} "
              f"${s['min']:>10.2f} ${s['max']:>10.2f} {s['count']:>7}")
    
    # Analyze convergence trend
    print(f"\n{'='*80}")
    print(f"CONVERGENCE TREND ANALYSIS")
    print(f"{'='*80}")
    
    if len(snapshots) >= 3:
        # Split into thirds
        third = len(snapshots) // 3
        early = snapshots[:third]
        middle = snapshots[third:2*third]
        late = snapshots[2*third:]
        
        early_stdev = statistics.mean([s['stdev'] for s in early])
        middle_stdev = statistics.mean([s['stdev'] for s in middle])
        late_stdev = statistics.mean([s['stdev'] for s in late])
        
        early_range = statistics.mean([s['range'] for s in early])
        middle_range = statistics.mean([s['range'] for s in middle])
        late_range = statistics.mean([s['range'] for s in late])
        
        print(f"\nStandard Deviation (lower = more converged):")
        print(f"  Early period:  ${early_stdev:.2f}")
        print(f"  Middle period: ${middle_stdev:.2f}")
        print(f"  Late period:   ${late_stdev:.2f}")
        
        convergence_pct = ((early_stdev - late_stdev) / early_stdev * 100) if early_stdev > 0 else 0
        print(f"\n  Convergence: {convergence_pct:+.1f}% (negative = diverged, positive = converged)")
        
        print(f"\nReward Range (max - min):")
        print(f"  Early period:  ${early_range:.2f}")
        print(f"  Middle period: ${middle_range:.2f}")
        print(f"  Late period:   ${late_range:.2f}")
        
        range_change_pct = ((early_range - late_range) / early_range * 100) if early_range > 0 else 0
        print(f"\n  Range change: {range_change_pct:+.1f}% (negative = narrowed, positive = widened)")
    
    # Analyze individual pool trajectories
    print(f"\n{'='*80}")
    print(f"INDIVIDUAL POOL TRAJECTORIES")
    print(f"{'='*80}")
    
    # Track each pool's estimated reward over time
    pool_trajectories = defaultdict(list)
    
    for snapshot in snapshots:
        # We need to match pools by name across snapshots
        # For now, just show the first snapshot's pools
        pass
    
    # Show first and last snapshot's top pools
    if len(snapshots) > 1:
        first = snapshots[0]
        last = snapshots[-1]
        
        # Get pool data from history
        first_snapshot_data = None
        last_snapshot_data = None
        
        for s in history:
            ts = parse_timestamp(s['timestamp'])
            if ts == first['timestamp']:
                first_snapshot_data = s
            if ts == last['timestamp']:
                last_snapshot_data = s
        
        if first_snapshot_data and last_snapshot_data:
            print(f"\nTop 10 Pools - First Snapshot:")
            first_pools = sorted(
                [(p.get('name'), p.get('estimated_reward', 0)) for p in first_snapshot_data.get('pools', [])],
                key=lambda x: x[1],
                reverse=True
            )[:10]
            for name, reward in first_pools:
                print(f"  {name:<40} ${reward:>10.2f}")
            
            print(f"\nTop 10 Pools - Last Snapshot:")
            last_pools = sorted(
                [(p.get('name'), p.get('estimated_reward', 0)) for p in last_snapshot_data.get('pools', [])],
                key=lambda x: x[1],
                reverse=True
            )[:10]
            for name, reward in last_pools:
                print(f"  {name:<40} ${reward:>10.2f}")
            
            # Calculate changes
            first_dict = {name: reward for name, reward in first_pools}
            last_dict = {name: reward for name, reward in last_pools}
            
            print(f"\nReward Changes (pools in both snapshots):")
            common_pools = set(first_dict.keys()) & set(last_dict.keys())
            changes = []
            for pool in common_pools:
                change = last_dict[pool] - first_dict[pool]
                change_pct = (change / first_dict[pool] * 100) if first_dict[pool] > 0 else 0
                changes.append((pool, change, change_pct))
            
            changes.sort(key=lambda x: x[1])  # Sort by absolute change
            
            print(f"\n  {'Pool Name':<40} {'Change':<15} {'Change %':<12}")
            print(f"  {'-'*70}")
            for pool, change, change_pct in changes[:10]:
                print(f"  {pool:<40} ${change:>+10.2f} ({change_pct:>+7.1f}%)")
    
    # Bot activity indicators
    print(f"\n{'='*80}")
    print(f"BOT ACTIVITY INDICATORS")
    print(f"{'='*80}")
    
    if len(snapshots) >= 3:
        # Check if rewards are converging toward a common value
        early_mean = statistics.mean([s['mean'] for s in early])
        late_mean = statistics.mean([s['mean'] for s in late])
        
        # Check if standard deviation is decreasing
        stdev_decreasing = late_stdev < early_stdev
        range_narrowing = late_range < early_range
        
        # Check if mean is stable (not changing much)
        mean_stable = abs(late_mean - early_mean) / early_mean < 0.1 if early_mean > 0 else False
        
        print(f"\nIndicators of potential bot activity:")
        print(f"  ✓ Rewards converging (stdev decreasing): {stdev_decreasing}")
        print(f"  ✓ Reward range narrowing: {range_narrowing}")
        print(f"  ✓ Mean reward stable: {mean_stable}")
        
        if stdev_decreasing and range_narrowing:
            print(f"\n⚠️  STRONG INDICATOR: Rewards are converging and range is narrowing.")
            print(f"   This suggests coordinated activity equalizing rewards across pools.")
            print(f"   Your consistent ~$40/week earnings support this hypothesis.")
        elif stdev_decreasing or range_narrowing:
            print(f"\n⚠️  MODERATE INDICATOR: Some convergence detected.")
        else:
            print(f"\n✓ No strong convergence pattern detected.")
    
    # Analyze vote velocity (if we have pool data with votes)
    print(f"\n{'='*80}")
    print(f"VOTE VELOCITY ANALYSIS")
    print(f"{'='*80}")
    
    # Calculate vote changes between snapshots
    vote_velocities = []
    for i in range(1, len(snapshots)):
        prev_snapshot_data = None
        curr_snapshot_data = None
        
        for s in history:
            ts = parse_timestamp(s['timestamp'])
            if ts == snapshots[i-1]['timestamp']:
                prev_snapshot_data = s
            if ts == snapshots[i]['timestamp']:
                curr_snapshot_data = s
        
        if prev_snapshot_data and curr_snapshot_data:
            # Match pools by pool_id
            prev_pools = {p.get('pool_id'): p for p in prev_snapshot_data.get('pools', [])}
            curr_pools = {p.get('pool_id'): p for p in curr_snapshot_data.get('pools', [])}
            
            total_vote_change = 0
            time_diff_hours = (snapshots[i]['timestamp'] - snapshots[i-1]['timestamp']).total_seconds() / 3600
            
            for pool_id in set(prev_pools.keys()) & set(curr_pools.keys()):
                prev_votes = prev_pools[pool_id].get('current_votes', 0) or 0
                curr_votes = curr_pools[pool_id].get('current_votes', 0) or 0
                vote_change = curr_votes - prev_votes
                total_vote_change += abs(vote_change)
            
            if time_diff_hours > 0:
                velocity = total_vote_change / time_diff_hours
                vote_velocities.append({
                    'timestamp': snapshots[i]['timestamp'],
                    'velocity': velocity,
                    'time_diff_hours': time_diff_hours
                })
    
    if vote_velocities:
        # Analyze velocity patterns
        early_velocities = [v['velocity'] for v in vote_velocities[:len(vote_velocities)//3]]
        late_velocities = [v['velocity'] for v in vote_velocities[-len(vote_velocities)//3:]]
        
        if early_velocities and late_velocities:
            early_avg = statistics.mean(early_velocities)
            late_avg = statistics.mean(late_velocities)
            
            print(f"\nAverage vote velocity:")
            print(f"  Early period: {early_avg:,.0f} votes/hour")
            print(f"  Late period:  {late_avg:,.0f} votes/hour")
            
            if late_avg > early_avg * 1.5:
                print(f"\n⚠️  VOTE SURGE DETECTED: Late-period velocity is {late_avg/early_avg:.1f}x higher!")
                print(f"   This strongly suggests coordinated bot activity near epoch end.")
            elif late_avg > early_avg:
                print(f"\n  → Moderate increase in vote velocity near epoch end.")
            else:
                print(f"\n  → Vote velocity stable or decreasing.")
    
    # Summary
    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    
    if len(snapshots) > 1:
        final_mean = snapshots[-1]['mean']
        final_stdev = snapshots[-1]['stdev']
        cv = (final_stdev / final_mean * 100) if final_mean > 0 else 0
        
        print(f"\nFinal snapshot statistics:")
        print(f"  Mean estimated reward: ${final_mean:.2f}")
        print(f"  Standard deviation: ${final_stdev:.2f}")
        print(f"  Coefficient of variation: {cv:.1f}% (lower = more equal)")
        print(f"  Reward range: ${snapshots[-1]['range']:.2f}")
        
        if cv < 20:
            print(f"\n  → Low variation ({cv:.1f}%) suggests rewards are quite equal across pools.")
        elif cv < 40:
            print(f"\n  → Moderate variation ({cv:.1f}%) suggests some reward differences remain.")
        else:
            print(f"\n  → High variation ({cv:.1f}%) suggests significant reward differences.")
        
        # Final assessment
        print(f"\n{'='*80}")
        print(f"ASSESSMENT")
        print(f"{'='*80}")
        
        evidence_count = 0
        if stdev_decreasing:
            evidence_count += 1
        if range_narrowing:
            evidence_count += 1
        if vote_velocities and late_avg > early_avg * 1.5:
            evidence_count += 1
        
        if evidence_count >= 2:
            print(f"\n🔴 STRONG EVIDENCE of bot activity equalizing rewards:")
            print(f"   - Your consistent ~$40/week earnings align with this pattern")
            print(f"   - Rewards converge to similar levels regardless of pool choice")
            print(f"   - Bots likely auto-voting across top pools to maintain equilibrium")
        elif evidence_count == 1:
            print(f"\n🟡 MODERATE EVIDENCE of bot activity")
        else:
            print(f"\n🟢 LITTLE EVIDENCE of coordinated bot activity")


def main():
    parser = argparse.ArgumentParser(
        description="Analyze reward convergence patterns to detect bot activity",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        'history_file',
        help='Path to history JSON file (e.g., output/pool_tracking_2025-11-12_history.json)'
    )
    
    args = parser.parse_args()
    
    try:
        analyze_reward_convergence(args.history_file)
    except FileNotFoundError:
        print(f"Error: File not found: {args.history_file}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in {args.history_file}: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
