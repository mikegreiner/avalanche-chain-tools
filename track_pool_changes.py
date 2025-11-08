#!/usr/bin/env python3
"""
Track changes in recommended pools over time.

This script monitors which recommended pools receive the most late-breaking votes
and which pools' rewards hold up best (least dilution) until the voting window closes.

Usage:
    # First run: Save current recommended pools as baseline
    python3 track_pool_changes.py --init --top 10 --voting-power 15000
    
    # Subsequent runs: Compare current state to baseline
    python3 track_pool_changes.py
    
    # View history of changes
    python3 track_pool_changes.py --history
"""

import json
import argparse
import sys
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional
from pathlib import Path

__version__ = "1.1.0"

try:
    from blackhole_pool_recommender import BlackholePoolRecommender, Pool
except ImportError:
    print("Error: Could not import blackhole_pool_recommender. Make sure it's in the same directory.")
    sys.exit(1)


def format_timestamp_display(utc_timestamp_str: str) -> str:
    """Convert UTC timestamp string to local time for display.
    
    Args:
        utc_timestamp_str: ISO format UTC timestamp string
        
    Returns:
        Formatted string showing local time and UTC time
    """
    try:
        # Parse UTC timestamp
        if utc_timestamp_str.endswith('Z'):
            utc_timestamp_str = utc_timestamp_str.replace('Z', '+00:00')
        utc_dt = datetime.fromisoformat(utc_timestamp_str)
        
        # Convert to local time
        local_dt = utc_dt.astimezone()
        
        # Format both times
        local_str = local_dt.strftime('%Y-%m-%d %H:%M:%S %Z')
        utc_str = utc_dt.strftime('%Y-%m-%d %H:%M:%S UTC')
        
        return f"{local_str} ({utc_str})"
    except Exception:
        # Fallback to original if parsing fails
        return utc_timestamp_str


DEFAULT_TRACKING_FILE = 'pool_tracking_data.json'
DEFAULT_HISTORY_FILE = 'pool_tracking_history.json'


def get_tracking_files(output_file: Optional[str]) -> tuple[str, str]:
    """Get tracking file paths based on output file argument."""
    if output_file:
        # Use output file as base name, strip extension if present
        base = output_file.replace('.json', '').replace('.txt', '')
        tracking_file = f"{base}_baseline.json"
        history_file = f"{base}_history.json"
    else:
        tracking_file = DEFAULT_TRACKING_FILE
        history_file = DEFAULT_HISTORY_FILE
    
    return tracking_file, history_file


def save_baseline(recommender: BlackholePoolRecommender, args: argparse.Namespace) -> None:
    """Save current recommended pools as baseline for tracking."""
    print("Fetching current pool recommendations...")
    
    try:
        recommendations = recommender.recommend_pools(
            top_n=args.top,
            user_voting_power=args.voting_power,
            hide_vamm=args.hide_vamm,
            min_rewards=args.min_rewards,
            max_pool_percentage=args.max_pool_percentage,
            pool_name=args.pool_name,
            quiet=True
        )
    except Exception as e:
        print(f"Error fetching pool data: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
    
    if not recommendations:
        print("Error: No pools recommended. Cannot create baseline.", file=sys.stderr)
        sys.exit(1)
    
    # Calculate rewards per vote for each pool
    baseline_data = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "epoch_close_mountain": args.epoch_close_mountain if hasattr(args, 'epoch_close_mountain') else None,
        "user_voting_power": args.voting_power,  # Store voting power for estimated rewards tracking
        "pools": []
    }
    
    for pool in recommendations:
        rewards_per_vote = None
        if pool.current_votes is not None and pool.current_votes > 0:
            rewards_per_vote = pool.total_rewards / pool.current_votes
        
        estimated_reward = None
        if args.voting_power:
            estimated_reward = pool.estimate_user_rewards(args.voting_power)
        
        pool_data = {
            "name": pool.name,
            "pool_id": pool.pool_id,
            "pool_type": pool.pool_type,
            "total_rewards": pool.total_rewards,
            "current_votes": pool.current_votes,
            "rewards_per_vote": rewards_per_vote,
            "vapr": pool.vapr,
            "profitability_score": pool.profitability_score(),
            "estimated_reward": estimated_reward
        }
        baseline_data["pools"].append(pool_data)
    
    tracking_file, _ = get_tracking_files(args.output)
    
    # Ensure output directory exists
    tracking_path = Path(tracking_file)
    tracking_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(tracking_file, 'w') as f:
        json.dump(baseline_data, f, indent=2)
    
    print(f"\n[OK] Baseline saved to {tracking_file}")
    print(f"     Tracked {len(recommendations)} pools")
    print(f"     Timestamp: {format_timestamp_display(baseline_data['timestamp'])}")
    if baseline_data["epoch_close_mountain"]:
        print(f"     Epoch closes: {baseline_data['epoch_close_mountain']} (Mountain Time)")
    print(f"\n[SUCCESS] Baseline initialization completed successfully")


