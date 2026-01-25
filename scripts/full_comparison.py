#!/usr/bin/env python3
"""
Full comparison: Our RPC data vs Site data

Runs both scripts and shows side-by-side comparison.
"""

import subprocess
import json
import sys
from datetime import datetime, timezone

def run_rpc_fetch():
    """Run our RPC fetch and return results."""
    print("Fetching our RPC data...")
    result = subprocess.run(
        ['python3', 'scripts/compare_pool_data.py', '--top', '30', '--json'],
        capture_output=True,
        text=True,
        timeout=180
    )
    
    # Parse JSON from output (skip the header lines)
    lines = result.stdout.strip().split('\n')
    for i, line in enumerate(lines):
        if line.startswith('['):
            return json.loads('\n'.join(lines[i:]))
    return []


def run_site_scrape():
    """Run site scraper and return results."""
    print("Scraping site data...")
    result = subprocess.run(
        ['python3', 'scripts/scrape_site_pools.py', '--top', '80', '--output', '/tmp/site_pools.json'],
        capture_output=True,
        text=True,
        timeout=120
    )
    
    try:
        with open('/tmp/site_pools.json') as f:
            return json.load(f)
    except:
        return []


def main():
    print("=" * 120)
    print("FULL COMPARISON: Our RPC vs Site Data")
    print("=" * 120)
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")
    print()
    
    # Get both datasets
    rpc_data = run_rpc_fetch()
    site_data = run_site_scrape()
    
    print(f"\nGot {len(rpc_data)} pools from RPC, {len(site_data)} from site")
    
    # Create lookup by pool name
    rpc_by_name = {p['name']: p for p in rpc_data}
    site_by_name = {p['name']: p for p in site_data}
    
    # Find common pools
    common_names = set(rpc_by_name.keys()) & set(site_by_name.keys())
    print(f"Common pools: {len(common_names)}")
    
    # Compare
    print("\n" + "=" * 120)
    print("SIDE-BY-SIDE COMPARISON (sorted by Site Total Rewards)")
    print("=" * 120)
    print()
    print(f"{'Pool Name':<26} | {'RPC Fees':>12} {'RPC Total':>12} {'RPC VAPR':>10} | {'Site Fees':>12} {'Site Total':>12} {'Site VAPR':>10} | {'Diff%':>6}")
    print("-" * 120)
    
    # Sort site data by total rewards
    site_sorted = sorted(site_data, key=lambda x: x.get('total_rewards_num', 0), reverse=True)
    
    comparisons = []
    for site_pool in site_sorted[:30]:
        name = site_pool['name']
        rpc_pool = rpc_by_name.get(name)
        
        site_fees = site_pool.get('total_rewards_num', 0)  # Site shows fees as total for most
        site_vapr = site_pool.get('vapr_num', 0)
        
        if rpc_pool:
            rpc_fees = rpc_pool.get('fees_usd', 0)
            rpc_total = rpc_pool.get('total_rewards', 0)
            rpc_vapr = rpc_pool.get('vapr', 0)
            
            # Calculate difference
            if site_fees > 0:
                diff_pct = ((rpc_total - site_fees) / site_fees) * 100
            else:
                diff_pct = 0
            
            comparisons.append({
                'name': name,
                'rpc_fees': rpc_fees,
                'rpc_total': rpc_total,
                'rpc_vapr': rpc_vapr,
                'site_fees': site_fees,
                'site_vapr': site_vapr,
                'diff_pct': diff_pct,
            })
            
            print(f"{name:<26} | ${rpc_fees:>10,.0f} ${rpc_total:>10,.0f} {rpc_vapr:>9.1f}% | "
                  f"${site_fees:>10,.0f} ${site_fees:>10,.0f} {site_vapr:>9.1f}% | {diff_pct:>+5.1f}%")
        else:
            print(f"{name:<26} | {'N/A':>12} {'N/A':>12} {'N/A':>10} | "
                  f"${site_fees:>10,.0f} ${site_fees:>10,.0f} {site_vapr:>9.1f}% | {'---':>6}")
    
    # Summary statistics
    if comparisons:
        diffs = [c['diff_pct'] for c in comparisons if abs(c['diff_pct']) < 1000]  # Exclude outliers
        if diffs:
            avg_diff = sum(diffs) / len(diffs)
            max_diff = max(diffs)
            min_diff = min(diffs)
            
            print("\n" + "=" * 120)
            print("SUMMARY")
            print("=" * 120)
            print(f"  Pools compared: {len(comparisons)}")
            print(f"  Average difference: {avg_diff:+.1f}%")
            print(f"  Range: {min_diff:+.1f}% to {max_diff:+.1f}%")
            
            # Show biggest discrepancies
            by_diff = sorted(comparisons, key=lambda x: abs(x['diff_pct']), reverse=True)
            print("\n  Largest discrepancies:")
            for c in by_diff[:5]:
                print(f"    {c['name']}: RPC ${c['rpc_total']:,.0f} vs Site ${c['site_fees']:,.0f} ({c['diff_pct']:+.1f}%)")


if __name__ == "__main__":
    main()
