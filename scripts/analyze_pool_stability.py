#!/usr/bin/env python3
"""
Analyze pool tracking data to identify stability patterns and metrics.

This script analyzes historical pool data to:
1. Calculate vote velocity and reward stability
2. Identify which pools maintain profitability vs decline
3. Test hypotheses about pool stability (large rewards + large votes = more stable)
4. Generate insights for building a stability-adjusted scoring algorithm
"""

import json
import sys
from datetime import datetime
from collections import defaultdict
from typing import Dict, List, Optional
from pathlib import Path
import statistics

def load_history_file(filepath: str) -> List[Dict]:
    """Load pool tracking history file."""
    with open(filepath, 'r') as f:
        return json.load(f)

def parse_timestamp(ts_str: str) -> datetime:
    """Parse ISO timestamp string to datetime."""
    if ts_str.endswith('Z'):
        ts_str = ts_str.replace('Z', '+00:00')
    return datetime.fromisoformat(ts_str)

def analyze_pool_trajectory(pool_snapshots: List[Dict]) -> Dict:
    """Analyze a single pool's trajectory over time."""
    if len(pool_snapshots) < 2:
        return None
    
    # Sort by timestamp
    pool_snapshots = sorted(pool_snapshots, key=lambda x: parse_timestamp(x['timestamp']))
    
    first = pool_snapshots[0]
    last = pool_snapshots[-1]
    
    # Calculate changes
    time_span = (parse_timestamp(last['timestamp']) - parse_timestamp(first['timestamp'])).total_seconds() / 3600  # hours
    
    if time_span == 0:
        return None
    
    # Vote velocity (votes per hour)
    vote_change = last['current_votes'] - first['current_votes']
    vote_velocity = vote_change / time_span if time_span > 0 else 0
    
    # Reward change
    reward_change = last['total_rewards'] - first['total_rewards']
    reward_change_pct = (reward_change / first['total_rewards'] * 100) if first['total_rewards'] > 0 else 0
    
    # Rewards per vote change
    rpv_first = first['rewards_per_vote']
    rpv_last = last['rewards_per_vote']
    rpv_change_pct = ((rpv_last - rpv_first) / rpv_first * 100) if rpv_first > 0 else 0
    
    # Profitability score change
    score_first = first['profitability_score']
    score_last = last['profitability_score']
    score_change = score_last - score_first
    score_change_pct = (score_change / score_first * 100) if score_first > 0 else 0
    
    # Estimated reward change
    est_reward_first = first['estimated_reward']
    est_reward_last = last['estimated_reward']
    est_reward_change = est_reward_last - est_reward_first
    est_reward_change_pct = (est_reward_change / est_reward_first * 100) if est_reward_first > 0 else 0
    
    # Calculate stability metrics (coefficient of variation)
    rewards = [s['total_rewards'] for s in pool_snapshots]
    votes = [s['current_votes'] for s in pool_snapshots]
    rpv_values = [s['rewards_per_vote'] for s in pool_snapshots if s.get('rewards_per_vote') is not None]
    scores = [s['profitability_score'] for s in pool_snapshots]
    
    # New stability metrics (if available in data)
    stability_scores = [s['stability_score'] for s in pool_snapshots if s.get('stability_score') is not None]
    stability_adjusted_scores = [s['stability_adjusted_score'] for s in pool_snapshots if s.get('stability_adjusted_score') is not None]
    vote_densities = [s['vote_density'] for s in pool_snapshots if s.get('vote_density') is not None]
    
    reward_cv = (statistics.stdev(rewards) / statistics.mean(rewards) * 100) if len(rewards) > 1 and statistics.mean(rewards) > 0 else 0
    vote_cv = (statistics.stdev(votes) / statistics.mean(votes) * 100) if len(votes) > 1 and statistics.mean(votes) > 0 else 0
    rpv_cv = (statistics.stdev(rpv_values) / statistics.mean(rpv_values) * 100) if len(rpv_values) > 1 and statistics.mean(rpv_values) > 0 else 0
    score_cv = (statistics.stdev(scores) / statistics.mean(scores) * 100) if len(scores) > 1 and statistics.mean(scores) > 0 else 0
    
    # Stability score CV (if available)
    stability_cv = (statistics.stdev(stability_scores) / statistics.mean(stability_scores) * 100) if len(stability_scores) > 1 and statistics.mean(stability_scores) > 0 else 0
    stability_adjusted_cv = (statistics.stdev(stability_adjusted_scores) / statistics.mean(stability_adjusted_scores) * 100) if len(stability_adjusted_scores) > 1 and statistics.mean(stability_adjusted_scores) > 0 else 0
    vote_density_cv = (statistics.stdev(vote_densities) / statistics.mean(vote_densities) * 100) if len(vote_densities) > 1 and statistics.mean(vote_densities) > 0 else 0
    
    # Average values
    avg_rewards = statistics.mean(rewards)
    avg_votes = statistics.mean(votes)
    avg_rpv = statistics.mean(rpv_values)
    
    return {
        'pool_name': first['name'],
        'pool_id': first.get('pool_id'),
        'pool_type': first.get('pool_type'),
        'snapshots': len(pool_snapshots),
        'time_span_hours': time_span,
        'first_timestamp': first['timestamp'],
        'last_timestamp': last['timestamp'],
        # Initial values
        'initial_rewards': first['total_rewards'],
        'initial_votes': first['current_votes'],
        'initial_rpv': rpv_first,
        'initial_score': score_first,
        'initial_est_reward': est_reward_first,
        # Final values
        'final_rewards': last['total_rewards'],
        'final_votes': last['current_votes'],
        'final_rpv': rpv_last,
        'final_score': score_last,
        'final_est_reward': est_reward_last,
        # Changes
        'vote_change': vote_change,
        'vote_velocity': vote_velocity,
        'reward_change': reward_change,
        'reward_change_pct': reward_change_pct,
        'rpv_change_pct': rpv_change_pct,
        'score_change': score_change,
        'score_change_pct': score_change_pct,
        'est_reward_change': est_reward_change,
        'est_reward_change_pct': est_reward_change_pct,
        # Stability metrics (coefficient of variation - lower = more stable)
        'reward_stability': reward_cv,
        'vote_stability': vote_cv,
        'rpv_stability': rpv_cv,
        'score_stability': score_cv,
        'stability_score_stability': stability_cv if stability_scores else None,
        'stability_adjusted_stability': stability_adjusted_cv if stability_adjusted_scores else None,
        'vote_density_stability': vote_density_cv if vote_densities else None,
        # Average values
        'avg_rewards': avg_rewards,
        'avg_votes': avg_votes,
        'avg_rpv': avg_rpv,
        'avg_stability_score': statistics.mean(stability_scores) if stability_scores else None,
        'avg_stability_adjusted_score': statistics.mean(stability_adjusted_scores) if stability_adjusted_scores else None,
        'avg_vote_density': statistics.mean(vote_densities) if vote_densities else None,
        # Characteristics
        'vote_density': avg_votes / avg_rewards if avg_rewards > 0 else 0,  # votes per dollar of rewards (calculated, may differ from tracked)
        'reward_size_category': 'large' if avg_rewards > 50000 else 'medium' if avg_rewards > 20000 else 'small',
        'vote_size_category': 'large' if avg_votes > 20000000 else 'medium' if avg_votes > 10000000 else 'small',
    }