def load_baseline(output_file: Optional[str] = None) -> Optional[Dict]:
    """Load baseline data from tracking file."""
    tracking_file, _ = get_tracking_files(output_file)
    
    if not Path(tracking_file).exists():
        return None
    
    with open(tracking_file, 'r') as f:
        return json.load(f)


def save_snapshot(recommender: BlackholePoolRecommender, args: argparse.Namespace, history_file: str) -> None:
    """Save a snapshot of current pool state (for time-series tracking)."""
    print("Fetching current pool data...")
    
    try:
        recommendations = recommender.recommend_pools(
            top_n=args.top,
            user_voting_power=args.voting_power,
            hide_vamm=args.hide_vamm,
            min_rewards=args.min_rewards,
            max_pool_percentage=args.max_pool_percentage,
            pool_name=args.pool_name,
            quiet=True
        )
    except Exception as e:
        print(f"Error fetching pool data: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
    
    if not recommendations:
        print("Error: No pools found. Cannot save snapshot.", file=sys.stderr)
        sys.exit(1)
    
    snapshot = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_voting_power": args.voting_power,  # Store voting power for estimated rewards tracking
        "pools": []
    }
    
    for pool in recommendations:
        rewards_per_vote = None
        if pool.current_votes is not None and pool.current_votes > 0:
            rewards_per_vote = pool.total_rewards / pool.current_votes
        
        estimated_reward = None
        if args.voting_power:
            estimated_reward = pool.estimate_user_rewards(args.voting_power)
        
        pool_data = {
            "name": pool.name,
            "pool_id": pool.pool_id,
            "pool_type": pool.pool_type,
            "total_rewards": pool.total_rewards,
            "current_votes": pool.current_votes,
            "rewards_per_vote": rewards_per_vote,
            "vapr": pool.vapr,
            "profitability_score": pool.profitability_score(),
            "estimated_reward": estimated_reward
        }
        snapshot["pools"].append(pool_data)
    
    # Save snapshot to history
    history_path = Path(history_file)
    history_path.parent.mkdir(parents=True, exist_ok=True)
    
    if history_path.exists():
        with open(history_path, 'r') as f:
            history = json.load(f)
    else:
        history = []
    
    history.append(snapshot)
    
    # Keep only last 2000 entries (about 14 days if running every 15 minutes)
    # Calculation: 4 snapshots/hour → 24 hours → 14 days = 1,344 snapshots
    history = history[-2000:]
    
    with open(history_file, 'w') as f:
        json.dump(history, f, indent=2)
    
    print(f"\n[OK] Snapshot saved to {history_file}")
    print(f"     Tracked {len(recommendations)} pools")
    print(f"     Timestamp: {format_timestamp_display(snapshot['timestamp'])}")
    print(f"     Total snapshots in history: {len(history)}")
    print(f"\n[SUCCESS] Snapshot completed successfully")


def show_history(history_file: str) -> None:
    """Show history of pool changes and trends."""
    history_path = Path(history_file)
    
    if not history_path.exists():
        print(f"No history file found: {history_file}")
        print("Run snapshots first to build history.")
        return
    
    with open(history_path, 'r') as f:
        history = json.load(f)
    
    print(f"\n{'='*80}")
    print(f"POOL TRACKING HISTORY ({len(history)} entries)")
    print(f"{'='*80}\n")
    
    # Filter to snapshots only (ignore any old comparison entries)
    snapshots = [e for e in history if e.get('type') != 'comparison']
    
    if snapshots:
        print(f"SNAPSHOTS ({len(snapshots)} total):")
        print("-" * 80)
        for entry in snapshots[-10:]:  # Show last 10
            timestamp_display = format_timestamp_display(entry['timestamp'])
            print(f"  {timestamp_display}: {len(entry.get('pools', []))} pools")
        
        # Show trends if we have multiple snapshots
        if len(snapshots) >= 2:
            print(f"\n\nTRENDS ACROSS SNAPSHOTS:")
            print("-" * 80)
            show_trends(snapshots)
    else:
        print("No snapshots found. Run --snapshot to start tracking.")
    
    print(f"\n[SUCCESS] History display completed successfully")
    print()


