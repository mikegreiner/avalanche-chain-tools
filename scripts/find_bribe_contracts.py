#!/usr/bin/env python3
"""
Find bribe contracts - rewards often come from bribe contracts
"""

import json
import sys
from web3 import Web3

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_PROXY = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"

# Bribe-related selectors
BRIBE_SELECTORS = {
    "bribe()": "0x8d8e4c8e",
    "bribeAddress()": "0x8d8e4c8e",
    "bribes(address)": "0x8d8e4c8e",
    "getBribe(address)": "0x8d8e4c8e",
}

# Bribe contract function selectors
BRIBE_CONTRACT_SELECTORS = {
    "rewardsPerEpoch()": "0x5c60da1b",
    "rewardsPerToken()": "0x40c10f19",
    "totalRewards()": "0x5c60da1b",
    "epochRewards(uint256)": "0x5c60da1b",
    "claimable(address)": "0x379607f5",
    "earned(address)": "0x3d18b912",
}

def find_bribe_address(w3, voter_address, pool_address):
    """Find bribe contract address for a pool"""
    addr_clean = pool_address[2:].lower().zfill(64)
    
    for name, selector in BRIBE_SELECTORS.items():
        data = selector + addr_clean
        try:
            result = w3.eth.call({
                'to': w3.to_checksum_address(voter_address),
                'data': data
            })
            
            if result and result != b'\x00' * 32:
                bribe_addr = '0x' + result.hex()[-40:]
                if bribe_addr != '0x' + '0' * 40:
                    return w3.to_checksum_address(bribe_addr)
        except:
            continue
    
    return None

def probe_bribe_contract(w3, bribe_address):
    """Probe bribe contract"""
    results = {}
    
    for func_name, selector in BRIBE_CONTRACT_SELECTORS.items():
        if 'uint256' in func_name or 'address' in func_name:
            continue  # Skip functions needing arguments for now
        
        try:
            result = w3.eth.call({
                'to': bribe_address,
                'data': selector
            })
            
            if result and result != b'\x00' * 32:
                value = int(result.hex(), 16)
                if value > 0:
                    results[func_name] = value / 1e18
        except:
            pass
    
    return results

def investigate_bribes(pool_addresses):
    """Investigate bribe contracts for pools"""
    print("="*80)
    print("BRIBE CONTRACT INVESTIGATION")
    print("="*80)
    
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("❌ Could not connect to RPC")
        return
    
    print(f"✓ Connected to {RPC_URL}\n")
    
    for pool_addr in pool_addresses:
        print(f"\nPool: {pool_addr}")
        
        # Try to find bribe
        bribe_addr = find_bribe_address(w3, VOTER_PROXY, pool_addr)
        if bribe_addr:
            print(f"  ✓ Bribe: {bribe_addr}")
            bribe_data = probe_bribe_contract(w3, bribe_addr)
            if bribe_data:
                print(f"  ✓ Bribe data:")
                for key, value in bribe_data.items():
                    print(f"    - {key}: {value}")
        else:
            print(f"  ❌ No bribe found")

if __name__ == "__main__":
    test_pools = [
        "0x9a6142ef0766915db02066f791d969c22eba1dca",
        "0x78f5a53731564894a7e4fff827a88e5fbf9cfcb6",
        "0xedcfa2d80cf06fb7642e956a1e95dbc37c75995b",
    ]
    
    investigate_bribes(test_pools)
