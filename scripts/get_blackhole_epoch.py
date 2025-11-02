#!/usr/bin/env python3
"""
Get the actual Blackhole epoch number from the website or contract.

This script attempts to determine how Blackhole calculates epochs
by either:
1. Scraping the voting page
2. Querying the contract
3. Finding API endpoints
"""

import sys
import os
import requests
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def get_epoch_from_website() -> Optional[int]:
    """Try to get epoch number from the voting page"""
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        import time
        import re
        
        options = Options()
        options.add_argument('--headless=new')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        
        driver = webdriver.Chrome(options=options)
        driver.get('https://blackhole.xyz/vote')
        time.sleep(5)
        
        page_source = driver.page_source
        
        # Look for "Epoch #16" pattern
        epoch_match = re.search(r'Epoch\s*#(\d+)', page_source, re.IGNORECASE)
        
        # Also try to extract from JavaScript
        # Look for epoch-related variables
        js_epoch = re.findall(r'["\']?epoch["\']?\s*[:=]\s*(\d+)', page_source, re.IGNORECASE)
        
        driver.quit()
        
        if epoch_match:
            return int(epoch_match.group(1))
        elif js_epoch:
            # Return the first reasonable epoch number found
            for e in js_epoch:
                epoch_num = int(e)
                if 1 <= epoch_num <= 1000:  # Reasonable range
                    return epoch_num
        
        return None
    except Exception as e:
        print(f"Error scraping website: {e}")
        return None


def get_epoch_from_contract(block_number: Optional[int] = None) -> Optional[int]:
    """Get epoch from contract and try to map to website epoch"""
    try:
        from web3 import Web3
        import json
        
        rpc_url = "https://api.avax.network/ext/bc/C/rpc"
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        
        voting_escrow_addr = '0xeac562811cc6abdbb2c9ee88719eca4ee79ad763'
        
        abi_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'voting_contract_abi.json')
        with open(abi_path, 'r') as f:
            abi = json.load(f)
        
        contract = w3.eth.contract(
            address=Web3.to_checksum_address(voting_escrow_addr),
            abi=abi
        )
        
        if block_number:
            contract_epoch = contract.functions.epoch().call(block_identifier=block_number)
        else:
            contract_epoch = contract.functions.epoch().call()
        
        return contract_epoch
    except Exception as e:
        print(f"Error querying contract: {e}")
        return None


def find_epoch_mapping():
    """Try to find the mapping between contract epoch and website epoch"""
    print("="*70)
    print("FINDING BLACKHOLE EPOCH MAPPING")
    print("="*70)
    print()
    
    # Get current website epoch
    website_epoch = get_epoch_from_website()
    if website_epoch:
        print(f"Current website epoch: #{website_epoch}")
    else:
        print("Could not get website epoch")
        return
    
    # Get current contract epoch
    contract_epoch = get_epoch_from_contract()
    if contract_epoch:
        print(f"Current contract epoch: {contract_epoch}")
    else:
        print("Could not get contract epoch")
        return
    
    print()
    print("Testing different mappings...")
    print("-"*70)
    
    # Test various formulas
    offset = contract_epoch - website_epoch
    print(f"Simple offset: contract_epoch - {offset} = website_epoch")
    print(f"  Formula: website_epoch = contract_epoch - {offset}")
    
    # Test with past blocks
    print()
    print("Verifying with past vote blocks:")
    test_blocks = [71096237, 70738928, 70364604]
    for block in test_blocks:
        ce = get_epoch_from_contract(block)
        if ce:
            we = ce - offset
            print(f"  Block {block:,}: contract_epoch={ce} -> website_epoch={we}")


if __name__ == "__main__":
    find_epoch_mapping()
