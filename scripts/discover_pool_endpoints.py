#!/usr/bin/env python3
"""
Comprehensive endpoint discovery for Blackhole DEX pool data
Discovers API endpoints, RPC calls, and contract interactions for all pool types
"""

import json
import requests
import sys
from web3 import Web3
from typing import Dict, List, Set, Optional
import time

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_PROXY = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"
RESOURCES_BASE = "https://resources.blackhole.xyz"

# Known endpoints
KNOWN_ENDPOINTS = {
    "CL": "https://resources.blackhole.xyz/cl-pools-list/cl-pools.json",
}

# Potential endpoint patterns to try
ENDPOINT_PATTERNS = [
    "vamm-pools-list/vamm-pools.json",
    "samm-pools-list/samm-pools.json",
    "pools-list/pools.json",
    "all-pools-list/all-pools.json",
    "vamm-pools/vamm-pools.json",
    "samm-pools/samm-pools.json",
    "pools/vamm.json",
    "pools/samm.json",
    "api/pools/vamm",
    "api/pools/samm",
    "api/vamm-pools",
    "api/samm-pools",
]

# Common function selectors for pool discovery
FUNCTION_SELECTORS = {
    "allPoolsLength()": "0x6430da65",
    "allPools(uint256)": "0x12065fe0",
    "pools(uint256)": "0xac9630aa",
    "poolCount()": "0x0dfe1681",
    "getPool(address,address,uint24)": "0x1698ee82",  # Uniswap V3 style
    "getPools()": "0x0dfe1681",
    "factories()": "0x439ca35c",
    "factory()": "0xc45a0155",
    "gauges(address)": "0x419074b2",
    "weights(address)": "0xa7cac846",
    "totalWeight()": "0x96c82e57",
}

def test_endpoint(url: str, headers: Optional[Dict] = None) -> Dict:
    """Test if an endpoint exists and is accessible"""
    result = {
        "url": url,
        "exists": False,
        "status": None,
        "accessible": False,
        "content_type": None,
        "size": 0,
        "error": None
    }
    
    try:
        test_headers = {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
            "Accept": "application/json",
            "Referer": "https://blackhole.xyz/vote",
            "Origin": "https://blackhole.xyz"
        }
        if headers:
            test_headers.update(headers)
        
        response = requests.get(url, headers=test_headers, timeout=10, allow_redirects=True)
        result["status"] = response.status_code
        result["content_type"] = response.headers.get("content-type", "")
        result["size"] = len(response.content)
        
        if response.status_code == 200:
            result["exists"] = True
            result["accessible"] = True
            try:
                data = response.json()
                result["data"] = data
                result["data_preview"] = str(data)[:500]
            except:
                result["data"] = response.text[:500]
        elif response.status_code == 403:
            result["exists"] = True  # Endpoint exists but access denied
            result["error"] = "Access denied (403)"
        elif response.status_code == 404:
            result["exists"] = False
        else:
            result["exists"] = True
            result["error"] = f"Status {response.status_code}"
            
    except requests.exceptions.RequestException as e:
        result["error"] = str(e)
    
    return result

def probe_voter_contract(w3: Web3, voter_address: str) -> Dict:
    """Probe the voter contract for pool-related functions"""
    print(f"\n{'='*80}")
    print("PROBING VOTER CONTRACT")
    print(f"{'='*80}")
    
    results = {}
    voter_checksum = w3.to_checksum_address(voter_address)
    
    for name, selector in FUNCTION_SELECTORS.items():
        try:
            res = w3.eth.call({
                'to': voter_checksum,
                'data': selector
            })
            if res and res != b'\x00' * 32:
                results[name] = {
                    "selector": selector,
                    "result": res.hex(),
                    "decoded": None
                }
                print(f"[FOUND] {name}: {res.hex()[:66]}...")
            else:
                print(f"[EMPTY] {name}")
        except Exception as e:
            print(f"[ERROR] {name}: {e}")
    
    # Try to get pool count
    try:
        pool_count_selector = FUNCTION_SELECTORS["allPoolsLength()"]
        res = w3.eth.call({
            'to': voter_checksum,
            'data': pool_count_selector
        })
        if res and res != b'\x00' * 32:
            pool_count = int(res.hex(), 16)
            results["pool_count"] = pool_count
            print(f"\n[INFO] Total pools (allPoolsLength): {pool_count}")
            
            # Try to fetch first few pools
            if pool_count > 0:
                print(f"\nFetching first 5 pools...")
                pools = []
                for i in range(min(5, pool_count)):
                    try:
                        pool_selector = FUNCTION_SELECTORS["allPools(uint256)"]
                        index_hex = hex(i)[2:].zfill(64)
                        data = pool_selector + index_hex
                        pool_res = w3.eth.call({
                            'to': voter_checksum,
                            'data': data
                        })
                        if pool_res and pool_res != b'\x00' * 32:
                            pool_addr = '0x' + pool_res.hex()[-40:]
                            pools.append(pool_addr)
                            print(f"  Pool {i}: {pool_addr}")
                    except Exception as e:
                        print(f"  Error fetching pool {i}: {e}")
                results["sample_pools"] = pools
    except Exception as e:
        print(f"[ERROR] Could not get pool count: {e}")
    
    return results

