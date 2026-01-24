#!/usr/bin/env python3
"""
Verify that extracted values from multicall responses match DOM-extracted rewards
"""

import json
import sys

def load_dom_rewards():
    """Load rewards from DOM extraction (if available)"""
    # This would come from the extension's chrome.storage.local
    # For now, we'll check if we have any saved DOM data
    dom_rewards = {}
    
    # Check for any saved pool data
    try:
        with open('pool_data_from_dom.json', 'r') as f:
            data = json.load(f)
            for pool in data:
                addr = pool.get('pool_id', '').lower()
                rewards = pool.get('total_rewards', 0)
                if addr and rewards > 0:
                    dom_rewards[addr] = rewards
    except:
        pass
    
    return dom_rewards

def compare_rewards(extracted_file, dom_rewards):
    """Compare extracted values to DOM rewards"""
    print("="*80)
    print("VERIFYING EXTRACTED REWARDS AGAINST DOM DATA")
    print("="*80)
    
    with open(extracted_file, 'r') as f:
        extracted = json.load(f)
    
    print(f"\nExtracted rewards for {len(extracted.get('pools', {}))} pools")
    print(f"DOM rewards for {len(dom_rewards)} pools\n")
    
    matches = []
    mismatches = []
    only_extracted = []
    only_dom = []
    
    for pool, data in extracted.get('pools', {}).items():
        pool_lower = pool.lower()
        extracted_value = data.get('max', 0)
        dom_value = dom_rewards.get(pool_lower, 0)
        
        if extracted_value > 0 and dom_value > 0:
            # Both have values - compare
            diff = abs(extracted_value - dom_value)
            pct_diff = (diff / dom_value) * 100 if dom_value > 0 else 0
            
            if pct_diff < 10:  # Within 10%
                matches.append({
                    'pool': pool,
                    'extracted': extracted_value,
                    'dom': dom_value,
                    'diff_pct': pct_diff
                })
            else:
                mismatches.append({
                    'pool': pool,
                    'extracted': extracted_value,
                    'dom': dom_value,
                    'diff_pct': pct_diff
                })
        elif extracted_value > 0:
            only_extracted.append({
                'pool': pool,
                'value': extracted_value
            })
        elif dom_value > 0:
            only_dom.append({
                'pool': pool,
                'value': dom_value
            })
    
    print(f"✓ Matches (within 10%): {len(matches)}")
    if matches:
        print("\nSample matches:")
        for m in matches[:10]:
            print(f"  {m['pool']}: extracted=${m['extracted']:,.2f}, dom=${m['dom']:,.2f}, diff={m['diff_pct']:.1f}%")
    
    print(f"\n⚠️  Mismatches (>10% diff): {len(mismatches)}")
    if mismatches:
        print("\nSample mismatches:")
        for m in mismatches[:10]:
            print(f"  {m['pool']}: extracted=${m['extracted']:,.2f}, dom=${m['dom']:,.2f}, diff={m['diff_pct']:.1f}%")
    
    print(f"\n📊 Only in extracted: {len(only_extracted)}")
    print(f"📊 Only in DOM: {len(only_dom)}")
    
    # Summary
    print("\n" + "="*80)
    print("CONCLUSION")
    print("="*80)
    
    if len(matches) > len(mismatches):
        print("\n✅ Extracted values appear to match DOM rewards!")
        print("   The values in multicall responses are likely rewards.")
    elif len(mismatches) > len(matches):
        print("\n⚠️  Extracted values don't match DOM rewards well.")
        print("   They might be different data (TVL, balances, etc.)")
    else:
        print("\n❓ Inconclusive - need more data to verify")
    
    return {
        'matches': matches,
        'mismatches': mismatches,
        'only_extracted': only_extracted,
        'only_dom': only_dom
    }

if __name__ == "__main__":
    extracted_file = "rewards_found_in_responses.json"
    if len(sys.argv) > 1:
        extracted_file = sys.argv[1]
    
    dom_rewards = load_dom_rewards()
    compare_rewards(extracted_file, dom_rewards)
