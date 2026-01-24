#!/usr/bin/env python3
"""
Extract contract addresses from multicall RPC requests
Uses pattern matching to find Ethereum addresses in hex data
Works even without perfect ABI decoding
"""

import json
import re
import sys
from typing import Dict, List, Set
from collections import Counter

MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11"

def extract_addresses_from_hex(data_hex: str) -> Set[str]:
    """
    Extract all valid Ethereum addresses from hex data
    Addresses are 20 bytes (40 hex chars), often left-padded to 32 bytes (64 hex chars)
    """
    addresses = set()
    
    if not data_hex or not data_hex.startswith('0x'):
        return addresses
    
    # Remove 0x prefix
    data = data_hex[2:].lower()
    
    # Pattern 1: Look for addresses in 64-char chunks (32-byte ABI encoding)
    # Addresses are left-padded with zeros
    for i in range(0, len(data) - 63, 2):  # Step by 2 to avoid overlap
        chunk = data[i:i+64]
        if len(chunk) == 64:
            # Check if it's left-padded (first 24 chars are zeros)
            if chunk[:24] == '0' * 24:
                addr_hex = chunk[24:64]
                # Validate it's a valid hex address
                if re.match(r'^[0-9a-f]{40}$', addr_hex):
                    address = '0x' + addr_hex
                    addresses.add(address)
    
    # Pattern 2: Look for any 40-char hex sequences that look like addresses
    # (addresses often start with 0x and have specific patterns)
    for match in re.finditer(r'[0-9a-f]{40}', data):
        addr_hex = match.group(0)
        address = '0x' + addr_hex
        # Basic validation: not all zeros, not all f's
        if address != '0x' + '0' * 40 and address != '0x' + 'f' * 40:
            addresses.add(address)
    
    return addresses

def analyze_log_file(log_file: str) -> Dict:
    """Analyze API log file and extract contract addresses from multicalls"""
    print("="*80)
    print("EXTRACTING CONTRACT ADDRESSES FROM MULTICALLS")
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
            
            # Check if it's a multicall
            if (contract and contract.lower() == MULTICALL3.lower() and 
                data_hex and data_hex.startswith('0x82ad56cb')):
                multicall_requests.append({
                    'request': req,
                    'data': data_hex
                })
        except:
            continue
    
    print(f"Multicall requests found: {len(multicall_requests)}\n")
    
    # Extract addresses from each multicall
    all_addresses = Counter()
    address_sources = {}  # Track which addresses appear in which requests
    
    print("Extracting addresses from multicall data...\n")
    
    for i, mc in enumerate(multicall_requests):
        data_hex = mc['data']
        addresses = extract_addresses_from_hex(data_hex)
        
        for addr in addresses:
            all_addresses[addr.lower()] += 1
            if addr.lower() not in address_sources:
                address_sources[addr.lower()] = []
            address_sources[addr.lower()].append(i)
        
        if (i + 1) % 20 == 0:
            print(f"  Processed {i + 1}/{len(multicall_requests)} multicalls...")
    
    print(f"\n✓ Extracted {len(all_addresses)} unique addresses")
    
    # Filter out obvious non-contracts (zeros, multicall itself, ABI encoding artifacts, etc.)
    filtered_addresses = {}
    excluded = {
        MULTICALL3.lower(),
        '0x' + '0' * 40,
        '0x' + 'f' * 40,
    }
    
    # Filter out addresses that look like ABI encoding artifacts
    # (addresses with too many leading zeros or specific patterns)
    def is_valid_address(addr: str) -> bool:
        addr_lower = addr.lower()
        if addr_lower in excluded:
            return False
        
        # Check if it's mostly zeros (likely ABI padding)
        hex_part = addr_lower[2:]
        zero_count = hex_part.count('0')
        if zero_count > 30:  # More than 30 zeros out of 40 chars
            return False
        
        # Check for suspicious patterns (all same digit, etc.)
        if len(set(hex_part)) < 4:  # Less than 4 unique hex digits
            return False
        
        # Check if it looks like an offset (common in ABI encoding)
        # Offsets are usually small numbers left-padded
        if hex_part[:30] == '0' * 30:  # First 30 chars are zeros
            return False
        
        return True
    
    for addr, count in all_addresses.items():
        if is_valid_address(addr) and count >= 2:  # Appears at least twice (more reliable)
            filtered_addresses[addr] = {
                'address': '0x' + addr[2:] if not addr.startswith('0x') else addr,  # Ensure proper format
                'occurrences': count,
                'in_multicalls': len(address_sources[addr])
            }
    
    # Sort by occurrences (most common first)
    sorted_addresses = sorted(
        filtered_addresses.items(),
        key=lambda x: -x[1]['occurrences']
    )
    
    # Display results
    print("\n" + "="*80)
    print("EXTRACTED CONTRACT ADDRESSES")
    print("="*80)
    print(f"\nFound {len(sorted_addresses)} unique contract addresses\n")
    
    print("Most frequently called contracts:")
    for addr_lower, info in sorted_addresses[:30]:
        print(f"  {info['address']} (appears {info['occurrences']}x in {info['in_multicalls']} multicalls)")
    
    # Check for known contracts
    VOTER = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"
    known_pools = {
        "0x9a6142ef0766915db02066f791d969c22eba1dca": "CL200-WAVAX/BLACK",
        "0x5e128ebc09c918ddae3ca1668d4ee9527dc00d78": "CL200-WETH.e/WAVAX",
        "0xa02ec3ba8d17887567672b2cdcaf525534636ea0": "CL1-WAVAX/USDC",
        "0x78f5a53731564894a7e4fff827a88e5fbf9cfcb6": "vAMM-GCROC/WAVAX",
        "0xedcfa2d80cf06fb7642e956a1e95dbc37c75995b": "sAMM-CROC/WAVAX",
    }
    
    print("\n" + "="*80)
    print("KNOWN CONTRACTS CHECK")
    print("="*80)
    
    found_known = []
    for addr_lower, info in sorted_addresses:
        if addr_lower in known_pools:
            found_known.append((info['address'], known_pools[addr_lower], info['occurrences']))
    
    if found_known:
        print(f"\n✓ Found {len(found_known)} known pools in multicalls:")
        for addr, name, count in found_known:
            print(f"  {addr} - {name} ({count}x)")
    else:
        print("\n⚠ No known pools found in extracted addresses")
        print("  This might indicate the extraction needs refinement")
    
    voter_found = any(addr.lower() == VOTER.lower() for addr, _ in sorted_addresses)
    if voter_found:
        print(f"\n✓ Voter contract ({VOTER}) found in multicalls")
    
    # Save results
    output = {
        "total_multicalls": len(multicall_requests),
        "unique_addresses": len(sorted_addresses),
        "addresses": [
            {
                "address": info['address'],
                "occurrences": info['occurrences'],
                "in_multicalls": info['in_multicalls']
            }
            for _, info in sorted_addresses
        ],
        "known_pools_found": [
            {"address": addr, "name": name, "occurrences": count}
            for addr, name, count in found_known
        ]
    }
    
    output_file = "extracted_contracts.json"
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n✓ Results saved to: {output_file}")
    
    return output

if __name__ == "__main__":
    if len(sys.argv) < 2:
        log_file = "ai-tmp/blackhole-api-logs-2026-01-20T01_52_45.591Z.json"
        print(f"No file specified, using: {log_file}")
    else:
        log_file = sys.argv[1]
    
    try:
        analyze_log_file(log_file)
    except FileNotFoundError:
        print(f"Error: File not found: {log_file}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
