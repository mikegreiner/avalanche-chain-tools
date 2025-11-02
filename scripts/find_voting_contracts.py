#!/usr/bin/env python3
"""
Find Blackhole Voting Contracts

This script uses multiple methods to identify:
1. Voting contract address
2. veBLACK contract address
3. Pool contract addresses
4. Contract ABIs
"""

import requests
import json
import re
import time
from typing import List, Dict, Optional, Set
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

SNOWTRACE_API = "https://api.snowtrace.io/api"
API_KEY = "YourApiKeyToken"


def get_contract_abi(contract_address: str) -> Optional[List]:
    """Get contract ABI from Snowtrace"""
    print(f"Fetching ABI for {contract_address}...")
    url = f"{SNOWTRACE_API}?module=contract&action=getabi&address={contract_address}&apikey={API_KEY}"
    
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        
        if data.get('status') == '1' and data.get('result') != 'Contract source code not verified':
            abi = json.loads(data['result'])
            print(f"  ? ABI found ({len(abi)} items)")
            return abi
        else:
            print(f"  ? ABI not verified on Snowtrace")
    except Exception as e:
        print(f"  ? Error: {e}")
    
    return None


def get_contract_source(contract_address: str) -> Optional[Dict]:
    """Get contract source code and creation info"""
    url = f"{SNOWTRACE_API}?module=contract&action=getsourcecode&address={contract_address}&apikey={API_KEY}"
    
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        
        if data.get('status') == '1' and data.get('result'):
            result = data['result'][0]
            return {
                'contract_name': result.get('ContractName'),
                'compiler_version': result.get('CompilerVersion'),
                'optimization': result.get('OptimizationUsed'),
                'source_code': result.get('SourceCode')
            }
    except Exception as e:
        print(f"Error fetching source: {e}")
    
    return None


def extract_addresses_from_text(text: str) -> Set[str]:
    """Extract Ethereum addresses from text"""
    pattern = r'0x[a-fA-F0-9]{40}'
    return set(re.findall(pattern, text.lower()))


def find_voting_function_signatures(abi: List[Dict]) -> List[Dict]:
    """Find functions that look like voting functions"""
    voting_keywords = ['vote', 'voting', 'pool', 'allocate', 'distribute', 'gauge', 'bribe']
    functions = []
    
    for item in abi:
        if item.get('type') == 'function':
            name = item.get('name', '').lower()
            if any(keyword in name for keyword in voting_keywords):
                inputs = item.get('inputs', [])
                outputs = item.get('outputs', [])
                input_types = [inp.get('type') for inp in inputs]
                sig = f"{item.get('name')}({','.join(input_types)})"
                functions.append({
                    'name': item.get('name'),
                    'signature': sig,
                    'inputs': inputs,
                    'outputs': outputs,
                    'state_mutability': item.get('stateMutability', 'nonpayable')
                })
    
    return functions


