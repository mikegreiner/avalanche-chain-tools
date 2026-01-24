#!/usr/bin/env python3
"""
Find how rewards/VAPR are fetched - check for API endpoints or RPC patterns
"""

import json
import sys
import requests

# Known endpoints
KNOWN_ENDPOINTS = [
    "https://resources.blackhole.xyz/cl-pools-list/cl-pools.json",
    "https://resources.blackhole.xyz/vamm-pools-list/vamm-pools.json",
    "https://resources.blackhole.xyz/samm-pools-list/samm-pools.json",
    "https://resources.blackhole.xyz/token-details.json",
    "https://api.blackhole.xyz/pools",
    "https://api.blackhole.xyz/rewards",
    "https://api.blackhole.xyz/vapr",
    "https://blackhole.xyz/api/pools",
    "https://blackhole.xyz/api/rewards",
]

def check_endpoint(url):
    """Check if endpoint exists and what it returns"""
    try:
        response = requests.get(url, timeout=5)
        print(f"\n{url}:")
        print(f"  Status: {response.status_code}")
        if response.status_code == 200:
            try:
                data = response.json()
                print(f"  Type: JSON")
                if isinstance(data, dict):
                    print(f"  Keys: {list(data.keys())[:10]}")
                elif isinstance(data, list):
                    print(f"  Length: {len(data)}")
                    if len(data) > 0:
                        print(f"  First item keys: {list(data[0].keys())[:10] if isinstance(data[0], dict) else 'N/A'}")
            except:
                print(f"  Type: {response.headers.get('content-type', 'unknown')}")
                print(f"  Size: {len(response.content)} bytes")
        elif response.status_code == 403:
            print(f"  ⚠️  Forbidden (exists but restricted)")
        elif response.status_code == 404:
            print(f"  ❌ Not found")
    except requests.exceptions.RequestException as e:
        print(f"  ❌ Error: {e}")

def find_endpoints_in_logs(log_file):
    """Find all unique endpoints in log file"""
    print("="*80)
    print("FINDING API ENDPOINTS IN LOGS")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    
    # Extract unique URLs
    urls = set()
    for req in requests:
        url = req.get('url', '')
        if url and ('blackhole' in url.lower() or 'api' in url.lower()):
            urls.add(url)
    
    print(f"\nFound {len(urls)} unique Blackhole-related URLs:\n")
    for url in sorted(urls):
        print(f"  {url}")
    
    return urls

if __name__ == "__main__":
    print("="*80)
    print("CHECKING KNOWN ENDPOINTS")
    print("="*80)
    
    for endpoint in KNOWN_ENDPOINTS:
        check_endpoint(endpoint)
    
    # Check logs
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T01_52_45.591Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    try:
        find_endpoints_in_logs(log_file)
    except FileNotFoundError:
        print(f"\n⚠️  Log file not found: {log_file}")
    except Exception as e:
        print(f"\n⚠️  Error analyzing logs: {e}")