def calculate_goodness_score(trend: Dict) -> float:
    """Calculate a composite 'goodness' score for a pool.
    
    Higher scores = better pools (less dilution, better metrics).
    Components:
    - Estimated reward change % (higher is better)
    - Rewards per vote change % (higher is better)
    - APR change % (higher is better)
    - Total rewards change % (higher is better)
    - Votes change % (lower is better, so we negate it)
    """
    score = 0.0
    
    # Estimated reward change (most important - direct impact on user)
    if trend['estimated_reward_change_pct'] is not None:
        score += trend['estimated_reward_change_pct'] * 2.0
    
    # Rewards per vote change (indicates dilution)
    if trend['rpv_change_pct'] is not None:
        score += trend['rpv_change_pct'] * 1.5
    
    # APR change (higher is better)
    if trend['vapr_change_pct'] is not None:
        score += trend['vapr_change_pct'] * 1.0
    
    # Total rewards change (higher is better)
    if trend['total_rewards_change_pct'] is not None:
        score += trend['total_rewards_change_pct'] * 0.5
    
    # Votes change (lower is better - less dilution)
    # Normalize votes change as percentage, then negate
    if trend['first_votes'] > 0:
        votes_change_pct = ((trend['votes_change'] or 0) / trend['first_votes']) * 100
        score -= votes_change_pct * 0.3  # Less votes = better
    
    return score


def get_attractiveness_symbol(trend: Dict) -> str:
    """Get a symbol indicating overall pool attractiveness change.
    
    Returns: ↑ (more attractive), ↓ (less attractive), → (neutral/no change)
    """
    score = calculate_goodness_score(trend)
    
    # Thresholds for determining attractiveness
    if score > 2.0:
        return "↑↑"  # Significantly more attractive
    elif score > 0.5:
        return "↑"   # More attractive
    elif score < -2.0:
        return "↓↓"  # Significantly less attractive
    elif score < -0.5:
        return "↓"   # Less attractive
    else:
        return "→"   # Neutral/similar


