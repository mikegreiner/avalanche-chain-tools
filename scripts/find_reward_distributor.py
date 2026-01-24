#!/usr/bin/env python3
"""
Look for reward distributor contracts or other reward-related contracts
Maybe rewards come from a central distributor, not individual gauges
"""

import json
import sys
from web3 import Web3
from collections import Counter

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VOTER_PROXY = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"

# Common reward distributor patterns
REWARD_SELECTORS = {
    "rewardDistributor()": "0x5c60da1b",
    "distributor()": "0x5c60da1b",
    "rewards()": "0x5c60da1b",
    "rewardToken()": "0x16f0115b",
    "emission()": "0x5c60da1b",
    "emissionRate()": "0x5c60da1b",
}

def find_contracts_in_multicalls(log_file):
    """Find all unique contract addresses called in multicalls"""
    print("="*80)
    print("FINDING CONTRACTS IN MULTICALLS")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    
    # Extract contract addresses from multicall requests
    contract_addresses = set()
    
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
                
                if data_field and data_field.startswith('0x82ad56cb'):  # aggregate selector
                    # Extract addresses from the calldata
                    # Multicall format: aggregate((address,bytes)[])
                    # After selector, we have array encoding
                    hex_data = data_field[10:]  # Remove selector
                    
                    # Try to extract addresses (they appear at regular intervals)
                    # Each call is: address (20 bytes = 40 hex chars) + offset + length + data
                    for i in range(0, len(hex_data) - 40, 2):
                        potential_addr = '0x' + hex_data[i:i+40]
                        if len(potential_addr) == 42:
                            # Check if it looks valid
                            if potential_addr != '0x' + '0' * 40:
                                try:
                                    # Validate as checksum address
                                    Web3.to_checksum_address(potential_addr)
                                    contract_addresses.add(potential_addr.lower())
                                except:
                                    pass
    
    print(f"\nFound {len(contract_addresses)} unique contract addresses\n")
    print("Top 20 contracts:")
    for addr in sorted(list(contract_addresses))[:20]:
        print(f"  {addr}")
    
    return contract_addresses

def probe_reward_contracts(w3, addresses):
    """Probe addresses for reward-related functions"""
    print("\n" + "="*80)
    print("PROBING CONTRACTS FOR REWARD FUNCTIONS")
    print("="*80)
    
    reward_contracts = []
    
    for addr in list(addresses)[:50]:  # Probe first 50
        try:
            checksum_addr = w3.to_checksum_address(addr)
            
            # Try common reward functions
            for func_name, selector in REWARD_SELECTORS.items():
                try:
                    result = w3.eth.call({
                        'to': checksum_addr,
                        'data': selector
                    })
                    
                    if result and result != b'\x00' * 32:
                        print(f"\n✓ {checksum_addr} has {func_name}")
                        reward_contracts.append({
                            'address': checksum_addr,
                            'function': func_name
                        })
                        break
                except:
                    pass
        except:
            pass
    
    return reward_contracts

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T01_52_45.591Z.json"
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("❌ Could not connect to RPC")
        sys.exit(1)
    
    contracts = find_contracts_in_multicalls(log_file)
    reward_contracts = probe_reward_contracts(w3, contracts)
    
    if reward_contracts:
        print(f"\n✓ Found {len(reward_contracts)} potential reward contracts")
    else:
        print("\n⚠️  No obvious reward contracts found")
