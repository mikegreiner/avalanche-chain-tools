#!/usr/bin/env python3
"""
Comprehensive pool discovery script
Combines multiple approaches:
1. Extract addresses from multicall logs
2. Query weights from voter contract
3. Cross-reference with known pools
4. Identify pool types
"""

import json
import sys
from web3 import Web3
from typing import Dict, List, Set
from collections import Counter
import re

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_PROXY = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"
MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11"

# Known pools for validation
KNOWN_POOLS = {
    "0x9a6142ef0766915db02066f791d969c22eba1dca": {"name": "CL200-WAVAX/BLACK", "type": "CL"},
    "0x5e128ebc09c918ddae3ca1668d4ee9527dc00d78": {"name": "CL200-WETH.e/WAVAX", "type": "CL"},
    "0xa02ec3ba8d17887567672b2cdcaf525534636ea0": {"name": "CL1-WAVAX/USDC", "type": "CL"},
    "0x78f5a53731564894a7e4fff827a88e5fbf9cfcb6": {"name": "vAMM-GCROC/WAVAX", "type": "vAMM"},
    "0xedcfa2d80cf06fb7642e956a1e95dbc37c75995b": {"name": "sAMM-CROC/WAVAX", "type": "sAMM"},
}

def extract_valid_addresses_from_hex(data_hex: str) -> Set[str]:
    """Extract valid Ethereum addresses, filtering out ABI artifacts"""
    addresses = set()
    
    if not data_hex or not data_hex.startswith('0x'):
        return addresses
    
    data = data_hex[2:].lower()
    
    # Look for addresses in 64-char chunks (32-byte ABI encoding)
    # Valid addresses should have reasonable distribution of hex digits
    for i in range(0, len(data) - 63, 2):
        chunk = data[i:i+64]
        if len(chunk) == 64:
            # Check if it's left-padded (first 24 chars are zeros)
            if chunk[:24] == '0' * 24:
                addr_hex = chunk[24:64]
                if re.match(r'^[0-9a-f]{40}$', addr_hex):
                    addr = '0x' + addr_hex
                    # Additional validation: not all zeros, not all f's, has some variety
                    unique_chars = len(set(addr_hex))
                    if unique_chars >= 4:  # At least 4 different hex digits
                        addresses.add(addr)
    
    return addresses

def extract_pools_from_logs(log_file: str) -> Dict:
    """Extract pool addresses from multicall logs"""
    print("="*80)
    print("STEP 1: EXTRACTING POOLS FROM MULTICALL LOGS")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    print(f"\nTotal requests: {len(requests)}")
    
    # Find multicall requests
    multicall_requests = []
    for req in requests:
        analysis = req.get('analysis', {}) or {}
        request_body = req.get('requestBody', '')
        
        if not request_body:
            continue
        
        try:
            rpc_data = json.loads(request_body)
            params = rpc_data.get('params', [])
            
            if not params or len(params) == 0:
                continue
            
            call_param = params[0]
            if not isinstance(call_param, dict):
                continue
            
            contract = call_param.get('to', '')
            data_hex = call_param.get('data', '')
            
            if (contract and contract.lower() == MULTICALL3.lower() and 
                data_hex and data_hex.startswith('0x82ad56cb')):
                multicall_requests.append(data_hex)
        except:
            continue
    
    print(f"Multicall requests found: {len(multicall_requests)}\n")
    
    # Extract addresses
    all_addresses = Counter()
    for i, data_hex in enumerate(multicall_requests):
        addresses = extract_valid_addresses_from_hex(data_hex)
        for addr in addresses:
            all_addresses[addr.lower()] += 1
        
        if (i + 1) % 20 == 0:
            print(f"  Processed {i + 1}/{len(multicall_requests)} multicalls...")
    
    # Filter: must appear multiple times and not be obvious artifacts
    excluded = {MULTICALL3.lower(), '0x' + '0' * 40, '0x' + 'f' * 40}
    
    pool_addresses = []
    for addr, count in all_addresses.items():
        if addr not in excluded and count >= 3:  # Appears at least 3 times
            pool_addresses.append(addr)
    
    print(f"\n✓ Extracted {len(pool_addresses)} potential pool addresses")
    
    # Check against known pools
    found_known = []
    for addr in pool_addresses:
        if addr in KNOWN_POOLS:
            found_known.append(addr)
    
    if found_known:
        print(f"✓ Found {len(found_known)} known pools:")
        for addr in found_known:
            info = KNOWN_POOLS[addr]
            print(f"  {addr} - {info['name']} ({info['type']})")
    
    return {
        'addresses': pool_addresses,
        'known_found': found_known,
        'total_multicalls': len(multicall_requests)
    }