def show_trends(snapshots: List[Dict]) -> None:
    """Show trends across multiple snapshots."""
    if len(snapshots) < 2:
        return
    
    # Get all unique pool names/IDs across snapshots
    pool_keys = {}
    for snapshot in snapshots:
        for pool in snapshot.get('pools', []):
            key = pool.get('pool_id') or pool.get('name')
            if key:
                pool_keys[key] = pool.get('name', key)
    
    # Track changes for each pool
    trends = []
    for pool_key, pool_name in pool_keys.items():
        # Find pool in first and last snapshot
        first_pool = None
        last_pool = None
        
        for snapshot in snapshots:
            for pool in snapshot.get('pools', []):
                if (pool.get('pool_id') == pool_key or pool.get('name') == pool_key):
                    if first_pool is None:
                        first_pool = pool
                    last_pool = pool
                    break
        
        if first_pool and last_pool:
            first_votes = first_pool.get('current_votes') or 0
            last_votes = last_pool.get('current_votes') or 0
            votes_change = last_votes - first_votes
            
            first_rpv = first_pool.get('rewards_per_vote')
            last_rpv = last_pool.get('rewards_per_vote')
            
            rpv_change_pct = None
            if first_rpv is not None and last_rpv is not None and first_rpv > 0:
                rpv_change_pct = ((last_rpv - first_rpv) / first_rpv) * 100
            
            first_total_rewards = first_pool.get('total_rewards') or 0
            last_total_rewards = last_pool.get('total_rewards') or 0
            total_rewards_change = last_total_rewards - first_total_rewards
            total_rewards_change_pct = None
            if first_total_rewards > 0:
                total_rewards_change_pct = (total_rewards_change / first_total_rewards) * 100
            
            first_vapr = first_pool.get('vapr') or 0
            last_vapr = last_pool.get('vapr') or 0
            vapr_change = last_vapr - first_vapr
            vapr_change_pct = None
            if first_vapr > 0:
                vapr_change_pct = (vapr_change / first_vapr) * 100
            
            first_estimated_reward = first_pool.get('estimated_reward')
            last_estimated_reward = last_pool.get('estimated_reward')
            estimated_reward_change = None
            estimated_reward_change_pct = None
            if first_estimated_reward is not None and last_estimated_reward is not None:
                estimated_reward_change = last_estimated_reward - first_estimated_reward
                if first_estimated_reward > 0:
                    estimated_reward_change_pct = (estimated_reward_change / first_estimated_reward) * 100
            
            first_profitability_score = first_pool.get('profitability_score')
            last_profitability_score = last_pool.get('profitability_score')
            profitability_score_change = None
            profitability_score_change_pct = None
            if first_profitability_score is not None and last_profitability_score is not None:
                profitability_score_change = last_profitability_score - first_profitability_score
                if first_profitability_score > 0:
                    profitability_score_change_pct = (profitability_score_change / first_profitability_score) * 100
            
            trend_data = {
                'name': pool_name,
                'pool_type': first_pool.get('pool_type', 'Unknown'),
                'votes_change': votes_change,
                'first_votes': first_votes,
                'last_votes': last_votes,
                'rpv_change_pct': rpv_change_pct,
                'first_rpv': first_rpv,
                'last_rpv': last_rpv,
                'total_rewards_change': total_rewards_change,
                'total_rewards_change_pct': total_rewards_change_pct,
                'first_total_rewards': first_total_rewards,
                'last_total_rewards': last_total_rewards,
                'vapr_change': vapr_change,
                'vapr_change_pct': vapr_change_pct,
                'first_vapr': first_vapr,
                'last_vapr': last_vapr,
                'estimated_reward_change': estimated_reward_change,
                'estimated_reward_change_pct': estimated_reward_change_pct,
                'first_estimated_reward': first_estimated_reward,
                'last_estimated_reward': last_estimated_reward,
                'profitability_score_change': profitability_score_change,
                'profitability_score_change_pct': profitability_score_change_pct,
                'first_profitability_score': first_profitability_score,
                'last_profitability_score': last_profitability_score
            }
            # Calculate goodness score
            trend_data['goodness_score'] = calculate_goodness_score(trend_data)
            trend_data['attractiveness'] = get_attractiveness_symbol(trend_data)
            trends.append(trend_data)
    
    # Show summary of pool attractiveness changes
    print("\nPOOL ATTRACTIVENESS SUMMARY (since first snapshot):")
    print("-" * 80)
    print("Symbols: ↑↑ = Much more attractive, ↑ = More attractive, → = Neutral, ↓ = Less attractive, ↓↓ = Much less attractive")
    print()
    
    # Sort by goodness score (best first)
    trends_by_goodness = sorted(trends, key=lambda x: x['goodness_score'], reverse=True)
    
    for trend in trends_by_goodness:
        symbol = trend['attractiveness']
        score = trend['goodness_score']
        print(f"  {symbol} {trend['name']} ({trend['pool_type']}) - Score: {score:+.1f}")
    
    # Sort by profitability score first, then by rewards per vote (least dilution) for detailed view
    def sort_key(trend):
        # Primary: profitability score (highest first)
        profitability = trend.get('last_profitability_score') or 0
        # Secondary: rewards per vote (highest = least dilution)
        rpv = trend.get('last_rpv') or 0
        # Return tuple for multi-level sorting (reverse=True means highest first)
        return (profitability, rpv)
    
    trends_by_goodness_detailed = sorted(trends, key=sort_key, reverse=True)
    
    print("\n\nTOP POOLS BY OVERALL PERFORMANCE (sorted by profitability score, then least dilution):")
    for i, trend in enumerate(trends_by_goodness_detailed[:10], 1):
        attract_symbol = trend['attractiveness']
        score = trend['goodness_score']
        print(f"\n{i}. {trend['name']} ({trend['pool_type']}) {attract_symbol} [Score: {score:+.1f}]")
        
        if trend['estimated_reward_change_pct'] is not None:
            symbol = "↓" if trend['estimated_reward_change_pct'] < 0 else "↑" if trend['estimated_reward_change_pct'] > 0 else "→"
            print(f"   Est. Reward: ${trend['first_estimated_reward']:,.2f} → ${trend['last_estimated_reward']:,.2f} ({trend['estimated_reward_change_pct']:+.2f}%) {symbol}")
        
        if trend['profitability_score_change'] is not None:
            symbol_ps = "↓" if trend['profitability_score_change'] < 0 else "↑" if trend['profitability_score_change'] > 0 else "→"
            if trend['profitability_score_change_pct'] is not None:
                change_str = f"{trend['profitability_score_change']:+.2f} ({trend['profitability_score_change_pct']:+.2f}%)"
            else:
                change_str = f"{trend['profitability_score_change']:+.2f}"
            print(f"   Profitability Score: {trend['first_profitability_score']:.2f} → {trend['last_profitability_score']:.2f} ({change_str}) {symbol_ps}")
        
        if trend['rpv_change_pct'] is not None:
            symbol_rpv = "↓" if trend['rpv_change_pct'] < 0 else "↑" if trend['rpv_change_pct'] > 0 else "→"
            print(f"   Rewards/Vote: ${trend['first_rpv']:.6f} → ${trend['last_rpv']:.6f} ({trend['rpv_change_pct']:+.2f}%) {symbol_rpv}")
        
        if trend['total_rewards_change_pct'] is not None:
            symbol_tr = "↓" if trend['total_rewards_change_pct'] < 0 else "↑" if trend['total_rewards_change_pct'] > 0 else "→"
            print(f"   Total Rewards: ${trend['first_total_rewards']:,.2f} → ${trend['last_total_rewards']:,.2f} ({trend['total_rewards_change_pct']:+.2f}%) {symbol_tr}")
        
        if trend['vapr_change_pct'] is not None:
            symbol_vapr = "↓" if trend['vapr_change_pct'] < 0 else "↑" if trend['vapr_change_pct'] > 0 else "→"
            print(f"   VAPR: {trend['first_vapr']:.2f}% → {trend['last_vapr']:.2f}% ({trend['vapr_change_pct']:+.2f}%) {symbol_vapr}")
        
        votes_change = trend['votes_change'] or 0
        print(f"   Votes: {trend['first_votes']:,.0f} → {trend['last_votes']:,.0f} ({votes_change:+,.0f})")
    
    # Sort by votes change (most votes added) for reference
    trends_by_votes = sorted(trends, key=lambda x: x['votes_change'] or 0, reverse=True)
    
    print("\n\nTOP POOLS BY VOTES ADDED (since first snapshot):")
    for i, trend in enumerate(trends_by_votes[:10], 1):
        votes_change = trend['votes_change'] or 0
        print(f"\n{i}. {trend['name']} ({trend['pool_type']})")
        print(f"   Votes: {trend['first_votes']:,.0f} → {trend['last_votes']:,.0f} ({votes_change:+,.0f})")
        
        if trend['total_rewards_change_pct'] is not None:
            symbol = "↓" if trend['total_rewards_change_pct'] < 0 else "↑" if trend['total_rewards_change_pct'] > 0 else "→"
            print(f"   Total Rewards: ${trend['first_total_rewards']:,.2f} → ${trend['last_total_rewards']:,.2f} ({trend['total_rewards_change_pct']:+.2f}%) {symbol}")
        
        if trend['vapr_change_pct'] is not None:
            symbol = "↓" if trend['vapr_change_pct'] < 0 else "↑" if trend['vapr_change_pct'] > 0 else "→"
            print(f"   VAPR: {trend['first_vapr']:.2f}% → {trend['last_vapr']:.2f}% ({trend['vapr_change_pct']:+.2f}%) {symbol}")
        
        if trend['profitability_score_change'] is not None:
            symbol_ps = "↓" if trend['profitability_score_change'] < 0 else "↑" if trend['profitability_score_change'] > 0 else "→"
            if trend['profitability_score_change_pct'] is not None:
                change_str = f"{trend['profitability_score_change']:+.2f} ({trend['profitability_score_change_pct']:+.2f}%)"
            else:
                change_str = f"{trend['profitability_score_change']:+.2f}"
            print(f"   Profitability Score: {trend['first_profitability_score']:.2f} → {trend['last_profitability_score']:.2f} ({change_str}) {symbol_ps}")
        
        if trend['rpv_change_pct'] is not None:
            symbol = "↓" if trend['rpv_change_pct'] < 0 else "↑" if trend['rpv_change_pct'] > 0 else "→"
            print(f"   Rewards/Vote: ${trend['first_rpv']:.6f} → ${trend['last_rpv']:.6f} ({trend['rpv_change_pct']:+.2f}%) {symbol}")
        
        if trend['estimated_reward_change_pct'] is not None:
            symbol = "↓" if trend['estimated_reward_change_pct'] < 0 else "↑" if trend['estimated_reward_change_pct'] > 0 else "→"
            print(f"   Est. Reward: ${trend['first_estimated_reward']:,.2f} → ${trend['last_estimated_reward']:,.2f} ({trend['estimated_reward_change_pct']:+.2f}%) {symbol}")