def analyze_all_pools(history_file: str) -> Dict:
    """Analyze all pools in history file."""
    history = load_history_file(history_file)
    
    # Group snapshots by pool_id (or name if no pool_id)
    pools_by_id = defaultdict(list)
    
    for snapshot in history:
        timestamp = snapshot.get('timestamp')
        pools = snapshot.get('pools', [])
        
        for pool in pools:
            pool_id = pool.get('pool_id') or pool.get('name')
            pool_with_timestamp = {**pool, 'timestamp': timestamp}
            pools_by_id[pool_id].append(pool_with_timestamp)
    
    # Analyze each pool
    pool_analyses = []
    for pool_id, snapshots in pools_by_id.items():
        analysis = analyze_pool_trajectory(snapshots)
        if analysis:
            pool_analyses.append(analysis)
    
    return {
        'total_pools': len(pool_analyses),
        'pools': pool_analyses
    }

def generate_insights(analysis: Dict) -> Dict:
    """Generate insights from the analysis."""
    pools = analysis['pools']
    
    if not pools:
        return {'error': 'No pool data to analyze'}
    
    # Sort pools by different metrics
    by_reward_stability = sorted(pools, key=lambda x: x['reward_stability'])
    by_rpv_stability = sorted(pools, key=lambda x: x['rpv_stability'])
    by_score_stability = sorted(pools, key=lambda x: x['score_stability'])
    by_est_reward_change = sorted(pools, key=lambda x: x['est_reward_change_pct'], reverse=True)
    
    # Test hypothesis: Large rewards + large votes = more stable
    large_rewards_large_votes = [p for p in pools if p['reward_size_category'] == 'large' and p['vote_size_category'] == 'large']
    small_rewards_small_votes = [p for p in pools if p['reward_size_category'] == 'small' and p['vote_size_category'] == 'small']
    
    # Calculate average stability for each group
    def avg_stability(pool_list, metric='rpv_stability'):
        if not pool_list:
            return None
        return statistics.mean([p[metric] for p in pool_list])
    
    insights = {
        'total_pools_analyzed': len(pools),
        'most_stable_rewards': by_reward_stability[:5],
        'most_stable_rpv': by_rpv_stability[:5],
        'most_stable_scores': by_score_stability[:5],
        'best_reward_gainers': by_est_reward_change[:5],
        'worst_reward_losers': sorted(pools, key=lambda x: x['est_reward_change_pct'])[:5],
        'hypothesis_test': {
            'large_rewards_large_votes': {
                'count': len(large_rewards_large_votes),
                'avg_rpv_stability': avg_stability(large_rewards_large_votes, 'rpv_stability'),
                'avg_reward_stability': avg_stability(large_rewards_large_votes, 'reward_stability'),
                'avg_score_stability': avg_stability(large_rewards_large_votes, 'score_stability'),
                'avg_est_reward_change_pct': statistics.mean([p['est_reward_change_pct'] for p in large_rewards_large_votes]) if large_rewards_large_votes else None,
            },
            'small_rewards_small_votes': {
                'count': len(small_rewards_small_votes),
                'avg_rpv_stability': avg_stability(small_rewards_small_votes, 'rpv_stability'),
                'avg_reward_stability': avg_stability(small_rewards_small_votes, 'reward_stability'),
                'avg_score_stability': avg_stability(small_rewards_small_votes, 'score_stability'),
                'avg_est_reward_change_pct': statistics.mean([p['est_reward_change_pct'] for p in small_rewards_small_votes]) if small_rewards_small_votes else None,
            }
        },
        'vote_velocity_stats': {
            'avg': statistics.mean([p['vote_velocity'] for p in pools]),
            'median': statistics.median([p['vote_velocity'] for p in pools]),
            'max': max([p['vote_velocity'] for p in pools]),
            'min': min([p['vote_velocity'] for p in pools]),
        },
        'correlations': {
            'vote_density_vs_stability': {
                'high_density': avg_stability([p for p in pools if p['vote_density'] > statistics.median([p['vote_density'] for p in pools])], 'rpv_stability'),
                'low_density': avg_stability([p for p in pools if p['vote_density'] <= statistics.median([p['vote_density'] for p in pools])], 'rpv_stability'),
            }
        }
    }
    
    return insights

