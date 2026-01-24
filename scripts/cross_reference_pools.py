#!/usr/bin/env python3
"""
Cross-reference identified pools with DOM extraction and MHTML data
to better classify vAMM and sAMM pools
"""

import json
import re
import sys
from typing import Dict, List, Set

def extract_pools_from_mhtml(mhtml_file: str) -> Dict[str, str]:
    """Extract pool addresses and their names/types from MHTML"""
    pools = {}  # address -> name
    
    try:
        with open(mhtml_file, 'r') as f:
            content = f.read()
        
        # Look for pool addresses with associated names
        # Pattern: data-pool-id="0x..." data-pool-name="vAMM-..."
        pattern = r'data-pool-id=\"(0x[a-fA-F0-9]{40})\"[^>]*data-pool-name=\"([^\"]+)\"'
        matches = re.findall(pattern, content, re.IGNORECASE)
        
        for addr, name in matches:
            pools[addr.lower()] = name
        
        # Also try to find addresses near vAMM/sAMM names
        # Look for patterns like: vAMM-TOKEN1/TOKEN2 followed by an address
        vamm_pattern = r'(vAMM-[A-Z0-9\.]+/[A-Z0-9\.]+)[^>]*0x([a-fA-F0-9]{40})'
        samm_pattern = r'(sAMM-[A-Z0-9\.]+/[A-Z0-9\.]+)[^>]*0x([a-fA-F0-9]{40})'
        
        for match in re.finditer(vamm_pattern, content, re.IGNORECASE):
            name, addr = match.groups()
            pools[addr.lower()] = name
        
        for match in re.finditer(samm_pattern, content, re.IGNORECASE):
            name, addr = match.groups()
            pools[addr.lower()] = name
            
    except FileNotFoundError:
        print(f"Warning: MHTML file not found: {mhtml_file}")
    except Exception as e:
        print(f"Warning: Error parsing MHTML: {e}")
    
    return pools

def cross_reference(classified_file: str, mhtml_file: str = None):
    """Cross-reference classified pools with MHTML data"""
    print("="*80)
    print("CROSS-REFERENCING POOLS")
    print("="*80)
    
    # Load classified pools
    with open(classified_file, 'r') as f:
        data = json.load(f)
    
    unknown_pools = data.get('pools_by_type', {}).get('Unknown', [])
    print(f"\nUnknown pools to classify: {len(unknown_pools)}")
    
    # Extract from MHTML if available
    mhtml_pools = {}
    if mhtml_file:
        print(f"\nExtracting pools from MHTML: {mhtml_file}")
        mhtml_pools = extract_pools_from_mhtml(mhtml_file)
        print(f"✓ Found {len(mhtml_pools)} pools in MHTML")
    
    # Classify unknown pools based on MHTML
    reclassified = {
        'vAMM': [],
        'sAMM': [],
        'CL': [],
        'Unknown': []
    }
    
    vamm_count = 0
    samm_count = 0
    
    for pool in unknown_pools:
        addr = pool['address'].lower()
        pool_type = 'Unknown'
        
        # Check MHTML
        if addr in mhtml_pools:
            name = mhtml_pools[addr]
            if name.upper().startswith('VAMM-'):
                pool_type = 'vAMM'
                vamm_count += 1
            elif name.upper().startswith('SAMM-'):
                pool_type = 'sAMM'
                samm_count += 1
            elif name.upper().startswith('CL'):
                pool_type = 'CL'
        
        pool['type'] = pool_type
        pool['name'] = mhtml_pools.get(addr, 'Unknown')
        reclassified[pool_type].append(pool)
    
    # Display results
    print("\n" + "="*80)
    print("RECLASSIFICATION RESULTS")
    print("="*80)
    
    print(f"\nReclassified from MHTML:")
    print(f"  vAMM: {vamm_count}")
    print(f"  sAMM: {samm_count}")
    print(f"  Still Unknown: {len(reclassified['Unknown'])}")
    
    # Show vAMM pools
    if reclassified['vAMM']:
        print(f"\nvAMM Pools ({len(reclassified['vAMM'])}):")
        for pool in sorted(reclassified['vAMM'], key=lambda x: -x['weight'])[:20]:
            print(f"  {pool['address']} - {pool.get('name', 'Unknown')} (weight: {pool['weight']:,.2f})")
    
    # Show sAMM pools
    if reclassified['sAMM']:
        print(f"\nsAMM Pools ({len(reclassified['sAMM'])}):")
        for pool in sorted(reclassified['sAMM'], key=lambda x: -x['weight'])[:20]:
            print(f"  {pool['address']} - {pool.get('name', 'Unknown')} (weight: {pool['weight']:,.2f})")
    
    # Update classification
    final_classification = {
        'CL': data['pools_by_type']['CL'] + reclassified['CL'],
        'vAMM': data['pools_by_type']['vAMM'] + reclassified['vAMM'],
        'sAMM': data['pools_by_type']['sAMM'] + reclassified['sAMM'],
        'Unknown': reclassified['Unknown']
    }
    
    # Save updated results
    output = {
        'total_pools': data['total_pools'],
        'classification': {
            'CL': len(final_classification['CL']),
            'vAMM': len(final_classification['vAMM']),
            'sAMM': len(final_classification['sAMM']),
            'Unknown': len(final_classification['Unknown'])
        },
        'pools_by_type': final_classification
    }
    
    output_file = "classified_pools_final.json"
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n✓ Updated classification saved to: {output_file}")
    
    # Summary
    print("\n" + "="*80)
    print("FINAL SUMMARY")
    print("="*80)
    print(f"\nTotal pools: {output['total_pools']}")
    print(f"  CL: {output['classification']['CL']}")
    print(f"  vAMM: {output['classification']['vAMM']}")
    print(f"  sAMM: {output['classification']['sAMM']}")
    print(f"  Unknown: {output['classification']['Unknown']}")
    
    return output

if __name__ == "__main__":
    classified_file = "classified_pools.json"
    mhtml_file = "blackhole-voting-jan6.mhtml"
    
    if len(sys.argv) > 1:
        classified_file = sys.argv[1]
    if len(sys.argv) > 2:
        mhtml_file = sys.argv[2]
    
    try:
        cross_reference(classified_file, mhtml_file)
    except FileNotFoundError as e:
        print(f"Error: File not found: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
