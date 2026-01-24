#!/usr/bin/env python3
"""
Analyze which pools see the most late-voting bot activity.

Focuses on:
1. Vote velocity surges near epoch end
2. Which pools get the most late votes
3. Whether BLACK or SUPER pools get more bot activity
"""

import json
import sys
from collections import defaultdict
from statistics import mean, median
from pathlib import Path
from datetime import datetime

def parse_timestamp(ts_str: str) -> datetime:
    """Parse ISO timestamp string to datetime."""
    if ts_str.endswith('Z'):
        ts_str = ts_str.replace('Z', '+00:00')
    return datetime.fromisoformat(ts_str)

def analyze_bot_activity():
    # Load all history files
    files = [
        'output/pool_tracking_2025-11-05_history.json',
        'output/pool_tracking_2025-11-12_history.json',
        'output/pool_tracking_2025-11-19_history.json'
    ]
    
    # Track vote velocity by pool
    pool_velocities = defaultdict(list)  # pool_id -> list of velocities
    pool_late_velocities = defaultdict(list)  # pool_id -> list of late-period velocities
    pool_info = {}  # pool_id -> pool info
    
    # Track by token type
    black_pools = defaultdict(list)
    super_pools = defaultdict(list)
    other_pools = defaultdict(list)
    
    for file in files:
        try:
            filepath = Path(file)
            if not filepath.exists():
                continue
                
            with open(filepath, 'r') as f:
                history = json.load(f)
                
            if not history:
                continue
            
            # Sort by timestamp
            history.sort(key=lambda x: parse_timestamp(x['timestamp']))
            
            # Split into thirds for early/middle/late analysis
            third = len(history) // 3
            early_snapshots = history[:third] if third > 0 else []
            late_snapshots = history[-third:] if third > 0 else []
            
            # Calculate vote velocities between consecutive snapshots
            for i in range(1, len(history)):
                prev_snapshot = history[i-1]
                curr_snapshot = history[i]
                
                prev_pools = {p.get('pool_id'): p for p in prev_snapshot.get('pools', [])}
                curr_pools = {p.get('pool_id'): p for p in curr_snapshot.get('pools', [])}
                
                time_diff = (parse_timestamp(curr_snapshot['timestamp']) - 
                           parse_timestamp(prev_snapshot['timestamp'])).total_seconds() / 3600
                
                if time_diff <= 0:
                    continue
                
                # Calculate velocity for each pool
                for pool_id in set(prev_pools.keys()) & set(curr_pools.keys()):
                    prev_votes = prev_pools[pool_id].get('current_votes', 0) or 0
                    curr_votes = curr_pools[pool_id].get('current_votes', 0) or 0
                    vote_change = curr_votes - prev_votes
                    velocity = vote_change / time_diff
                    
                    pool_velocities[pool_id].append(velocity)
                    
                    # Store pool info
                    if pool_id not in pool_info:
                        pool_info[pool_id] = {
                            'name': curr_pools[pool_id].get('name', 'Unknown'),
                            'pool_id': pool_id
                        }
                    
                    # Check if this is late period
                    if curr_snapshot in late_snapshots:
                        pool_late_velocities[pool_id].append(velocity)
                        
                        # Categorize by token type
                        pool_name = curr_pools[pool_id].get('name', '').upper()
                        if '/BLACK' in pool_name or 'BLACK/' in pool_name:
                            black_pools[pool_id].append(velocity)
                        elif '/SUPER' in pool_name or 'SUPER/' in pool_name:
                            super_pools[pool_id].append(velocity)
                        else:
                            other_pools[pool_id].append(velocity)
                            
        except Exception as e:
            print(f"Error loading {file}: {e}", file=sys.stderr)
            continue
    
    # Calculate statistics for each pool
    pool_stats = []
    for pool_id, velocities in pool_velocities.items():
        if len(velocities) < 3:  # Need at least 3 data points
            continue
        
        late_velocities = pool_late_velocities.get(pool_id, [])
        
        avg_velocity = mean(velocities)
        median_velocity = median(velocities)
        max_velocity = max(velocities)
        
        avg_late_velocity = mean(late_velocities) if late_velocities else 0
        max_late_velocity = max(late_velocities) if late_velocities else 0
        
        # Calculate velocity surge (late vs overall)
        velocity_surge = (avg_late_velocity / avg_velocity) if avg_velocity > 0 else 0
        
        pool_stats.append({
            'pool_id': pool_id,
            'name': pool_info.get(pool_id, {}).get('name', 'Unknown'),
            'avg_velocity': avg_velocity,
            'median_velocity': median_velocity,
            'max_velocity': max_velocity,
            'avg_late_velocity': avg_late_velocity,
            'max_late_velocity': max_late_velocity,
            'velocity_surge': velocity_surge,
            'late_velocity_count': len(late_velocities),
            'total_velocity_count': len(velocities)
        })
    
    # Sort by late velocity (most bot activity)
    pool_stats.sort(key=lambda x: x['avg_late_velocity'], reverse=True)
    
    print("=" * 100)
    print("LATE-VOTING BOT ACTIVITY ANALYSIS")
    print("=" * 100)
    
    print(f"\nTop 15 Pools by Late-Period Vote Velocity (Most Bot Activity):")
    print(f"{'Pool Name':<40} {'Avg Late Vel':<15} {'Max Late Vel':<15} {'Surge':<10} {'Late Data':<10}")
    print("-" * 100)
    
    for p in pool_stats[:15]:
        surge_str = f"{p['velocity_surge']:.2f}x" if p['velocity_surge'] > 0 else "N/A"
        print(f"{p['name']:<40} {p['avg_late_velocity']:>13,.0f} {p['max_late_velocity']:>13,.0f} "
              f"{surge_str:>9} {p['late_velocity_count']:>9}")
    
    # Analyze by token type
    print(f"\n" + "=" * 100)
    print("BOT ACTIVITY BY TOKEN TYPE")
    print("=" * 100)
    
    def analyze_token_type(pools_dict, token_name):
        if not pools_dict:
            return None
        
        all_velocities = []
        for pool_id, velocities in pools_dict.items():
            all_velocities.extend(velocities)
        
        if not all_velocities:
            return None
        
        return {
            'token': token_name,
            'pool_count': len(pools_dict),
            'avg_velocity': mean(all_velocities),
            'median_velocity': median(all_velocities),
            'max_velocity': max(all_velocities),
            'total_data_points': len(all_velocities)
        }
    
    black_stats = analyze_token_type(black_pools, "BLACK")
    super_stats = analyze_token_type(super_pools, "SUPER")
    other_stats = analyze_token_type(other_pools, "Other")
    
    print(f"\n{'Token Type':<15} {'Pool Count':<12} {'Avg Velocity':<15} {'Median':<15} {'Max':<15} {'Data Points':<12}")
    print("-" * 100)
    
    for stats in [black_stats, super_stats, other_stats]:
        if stats:
            print(f"{stats['token']:<15} {stats['pool_count']:>11} {stats['avg_velocity']:>13,.0f} "
                  f"{stats['median_velocity']:>13,.0f} {stats['max_velocity']:>13,.0f} {stats['total_data_points']:>11}")
    
    # Compare BLACK vs SUPER
    if black_stats and super_stats:
        print(f"\n" + "=" * 100)
        print("BLACK vs SUPER COMPARISON")
        print("=" * 100)
        
        print(f"\nBLACK pools:")
        print(f"  Average late-period velocity: {black_stats['avg_velocity']:,.0f} votes/hour")
        print(f"  Number of BLACK pools tracked: {black_stats['pool_count']}")
        print(f"  Total data points: {black_stats['total_data_points']}")
        
        print(f"\nSUPER pools:")
        print(f"  Average late-period velocity: {super_stats['avg_velocity']:,.0f} votes/hour")
        print(f"  Number of SUPER pools tracked: {super_stats['pool_count']}")
        print(f"  Total data points: {super_stats['total_data_points']}")
        
        print(f"\nComparison:")
        if super_stats['avg_velocity'] > 0:
            black_ratio = black_stats['avg_velocity'] / super_stats['avg_velocity']
            if black_ratio > 1.2:
                print(f"  🔴 BLACK pools see {black_ratio:.2f}x MORE bot activity than SUPER pools")
            elif black_ratio < 0.8:
                print(f"  🟢 SUPER pools see {1/black_ratio:.2f}x MORE bot activity than BLACK pools")
            else:
                print(f"  🟡 Similar bot activity: BLACK is {black_ratio:.2f}x SUPER")
        else:
            print(f"  🔴 BLACK pools see SIGNIFICANTLY MORE bot activity than SUPER pools")
            print(f"     (SUPER pools show minimal/no late-period activity)")
    
    # Show specific BLACK and SUPER pools
    print(f"\n" + "=" * 100)
    print("TOP BLACK POOLS BY LATE-PERIOD ACTIVITY")
    print("=" * 100)
    
    black_pool_stats = [p for p in pool_stats if '/BLACK' in p['name'].upper() or 'BLACK/' in p['name'].upper()]
    black_pool_stats.sort(key=lambda x: x['avg_late_velocity'], reverse=True)
    
    if black_pool_stats:
        print(f"\n{'Pool Name':<40} {'Avg Late Vel':<15} {'Max Late Vel':<15} {'Surge':<10}")
        print("-" * 85)
        for p in black_pool_stats[:10]:
            surge_str = f"{p['velocity_surge']:.2f}x" if p['velocity_surge'] > 0 else "N/A"
            print(f"{p['name']:<40} {p['avg_late_velocity']:>13,.0f} {p['max_late_velocity']:>13,.0f} {surge_str:>9}")
    
    print(f"\n" + "=" * 100)
    print("TOP SUPER POOLS BY LATE-PERIOD ACTIVITY")
    print("=" * 100)
    
    super_pool_stats = [p for p in pool_stats if '/SUPER' in p['name'].upper() or 'SUPER/' in p['name'].upper()]
    super_pool_stats.sort(key=lambda x: x['avg_late_velocity'], reverse=True)
    
    if super_pool_stats:
        print(f"\n{'Pool Name':<40} {'Avg Late Vel':<15} {'Max Late Vel':<15} {'Surge':<10}")
        print("-" * 85)
        for p in super_pool_stats[:10]:
            surge_str = f"{p['velocity_surge']:.2f}x" if p['velocity_surge'] > 0 else "N/A"
            print(f"{p['name']:<40} {p['avg_late_velocity']:>13,.0f} {p['max_late_velocity']:>13,.0f} {surge_str:>9}")
    
    # Summary
    print(f"\n" + "=" * 100)
    print("SUMMARY")
    print("=" * 100)
    
    if black_stats and super_stats:
        if super_stats['avg_velocity'] > 0:
            black_ratio = black_stats['avg_velocity'] / super_stats['avg_velocity']
            if black_stats['avg_velocity'] > super_stats['avg_velocity']:
                print(f"\n🔴 BLACK pools see MORE late-voting bot activity:")
                print(f"   - BLACK: {black_stats['avg_velocity']:,.0f} votes/hour")
                print(f"   - SUPER: {super_stats['avg_velocity']:,.0f} votes/hour")
                print(f"   - Difference: {black_stats['avg_velocity'] - super_stats['avg_velocity']:,.0f} votes/hour ({black_ratio:.2f}x)")
            else:
                print(f"\n🟢 SUPER pools see MORE late-voting bot activity:")
                print(f"   - SUPER: {super_stats['avg_velocity']:,.0f} votes/hour")
                print(f"   - BLACK: {black_stats['avg_velocity']:,.0f} votes/hour")
                print(f"   - Difference: {super_stats['avg_velocity'] - black_stats['avg_velocity']:,.0f} votes/hour ({1/black_ratio:.2f}x)")
        else:
            print(f"\n🔴 BLACK pools see SIGNIFICANTLY MORE late-voting bot activity:")
            print(f"   - BLACK: {black_stats['avg_velocity']:,.0f} votes/hour")
            print(f"   - SUPER: {super_stats['avg_velocity']:,.0f} votes/hour (minimal activity)")
            print(f"   - BLACK pools are the primary target of late-voting bots")
    
    print(f"\nTop 3 pools with most bot activity:")
    for i, p in enumerate(pool_stats[:3], 1):
        print(f"  {i}. {p['name']}: {p['avg_late_velocity']:,.0f} votes/hour (surge: {p['velocity_surge']:.2f}x)")

if __name__ == '__main__':
    analyze_bot_activity()
