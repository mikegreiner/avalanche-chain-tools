import requests
import json

url = "https://resources.blackhole.xyz/cl-pools-list/cl-pools.json"
print(f"Fetching {url}...")

try:
    res = requests.get(url, timeout=10)
    data = res.json()
    
    pools = data.get('pools', data.get('data', {}).get('pools', []))
    print(f"Found {len(pools)} pools in API.")
    
    # Look for XAUt0/WAVAX
    target_pool = None
    for p in pools:
        symbol0 = p.get('token0', {}).get('symbol', '')
        symbol1 = p.get('token1', {}).get('symbol', '')
        name = f"{symbol0}/{symbol1}"
        if 'XAUt0' in name and 'WAVAX' in name:
            target_pool = p
            print(f"\nFound target pool: {name}")
            print(json.dumps(p, indent=2))
            
            # Check fees
            fees = float(p.get('feesUSD', 0))
            untracked = float(p.get('untrackedFeesUSD', 0))
            print(f"\nFeesUSD: ${fees:,.2f}")
            print(f"UntrackedFeesUSD: ${untracked:,.2f}")
            print(f"ID (Address): {p.get('id')}")
            break
            
    if not target_pool:
        print("Target pool not found in API.")
        
except Exception as e:
    print(f"Error: {e}")
