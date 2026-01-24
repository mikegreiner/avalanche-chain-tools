#!/usr/bin/env python3
"""
Check what methods the voter contract actually has
Try various function selectors to see what works
"""

from web3 import Web3
import json

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_PROXY = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"

# Try various function selectors that might list pools
SELECTORS_TO_TRY = {
    # Pool listing methods
    "allPoolsLength()": "0x6430da65",
    "allPools(uint256)": "0x12065fe0",
    "poolCount()": "0x0dfe1681",
    "pools(uint256)": "0xac9630aa",
    "getPools()": "0x0dfe1681",
    "poolsLength()": "0x6430da65",
    
    # Weight/registry methods
    "weights(address)": "0xa7cac846",
    "totalWeight()": "0x96c82e57",
    "gauges(address)": "0x419074b2",
    "getGauge(address)": "0xcc56b2c5",
    
    # Factory methods
    "factory()": "0xc45a0155",
    "factories()": "0x439ca35c",
    
    # Other common methods
    "owner()": "0x8da5cb5b",
    "name()": "0x06fdde03",
}

w3 = Web3(Web3.HTTPProvider(RPC_URL))
voter = w3.to_checksum_address(VOTER_PROXY)

print("="*80)
print("CHECKING VOTER CONTRACT METHODS")
print("="*80)
print(f"\nVoter: {voter}")
print(f"RPC: {RPC_URL}\n")

working_methods = {}
failing_methods = {}

for name, selector in SELECTORS_TO_TRY.items():
    try:
        result = w3.eth.call({
            'to': voter,
            'data': selector
        })
        
        if result and result != b'\x00' * 32:
            # Try to interpret result
            result_hex = result.hex()
            
            # Check if it looks like an address (last 20 bytes)
            if len(result_hex) >= 40:
                potential_addr = '0x' + result_hex[-40:]
                # Check if it's a valid address format
                if all(c in '0123456789abcdef' for c in potential_addr[2:]):
                    working_methods[name] = {
                        'selector': selector,
                        'result': result_hex,
                        'interpretation': f'Possible address: {potential_addr}'
                    }
                else:
                    # Try as uint256
                    try:
                        value = int(result_hex, 16)
                        working_methods[name] = {
                            'selector': selector,
                            'result': result_hex,
                            'interpretation': f'uint256: {value}'
                        }
                    except:
                        working_methods[name] = {
                            'selector': selector,
                            'result': result_hex[:66] + '...',
                            'interpretation': 'Unknown format'
                        }
            else:
                working_methods[name] = {
                    'selector': selector,
                    'result': result_hex,
                    'interpretation': 'Short result'
                }
        else:
            failing_methods[name] = "Empty result"
    except Exception as e:
        error_msg = str(e)
        if 'execution reverted' in error_msg:
            failing_methods[name] = "Execution reverted"
        else:
            failing_methods[name] = error_msg

print("WORKING METHODS:")
print("-" * 80)
for name, info in sorted(working_methods.items()):
    print(f"{name}")
    print(f"  Selector: {info['selector']}")
    print(f"  Result: {info['interpretation']}")
    print()

print("\nFAILING METHODS:")
print("-" * 80)
for name, reason in sorted(failing_methods.items()):
    print(f"{name}: {reason}")

# Try calling weights() with a known pool
print("\n" + "="*80)
print("TESTING weights(address) WITH KNOWN POOLS")
print("="*80)

known_pools = [
    "0x9A6142eF0766915dB02066f791D969C22eba1dcA",  # CL200-WAVAX/BLACK
    "0x78F5A53731564894A7e4FfF827a88E5FbF9cfCb6",  # vAMM-GCROC/WAVAX
    "0xedCFA2d80cf06FB7642E956a1e95DBC37c75995b",  # sAMM-CROC/WAVAX
]

for pool_addr in known_pools:
    try:
        addr_clean = pool_addr[2:].lower().zfill(64)
        data = "0xa7cac846" + addr_clean
        result = w3.eth.call({
            'to': voter,
            'data': data
        })
        if result and result != b'\x00' * 32:
            weight = int(result.hex(), 16)
            weight_formatted = weight / 1e18
            print(f"✓ {pool_addr}: weight = {weight_formatted:.2f}")
        else:
            print(f"✗ {pool_addr}: No weight (empty result)")
    except Exception as e:
        print(f"✗ {pool_addr}: Error - {e}")