def print_analysis_report(analysis: Dict, insights: Dict):
    """Print a human-readable analysis report."""
    print("=" * 80)
    print("POOL STABILITY ANALYSIS REPORT")
    print("=" * 80)
    print(f"\nTotal Pools Analyzed: {insights['total_pools_analyzed']}")
    
    print("\n" + "=" * 80)
    print("HYPOTHESIS TEST: Large Rewards + Large Votes = More Stable?")
    print("=" * 80)
    
    hyp = insights['hypothesis_test']
    large = hyp['large_rewards_large_votes']
    small = hyp['small_rewards_small_votes']
    
    print(f"\nLarge Rewards + Large Votes (n={large['count']}):")
    print(f"  Average RPV Stability (CV): {large['avg_rpv_stability']:.2f}% (lower = more stable)")
    print(f"  Average Reward Stability (CV): {large['avg_reward_stability']:.2f}%")
    print(f"  Average Score Stability (CV): {large['avg_score_stability']:.2f}%")
    print(f"  Average Estimated Reward Change: {large['avg_est_reward_change_pct']:.2f}%")
    
    print(f"\nSmall Rewards + Small Votes (n={small['count']}):")
    print(f"  Average RPV Stability (CV): {small['avg_rpv_stability']:.2f}% (lower = more stable)")
    print(f"  Average Reward Stability (CV): {small['avg_reward_stability']:.2f}%")
    print(f"  Average Score Stability (CV): {small['avg_score_stability']:.2f}%")
    print(f"  Average Estimated Reward Change: {small['avg_est_reward_change_pct']:.2f}%")
    
    if large['avg_rpv_stability'] and small['avg_rpv_stability']:
        if large['avg_rpv_stability'] < small['avg_rpv_stability']:
            print("\n✓ HYPOTHESIS SUPPORTED: Large rewards + large votes pools are MORE stable")
        else:
            print("\n✗ HYPOTHESIS NOT SUPPORTED: Large rewards + large votes pools are LESS stable")
    
    print("\n" + "=" * 80)
    print("MOST STABLE POOLS (by Rewards per Vote Stability)")
    print("=" * 80)
    for i, pool in enumerate(insights['most_stable_rpv'][:10], 1):
        print(f"{i}. {pool['pool_name']}")
        print(f"   RPV Stability (CV): {pool['rpv_stability']:.2f}%")
        print(f"   Avg Rewards: ${pool['avg_rewards']:,.0f}, Avg Votes: {pool['avg_votes']:,.0f}")
        print(f"   Est Reward Change: {pool['est_reward_change_pct']:.2f}%")
        print()
    
    print("=" * 80)
    print("BEST PERFORMERS (Estimated Reward Gain)")
    print("=" * 80)
    for i, pool in enumerate(insights['best_reward_gainers'][:10], 1):
        print(f"{i}. {pool['pool_name']}")
        print(f"   Est Reward Change: {pool['est_reward_change_pct']:+.2f}%")
        print(f"   Initial: ${pool['initial_est_reward']:.2f} → Final: ${pool['final_est_reward']:.2f}")
        print(f"   RPV Stability: {pool['rpv_stability']:.2f}%")
        print()
    
    print("=" * 80)
    print("VOTE VELOCITY STATISTICS")
    print("=" * 80)
    vv = insights['vote_velocity_stats']
    print(f"Average: {vv['avg']:,.0f} votes/hour")
    print(f"Median: {vv['median']:,.0f} votes/hour")
    print(f"Range: {vv['min']:,.0f} to {vv['max']:,.0f} votes/hour")
    
    print("\n" + "=" * 80)
    print("VOTE DENSITY vs STABILITY")
    print("=" * 80)
    corr = insights['correlations']['vote_density_vs_stability']
    print(f"High Vote Density (above median): {corr['high_density']:.2f}% RPV stability")
    print(f"Low Vote Density (below median): {corr['low_density']:.2f}% RPV stability")

def main():
    """Main analysis function."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Analyze pool tracking data for stability patterns')
    parser.add_argument('history_file', help='Path to pool tracking history JSON file')
    parser.add_argument('--output', '-o', help='Output file for detailed JSON analysis')
    parser.add_argument('--json', action='store_true', help='Output as JSON instead of text')
    
    args = parser.parse_args()
    
    if not Path(args.history_file).exists():
        print(f"Error: History file not found: {args.history_file}", file=sys.stderr)
        sys.exit(1)
    
    print("Loading and analyzing pool tracking data...", file=sys.stderr)
    analysis = analyze_all_pools(args.history_file)
    insights = generate_insights(analysis)
    
    if args.json:
        output = {
            'analysis': analysis,
            'insights': insights
        }
        if args.output:
            with open(args.output, 'w') as f:
                json.dump(output, f, indent=2)
        else:
            print(json.dumps(output, indent=2))
    else:
        print_analysis_report(analysis, insights)
        
        if args.output:
            output = {
                'analysis': analysis,
                'insights': insights
            }
            with open(args.output, 'w') as f:
                json.dump(output, f, indent=2)
            print(f"\nDetailed JSON analysis saved to: {args.output}", file=sys.stderr)

if __name__ == '__main__':
    main()
