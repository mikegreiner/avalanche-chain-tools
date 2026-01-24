#!/usr/bin/env python3
"""
Query the voter contract to get all registered pools
Then identify which are CL, vAMM, or sAMM pools
"""

import json
from web3 import Web3
from typing import Dict, List, Optional, Set
import sys

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_PROXY = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"

# Function selectors
SELECTORS = {
    "allPoolsLength()": "0x6430da65",
    "allPools(uint256)": "0x12065fe0",
    "weights(address)": "0xa7cac846",
    "gauges(address)": "0x419074b2",
    "totalWeight()": "0x96c82e57",
}

# Known pool addresses from previous analysis (for validation)
KNOWN_CL_POOLS = {
    "0x9A6142eF0766915dB02066f791D969C22eba1dcA",  # CL200-WAVAX/BLACK
    "0x5E128EbC09C918DDAE3Ca1668d4EE9527dc00D78",  # CL200-WETH.e/WAVAX
    "0xA02Ec3Ba8d17887567672b2CDCAF525534636Ea0",  # CL1-WAVAX/USDC
}

KNOWN_VAMM_POOLS = {
    "0x78F5A53731564894A7e4FfF827a88E5FbF9cfCb6",  # vAMM-GCROC/WAVAX
}

KNOWN_SAMM_POOLS = {
    "0xedCFA2d80cf06FB7642E956a1e95DBC37c75995b",  # sAMM-CROC/WAVAX
}

def get_pool_count(w3: Web3, voter_address: str) -> Optional[int]:
    """Get total number of pools from voter contract"""
    try:
        result = w3.eth.call({
            'to': w3.to_checksum_address(voter_address),
            'data': SELECTORS["allPoolsLength()"]
        })
        if result and result != b'\x00' * 32:
            count = int(result.hex(), 16)
            return count
    except Exception as e:
        print(f"Error getting pool count: {e}")
    return None

def get_pool_at_index(w3: Web3, voter_address: str, index: int) -> Optional[str]:
    """Get pool address at given index"""
    try:
        # Encode index as uint256 (64 hex chars, zero-padded)
        index_hex = hex(index)[2:].zfill(64)
        data = SELECTORS["allPools(uint256)"] + index_hex
        
        result = w3.eth.call({
            'to': w3.to_checksum_address(voter_address),
            'data': data
        })
        
        if result and result != b'\x00' * 32:
            # Address is in last 20 bytes (40 hex chars)
            address_hex = result.hex()[-40:]
            address = '0x' + address_hex
            return w3.to_checksum_address(address)
    except Exception as e:
        print(f"Error getting pool at index {index}: {e}")
    return None

def get_pool_weight(w3: Web3, voter_address: str, pool_address: str) -> Optional[int]:
    """Get current weight for a pool"""
    try:
        # Remove 0x and pad address to 64 chars
        addr_clean = pool_address[2:].lower().zfill(64)
        data = SELECTORS["weights(address)"] + addr_clean
        
        result = w3.eth.call({
            'to': w3.to_checksum_address(voter_address),
            'data': data
        })
        
        if result and result != b'\x00' * 32:
            weight = int(result.hex(), 16)
            return weight
    except Exception as e:
        pass
    return None

def identify_pool_type(w3: Web3, pool_address: str) -> str:
    """
    Try to identify pool type by checking:
    1. Known pools list
    2. Contract code/interface
    3. Factory that created it
    """
    pool_lower = pool_address.lower()
    
    # Check known pools
    if pool_lower in {p.lower() for p in KNOWN_CL_POOLS}:
        return "CL"
    if pool_lower in {p.lower() for p in KNOWN_VAMM_POOLS}:
        return "vAMM"
    if pool_lower in {p.lower() for p in KNOWN_SAMM_POOLS}:
        return "sAMM"
    
    # Try to get contract code to identify
    try:
        code = w3.eth.get_code(w3.to_checksum_address(pool_address))
        code_hex = code.hex()
        
        # Look for function selectors that might indicate pool type
        # This is a heuristic - different pool types have different interfaces
        
        # CL pools often have tick-related functions
        if '0x99fbab88' in code_hex or '0x128acb08' in code_hex:  # tickSpacing, swap
            return "CL (likely)"
        
        # vAMM might have virtual pool functions
        if '0x8a7c195f' in code_hex:  # crossTo (virtual pool)
            return "vAMM (likely)"
        
        # sAMM might have stable-specific functions
        # This is harder to identify - might need to check factory
        
    except Exception as e:
        pass
    
    return "Unknown"