def analyze_rpc_calls_from_logs(log_file: str) -> Dict:
    """Analyze RPC calls from API logs to understand patterns"""
    print(f"\n{'='*80}")
    print("ANALYZING RPC CALLS FROM LOGS")
    print(f"{'='*80}")
    
    try:
        with open(log_file, 'r') as f:
            logs = json.load(f)
        
        # Extract unique RPC methods and patterns
        rpc_methods = set()
        contract_addresses = set()
        function_selectors = set()
        
        for entry in logs:
            if 'requestBody' in entry:
                try:
                    body = json.loads(entry['requestBody'])
                    if 'method' in body:
                        rpc_methods.add(body['method'])
                    if 'params' in body and isinstance(body['params'], list):
                        for param in body['params']:
                            if isinstance(param, dict) and 'data' in param:
                                data = param['data']
                                if data.startswith('0x') and len(data) >= 10:
                                    selector = data[:10]
                                    function_selectors.add(selector)
                            if isinstance(param, dict) and 'to' in param:
                                contract_addresses.add(param['to'])
                except:
                    pass
        
        print(f"\nFound {len(rpc_methods)} unique RPC methods:")
        for method in sorted(rpc_methods):
            print(f"  - {method}")
        
        print(f"\nFound {len(contract_addresses)} unique contract addresses:")
        for addr in sorted(contract_addresses)[:10]:
            print(f"  - {addr}")
        
        print(f"\nFound {len(function_selectors)} unique function selectors:")
        for selector in sorted(function_selectors)[:20]:
            print(f"  - {selector}")
        
        return {
            "rpc_methods": list(rpc_methods),
            "contract_addresses": list(contract_addresses),
            "function_selectors": list(function_selectors)
        }
    except Exception as e:
        print(f"[ERROR] Could not analyze logs: {e}")
        return {}

def discover_endpoints() -> Dict:
    """Try to discover all pool endpoints"""
    print(f"\n{'='*80}")
    print("DISCOVERING API ENDPOINTS")
    print(f"{'='*80}")
    
    results = {
        "found": [],
        "exists_but_denied": [],
        "not_found": [],
        "errors": []
    }
    
    # Test known endpoint first
    print(f"\nTesting known CL endpoint...")
    cl_result = test_endpoint(KNOWN_ENDPOINTS["CL"])
    if cl_result["accessible"]:
        results["found"].append(cl_result)
        print(f"  ✓ CL endpoint accessible: {cl_result['url']}")
    else:
        results["exists_but_denied"].append(cl_result)
        print(f"  ✗ CL endpoint: {cl_result.get('error', 'Unknown error')}")
    
    # Test potential endpoints
    print(f"\nTesting potential endpoints...")
    for pattern in ENDPOINT_PATTERNS:
        url = f"{RESOURCES_BASE}/{pattern}"
        print(f"\nTesting: {url}")
        result = test_endpoint(url)
        
        if result["accessible"]:
            results["found"].append(result)
            print(f"  ✓ FOUND AND ACCESSIBLE!")
            if "data" in result:
                print(f"  Preview: {result.get('data_preview', 'N/A')[:200]}")
        elif result["status"] == 403:
            results["exists_but_denied"].append(result)
            print(f"  ⚠ EXISTS but access denied (403)")
        elif result["status"] == 404:
            results["not_found"].append(result)
            print(f"  ✗ Not found (404)")
        else:
            results["errors"].append(result)
            print(f"  ✗ Error: {result.get('error', 'Unknown')}")
        
        time.sleep(0.5)  # Be nice to the server
    
    return results

