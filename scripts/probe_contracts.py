import json
from web3 import Web3

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
w3 = Web3(Web3.HTTPProvider(RPC_URL))
VOTER_PROXY = w3.to_checksum_address("0xe30d0c8532721551a51a9fec7fb233759964d9e3")

# Common factory/registry function selectors
selectors = {
    "factory()": "0xc45a0155",
    "factories()": "0x439ca35c",
    "pools()": "0xac9630aa",
    "allPoolsLength()": "0x6430da65",
    "allPools(uint256)": "0x12065fe0"
}

print(f"Probing Voter Proxy at {VOTER_PROXY}...")

for name, selector in selectors.items():
    try:
        res = w3.eth.call({
            'to': VOTER_PROXY,
            'data': selector
        })
        if res and res != b'\x00' * 32:
            print(f"[FOUND] {name}: {res.hex()}")
        else:
            print(f"[EMPTY] {name}")
    except Exception as e:
        print(f"[ERROR] {name}: {e}")

# Also check for Gauge Factory
# Selector for gauges(address) 
GAUGES_SELECTOR = "0x419074b2"
# Test with a known pool address from your logs (XAUt0/WAVAX)
TEST_POOL = "0x533f6eb38d1c2e420a043ae0bdb5040c86dbc07f"
try:
    data = GAUGES_SELECTOR + TEST_POOL[2:].lower().zfill(64)
    res = w3.eth.call({
        'to': VOTER_PROXY,
        'data': data
    })
    print(f"Gauge for {TEST_POOL}: {res.hex()}")
except Exception as e:
    print(f"Error checking gauge: {e}")