def query_pool_weights(w3: Web3, voter_address: str, pool_addresses: List[str]) -> Dict:
    """Query weights for all pool addresses"""
    print("\n" + "="*80)
    print("STEP 2: QUERYING POOL WEIGHTS FROM VOTER CONTRACT")
    print("="*80)
    
    voter_checksum = w3.to_checksum_address(voter_address)
    weights_selector = "0xa7cac846"
    
    print(f"\nQuerying weights for {len(pool_addresses)} pools...\n")
    
    pool_data = []
    successful = 0
    failed = 0
    
    # Process in batches
    batch_size = 50
    for i, addr in enumerate(pool_addresses):
        if i % batch_size == 0 and i > 0:
            print(f"  Progress: {i}/{len(pool_addresses)} pools queried...")
        
        try:
            addr_clean = addr[2:].lower().zfill(64)
            data = weights_selector + addr_clean
            
            result = w3.eth.call({
                'to': voter_checksum,
                'data': data
            })
            
            if result and result != b'\x00' * 32:
                weight = int(result.hex(), 16)
                weight_formatted = weight / 1e18
                
                # Check if it's a known pool
                pool_info = KNOWN_POOLS.get(addr, {})
                
                pool_data.append({
                    'address': '0x' + addr[2:],  # Ensure proper format
                    'weight': weight,
                    'weight_formatted': weight_formatted,
                    'has_weight': True,
                    'known_name': pool_info.get('name'),
                    'known_type': pool_info.get('type')
                })
                successful += 1
            else:
                pool_data.append({
                    'address': '0x' + addr[2:],
                    'weight': 0,
                    'weight_formatted': 0,
                    'has_weight': False,
                    'known_name': KNOWN_POOLS.get(addr, {}).get('name'),
                    'known_type': KNOWN_POOLS.get(addr, {}).get('type')
                })
                failed += 1
        except Exception as e:
            pool_data.append({
                'address': '0x' + addr[2:],
                'weight': 0,
                'weight_formatted': 0,
                'has_weight': False,
                'error': str(e)
            })
            failed += 1
    
    print(f"\n✓ Successfully queried {successful} pools with weights")
    if failed > 0:
        print(f"⚠ {failed} pools had no weight or errors")
    
    return {
        'pools': pool_data,
        'successful': successful,
        'failed': failed
    }

