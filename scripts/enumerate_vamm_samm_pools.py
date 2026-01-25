#!/usr/bin/env python3
"""
Enumerate vAMM and sAMM pools from GAUGE_MANAGER.

This script discovers all vAMM/sAMM pools that have gauges (i.e., can receive votes)
and saves them in a format similar to the CL pools static API.

Usage:
    python scripts/enumerate_vamm_samm_pools.py [--output FILE]
"""

import json
import argparse
from datetime import datetime, timezone
from web3 import Web3

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
GAUGE_MANAGER = "0x59aa177312Ff6Bdf39C8Af6F46dAe217bf76CBf6"
VOTER = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"


class PoolEnumerator:
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(RPC_URL))
    
    def selector(self, sig: str) -> str:
        return "0x" + self.w3.keccak(text=sig)[:4].hex()
    
    def call(self, to: str, data: str):
        try:
            return self.w3.eth.call({'to': Web3.to_checksum_address(to), 'data': data})
        except:
            return None
    
    def decode_uint(self, data, offset=0) -> int:
        if not data or len(data) < offset + 32:
            return 0
        return int.from_bytes(data[offset:offset+32], 'big')
    
    def decode_address(self, data, offset=0) -> str:
        if not data or len(data) < offset + 32:
            return None
        addr = "0x" + data[offset+12:offset+32].hex()
        return addr if addr != "0x" + "0"*40 else None
    
    def decode_string(self, data) -> str:
        if not data or len(data) < 64:
            return ""
        try:
            offset = int.from_bytes(data[0:32], 'big')
            length = int.from_bytes(data[offset:offset+32], 'big')
            return data[offset+32:offset+32+length].decode('utf-8')
        except:
            return ""
    
    def decode_bool(self, data):
        if not data or len(data) < 32:
            return None
        return int.from_bytes(data[:32], 'big') != 0
    
    def encode_address(self, addr: str) -> str:
        return addr[2:].lower().zfill(64)
    
    def get_all_gauge_pools(self) -> list:
        """Get all pool addresses from GAUGE_MANAGER"""
        length = self.decode_uint(self.call(GAUGE_MANAGER, self.selector('length()')))
        print(f"GAUGE_MANAGER has {length} pools")
        
        pools = []
        for i in range(length):
            result = self.call(GAUGE_MANAGER, self.selector('pools(uint256)') + hex(i)[2:].zfill(64))
            addr = self.decode_address(result)
            if addr:
                pools.append(addr)
            if (i + 1) % 50 == 0:
                print(f"  Fetched {i+1}/{length} pool addresses...")
        
        return pools
    
    def get_pool_info(self, pool_addr: str) -> dict:
        """Get detailed info for a single pool"""
        # Check if CL pool (has tickSpacing)
        tick_spacing = self.decode_uint(self.call(pool_addr, self.selector('tickSpacing()')))
        
        if tick_spacing > 0:
            # CL pool - skip (we have the static API for these)
            return None
        
        # Check if stable (sAMM) or volatile (vAMM)
        stable_result = self.call(pool_addr, self.selector('stable()'))
        is_stable = self.decode_bool(stable_result)
        
        if is_stable is None:
            return None  # Unknown pool type
        
        pool_type = 'sAMM' if is_stable else 'vAMM'
        
        # Get token addresses
        token0 = self.decode_address(self.call(pool_addr, self.selector('token0()')))
        token1 = self.decode_address(self.call(pool_addr, self.selector('token1()')))
        
        if not token0 or not token1:
            return None
        
        # Get token details
        sym0 = self.decode_string(self.call(token0, self.selector('symbol()'))) or "?"
        sym1 = self.decode_string(self.call(token1, self.selector('symbol()'))) or "?"
        dec0 = self.decode_uint(self.call(token0, self.selector('decimals()'))) or 18
        dec1 = self.decode_uint(self.call(token1, self.selector('decimals()'))) or 18
        
        # Get gauge address
        gauge = self.decode_address(self.call(GAUGE_MANAGER, 
            self.selector('gauges(address)') + self.encode_address(pool_addr)))
        
        return {
            "id": pool_addr.lower(),
            "type": pool_type,
            "stable": is_stable,
            "token0": {
                "id": token0.lower(),
                "symbol": sym0,
                "decimals": str(dec0)
            },
            "token1": {
                "id": token1.lower(),
                "symbol": sym1,
                "decimals": str(dec1)
            },
            "gauge": gauge.lower() if gauge else None
        }
    
    def enumerate_vamm_samm_pools(self) -> dict:
        """Enumerate all vAMM/sAMM pools with full metadata"""
        print("Enumerating pools from GAUGE_MANAGER...")
        all_pools = self.get_all_gauge_pools()
        
        print(f"\nFetching pool details for {len(all_pools)} pools...")
        vamm_pools = []
        samm_pools = []
        skipped_cl = 0
        
        for i, addr in enumerate(all_pools):
            info = self.get_pool_info(addr)
            
            if info is None:
                skipped_cl += 1
            elif info['type'] == 'vAMM':
                vamm_pools.append(info)
            elif info['type'] == 'sAMM':
                samm_pools.append(info)
            
            if (i + 1) % 30 == 0:
                print(f"  Processed {i+1}/{len(all_pools)} pools...")
        
        print()
        print(f"Summary:")
        print(f"  vAMM pools: {len(vamm_pools)}")
        print(f"  sAMM pools: {len(samm_pools)}")
        print(f"  CL pools (skipped): {skipped_cl}")
        
        return {
            "pools": vamm_pools + samm_pools,
            "vamm_count": len(vamm_pools),
            "samm_count": len(samm_pools),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": "GAUGE_MANAGER enumeration"
        }


def main():
    parser = argparse.ArgumentParser(description="Enumerate vAMM/sAMM pools")
    parser.add_argument("--output", "-o", default="data/vamm_samm_pools_enumerated.json",
                        help="Output file path")
    args = parser.parse_args()
    
    enumerator = PoolEnumerator()
    data = enumerator.enumerate_vamm_samm_pools()
    
    # Save to file
    with open(args.output, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"\nSaved to {args.output}")
    
    # Show top pools by name
    print("\nSample pools:")
    for pool in data["pools"][:15]:
        name = f"{pool['type']}-{pool['token0']['symbol']}/{pool['token1']['symbol']}"
        print(f"  {name}")


if __name__ == "__main__":
    main()
