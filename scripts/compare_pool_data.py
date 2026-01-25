#!/usr/bin/env python3
"""
Compare our RPC-calculated pool data against the site.

This script fetches pool data using the same logic as our extension,
outputting results in a format easy to compare against blackhole.xyz/vote.

Usage:
    python scripts/compare_pool_data.py [--top N] [--pool NAME]
"""

import json
import argparse
from datetime import datetime, timezone
from web3 import Web3

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
CL_POOLS_URL = "https://resources.blackhole.xyz/cl-pools-list/cl-pools.json"
VAMM_SAMM_FILE = "data/vamm_samm_pools_enumerated.json"
DEFILLAMA_URL = "https://coins.llama.fi/prices/current/"

# Contract addresses
VOTER = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"
GAUGE_MANAGER = "0x59aa177312Ff6Bdf39C8Af6F46dAe217bf76CBf6"

# Known tokens
TOKENS = {
    "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7": ("WAVAX", 18),
    "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e": ("USDC", 6),
    "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7": ("USDt", 6),
    "0xcd94a87696fac69edae3a70fe5725307ae1c43f6": ("BLACK", 18),
}

SECONDS_PER_WEEK = 604800


class PoolDataFetcher:
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(RPC_URL))
        self.token_prices = {}
        self.token_decimals = {}
        
    def selector(self, sig: str) -> str:
        return "0x" + self.w3.keccak(text=sig)[:4].hex()
    
    def call(self, to: str, data: str):
        try:
            result = self.w3.eth.call({
                'to': Web3.to_checksum_address(to),
                'data': data
            })
            return result
        except Exception as e:
            return None
    
    def decode_uint(self, data, offset=0) -> int:
        if not data or len(data) < offset + 32:
            return 0
        return int.from_bytes(data[offset:offset+32], 'big')
    
    def decode_addr(self, data, offset=0) -> str:
        if not data or len(data) < offset + 32:
            return None
        addr = "0x" + data[offset+12:offset+32].hex()
        return addr if addr != "0x" + "0"*40 else None
    
    def get_current_epoch_start(self) -> int:
        """Get current epoch start (Thursday 00:00 UTC)
        Site shows ongoing/current epoch fees, not previous completed epoch."""
        now = int(datetime.now(timezone.utc).timestamp())
        current_epoch = (now // SECONDS_PER_WEEK) * SECONDS_PER_WEEK
        return current_epoch
    
    def fetch_token_prices(self, addresses: list):
        """Fetch prices from DeFiLlama"""
        import requests
        
        coins = ",".join(f"avax:{addr.lower()}" for addr in addresses)
        try:
            resp = requests.get(f"{DEFILLAMA_URL}{coins}", timeout=10)
            data = resp.json()
            for key, info in data.get("coins", {}).items():
                addr = key.replace("avax:", "").lower()
                self.token_prices[addr] = info.get("price", 0)
        except Exception as e:
            print(f"Warning: Failed to fetch prices: {e}")
    
    def get_token_price(self, address: str) -> float:
        return self.token_prices.get(address.lower(), 0)
    
    def get_token_decimals(self, address: str) -> int:
        addr = address.lower()
        if addr in self.token_decimals:
            return self.token_decimals[addr]
        if addr in TOKENS:
            return TOKENS[addr][1]
        return 18
    
    def fetch_cl_pools(self) -> list:
        """Fetch CL pool metadata"""
        import requests
        resp = requests.get(CL_POOLS_URL, timeout=10)
        data = resp.json()
        return data.get("pools", data)
    
    def fetch_vamm_samm_pools(self) -> list:
        """Fetch vAMM/sAMM pool metadata from local file"""
        import os
        file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), VAMM_SAMM_FILE)
        if not os.path.exists(file_path):
            print(f"  Warning: {VAMM_SAMM_FILE} not found. Run enumerate_vamm_samm_pools.py first.")
            return []
        with open(file_path) as f:
            data = json.load(f)
        return data.get("pools", [])
    
    def get_total_votes(self) -> float:
        result = self.call(VOTER, self.selector("totalWeight()"))
        return self.decode_uint(result) / 1e18 if result else 0
    
    def get_pool_votes(self, pool_address: str) -> float:
        param = pool_address[2:].lower().zfill(64)
        result = self.call(VOTER, f"{self.selector('weights(address)')}{param}")
        return self.decode_uint(result) / 1e18 if result else 0
    
    def get_gauge_for_pool(self, pool_address: str) -> str:
        param = pool_address[2:].lower().zfill(64)
        result = self.call(GAUGE_MANAGER, f"{self.selector('gauges(address)')}{param}")
        return self.decode_addr(result)
    
    def get_bribe_rewards_for_tokens(self, bribe_address: str, token_addresses: list, epoch_start: int) -> dict:
        """Get rewards from a bribe contract for specific tokens in an epoch"""
        rewards = {"tokens": [], "total_usd": 0}
        
        epoch_param = hex(epoch_start)[2:].zfill(64)
        
        for token_addr in token_addresses:
            if not token_addr:
                continue
                
            token_param = token_addr[2:].lower().zfill(64)
            result = self.call(
                bribe_address,
                f"{self.selector('tokenRewardsPerEpoch(address,uint256)')}{token_param}{epoch_param}"
            )
            raw_amount = self.decode_uint(result) if result else 0
            
            if raw_amount == 0:
                continue
            
            # Convert to USD
            decimals = self.get_token_decimals(token_addr)
            amount = raw_amount / (10 ** decimals)
            price = self.get_token_price(token_addr)
            usd_value = amount * price
            
            # Get token symbol
            symbol = TOKENS.get(token_addr.lower(), (token_addr[:10], 18))[0]
            
            rewards["tokens"].append({
                "address": token_addr,
                "symbol": symbol,
                "amount": amount,
                "price": price,
                "usd": usd_value,
            })
            rewards["total_usd"] += usd_value
        
        return rewards
    
    def get_pool_data(self, pool_meta: dict, black_price: float, epoch_start: int) -> dict:
        """Get complete data for a pool"""
        pool_addr = pool_meta["id"]
        
        # Determine pool type and build name
        t0 = pool_meta.get("token0", {})
        t1 = pool_meta.get("token1", {})
        
        if pool_meta.get("type") in ("vAMM", "sAMM"):
            # vAMM/sAMM pool format
            pool_type = pool_meta["type"]
        else:
            # CL pool format - use tickSpacing
            tick_spacing = int(pool_meta.get("tickSpacing", 0))
            pool_type = f"CL{tick_spacing}" if tick_spacing > 0 else "CL"
        
        name = f"{pool_type}-{t0.get('symbol', '?')}/{t1.get('symbol', '?')}"
        
        # Token addresses for this pool
        token0_addr = t0.get("id")
        token1_addr = t1.get("id")
        pool_tokens = [token0_addr, token1_addr]
        
        # Get votes
        votes = self.get_pool_votes(pool_addr)
        
        # Get gauge
        gauge_addr = self.get_gauge_for_pool(pool_addr)
        
        fees_usd = 0
        incentives_usd = 0
        internal_rewards = {}
        external_rewards = {}
        
        if gauge_addr:
            # Get internal_bribe (fees)
            result = self.call(gauge_addr, self.selector("internal_bribe()"))
            internal_bribe = self.decode_addr(result)
            
            # Get external_bribe (incentives)
            result = self.call(gauge_addr, self.selector("external_bribe()"))
            external_bribe = self.decode_addr(result)
            
            if internal_bribe:
                # For internal bribe (fees), use pool's token0/token1
                internal_rewards = self.get_bribe_rewards_for_tokens(internal_bribe, pool_tokens, epoch_start)
                fees_usd = internal_rewards["total_usd"]
            
            if external_bribe:
                # For external bribe (incentives), check pool tokens + common incentive tokens
                # BLACK is commonly used as incentive
                BLACK = "0xcd94a87696fac69edae3a70fe5725307ae1c43f6"
                incentive_tokens = pool_tokens + [BLACK]
                external_rewards = self.get_bribe_rewards_for_tokens(external_bribe, incentive_tokens, epoch_start)
                incentives_usd = external_rewards["total_usd"]
        
        total_rewards = fees_usd + incentives_usd
        
        # Calculate VAPR
        vapr = 0
        if votes > 0 and black_price > 0:
            annual_rewards = total_rewards * 52
            votes_usd = votes * black_price
            vapr = (annual_rewards / votes_usd) * 100
        
        return {
            "address": pool_addr,
            "name": name,
            "votes": votes,
            "fees_usd": fees_usd,
            "incentives_usd": incentives_usd,
            "total_rewards": total_rewards,
            "vapr": vapr,
            "tvl": float(pool_meta.get("totalValueLockedUSD", 0)),
            "gauge": gauge_addr,
            "internal_rewards": internal_rewards,
            "external_rewards": external_rewards,
        }