def analyze_results(extracted: Dict, weights: Dict) -> Dict:
    """Analyze and categorize results"""
    print("\n" + "="*80)
    print("STEP 3: ANALYSIS AND CATEGORIZATION")
    print("="*80)
    
    pools = weights['pools']
    
    # Categorize by type
    by_type = {
        'CL': [],
        'vAMM': [],
        'sAMM': [],
        'Unknown': []
    }
    
    for pool in pools:
        pool_type = pool.get('known_type') or 'Unknown'
        if pool_type.startswith('CL'):
            by_type['CL'].append(pool)
        elif pool_type.startswith('vAMM'):
            by_type['vAMM'].append(pool)
        elif pool_type.startswith('sAMM'):
            by_type['sAMM'].append(pool)
        else:
            by_type['Unknown'].append(pool)
    
    # Summary
    print(f"\nPool Type Breakdown:")
    print(f"  CL pools: {len(by_type['CL'])}")
    print(f"  vAMM pools: {len(by_type['vAMM'])}")
    print(f"  sAMM pools: {len(by_type['sAMM'])}")
    print(f"  Unknown/Other: {len(by_type['Unknown'])}")
    
    # Show pools with weights
    pools_with_weights = [p for p in pools if p.get('has_weight') and p['weight'] > 0]
    print(f"\nPools with non-zero weights: {len(pools_with_weights)}")
    
    # Sort by weight
    pools_with_weights.sort(key=lambda x: -x['weight'])
    
    print(f"\nTop 20 pools by weight:")
    for i, pool in enumerate(pools_with_weights[:20], 1):
        name = pool.get('known_name') or 'Unknown'
        pool_type = pool.get('known_type') or '?'
        weight = pool['weight_formatted']
        print(f"  {i:2d}. {pool['address']} - {name} ({pool_type}) - {weight:,.2f}")
    
    # Show vAMM/sAMM pools specifically
    if by_type['vAMM']:
        print(f"\n✓ vAMM Pools Found ({len(by_type['vAMM'])}):")
        for pool in by_type['vAMM']:
            name = pool.get('known_name') or pool['address']
            weight = pool['weight_formatted']
            print(f"  {pool['address']} - {name} (weight: {weight:,.2f})")
    
    if by_type['sAMM']:
        print(f"\n✓ sAMM Pools Found ({len(by_type['sAMM'])}):")
        for pool in by_type['sAMM']:
            name = pool.get('known_name') or pool['address']
            weight = pool['weight_formatted']
            print(f"  {pool['address']} - {name} (weight: {weight:,.2f})")
    
    return {
        'by_type': by_type,
        'pools_with_weights': pools_with_weights,
        'total_pools': len(pools)
    }

def main():
    if len(sys.argv) < 2:
        log_file = "ai-tmp/blackhole-api-logs-2026-01-20T01_52_45.591Z.json"
        print(f"No log file specified, using: {log_file}")
    else:
        log_file = sys.argv[1]
    
    # Initialize Web3
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("❌ Error: Could not connect to Avalanche RPC")
        return 1
    
    print(f"✓ Connected to Avalanche RPC: {RPC_URL}\n")
    
    # Step 1: Extract from logs
    try:
        extracted = extract_pools_from_logs(log_file)
    except FileNotFoundError:
        print(f"❌ Error: Log file not found: {log_file}")
        return 1
    
    if not extracted['addresses']:
        print("\n⚠ No pool addresses extracted from logs")
        return 1
    
    # Step 2: Query weights
    weights = query_pool_weights(w3, VOTER_PROXY, extracted['addresses'])
    
    # Step 3: Analyze
    analysis = analyze_results(extracted, weights)
    
    # Save results
    output = {
        'extraction': extracted,
        'weights': weights,
        'analysis': {
            'by_type_counts': {k: len(v) for k, v in analysis['by_type'].items()},
            'total_pools': analysis['total_pools'],
            'pools_with_weights': len(analysis['pools_with_weights'])
        },
        'all_pools': weights['pools']
    }
    
    output_file = "discovered_pools.json"
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n✓ Complete results saved to: {output_file}")
    
    # Next steps
    print("\n" + "="*80)
    print("NEXT STEPS")
    print("="*80)
    print("\n1. We now have pool addresses from multicall logs")
    print("2. We can query weights for any pool address")
    print("3. To get ALL pools, we need to:")
    print("   - Extract from DOM when page loads")
    print("   - Or find factory contracts that list pools")
    print("   - Or monitor more RPC calls")
    print("\n4. For vAMM/sAMM endpoints:")
    print("   - We found pool addresses, but no HTTP API endpoints")
    print("   - Pools are fetched via RPC calls to contracts")
    print("   - We can query these pools directly via RPC")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
