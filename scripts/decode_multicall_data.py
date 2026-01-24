#!/usr/bin/env python3
"""
Decode Multicall3 aggregate() calls to see what data is being fetched
This will tell us how the site gets rewards/VAPR for vAMM/sAMM pools
"""

import json
import sys
from web3 import Web3
from eth_abi import decode

RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11"
AGGREGATE_SELECTOR = "0x82ad56cb"

# Common function selectors we might see
KNOWN_SELECTORS = {
    "0xa7cac846": "weights(address)",
    "0x96c82e57": "totalWeight()",
    "0x0dfe1681": "token0()",
    "0xd21220a7": "token1()",
    "0x3850c7bd": "slot0()",
    "0x0902f1ac": "getReserves()",
    "0xddca3f43": "fee()",
    "0x3ddac953": "swapFee()",
}

def decode_multicall_input(data):
    """Decode Multicall3 aggregate() input"""
    if not data.startswith('0x'):
        data = '0x' + data
    
    # Remove selector
    if data.startswith(AGGREGATE_SELECTOR):
        calldata = data[len(AGGREGATE_SELECTOR):]
    else:
        calldata = data
    
    try:
        # aggregate((address,bytes)[]) - array of tuples
        # Each tuple is (address target, bytes calldata)
        decoded = decode(['(address,bytes)[]'], bytes.fromhex(calldata))
        calls = decoded[0]
        return calls
    except Exception as e:
        print(f"Error decoding: {e}")
        return None

def analyze_call(target, calldata):
    """Analyze a single call in the multicall"""
    target_checksum = Web3.to_checksum_address(target)
    selector = calldata[:10] if len(calldata) >= 10 else calldata
    
    info = {
        'target': target_checksum,
        'selector': selector,
        'function': KNOWN_SELECTORS.get(selector, 'unknown'),
        'calldata': calldata
    }
    
    # Try to decode arguments if we know the function
    if selector in KNOWN_SELECTORS:
        func = KNOWN_SELECTORS[selector]
        if 'address' in func:
            # Extract address argument
            if len(calldata) >= 74:  # 10 (selector) + 64 (address)
                addr_hex = '0x' + calldata[34:74]  # Skip selector, get address
                try:
                    addr = Web3.to_checksum_address(addr_hex)
                    info['argument'] = addr
                except:
                    pass
    
    return info

def analyze_multicall_request(multicall_info):
    """Analyze a multicall RPC request"""
    print("="*80)
    print("ANALYZING MULTICALL REQUEST")
    print("="*80)
    
    # Get the data
    data = multicall_info.get('data', '')
    if not data:
        print("No data found in request")
        return
    
    print(f"\nRaw data length: {len(data)} chars")
    print(f"Data starts with: {data[:20]}...")
    
    # Decode multicall
    calls = decode_multicall_input(data)
    if not calls:
        print("Could not decode multicall")
        return
    
    print(f"\n✓ Decoded {len(calls)} calls in multicall\n")
    
    # Analyze each call
    for i, (target, calldata) in enumerate(calls):
        info = analyze_call(target, calldata)
        print(f"Call {i+1}:")
        print(f"  Target: {info['target']}")
        print(f"  Function: {info['function']} ({info['selector']})")
        if 'argument' in info:
            print(f"  Argument: {info['argument']}")
        print()
    
    # Group by target contract
    by_target = {}
    for target, calldata in calls:
        target_checksum = Web3.to_checksum_address(target)
        if target_checksum not in by_target:
            by_target[target_checksum] = []
        by_target[target_checksum].append(calldata[:10])
    
    print("\n" + "="*80)
    print("CALLS BY TARGET CONTRACT")
    print("="*80)
    for target, selectors in sorted(by_target.items()):
        funcs = [KNOWN_SELECTORS.get(s, 'unknown') for s in selectors]
        print(f"\n{target}:")
        for func in funcs:
            print(f"  - {func}")

def analyze_log_file(log_file):
    """Analyze multicall requests from log file"""
    print("="*80)
    print(f"ANALYZING LOG FILE: {log_file}")
    print("="*80)
    
    with open(log_file, 'r') as f:
        data = json.load(f)
    
    # Get requests
    requests = data.get('requests', [])
    if not requests:
        requests = data.get('data', {}).get('requests', [])
    
    print(f"\nFound {len(requests)} requests in log file\n")
    
    # Find multicall requests
    multicalls = []
    for req in requests:
        url = req.get('url', '')
        method = req.get('method', '')
        body = req.get('requestBody', req.get('body', ''))
        
        # Parse JSON body if it's a string
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except:
                pass
        
        # Check if it's an RPC call
        if isinstance(body, dict):
            params = body.get('params', [])
            if params and isinstance(params[0], dict):
                to_addr = params[0].get('to', '')
                data_field = params[0].get('data', '')
                
                # Check if it targets Multicall3
                if to_addr and to_addr.lower() == MULTICALL3.lower():
                    if data_field and data_field.startswith(AGGREGATE_SELECTOR):
                        multicalls.append({
                            'request': req,
                            'data': data_field,
                            'params': params[0]
                        })
    
    print(f"Found {len(multicalls)} multicall requests\n")
    
    # Analyze first few
    for i, multicall_info in enumerate(multicalls[:5]):
        print(f"\n{'='*80}")
        print(f"MULTICALL REQUEST {i+1}")
        print(f"{'='*80}")
        analyze_multicall_request(multicall_info)
    
    if len(multicalls) > 5:
        print(f"\n... and {len(multicalls) - 5} more multicall requests")

if __name__ == "__main__":
    log_file = "ai-tmp/blackhole-api-logs-2026-01-20T01_52_45.591Z.json"
    if len(sys.argv) > 1:
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