def query_all_pools(w3: Web3, voter_address: str, output_file: Optional[str] = None) -> Dict:
    """Query voter contract for all pools"""
    print("="*80)
    print("QUERYING VOTER CONTRACT FOR ALL POOLS")
    print("="*80)
    
    voter_checksum = w3.to_checksum_address(voter_address)
    print(f"\nVoter Contract: {voter_checksum}")
    print(f"RPC: {RPC_URL}\n")
    
    # Get pool count
    print("Getting total pool count...")
    pool_count = get_pool_count(w3, voter_checksum)
    
    if pool_count is None:
        print("❌ Could not get pool count. The voter contract may not have allPoolsLength() method.")
        print("\nTrying alternative approach: checking if pools() method exists...")
        return {}
    
    print(f"✓ Found {pool_count} total pools\n")
    
    if pool_count == 0:
        print("No pools found in voter contract.")
        return {}
    
    # Get all pools
    print("Fetching all pool addresses...")
    pools = []
    failed_indices = []
    
    # Process in batches for progress updates
    batch_size = 50
    for i in range(pool_count):
        if i % batch_size == 0 and i > 0:
            print(f"  Progress: {i}/{pool_count} pools fetched...")
        
        pool_addr = get_pool_at_index(w3, voter_checksum, i)
        if pool_addr:
            pools.append(pool_addr)
        else:
            failed_indices.append(i)
    
    print(f"\n✓ Successfully fetched {len(pools)} pools")
    if failed_indices:
        print(f"⚠ Failed to fetch {len(failed_indices)} pools at indices: {failed_indices[:10]}")
    
    # Identify pool types
    print("\n" + "="*80)
    print("IDENTIFYING POOL TYPES")
    print("="*80)
    print("\nAnalyzing pools to determine type (CL/vAMM/sAMM)...\n")
    
    pool_data = []
    type_counts = {"CL": 0, "vAMM": 0, "sAMM": 0, "Unknown": 0}
    
    for i, pool_addr in enumerate(pools):
        if i % 20 == 0 and i > 0:
            print(f"  Progress: {i}/{len(pools)} pools analyzed...")
        
        pool_type = identify_pool_type(w3, pool_addr)
        weight = get_pool_weight(w3, voter_checksum, pool_addr)
        
        pool_data.append({
            "address": pool_addr,
            "index": i,
            "type": pool_type,
            "weight": weight,
            "weight_formatted": weight / 1e18 if weight else 0
        })
        
        if pool_type.startswith("CL"):
            type_counts["CL"] += 1
        elif pool_type.startswith("vAMM"):
            type_counts["vAMM"] += 1
        elif pool_type.startswith("sAMM"):
            type_counts["sAMM"] += 1
        else:
            type_counts["Unknown"] += 1
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    print(f"\nTotal pools: {len(pools)}")
    print(f"  CL pools: {type_counts['CL']}")
    print(f"  vAMM pools: {type_counts['vAMM']}")
    print(f"  sAMM pools: {type_counts['sAMM']}")
    print(f"  Unknown type: {type_counts['Unknown']}")
    
    # Show sample pools by type
    print("\n" + "="*80)
    print("SAMPLE POOLS BY TYPE")
    print("="*80)
    
    for pool_type in ["CL", "vAMM", "sAMM"]:
        type_pools = [p for p in pool_data if p["type"].startswith(pool_type)]
        if type_pools:
            print(f"\n{pool_type} Pools ({len(type_pools)}):")
            for pool in type_pools[:10]:
                weight_str = f"{pool['weight_formatted']:.2f}" if pool['weight'] else "0"
                print(f"  {pool['address']} (weight: {weight_str})")
            if len(type_pools) > 10:
                print(f"  ... and {len(type_pools) - 10} more")
    
    # Unknown pools
    unknown_pools = [p for p in pool_data if p["type"] == "Unknown"]
    if unknown_pools:
        print(f"\nUnknown Type Pools ({len(unknown_pools)}):")
        for pool in unknown_pools[:20]:
            print(f"  {pool['address']}")
        if len(unknown_pools) > 20:
            print(f"  ... and {len(unknown_pools) - 20} more")
    
    # Save results
    results = {
        "voter_contract": voter_checksum,
        "total_pools": len(pools),
        "pool_count_from_contract": pool_count,
        "type_counts": type_counts,
        "pools": pool_data
    }
    
    if output_file:
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\n✓ Results saved to: {output_file}")
    
    return results

def main():
    # Initialize Web3
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("❌ Error: Could not connect to Avalanche RPC")
        return 1
    
    print(f"✓ Connected to Avalanche RPC: {RPC_URL}\n")
    
    # Query all pools
    output_file = "voter_all_pools.json"
    results = query_all_pools(w3, VOTER_PROXY, output_file)
    
    if not results:
        print("\n⚠ Could not fetch pools. The voter contract may use different methods.")
        print("\nNext steps:")
        print("1. Check voter contract ABI for alternative methods")
        print("2. Try extracting addresses from multicall RPC logs")
        print("3. Query factory contracts directly")
        return 1
    
    # Next steps based on results
    print("\n" + "="*80)
    print("NEXT STEPS")
    print("="*80)
    
    if results["type_counts"]["vAMM"] > 0 or results["type_counts"]["sAMM"] > 0:
        print("\n✓ Found vAMM/sAMM pools!")
        print("  - We can now query these pools directly")
        print("  - We can fetch their metadata from contracts")
        print("  - We can integrate them into the pool data provider")
    else:
        print("\n⚠ Could not identify vAMM/sAMM pools by type detection")
        print("  - Pool type identification needs improvement")
        print("  - May need to check factory contracts")
        print("  - Or use DOM extraction to match addresses")
    
    print("\nRecommended follow-up:")
    print("1. Extract contract addresses from multicall logs for comparison")
    print("2. Query factory contracts to identify pool types")
    print("3. Cross-reference with DOM-extracted pools")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