def inspect_blackhole_page() -> Dict:
    """Inspect the Blackhole voting page for contract addresses"""
    print("="*70)
    print("Method 1: Inspecting blackhole.xyz/vote page")
    print("="*70)
    
    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--window-size=1920,1080')
    
    driver = None
    addresses = set()
    network_logs = []
    
    try:
        print("Loading page...")
        driver = webdriver.Chrome(options=options)
        driver.get("https://blackhole.xyz/vote")
        
        print("Waiting for page to load...")
        time.sleep(10)
        
        # Get page source
        page_source = driver.page_source
        addresses.update(extract_addresses_from_text(page_source))
        
        # Try to find contract addresses in JavaScript variables
        try:
            js_vars = driver.execute_script("""
                var vars = {};
                for (var prop in window) {
                    if (window.hasOwnProperty(prop) && 
                        typeof window[prop] === 'string' && 
                        window[prop].match(/^0x[a-fA-F0-9]{40}$/)) {
                        vars[prop] = window[prop];
                    }
                }
                return vars;
            """)
            for var_name, var_value in js_vars.items():
                addresses.add(var_value.lower())
                print(f"  Found in window.{var_name}: {var_value}")
        except Exception as e:
            print(f"  Could not extract JS variables: {e}")
        
        # Try to find addresses in localStorage
        try:
            local_storage = driver.execute_script("""
                var ls = {};
                for (var i = 0; i < localStorage.length; i++) {
                    var key = localStorage.key(i);
                    var value = localStorage.getItem(key);
                    if (value && value.match(/0x[a-fA-F0-9]{40}/)) {
                        ls[key] = value;
                    }
                }
                return ls;
            """)
            for key, value in local_storage.items():
                found = extract_addresses_from_text(value)
                addresses.update(found)
                if found:
                    print(f"  Found in localStorage.{key}: {found}")
        except Exception as e:
            print(f"  Could not read localStorage: {e}")
        
        # Check for API calls in network logs (requires enabling performance logging)
        print(f"\nFound {len(addresses)} unique addresses on page")
        
    except Exception as e:
        print(f"Error inspecting page: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if driver:
            driver.quit()
    
    return {
        'addresses': sorted(list(addresses)),
        'source': 'page_inspection'
    }


def search_snowtrace_for_voting_contracts() -> Dict:
    """Search Snowtrace for contracts with 'vote' or 'voting' in name"""
    print("\n" + "="*70)
    print("Method 2: Searching Snowtrace for voting-related contracts")
    print("="*70)
    
    # This is limited - Snowtrace API doesn't have a direct search
    # But we can check known patterns
    known_patterns = [
        '0x0000000000000000000000000000000000000000',  # Placeholder
    ]
    
    addresses = []
    
    # Check if we can find contracts by looking at BLACK token interactions
    black_token = '0xcd94a87696fac69edae3a70fe5725307ae1c43f6'
    
    print("Note: Snowtrace API search is limited. Manual research recommended.")
    
    return {
        'addresses': addresses,
        'source': 'snowtrace_search'
    }


def analyze_contract(address: str) -> Dict:
    """Analyze a contract address to determine if it's a voting contract"""
    print(f"\nAnalyzing contract: {address}")
    
    result = {
        'address': address,
        'has_abi': False,
        'contract_name': None,
        'voting_functions': [],
        'is_voting_contract': False
    }
    
    # Get ABI
    abi = get_contract_abi(address)
    if abi:
        result['has_abi'] = True
        result['abi'] = abi
        
        # Get contract source info
        source_info = get_contract_source(address)
        if source_info:
            result['contract_name'] = source_info.get('contract_name')
        
        # Check for voting functions
        voting_funcs = find_voting_function_signatures(abi)
        result['voting_functions'] = voting_funcs
        
        if voting_funcs:
            result['is_voting_contract'] = True
            print(f"  ? Potential voting contract (found {len(voting_funcs)} voting functions)")
            for func in voting_funcs[:5]:  # Show first 5
                print(f"    - {func['name']}: {func['signature']}")
        else:
            print(f"  ? No voting functions found")
    
    return result


def find_veblack_contract() -> Optional[str]:
    """Try to find the veBLACK contract"""
    print("\n" + "="*70)
    print("Searching for veBLACK contract")
    print("="*70)
    
    # veBLACK is typically a voting escrow contract
    # Common patterns: veToken, VotingEscrow
    # We can look for contracts that interact with BLACK token
    
    black_token = '0xcd94a87696fac69edae3a70fe5725307ae1c43f6'
    
    print("Checking BLACK token for potential veBLACK interactions...")
    
    # Get token holders (top holders might include veBLACK)
    # This is a placeholder - actual implementation would need more API calls
    print("  Note: Full veBLACK identification requires analyzing BLACK token interactions")
    
    return None


def main():
    print("\n" + "="*70)
    print("BLACKHOLE VOTING CONTRACT RESEARCH")
    print("="*70)
    print()
    
    # Method 1: Inspect the voting page
    page_results = inspect_blackhole_page()
    
    print(f"\nFound {len(page_results['addresses'])} addresses from page inspection")
    
    # Analyze promising addresses
    print("\nAnalyzing addresses for voting contracts...")
    
    voting_contracts = []
    pool_contracts = []
    
    for addr in page_results['addresses'][:20]:  # Check first 20
        analysis = analyze_contract(addr)
        
        if analysis['is_voting_contract']:
            voting_contracts.append(analysis)
        
        # Also check for pool contracts (might have 'pool' in name or functions)
        if analysis['has_abi']:
            abi = analysis['abi']
            for item in abi:
                if item.get('type') == 'function':
                    name = item.get('name', '').lower()
                    if 'pool' in name or 'liquidity' in name:
                        pool_contracts.append({
                            'address': addr,
                            'function': name
                        })
                        break
    
    # Summary
    print("\n" + "="*70)
    print("RESULTS SUMMARY")
    print("="*70)
    
    if voting_contracts:
        print(f"\n? Found {len(voting_contracts)} potential voting contract(s):")
        for contract in voting_contracts:
            print(f"\n  Address: {contract['address']}")
            if contract['contract_name']:
                print(f"  Name: {contract['contract_name']}")
            print(f"  Voting Functions: {len(contract['voting_functions'])}")
            for func in contract['voting_functions'][:3]:
                print(f"    - {func['name']}")
    else:
        print("\n? No voting contracts identified automatically")
        print("  Try:")
        print("  1. Inspect browser DevTools Network tab on blackhole.xyz/vote")
        print("  2. Look for API calls containing contract addresses")
        print("  3. Check recent voting transactions on Snowtrace")
    
    if pool_contracts:
        print(f"\n? Found {len(pool_contracts)} potential pool contract(s)")
        for pool in pool_contracts[:5]:
            print(f"  {pool['address']} - {pool['function']}")
    
    # Save results
    results = {
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
        'voting_contracts': voting_contracts,
        'pool_contracts': pool_contracts,
        'all_addresses_found': page_results['addresses']
    }
    
    output_file = 'voting_contract_research.json'
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    
    print(f"\n? Results saved to: {output_file}")
    print("\nNext steps:")
    print("1. Review the identified contracts")
    print("2. Verify contract addresses on Snowtrace")
    print("3. Add confirmed addresses to config.yaml")
    print("4. Get full ABIs and add to config.yaml")


if __name__ == "__main__":
    main()
