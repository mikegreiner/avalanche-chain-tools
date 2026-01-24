#!/usr/bin/env python3
"""
Decode RPC calls from captured API logs using web3.py
This properly handles Multicall3 aggregate() function decoding
"""

import json
import sys
from web3 import Web3
from typing import Dict, List

# Multicall3 contract address and ABI
MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11"

MULTICALL3_ABI = [
    {
        "inputs": [
            {
                "components": [
                    {"internalType": "address", "name": "target", "type": "address"},
                    {"internalType": "bytes", "name": "callData", "type": "bytes"}
                ],
                "internalType": "struct Multicall3.Call[]",
                "name": "calls",
                "type": "tuple[]"
            }
        ],
        "name": "aggregate",
        "outputs": [
            {"internalType": "uint256", "name": "blockNumber", "type": "uint256"},
            {"internalType": "bytes[]", "name": "returnData", "type": "bytes[]"}
        ],
        "stateMutability": "payable",
        "type": "function"
    }
]

# Known function selectors
KNOWN_SELECTORS = {
    "0x82ad56cb": "Multicall3.aggregate((address,bytes)[])",
    "0xa7cac846": "weights(address)",  # Voter contract
    "0x96c82e57": "totalWeight()",
    "0x419074b2": "gauges(address)",
    "0x6430da65": "allPoolsLength()",
    "0x12065fe0": "allPools(uint256)",
    "0xcc56b2c5": "getGauge(address)",
}

def decode_multicall_with_web3(data_hex: str) -> List[Dict]:
    """Decode multicall using web3.py contract interface"""
    if not data_hex or not data_hex.startswith('0x'):
        return []
    
    if len(data_hex) < 10:
        return []
    
    # Check if it's aggregate function
    if data_hex[:10] != '0x82ad56cb':
        return []
    
    try:
        # Create a dummy web3 instance (we only need it for ABI decoding)
        w3 = Web3()
        
        # Create contract instance (use checksummed address)
        multicall = w3.eth.contract(address=Web3.to_checksum_address(MULTICALL3), abi=MULTICALL3_ABI)
        
        # Decode the function input using the contract's decode_function_input method
        decoded = multicall.decode_function_input(data_hex)
        
        calls = []
        calls_array = decoded[1]['calls']  # The 'calls' parameter
        
        for i, call in enumerate(calls_array):
            target = call['target']
            call_data = call['callData']
            
            # Extract function selector (first 4 bytes)
            if len(call_data) >= 4:
                func_selector = '0x' + call_data[:4].hex()
            else:
                func_selector = '0x00000000'
            
            calls.append({
                'address': target,
                'function_selector': func_selector,
                'call_data_length': len(call_data),
                'call_index': i
            })
        
        return calls
    
    except Exception as e:
        # Print error for debugging (remove in production)
        print(f"  Decode error: {e}")
        return []

def analyze_log_file(log_file: str):
    """Analyze API log file and decode RPC calls"""
    print("="*80)
    print("RPC CALL DECODER (using web3.py)")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    requests = data.get('requests', [])
    print(f"\nTotal requests: {len(requests)}")
    
    # Find RPC calls
    rpc_requests = []
    for req in requests:
        analysis = req.get('analysis', {}) or {}
        if analysis.get('isRpcCall'):
            rpc_requests.append(req)
    
    print(f"RPC calls found: {len(rpc_requests)}\n")
    
    # Analyze multicall requests
    all_contracts = set()
    all_selectors = set()
    contract_selector_pairs = {}
    multicall_requests = []
    checked = 0
    
    for req in rpc_requests:
        request_body = req.get('requestBody', '')
        if not request_body:
            continue
        
        try:
            rpc_data = json.loads(request_body)
            params = rpc_data.get('params', [])
            
            if not params or len(params) == 0:
                continue
            
            call_param = params[0]
            if not isinstance(call_param, dict):
                continue
            
            contract = call_param.get('to', '')
            data_hex = call_param.get('data', '')
            checked += 1
            
            # Normalize contract address for comparison
            if contract and data_hex:
                contract_normalized = contract.lower()
                if contract_normalized == MULTICALL3.lower() and data_hex.startswith('0x82ad56cb'):
                    # It's a multicall
                    calls = decode_multicall_with_web3(data_hex)
                
                if calls:
                    multicall_requests.append({
                        'request': req,
                        'calls': calls
                    })
                    
                    # Collect contracts and selectors
                    for call in calls:
                        addr = call['address']
                        selector = call['function_selector']
                        all_contracts.add(addr)
                        all_selectors.add(selector)
                        
                        key = f"{addr}:{selector}"
                        contract_selector_pairs[key] = contract_selector_pairs.get(key, 0) + 1
        except Exception as e:
            continue
    
    print(f"Checked {checked} RPC requests for multicalls")
    
    # Display results
    print("="*80)
    print("MULTICALL ANALYSIS")
    print("="*80)
    print(f"\nMulticall requests decoded: {len(multicall_requests)}\n")
    
    for i, mc in enumerate(multicall_requests[:5]):  # Show first 5
        calls = mc['calls']
        
        print(f"Multicall Request #{i+1}:")
        print(f"  Contains {len(calls)} individual calls\n")
        
        # Group by contract
        by_contract = {}
        for call in calls:
            addr = call['address']
            if addr not in by_contract:
                by_contract[addr] = []
            by_contract[addr].append(call)
        
        # Show top contracts
        sorted_contracts = sorted(by_contract.items(), key=lambda x: -len(x[1]))[:10]
        
        for addr, contract_calls in sorted_contracts:
            selectors = {}
            for call in contract_calls:
                sel = call['function_selector']
                selectors[sel] = selectors.get(sel, 0) + 1
            
            print(f"  {addr}")
            print(f"    Total calls: {len(contract_calls)}")
            for sel, count in sorted(selectors.items(), key=lambda x: -x[1]):
                name = KNOWN_SELECTORS.get(sel, "Unknown")
                print(f"      {sel} ({name}): {count}x")
        print()
    
    # Summary
    print("="*80)
    print("SUMMARY")
    print("="*80)
    print(f"\nUnique contracts called: {len(all_contracts)}")
    for addr in sorted(all_contracts)[:30]:
        print(f"  {addr}")
    
    print(f"\nUnique function selectors: {len(all_selectors)}")
    for selector in sorted(all_selectors):
        name = KNOWN_SELECTORS.get(selector, "Unknown")
        print(f"  {selector} - {name}")
    
    print(f"\nMost common contract:selector pairs:")
    for pair, count in sorted(contract_selector_pairs.items(), key=lambda x: -x[1])[:20]:
        addr, selector = pair.split(':')
        selector_name = KNOWN_SELECTORS.get(selector, "Unknown")
        print(f"  {count:4d}x {addr[:42]:42s} : {selector} ({selector_name})")
    
    # Check for Voter contract
    VOTER = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"
    voter_calls = [addr for addr in all_contracts if addr.lower() == VOTER.lower()]
    if voter_calls:
        print(f"\n✓ Voter contract ({VOTER}) is being called!")
        print("  This is likely how pool weights are fetched.")
    
    return {
        'contracts': list(all_contracts),
        'selectors': list(all_selectors),
        'pairs': contract_selector_pairs,
        'multicall_count': len(multicall_requests)
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        log_file = "ai-tmp/blackhole-api-logs-2026-01-20T01_52_45.591Z.json"
        print(f"No file specified, using: {log_file}")
    else:
        log_file = sys.argv[1]
    
    try:
        analyze_log_file(log_file)
    except FileNotFoundError:
        print(f"Error: File not found: {log_file}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