def check_subgraph_endpoints() -> Dict:
    """Check for GraphQL subgraph endpoints"""
    print(f"\n{'='*80}")
    print("CHECKING FOR SUBGRAPH ENDPOINTS")
    print(f"{'='*80}")
    
    # Common subgraph patterns
    subgraph_patterns = [
        "https://api.thegraph.com/subgraphs/name/blackhole/",
        "https://subgraph.satsuma-prod.com/blackhole/",
        "https://gateway.thegraph.com/api/subgraphs/id/",
    ]
    
    results = []
    
    # We can't easily discover subgraph IDs without the actual endpoint
    # But we can check if there are any references in the codebase
    print("\nNote: Subgraph endpoints typically require specific IDs.")
    print("Check the browser's network tab for GraphQL requests.")
    
    return results

def main():
    print("="*80)
    print("BLACKHOLE DEX POOL ENDPOINT DISCOVERY")
    print("="*80)
    
    # Initialize Web3
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("ERROR: Could not connect to Avalanche RPC")
        return
    
    print(f"\nConnected to Avalanche RPC: {RPC_URL}")
    
    # 1. Discover API endpoints
    endpoint_results = discover_endpoints()
    
    # 2. Probe voter contract
    voter_results = probe_voter_contract(w3, VOTER_PROXY)
    
    # 3. Analyze RPC calls from logs if available
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T01_35_14.590Z.json"
    rpc_analysis = {}
    try:
        rpc_analysis = analyze_rpc_calls_from_logs(log_file)
    except FileNotFoundError:
        print(f"\n[INFO] Log file not found: {log_file}")
    
    # 4. Check for subgraph endpoints
    subgraph_results = check_subgraph_endpoints()
    
    # Summary
    print(f"\n{'='*80}")
    print("SUMMARY")
    print(f"{'='*80}")
    
    print(f"\n✓ Found {len(endpoint_results['found'])} accessible endpoints:")
    for result in endpoint_results["found"]:
        print(f"  - {result['url']}")
    
    if endpoint_results["exists_but_denied"]:
        print(f"\n⚠ Found {len(endpoint_results['exists_but_denied'])} endpoints that exist but are denied:")
        for result in endpoint_results["exists_but_denied"]:
            print(f"  - {result['url']} (403)")
    
    print(f"\n✓ Voter contract analysis complete")
    print(f"  - Tested {len(FUNCTION_SELECTORS)} function selectors")
    if "pool_count" in voter_results:
        print(f"  - Total pools: {voter_results['pool_count']}")
    
    # Save results
    output = {
        "endpoints": endpoint_results,
        "voter_contract": voter_results,
        "rpc_analysis": rpc_analysis,
        "timestamp": time.time()
    }
    
    output_file = "discovered_endpoints.json"
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n✓ Results saved to: {output_file}")
    
    # Recommendations
    print(f"\n{'='*80}")
    print("RECOMMENDATIONS")
    print(f"{'='*80}")
    
    if endpoint_results["exists_but_denied"]:
        print("\n1. Some endpoints exist but return 403. Try:")
        print("   - Adding proper Referer/Origin headers")
        print("   - Using browser automation to capture actual requests")
        print("   - Checking if authentication is required")
    
    print("\n2. For vAMM/sAMM pools, consider:")
    print("   - Intercepting network requests in browser DevTools")
    print("   - Checking if pools are fetched via RPC calls to specific contracts")
    print("   - Looking for factory contracts that create vAMM/sAMM pools")
    
    print("\n3. Next steps:")
    print("   - Use browser extension to capture all network requests")
    print("   - Analyze the actual requests made by blackhole.xyz/vote")
    print("   - Check factory contracts for vAMM and sAMM pool creation")

if __name__ == "__main__":
    main()