def main():
    parser = argparse.ArgumentParser(
        description='Track changes in recommended pools over time',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Initialize tracking with current recommendations
  python3 track_pool_changes.py --init --top 10 --voting-power 15000
  
  # Save a snapshot (for periodic tracking)
  python3 track_pool_changes.py --snapshot --top 10 --voting-power 15000
  
  # View history and trends
  python3 track_pool_changes.py --history
        """
    )
    
    parser.add_argument('--init', action='store_true',
                       help='Initialize tracking by saving current recommendations as baseline')
    parser.add_argument('--snapshot', action='store_true',
                       help='Save a snapshot of current pool state (for periodic tracking)')
    parser.add_argument('--history', action='store_true',
                       help='Show history of pool changes and trends')
    parser.add_argument('--top', type=int, default=10,
                       help='Number of top pools to track (default: 10)')
    parser.add_argument('--voting-power', type=float, default=None,
                       help='Your voting power in veBLACK (for filtering/ranking)')
    parser.add_argument('--hide-vamm', action='store_true',
                       help='Hide vAMM pools from results')
    parser.add_argument('--min-rewards', type=float, default=None,
                       help='Minimum total rewards in USD to include')
    parser.add_argument('--max-pool-percentage', type=float, default=None,
                       help='Maximum percentage of pool voting power')
    parser.add_argument('--pool-name', type=str, default=None,
                       help='Filter pools by name using shell-style wildcards (case-insensitive). If no wildcards are provided, automatically wraps pattern with * (e.g., "btc.b" becomes "*btc.b*"). Examples: "WAVAX/*", "*BLACK*", "CL200-*", "btc.b"')
    parser.add_argument('--no-cache', action='store_true',
                       help='Skip cache and fetch fresh data (will still refresh the cache with new data)')
    parser.add_argument('--cache-info', action='store_true',
                       help='Show detailed cache information and exit')
    parser.add_argument('--clear-cache', action='store_true',
                       help='Clear/delete cache files and exit')
    parser.add_argument('--epoch-close-mountain', type=str, default=None,
                       help='Epoch close time in Mountain Time (for reference)')
    parser.add_argument('-o', '--output', type=str, default=None,
                       help='Output file base name (e.g., output/pool_tracking). Files will be saved as {base}_baseline.json and {base}_history.json')
    parser.add_argument('--version', action='version', version=f'%(prog)s {__version__}')
    
    args = parser.parse_args()
    
    # Handle --clear-cache flag
    if args.clear_cache:
        try:
            recommender = BlackholePoolRecommender()
            if recommender._clear_cache():
                print("Cache cleared successfully.")
                print(f"Deleted: {recommender.cache_file}")
                print(f"Deleted: {recommender.cache_metadata_file}")
            else:
                print("No cache files found to clear.")
        except Exception as e:
            print(f"Error clearing cache: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
        
        sys.exit(0)
    
    # Handle --cache-info flag
    if args.cache_info:
        try:
            recommender = BlackholePoolRecommender()
            cache_info = recommender._get_cache_info()
            
            if cache_info:
                print("\n" + "="*60)
                print("CACHE INFORMATION")
                print("="*60)
                print(f"Cache file: {recommender.cache_file}")
                print(f"Metadata file: {recommender.cache_metadata_file}")
                print()
                # Determine status message
                if cache_info['is_valid']:
                    status = 'Valid'
                elif not cache_info.get('timestamp_valid', True):
                    status = 'Expired (timestamp)'
                elif not cache_info.get('content_valid', True):
                    status = 'Invalid (content validation failed)'
                else:
                    status = 'Expired'
                
                print(f"Status: {status}")
                print(f"Pools cached: {cache_info['pool_count']}")
                
                # Show validation issues if any
                validation_issues = cache_info.get('validation_issues', [])
                if validation_issues:
                    print()
                    print("Validation issues:")
                    for issue in validation_issues:
                        print(f"  - {issue}")
                
                print()
                # Show last refreshed in both local and UTC
                cache_timestamp = cache_info['timestamp']
                cache_local = cache_timestamp.astimezone()
                print(f"Last refreshed:")
                print(f"  Local: {cache_local.strftime('%Y-%m-%d %H:%M:%S %Z')}")
                print(f"  UTC:   {cache_timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}")
                age_seconds = int(cache_info['age_minutes'] * 60)
                age_minutes = age_seconds // 60
                age_secs = age_seconds % 60
                print(f"Age: {age_minutes}m {age_secs}s")
                print()
                # Show expiry time in both local and UTC
                expiry_timestamp = cache_info['expiry_time']
                expiry_local = expiry_timestamp.astimezone()
                if cache_info['is_valid']:
                    time_left = cache_info['time_until_expiry']
                    minutes_left = int(time_left.total_seconds() / 60)
                    seconds_left = int(time_left.total_seconds() % 60)
                    print(f"Expires at:")
                    print(f"  Local: {expiry_local.strftime('%Y-%m-%d %H:%M:%S %Z')}")
                    print(f"  UTC:   {expiry_timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}")
                    print(f"Time until expiry: {minutes_left}m {seconds_left}s")
                else:
                    print(f"Expired at:")
                    print(f"  Local: {expiry_local.strftime('%Y-%m-%d %H:%M:%S %Z')}")
                    print(f"  UTC:   {expiry_timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}")
                    if not cache_info.get('timestamp_valid', True):
                        print("Cache timestamp expired and will be refreshed on next run")
                    elif not cache_info.get('content_valid', True):
                        print("Cache content validation failed and will be refreshed on next run")
                    else:
                        print("Cache is expired and will be refreshed on next run")
                print()
                print(f"Cache expiry window: {cache_info['expiry_minutes']} minutes")
                print("="*60)
            else:
                print("\nNo cache found or cache is invalid.")
                print(f"Cache directory: {recommender.cache_dir}")
                print(f"Cache file: {recommender.cache_file}")
                print(f"Metadata file: {recommender.cache_metadata_file}")
                if not recommender.cache_dir.exists():
                    print("\nCache directory does not exist yet.")
                elif not recommender.cache_file.exists():
                    print("\nCache file does not exist yet.")
                elif not recommender.cache_metadata_file.exists():
                    print("\nCache metadata file does not exist yet.")
        except Exception as e:
            print(f"Error getting cache info: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
        
        sys.exit(0)
    
    # Get tracking file paths
    tracking_file, history_file = get_tracking_files(args.output)
    
    if args.history:
        show_history(history_file)
        return
    
    # Require one of --init or --snapshot
    if not args.init and not args.snapshot:
        print("Error: Must specify --init, --snapshot, or --history")
        print("Run with --help for usage information.")
        sys.exit(1)
    
    try:
        print("[DEBUG] Creating BlackholePoolRecommender instance...", file=sys.stderr)
        recommender = BlackholePoolRecommender(no_cache=args.no_cache)
        print("[DEBUG] Recommender created successfully", file=sys.stderr)
    except Exception as e:
        print(f"Error creating recommender: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
    
    if args.snapshot:
        save_snapshot(recommender, args, history_file)
    elif args.init:
        save_baseline(recommender, args)


if __name__ == "__main__":
    try:
        print(f"[DEBUG] Starting track_pool_changes.py at {datetime.now(timezone.utc).isoformat()}", file=sys.stderr)
        print(f"[DEBUG] Python path: {sys.executable}", file=sys.stderr)
        print(f"[DEBUG] Working directory: {os.getcwd()}", file=sys.stderr)
        main()
    except Exception as e:
        print(f"[FATAL] Unhandled exception: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
