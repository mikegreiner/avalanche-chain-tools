#!/usr/bin/env python3
"""
Query pool contracts directly for fees and see if we can calculate rewards
Maybe rewards = fees collected, and we can get fees from pool contracts
"""

import json
import sys
from web3 import Web3

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"

# Pool function selectors
POOL_SELECTORS = {
    "token0()": "0x0dfe1681",
    "token1()": "0xd21220a7",
    "fee()": "0xddca3f43",
    "swapFee()": "0x3ddac953",
    "protocolFees()": "0x5c60da1b",
    "fees()": "0xddca3f43",
    "feeGrowthGlobal0X128()": "0x5c60da1b",
    "feeGrowthGlobal1X128()": "0x5c60da1b",
    "liquidity()": "0x1a686502",
    "totalSupply()": "0x18160ddd",
}

def query_pool_data(w3, pool_address):
    """Query pool for all available data"""
    print(f"\nQuerying pool: {pool_address}")
    
    data = {}
    
    for func_name, selector in POOL_SELECTORS.items():
        try:
            result = w3.eth.call({
                'to': w3.to_checksum_address(pool_address),
                'data': selector
            })
            
            if result and result != b'\x00' * 32:
                value = int(result.hex(), 16)
                data[func_name] = value
                
                # Format based on function
                if 'fee' in func_name.lower():
                    if value < 10000:
                        print(f"  {func_name}: {value} (basis points: {value/100}%)")
                    else:
                        print(f"  {func_name}: {value}")
                elif 'liquidity' in func_name.lower() or 'supply' in func_name.lower():
                    print(f"  {func_name}: {value / 1e18:.2f}")
                else:
                    print(f"  {func_name}: {value}")
        except:
            pass
    
    return data

if __name__ == "__main__":
    test_pools = [
        "0x9a6142ef0766915db02066f791d969c22eba1dca",  # CL
        "0x78f5a53731564894a7e4fff827a88e5fbf9cfcb6",  # vAMM
        "0xedcfa2d80cf06fb7642e956a1e95dbc37c75995b",  # sAMM
    ]
    
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("❌ Could not connect")
        sys.exit(1)
    
    print("="*80)
    print("QUERYING POOL CONTRACTS FOR FEES/REWARDS")
    print("="*80)
    
    for pool in test_pools:
        query_pool_data(w3, pool)