def main():
    parser = argparse.ArgumentParser(description="Compare pool data with site")
    parser.add_argument("--top", type=int, default=20, help="Number of top pools to show")
    parser.add_argument("--pool", type=str, help="Filter by pool name (e.g., 'WAVAX/USDC')")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()
    
    print("=" * 100)
    print("POOL DATA COMPARISON - Our RPC vs Site")
    print("=" * 100)
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")
    print()
    
    fetcher = PoolDataFetcher()
    
    # Step 1: Fetch pool metadata (CL + vAMM/sAMM)
    print("Fetching pool metadata...")
    cl_pools = fetcher.fetch_cl_pools()
    print(f"  CL pools: {len(cl_pools)}")
    
    vamm_samm_pools = fetcher.fetch_vamm_samm_pools()
    print(f"  vAMM/sAMM pools: {len(vamm_samm_pools)}")
    
    pools_meta = cl_pools + vamm_samm_pools
    print(f"  Total: {len(pools_meta)} pools")
    
    # Step 2: Collect all token addresses and fetch prices
    print("Fetching token prices from DeFiLlama...")
    token_addrs = set()
    for p in pools_meta:
        if p.get("token0", {}).get("id"):
            addr = p["token0"]["id"].lower()
            token_addrs.add(addr)
            fetcher.token_decimals[addr] = int(p["token0"].get("decimals", 18))
        if p.get("token1", {}).get("id"):
            addr = p["token1"]["id"].lower()
            token_addrs.add(addr)
            fetcher.token_decimals[addr] = int(p["token1"].get("decimals", 18))
    
    # Add BLACK token
    token_addrs.add("0xcd94a87696fac69edae3a70fe5725307ae1c43f6")
    
    fetcher.fetch_token_prices(list(token_addrs))
    black_price = fetcher.get_token_price("0xcd94a87696fac69edae3a70fe5725307ae1c43f6")
    print(f"  BLACK price: ${black_price:.5f}")
    print(f"  WAVAX price: ${fetcher.get_token_price('0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7'):.2f}")
    
    # Step 3: Get epoch start
    epoch_start = fetcher.get_current_epoch_start()
    epoch_dt = datetime.fromtimestamp(epoch_start, tz=timezone.utc)
    print(f"  Current epoch: {epoch_dt.isoformat()} (ts: {epoch_start})")
    
    # Step 4: Fetch pool data
    print("\nFetching pool data (this may take a minute)...")
    results = []
    
    for i, meta in enumerate(pools_meta):
        if args.pool and args.pool.lower() not in meta.get("token0", {}).get("symbol", "").lower() \
           and args.pool.lower() not in meta.get("token1", {}).get("symbol", "").lower():
            continue
        
        pool_data = fetcher.get_pool_data(meta, black_price, epoch_start)
        results.append(pool_data)
        
        if (i + 1) % 10 == 0:
            print(f"  Processed {i + 1}/{len(pools_meta)} pools...")
    
    # Sort by total rewards descending
    results.sort(key=lambda x: x["total_rewards"], reverse=True)
    
    # Output
    if args.json:
        print(json.dumps(results[:args.top], indent=2))
    else:
        print("\n" + "=" * 100)
        print(f"TOP {args.top} POOLS BY TOTAL REWARDS")
        print("=" * 100)
        print()
        print(f"{'#':<3} {'Pool Name':<25} {'Votes':<12} {'Fees $':<12} {'Incent $':<10} {'Total $':<12} {'VAPR %':<10}")
        print("-" * 100)
        
        for i, pool in enumerate(results[:args.top], 1):
            votes_str = f"{pool['votes']/1e6:.2f}M" if pool['votes'] >= 1e6 else f"{pool['votes']:,.0f}"
            print(f"{i:<3} {pool['name']:<25} {votes_str:<12} "
                  f"${pool['fees_usd']:>10,.0f} ${pool['incentives_usd']:>8,.0f} "
                  f"${pool['total_rewards']:>10,.0f} {pool['vapr']:>8.1f}%")
        
        print()
        print("=" * 100)
        print("INSTRUCTIONS: Compare these values against https://blackhole.xyz/vote")
        print("  - Sort by 'Total Rewards' on the site")
        print("  - Compare Fees, Incentives, Total Rewards, and VAPR columns")
        print("=" * 100)
        
        # Show breakdown for top pool
        if results:
            top = results[0]
            print(f"\nDETAILED BREAKDOWN: {top['name']}")
            print("-" * 50)
            print(f"  Address: {top['address']}")
            print(f"  Gauge: {top['gauge']}")
            print(f"  Votes: {top['votes']:,.0f}")
            print()
            print("  Internal Bribe (Fees):")
            for t in top.get("internal_rewards", {}).get("tokens", []):
                print(f"    {t['symbol']}: {t['amount']:,.4f} × ${t['price']:.4f} = ${t['usd']:,.2f}")
            print(f"    TOTAL FEES: ${top['fees_usd']:,.2f}")
            print()
            print("  External Bribe (Incentives):")
            for t in top.get("external_rewards", {}).get("tokens", []):
                print(f"    {t['symbol']}: {t['amount']:,.4f} × ${t['price']:.4f} = ${t['usd']:,.2f}")
            print(f"    TOTAL INCENTIVES: ${top['incentives_usd']:,.2f}")
            print()
            print(f"  TOTAL REWARDS: ${top['total_rewards']:,.2f}")
            print(f"  VAPR: {top['vapr']:.2f}%")


if __name__ == "__main__":
    main()
