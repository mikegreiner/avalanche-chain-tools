#!/usr/bin/env python3
"""
Analyze the frequently called contract 0xb3629c89ed9cb172a3fba66dfdf8c06a85b35de9
This appears in many multicalls - might be important!
"""

import json
import sys
from web3 import Web3

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
FREQUENT_CONTRACT = "0xb3629c89ed9cb172a3fba66dfdf8c06a85b35de9"

# Common function selectors
SELECTORS = {
    "name()": "0x06fdde03",
    "symbol()": "0x95d89b41",
    "decimals()": "0x313ce567",
    "totalSupply()": "0x18160ddd",
    "balanceOf(address)": "0x70a08231",
    "owner()": "0x8da5cb5b",
    "factory()": "0xc45a0155",
    "allPoolsLength()": "0x6430da65",
    "allPools(uint256)": "0x0dfe1681",
    "pools(uint256)": "0x0dfe1681",
    "poolsLength()": "0x6430da65",
    "getPool(address,address,uint24)": "0x1698ee82",
    "getPools()": "0x0dfe1681",
    "rewards()": "0x5c60da1b",
    "rewardRate()": "0x7b9c3b7f",
    "emission()": "0x5c60da1b",
    "emissionRate()": "0x5c60da1b",
    "totalRewards()": "0x5c60da1b",
    "claimable()": "0x379607f5",
}

def probe_contract(w3, address):
    """Probe contract for available functions"""
    print(f"\n{'='*80}")
    print(f"PROBING CONTRACT: {address}")
    print(f"{'='*80}\n")
    
    results = {}
    
    for func_name, selector in SELECTORS.items():
        # Skip functions that need arguments
        if 'address' in func_name or 'uint256' in func_name or 'uint24' in func_name:
            continue
        
        try:
            result = w3.eth.call({
                'to': w3.to_checksum_address(address),
                'data': selector
            })
            
            if result and result != b'\x00' * 32:
                result_hex = result.hex()
                value = int(result_hex, 16)
                
                # Try to interpret
                interpretation = None
                if 'name' in func_name or 'symbol' in func_name:
                    # Try to decode as string
                    try:
                        if len(result_hex) >= 128:
                            length_hex = result_hex[64:128]
                            length = int(length_hex, 16)
                            if 0 < length < 32:
                                data_hex = result_hex[128:128 + (length * 2)]
                                text = bytes.fromhex(data_hex).decode('utf-8', errors='ignore').strip('\x00')
                                if text:
                                    interpretation = f"string: {text}"
                    except:
                        pass
                
                if not interpretation:
                    if value > 0:
                        if value < 1e10:
                            interpretation = f"uint256: {value}"
                        else:
                            interpretation = f"uint256: {value / 1e18:.2f}"
                
                if interpretation:
                    results[func_name] = {
                        'selector': selector,
                        'result': result_hex,
                        'interpretation': interpretation
                    }
                    print(f"✓ {func_name}: {interpretation}")
        except Exception as e:
            pass
    
    return results

if __name__ == "__main__":
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("❌ Could not connect to RPC")
        sys.exit(1)
    
    print("="*80)
    print("ANALYZING FREQUENTLY CALLED CONTRACT")
    print("="*80)
    
    results = probe_contract(w3, FREQUENT_CONTRACT)
    
    if not results:
        print("\n⚠️  No standard functions found")
        print("This might be a custom contract or the selectors are wrong")
    else:
        print(f"\n✓ Found {len(results)} working functions")
