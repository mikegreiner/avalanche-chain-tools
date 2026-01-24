#!/usr/bin/env python3
"""
Investigate tokens_per_week(uint256) function - this could be emission/reward rate!
"""

import json
import sys
from web3 import Web3

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_PROXY = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"

# Function selectors
TOKENS_PER_WEEK = "0xedf59997"  # tokens_per_week(uint256)
TOTAL_SUPPLY_AT_T = "0x7116c60c"  # totalSupplyAtT(uint256)

def call_tokens_per_week(w3, contract_address, week_number):
    """Call tokens_per_week(uint256) on a contract"""
    # Encode uint256 argument
    week_hex = hex(week_number)[2:].zfill(64)
    data = TOKENS_PER_WEEK + week_hex
    
    try:
        result = w3.eth.call({
            'to': w3.to_checksum_address(contract_address),
            'data': data
        })
        
        if result and result != b'\x00' * 32:
            value = int(result.hex(), 16)
            return value / 1e18
    except Exception as e:
        return None
    
    return None

def investigate_contracts(log_file):
    """Find which contracts have tokens_per_week"""
    print("="*80)
    print("INVESTIGATING tokens_per_week(uint256)")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    
    # Extract contracts that are called with tokens_per_week
    contracts_with_tokens_per_week = set()
    
    for req in requests:
        body = req.get('requestBody', req.get('body', ''))
        
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except:
                continue
        
        if isinstance(body, dict):
            params = body.get('params', [])
            if params and isinstance(params[0], dict):
                data_field = params[0].get('data', '')
                
                if data_field and TOKENS_PER_WEEK in data_field.lower():
                    # Extract contract address from the multicall
                    # The contract being called is in the multicall structure
                    # This is complex - for now, let's try known contracts
                    contracts_with_tokens_per_week.add(VOTER_PROXY)
    
    print(f"\nFound tokens_per_week calls in multicalls")
    print(f"Testing on voter contract and known pools...\n")
    
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("❌ Could not connect to RPC")
        return
    
    # Test on voter contract
    print(f"Testing on Voter Proxy: {VOTER_PROXY}")
    for week in [0, 1, 2]:  # Current week, next week, etc.
        value = call_tokens_per_week(w3, VOTER_PROXY, week)
        if value:
            print(f"  Week {week}: {value:,.2f} tokens per week")
    
    # Test on known pools
    test_pools = [
        "0x9a6142ef0766915db02066f791d969c22eba1dca",  # CL
        "0x78f5a53731564894a7e4fff827a88e5fbf9cfcb6",  # vAMM
        "0xedcfa2d80cf06fb7642e956a1e95dbc37c75995b",  # sAMM
    ]
    
    print(f"\nTesting on known pools:")
    for pool in test_pools:
        print(f"\n  Pool: {pool}")
        for week in [0, 1]:
            value = call_tokens_per_week(w3, pool, week)
            if value:
                print(f"    Week {week}: {value:,.2f} tokens per week")

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T02_34_55.027Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    investigate_contracts(log_file)
