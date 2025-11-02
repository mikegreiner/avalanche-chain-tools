#!/usr/bin/env python3
"""
Research Script for Blackhole Voting Contract

This script helps identify the Blackhole voting contract address and ABI
by analyzing transactions and the blackhole.xyz website.
"""

import requests
import json
import sys
from typing import Optional, Dict, List
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import time
import re

SNOWTRACE_API = "https://api.snowtrace.io/api"
API_KEY = "YourApiKeyToken"


def get_contract_from_transaction(tx_hash: str) -> Optional[Dict]:
    """Get contract information from a transaction hash"""
    url = f"{SNOWTRACE_API}?module=proxy&action=eth_getTransactionByHash&txhash={tx_hash}&apikey={API_KEY}"
    
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        
        if data.get('result'):
            tx = data['result']
            return {
                'to': tx.get('to'),
                'from': tx.get('from'),
                'data': tx.get('input'),
                'value': tx.get('value')
            }
    except Exception as e:
        print(f"Error fetching transaction: {e}")
    
    return None


def extract_contract_addresses_from_page(url: str) -> List[str]:
    """Extract contract addresses from the Blackhole voting page"""
    print(f"Loading {url}...")
    
    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    
    driver = None
    addresses = []
    
    try:
        driver = webdriver.Chrome(options=options)
        driver.get(url)
        time.sleep(5)
        
        # Get page source
        page_source = driver.page_source
        
        # Look for contract addresses (0x followed by 40 hex chars)
        address_pattern = r'0x[a-fA-F0-9]{40}'
        matches = re.findall(address_pattern, page_source)
        
        # Remove duplicates
        addresses = list(set(matches))
        
        print(f"Found {len(addresses)} potential contract addresses")
        
    except Exception as e:
        print(f"Error loading page: {e}")
    finally:
        if driver:
            driver.quit()
    
    return addresses


def get_contract_abi(contract_address: str) -> Optional[List]:
    """Get contract ABI from Snowtrace"""
    url = f"{SNOWTRACE_API}?module=contract&action=getabi&address={contract_address}&apikey={API_KEY}"
    
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        
        if data.get('status') == '1' and data.get('result') != 'Contract source code not verified':
            abi = json.loads(data['result'])
            return abi
    except Exception as e:
        print(f"Error fetching ABI: {e}")
    
    return None


def find_voting_function_signatures(abi: List[Dict]) -> List[str]:
    """Find function signatures that look like voting functions"""
    voting_keywords = ['vote', 'voting', 'pool', 'allocate', 'distribute']
    signatures = []
    
    for item in abi:
        if item.get('type') == 'function':
            name = item.get('name', '').lower()
            if any(keyword in name for keyword in voting_keywords):
                inputs = item.get('inputs', [])
                input_types = [inp.get('type') for inp in inputs]
                sig = f"{name}({','.join(input_types)})"
                signatures.append({
                    'name': item.get('name'),
                    'signature': sig,
                    'inputs': inputs,
                    'outputs': item.get('outputs', [])
                })
    
    return signatures


def main():
    print("="*60)
    print("Blackhole Voting Contract Research Tool")
    print("="*60)
    print()
    
    # Method 1: Extract from the voting page
    print("Method 1: Scanning blackhole.xyz/vote for contract addresses...")
    addresses = extract_contract_addresses_from_page("https://blackhole.xyz/vote")
    
    if addresses:
        print(f"\nFound {len(addresses)} contract addresses:")
        for addr in addresses[:10]:  # Show first 10
            print(f"  {addr}")
        
        # Check each address for voting-related functions
        print("\nAnalyzing contracts for voting functions...")
        for addr in addresses[:5]:  # Check first 5
            print(f"\nChecking {addr}...")
            abi = get_contract_abi(addr)
            if abi:
                voting_funcs = find_voting_function_signatures(abi)
                if voting_funcs:
                    print(f"  ? Found voting functions:")
                    for func in voting_funcs:
                        print(f"    - {func['name']}: {func['signature']}")
                else:
                    print(f"  ? No voting functions found")
    else:
        print("No addresses found")
    
    print("\n" + "="*60)
    print("Research complete!")
    print("="*60)
    print("\nNext steps:")
    print("1. Identify the voting contract from the addresses above")
    print("2. Get the full ABI using Snowtrace API")
    print("3. Add the contract address and ABI to config.yaml")
    print("4. Test with dry-run mode")


if __name__ == "__main__":
    main()
