#!/usr/bin/env python3
"""
Show Complete Voting History

Displays all voting transactions with details, organized by epoch if possible.
Shows what was validated.

Usage:
    python3 scripts/show_voting_history.py [wallet_address] [--limit N] [--friendly] [--validate]
"""

import sys
import os
import requests
from typing import List, Dict, Optional
from collections import defaultdict
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Try to import utils for token/pool name lookup
try:
    from avalanche_utils import get_token_info
    UTILS_AVAILABLE = True
except ImportError:
    UTILS_AVAILABLE = False

SNOWTRACE_API = "https://api.snowtrace.io/api"
API_KEY = "YourApiKeyToken"

# Known pool addresses (we'll try to identify more)
KNOWN_POOLS = {
    "0x8fef4fe4970a5d6bfa7c65871a2ebfd0f42aa822": "Pool (from vote transaction)",
    "0xfd9a46c213532401ef61f8d34e67a3653b70837a": "Pool (from merge transaction)",
    "0x40435bdffa4e5b936788b33a2fd767105c67bef7": "Pool (from merge transaction)",
}

DEFAULT_WALLET = "0x0000000000000000000000000000000000000001"

# Cache for pool/token names
_pool_name_cache = {}
_token_name_cache = {}

# Epoch duration from Blackhole contract (actual contract value)
# From voter contract EPOCH_DURATION() function: 604,800 blocks = 2 weeks
# Avalanche: ~2 seconds per block
# 604,800 blocks = 1,209,600 seconds = 14 days = 2 weeks
BLOCKS_PER_EPOCH = 604800


def fetch_transaction(tx_hash: str) -> Dict:
    """Fetch transaction from Snowtrace"""
    url = f"{SNOWTRACE_API}?module=proxy&action=eth_getTransactionByHash&txhash={tx_hash}&apikey={API_KEY}"
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        return data.get('result', {})
    except Exception as e:
        return {"error": str(e)}


def fetch_block(block_number: str) -> Dict:
    """Fetch block information"""
    url = f"{SNOWTRACE_API}?module=proxy&action=eth_getBlockByNumber&tag={block_number}&boolean=true&apikey={API_KEY}"
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        return data.get('result', {})
    except Exception as e:
        return {"error": str(e)}


def decode_vote_transaction(input_data: str) -> Dict:
    """Decode vote transaction"""
    if not input_data or len(input_data) < 202:
        return {"error": "Input too short"}
    
    func_sig = input_data[:10]
    if func_sig != '0x7ac09bf7':
        return {"error": f"Not vote() function (got: {func_sig})"}
    
    token_id = int(input_data[10:74], 16)
    offset_pools = int(input_data[74:138], 16)
    offset_weights = int(input_data[138:202], 16)
    
    # Decode pools
    pools_start = 10 + (offset_pools * 2)
    pool_count = int(input_data[pools_start:pools_start+64], 16)
    pools = []
    for i in range(pool_count):
        pool_pos = pools_start + 64 + (i * 64)
        if len(input_data) >= pool_pos + 64:
            pool_addr_hex = input_data[pool_pos:pool_pos+64]
            pool_addr = '0x' + pool_addr_hex[-40:].lower()
            pools.append(pool_addr)
    
    # Decode weights
    weights_start = 10 + (offset_weights * 2)
    weight_count = int(input_data[weights_start:weights_start+64], 16)
    weights = []
    for i in range(weight_count):
        weight_pos = weights_start + 64 + (i * 64)
        if len(input_data) >= weight_pos + 64:
            weight_hex = input_data[weight_pos:weight_pos+64]
            weight = int(weight_hex, 16)
            weights.append(weight)
    
    return {
        "token_id": token_id,
        "pools": pools,
        "weights": weights,
        "input_data": input_data
    }


def find_all_voting_transactions(wallet: str, limit: int = 10000) -> tuple:
    """Find all voting transactions with full details"""
    print(f"Fetching transaction history for {wallet}...")
    
    vote_txs = []
    merge_txs = []
    
    # Snowtrace API may paginate results, so we need to fetch in pages
    page = 1
    offset = 10000  # Max per page
    all_txs = []
    
    while True:
        url = f"{SNOWTRACE_API}?module=account&action=txlist&address={wallet}&startblock=0&endblock=99999999&sort=desc&apikey={API_KEY}&page={page}&offset={offset}"
        
        try:
            response = requests.get(url, timeout=15)
            data = response.json()
            
            if data.get('status') != '1':
                if page == 1:
                    print(f"API Error: {data.get('message', 'Unknown error')}")
                break
            
            txs = data.get('result', [])
            if not txs:
                break
            
            all_txs.extend(txs)
            
            # If we got fewer results than requested, we've reached the end
            if len(txs) < offset:
                break
            
            page += 1
        except Exception as e:
            if page == 1:
                print(f"Error fetching transactions: {e}")
            break
    
    if not all_txs:
        return [], []
    
    print(f"Fetched {len(all_txs)} total transactions (searching for votes...)")
    
    try:
        voter_contracts = [
            '0xe30d0c8532721551a51a9fec7fb233759964d9e3',  # Voter proxy
            '0x6bd81e7eafa4b21d5ad069b452ab4b8bb40c4525'    # Voter implementation
        ]
        
        voting_escrow = '0xeac562811cc6abdbb2c9ee88719eca4ee79ad763'
        
        for tx in all_txs[:limit]:
            if not tx:  # Skip None entries
                continue
                
            to_addr = (tx.get('to') or '').lower()
            input_data = tx.get('input', '') or ''
            func_sig = input_data[:10] if len(input_data) >= 10 else ''
            
            # Direct vote() calls
            if to_addr in [c.lower() for c in voter_contracts] and func_sig == '0x7ac09bf7':
                decoded = decode_vote_transaction(input_data)
                if 'error' not in decoded:
                    block_num = tx.get('blockNumber', '0x0')
                    block_int = int(block_num, 16) if block_num.startswith('0x') else int(block_num)
                    
                    # Try to get timestamp from transaction list first
                    timestamp = None
                    if tx.get('timeStamp'):
                        try:
                            timestamp = int(tx['timeStamp'])
                        except:
                            pass
                    
                    # Fallback to block info if not in tx
                    if not timestamp:
                        try:
                            block_info = fetch_block(block_num)
                            timestamp = int(block_info['timestamp'], 16) if block_info.get('timestamp') else None
                        except:
                            timestamp = None
                    
                    vote_txs.append({
                        'hash': tx.get('hash'),
                        'block': block_int,
                        'block_hex': block_num,
                        'timestamp': timestamp,
                        'from': tx.get('from'),
                        'to': tx.get('to'),
                        'decoded': decoded,
                        'type': 'vote()'
                    })
            
            # merge() calls that trigger voting
            elif to_addr == voting_escrow.lower() and func_sig == '0xd1c2babb':
                # This is merge() - decode it
                if len(input_data) >= 138:
                    try:
                        from_token = int(input_data[10:74], 16)
                        to_token = int(input_data[74:138], 16)
                        
                        block_num = tx.get('blockNumber', '0x0')
                        block_int = int(block_num, 16) if block_num.startswith('0x') else int(block_num)
                        
                        # Try to get timestamp from transaction list first
                        timestamp = None
                        if tx.get('timeStamp'):
                            try:
                                timestamp = int(tx['timeStamp'])
                            except:
                                pass
                        
                        # Fallback to block info if not in tx
                        if not timestamp:
                            try:
                                block_info = fetch_block(block_num)
                                timestamp = int(block_info['timestamp'], 16) if block_info.get('timestamp') else None
                            except:
                                timestamp = None
                        
                        merge_txs.append({
                            'hash': tx.get('hash'),
                            'block': block_int,
                            'block_hex': block_num,
                            'timestamp': timestamp,
                            'from': tx.get('from'),
                            'to': tx.get('to'),
                            'from_token': from_token,
                            'to_token': to_token,
                            'type': 'merge()'
                        })
                    except:
                        pass
        
        # Sort by block number
        vote_txs.sort(key=lambda x: x['block'], reverse=True)
        merge_txs.sort(key=lambda x: x['block'], reverse=True)
        
        return vote_txs, merge_txs
        
    except Exception as e:
        print(f"Error processing transactions: {e}")
        import traceback
        traceback.print_exc()
        return [], []


# Cache for current website epoch to avoid repeated scraping
_current_website_epoch_cache = None
_current_website_epoch_block = None

def get_current_website_epoch() -> Optional[int]:
    """Get current website epoch by scraping blackhole.xyz/vote"""
    global _current_website_epoch_cache, _current_website_epoch_block
    
    # Check cache (valid for ~1 hour / ~1800 blocks)
    from web3 import Web3
    try:
        w3 = Web3(Web3.HTTPProvider("https://api.avax.network/ext/bc/C/rpc"))
        current_block = w3.eth.block_number
        if (_current_website_epoch_cache is not None and 
            _current_website_epoch_block is not None and
            current_block - _current_website_epoch_block < 1800):
            return _current_website_epoch_cache
    except:
        pass
    
    # Scrape from website
    try:
        import re
        response = requests.get('https://blackhole.xyz/vote', timeout=10, headers={
            'User-Agent': 'Mozilla/5.0'
        })
        if response.status_code == 200:
            epoch_match = re.search(r'Epoch\s*#(\d+)', response.text, re.IGNORECASE)
            if epoch_match:
                epoch_num = int(epoch_match.group(1))
                _current_website_epoch_cache = epoch_num
                try:
                    _current_website_epoch_block = w3.eth.block_number
                except:
                    _current_website_epoch_block = current_block if 'current_block' in locals() else None
                return epoch_num
    except Exception as e:
        pass
    
    # Fallback to known current value
    return 16


def get_blackhole_epoch(block_number: int) -> Optional[int]:
    """
    Get the actual Blackhole epoch number for a given block.
    
    Calculates website epoch using block-based formula:
    website_epoch = (block - VOTING_START_BLOCK) // EPOCH_DURATION + 1
    
    The voting start block is determined by working backwards from the current
    known website epoch (scraped from blackhole.xyz/vote).
    """
    try:
        from web3 import Web3
        
        rpc_url = "https://api.avax.network/ext/bc/C/rpc"
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        
        # Get current block and website epoch to calculate voting start block
        current_block = w3.eth.block_number
        current_website_epoch = get_current_website_epoch()
        
        if current_website_epoch is None:
            current_website_epoch = 16  # Fallback
        
        # Calculate voting start block:
        # If current_website_epoch = (current_block - start_block) // EPOCH_DURATION + 1
        # Then: start_block = current_block - ((current_website_epoch - 1) * EPOCH_DURATION)
        voting_start_block = current_block - ((current_website_epoch - 1) * BLOCKS_PER_EPOCH)
        
        # Calculate website epoch for the given block
        website_epoch = ((block_number - voting_start_block) // BLOCKS_PER_EPOCH) + 1
        
        return max(1, website_epoch)  # Ensure at least 1
            
    except Exception as e:
        # Fallback to estimate if calculation fails
        return block_number // BLOCKS_PER_EPOCH


def estimate_epoch(block_number: int) -> int:
    """
    Get Blackhole epoch number (calls get_blackhole_epoch).
    
    This now uses the actual contract to get the real epoch number
    that matches what's shown on https://blackhole.xyz/vote
    """
    return get_blackhole_epoch(block_number)


def format_timestamp(timestamp: int) -> str:
    """Format Unix timestamp to human-friendly date"""
    if timestamp:
        dt = datetime.fromtimestamp(timestamp)
        # Format as "Monday, January 15, 2024 at 3:45 PM"
        return dt.strftime('%A, %B %d, %Y at %I:%M %p')
    return "Unknown"


def sanitize_name(name: str) -> str:
    """Remove newlines and normalize whitespace"""
    return ' '.join(name.split())


def get_pool_name(pool_address: str, try_hard: bool = False) -> str:
    """Get friendly name for pool address"""
    if pool_address in _pool_name_cache:
        return sanitize_name(_pool_name_cache[pool_address])
    
    # Try to get token0 and token1 from pool contract (most accurate)
    if try_hard:
        try:
            # Check if web3 is available
            from web3 import Web3
            
            # Try to get token0/token1 from pool contract
            rpc_url = "https://api.avax.network/ext/bc/C/rpc"
            w3 = Web3(Web3.HTTPProvider(rpc_url))
            
            # Standard Uniswap V3 / Algebra pool interface
            # token0() and token1() function selectors
            token0_selector = "0x0dfe1681"  # token0()
            token1_selector = "0xd21220a7"  # token1()
            
            try:
                # Convert to checksum address for web3.py
                from web3 import Web3
                pool_checksum = Web3.to_checksum_address(pool_address)
                
                # Call token0()
                result = w3.eth.call({
                    'to': pool_checksum,
                    'data': token0_selector
                })
                token0_address = '0x' + result.hex()[-40:].lower()
                token0_checksum = Web3.to_checksum_address(token0_address)
                
                # Call token1()
                result = w3.eth.call({
                    'to': pool_checksum,
                    'data': token1_selector
                })
                token1_address = '0x' + result.hex()[-40:].lower()
                token1_checksum = Web3.to_checksum_address(token1_address)
                
                # Get token info for both
                if UTILS_AVAILABLE:
                    token0_info = get_token_info(token0_checksum)
                    token1_info = get_token_info(token1_checksum)
                    
                    token0_symbol = token0_info.get('symbol', 'TOKEN0')
                    token1_symbol = token1_info.get('symbol', 'TOKEN1')
                    
                    if token0_symbol != 'UNKNOWN' and token1_symbol != 'UNKNOWN':
                        pool_name = f"{token0_symbol}/{token1_symbol}"
                        pool_name = sanitize_name(pool_name)
                        _pool_name_cache[pool_address] = pool_name
                        return pool_name
            except:
                pass
        except ImportError:
            pass
    
    # Try querying pool contract directly for symbol/name (fallback)
    try:
        url = f"{SNOWTRACE_API}?module=contract&action=getsourcecode&address={pool_address}&apikey={API_KEY}"
        response = requests.get(url, timeout=5)
        data = response.json()
        if data.get('status') == '1' and data.get('result'):
            contract = data['result'][0]
            contract_name = contract.get('ContractName', '')
            if contract_name and contract_name not in ['', 'Contract']:
                contract_name = sanitize_name(contract_name)
                # If it's just "AlgebraPool" or similar, try to enhance it
                if contract_name in ['AlgebraPool', 'Pool', 'UniswapV3Pool']:
                    # Don't cache generic names if we want better ones
                    if not try_hard:
                        _pool_name_cache[pool_address] = contract_name
                        return contract_name
                else:
                    _pool_name_cache[pool_address] = contract_name
                    return contract_name
    except:
        pass
    
    # Try known pools as fallback
    if pool_address in KNOWN_POOLS:
        known_name = KNOWN_POOLS[pool_address]
        known_name = sanitize_name(known_name)
        # If it's just a placeholder, skip it if try_hard
        if not (try_hard and known_name == "Pool (from vote transaction)"):
            _pool_name_cache[pool_address] = known_name
            return known_name
    
    # Try to get token info if available
    if UTILS_AVAILABLE and try_hard:
        try:
            token_info = get_token_info(pool_address)
            if token_info and token_info.get('name') and token_info['name'] not in ['Unknown Token', 'Unknown']:
                    name = token_info['name']
                    if token_info.get('symbol') and token_info['symbol'] != 'UNKNOWN':
                        name = f"{name} ({token_info['symbol']})"
                    name = sanitize_name(name)
                    if name not in ['Unknown Token', 'Unknown', 'Unknown Token (UNKNOWN)']:
                        _pool_name_cache[pool_address] = name
                        return name
        except:
            pass
    
    # Final fallback - show address in a readable way
    name = f"Pool ({pool_address[:8]}...{pool_address[-6:]})"
    _pool_name_cache[pool_address] = name
    return name


def get_token_id_name(token_id: int) -> str:
    """Get friendly name/description for token ID"""
    if token_id in _token_name_cache:
        return _token_name_cache[token_id]
    
    # For veBLACK locks, token ID is the NFT ID
    name = f"veBLACK Lock #{token_id}"
    _token_name_cache[token_id] = name
    return name


def show_voting_history(wallet: str, limit: Optional[int] = None, human_friendly: bool = False):
    """Show complete voting history"""
    if human_friendly:
        return show_voting_history_friendly(wallet, limit)
    
    # Default: detailed technical output
    print("="*70)
    print("COMPLETE VOTING HISTORY")
    print("="*70)
    print(f"Wallet: {wallet}")
    if limit:
        print(f"Showing last {limit} epoch(s)")
    print()
    
    # Find all voting transactions
    print("Searching transaction history...")
    vote_txs, merge_txs = find_all_voting_transactions(wallet)
    
    if not vote_txs and not merge_txs:
        print("\nNo voting-related transactions found.")
        print("\nPossible reasons:")
        print("  - Wallet has never voted")
        print("  - Transactions target different contracts")
        print("  - API issue (try again)")
        return
    
    print(f"\nFound:")
    print(f"  - {len(vote_txs)} direct vote() transaction(s)")
    print(f"  - {len(merge_txs)} merge() transaction(s) (may trigger voting)")
    print()
    
    # Group vote() transactions by epoch
    vote_by_epoch = defaultdict(list)
    for tx in vote_txs:
        epoch = estimate_epoch(tx['block'])
        vote_by_epoch[epoch].append(tx)
    
    # Sort epochs
    epochs = sorted(vote_by_epoch.keys(), reverse=True)
    
    # Apply epoch limit if specified
    if limit and limit > 0:
        epochs = epochs[:limit]
        vote_txs = [tx for epoch in epochs for tx in vote_by_epoch[epoch]]
        print(f"Showing last {len(epochs)} epoch(s) ({len(vote_txs)} vote(s))")
        print()
    
    # Combine vote() and merge() transactions for display
    all_voting_txs = vote_txs + merge_txs
    
    # Group by approximate epoch
    by_epoch = defaultdict(list)
    for tx in all_voting_txs:
        epoch = estimate_epoch(tx['block'])
        by_epoch[epoch].append(tx)
    
    epochs_all = sorted(by_epoch.keys(), reverse=True)
    
    print("="*70)
    print("VOTING HISTORY BY EPOCH")
    print("="*70)
    print()
    
    for epoch in epochs_all:
        txs = sorted(by_epoch[epoch], key=lambda x: x['block'], reverse=True)
        
        print(f"Epoch ~{epoch} (Block ~{epoch * BLOCKS_PER_EPOCH:,})")
        print("-" * 70)
        
        for tx in txs:
            print(f"\nTransaction: {tx['hash']}")
            print(f"  Type: {tx.get('type', 'Unknown')}")
            print(f"  Block: {tx['block']:,}")
            if tx.get('timestamp'):
                print(f"  Time: {format_timestamp(tx['timestamp'])}")
            
            if tx.get('type') == 'vote()':
                decoded = tx['decoded']
                token_id = decoded['token_id']
                token_name = get_token_id_name(token_id)
                print(f"  Token: {token_name}")
                print(f"  Token ID: {token_id}")
                print(f"  Pools ({len(decoded['pools'])}):")
                
                total_weight = sum(decoded['weights'])
                for i, (pool, weight) in enumerate(zip(decoded['pools'], decoded['weights']), 1):
                    percentage = (weight / total_weight * 100) if total_weight > 0 else 0
                    pool_name = get_pool_name(pool)
                    print(f"    {i}. {pool_name}")
                    print(f"       Address: {pool}")
                    print(f"       Weight: {weight} ({percentage:.1f}%)")
            
            elif tx.get('type') == 'merge()':
                from_token_name = get_token_id_name(tx['from_token'])
                to_token_name = get_token_id_name(tx['to_token'])
                print(f"  Merges: {from_token_name} ? {to_token_name}")
                print(f"  Token IDs: {tx['from_token']} ? {tx['to_token']}")
                print(f"  Note: merge() calls voter.poke() which triggers voting")
                print(f"        using pools/weights set by previous vote() call")
            
            print(f"  View on Snowtrace: https://snowtrace.io/tx/{tx['hash']}")
        
        print()
    
    # Summary
    print("="*70)
    print("VOTING SUMMARY")
    print("="*70)
    print(f"Total transactions found: {len(all_voting_txs)}")
    print(f"  - Direct vote() calls: {len(vote_txs)}")
    print(f"  - merge() calls: {len(merge_txs)}")
    print(f"Estimated epochs: {len(epochs_all)}")
    
    if vote_txs:
        print(f"\nDirect vote() Analysis:")
        print(f"  Unique token IDs used: {len(set(tx['decoded']['token_id'] for tx in vote_txs))}")
        print(f"  Unique pools voted: {len(set(pool for tx in vote_txs for pool in tx['decoded']['pools']))}")
        
        # Token ID usage
        token_ids = {}
        for tx in vote_txs:
            tid = tx['decoded']['token_id']
            token_ids[tid] = token_ids.get(tid, 0) + 1
        
        print(f"\n  Token ID Usage (vote() calls):")
        for tid, count in sorted(token_ids.items()):
            token_name = get_token_id_name(tid)
            print(f"    {token_name}: {count} vote(s)")
            print(f"      Token ID: {tid}")
        
        # Pool usage
        pool_counts = {}
        for tx in vote_txs:
            for pool in tx['decoded']['pools']:
                pool_counts[pool] = pool_counts.get(pool, 0) + 1
        
        print(f"\n  Most Voted Pools (vote() calls):")
        for pool, count in sorted(pool_counts.items(), key=lambda x: x[1], reverse=True)[:10]:
            pool_name = get_pool_name(pool)
            print(f"    {pool_name}: {count} vote(s)")
            print(f"      Address: {pool}")
    
    if merge_txs:
        print(f"\nmerge() Analysis:")
        merge_token_ids = set()
        for tx in merge_txs:
            merge_token_ids.add(tx['from_token'])
            merge_token_ids.add(tx['to_token'])
        print(f"  Token IDs involved: {sorted(merge_token_ids)}")
        print(f"  Total merge() calls: {len(merge_txs)}")
        print(f"  Note: merge() triggers voting via voter.poke()")
        print(f"        using pools/weights from previous vote() call")


def show_voting_history_short(wallet: str, limit: Optional[int] = None):
    """Show voting history in compact one-line-per-vote format"""
    print("# Your Voting History (Short Format)\n")
    print(f"**Wallet:** `{wallet}`\n")
    if limit:
        print(f"Showing last {limit} epoch(s)\n")
    print("---\n")
    
    # Find all voting transactions
    vote_txs, merge_txs = find_all_voting_transactions(wallet)
    
    if not vote_txs:
        print("No voting transactions found.")
        return
    
    # Group by epoch and sort
    vote_by_epoch = defaultdict(list)
    for tx in vote_txs:
        epoch = estimate_epoch(tx['block'])
        vote_by_epoch[epoch].append(tx)
    
    epochs = sorted(vote_by_epoch.keys(), reverse=True)
    
    if limit and limit > 0:
        epochs = epochs[:limit]
        vote_txs = [tx for epoch in epochs for tx in vote_by_epoch[epoch]]
    
    # Sort all votes by block (most recent first)
    all_votes = sorted(vote_txs, key=lambda x: x['block'], reverse=True)
    
    # Print one line per vote
    for tx in all_votes:
        decoded = tx['decoded']
        token_id = decoded['token_id']
        token_name = get_token_id_name(token_id)
        epoch = estimate_epoch(tx['block'])
        
        # Format timestamp
        vote_time = format_timestamp(tx['timestamp']) if tx.get('timestamp') else "Unknown"
        
        # Get pool info
        total_weight = sum(decoded['weights'])
        pools_str = ", ".join([
            f"{get_pool_name(pool, try_hard=True)} ({(weight / total_weight * 100) if total_weight > 0 else 0:.1f}%)"
            for pool, weight in zip(decoded['pools'], decoded['weights'])
        ])
        
        print(f"- **Epoch {epoch}** | {vote_time} | {token_name} | {pools_str}")
    print()


def show_voting_history_friendly(wallet: str, limit: Optional[int] = None, short: bool = False):
    """Show complete voting history in human-friendly format (markdown)"""
    if short:
        show_voting_history_short(wallet, limit)
        return
    
    print("# Your Voting History\n")
    print(f"**Wallet:** `{wallet}`\n")
    if limit:
        print(f"Showing last {limit} epoch(s)\n")
    print("---\n")
    
    # Find all voting transactions (only vote() transactions for display)
    if not short:
        print("Fetching your voting history from blockchain...\n")
    vote_txs, merge_txs = find_all_voting_transactions(wallet)
    
    if not vote_txs:
        print("## No Voting Transactions Found\n")
        print("Possible reasons:")
        print("- Wallet has never voted")
        print("- Transactions target different contracts")
        print("- API issue (try again)")
        return
    
    # Group vote() transactions by epoch
    vote_by_epoch = defaultdict(list)
    for tx in vote_txs:
        epoch = estimate_epoch(tx['block'])
        vote_by_epoch[epoch].append(tx)
    
    # Sort epochs (most recent first)
    epochs = sorted(vote_by_epoch.keys(), reverse=True)
    
    # Apply epoch limit if specified
    if limit and limit > 0:
        epochs = epochs[:limit]
        vote_txs = [tx for epoch in epochs for tx in vote_by_epoch[epoch]]
    
    if not short:
        print(f"**Found {len(vote_txs)} vote(s) across {len(epochs)} epoch(s)**\n")
        print("---\n")
    
    # Display each epoch's votes
    for epoch_idx, epoch in enumerate(epochs, 1):
        epoch_votes = sorted(vote_by_epoch[epoch], key=lambda x: x['block'], reverse=True)
        
        # Get approximate epoch date from first vote
        if epoch_votes[0].get('timestamp'):
            epoch_date = format_timestamp(epoch_votes[0]['timestamp'])
        else:
            epoch_date = "Date unknown"
        
        if not short:
            print(f"## Epoch {epoch} ({epoch_date})\n")
        
        for vote_idx, tx in enumerate(epoch_votes, 1):
            decoded = tx['decoded']
            token_id = decoded['token_id']
            token_name = get_token_id_name(token_id)
            
            # Format timestamp
            vote_time = format_timestamp(tx['timestamp']) if tx.get('timestamp') else "Time unknown"
            
            if not short:
                print(f"### Vote #{vote_idx}\n")
                print(f"- **Token:** {token_name}")
                print(f"- **When:** {vote_time}")
                print(f"- **Transaction:** [{tx['hash'][:10]}...](https://snowtrace.io/tx/{tx['hash']})")
                
                # Show pools with percentages (try hard to get pool names)
                total_weight = sum(decoded['weights'])
                pools_display = []
                for pool, weight in zip(decoded['pools'], decoded['weights']):
                    percentage = (weight / total_weight * 100) if total_weight > 0 else 0
                    pool_name = get_pool_name(pool, try_hard=True)
                    pools_display.append((pool_name, percentage))
                
                if pools_display:
                    print(f"- **Pools voted:**")
                    for pool_name, percentage in pools_display:
                        print(f"  - {pool_name}: {percentage:.1f}%")
                print()
            else:
                # Short format: one line per vote
                total_weight = sum(decoded['weights'])
                pools_str = ", ".join([
                    f"{get_pool_name(pool, try_hard=True)} ({(weight / total_weight * 100) if total_weight > 0 else 0:.1f}%)"
                    for pool, weight in zip(decoded['pools'], decoded['weights'])
                ])
                print(f"- **Epoch {epoch}** ({epoch_date}) | {token_name} | {pools_str}")
        
        if epoch_idx < len(epochs) and not short:
            print()
    
    # Summary
    if not short and vote_txs:
        print("---\n")
        print("## Summary\n")
        
        # Count unique tokens
        unique_tokens = set(tx['decoded']['token_id'] for tx in vote_txs)
        print(f"- **Total votes shown:** {len(vote_txs)}")
        print(f"- **Token(s) used:** {len(unique_tokens)}\n")
        
        # Token usage breakdown
        token_counts = {}
        for tx in vote_txs:
            tid = tx['decoded']['token_id']
            token_name = get_token_id_name(tid)
            token_counts[token_name] = token_counts.get(token_name, 0) + 1
        
        if token_counts:
            print("### Token Breakdown\n")
            for token_name, count in sorted(token_counts.items()):
                print(f"- {token_name}: {count} vote(s)")
            print()
        
        # Pool usage breakdown
        pool_counts = {}
        for tx in vote_txs:
            total_weight = sum(tx['decoded']['weights'])
            for pool, weight in zip(tx['decoded']['pools'], tx['decoded']['weights']):
                percentage = (weight / total_weight * 100) if total_weight > 0 else 0
                pool_name = get_pool_name(pool, try_hard=True)
                if pool_name not in pool_counts:
                    pool_counts[pool_name] = {'count': 0, 'avg_percentage': 0, 'total_percentage': 0}
                pool_counts[pool_name]['count'] += 1
                pool_counts[pool_name]['total_percentage'] += percentage
        
        if pool_counts:
            print("### Top Pools (by total votes)\n")
            for pool_name, stats in sorted(pool_counts.items(), key=lambda x: x[1]['total_percentage'], reverse=True)[:10]:
                avg_pct = stats['total_percentage'] / stats['count']
                print(f"- {pool_name}: {stats['count']} time(s), avg {avg_pct:.1f}%")
        print()


def validate_encoding_for_transaction(tx_data: Dict) -> Dict:
    """Validate encoding for a transaction (using dummy key)"""
    tx_hash = tx_data['hash']
    decoded = tx_data['decoded']
    actual_input = decoded['input_data']
    
    # Use dummy key for encoding generation
    dummy_key = "0x" + "1" * 64
    
    try:
        from blackhole_voter import BlackholeVoter, VotePlan
        
        voter = BlackholeVoter(private_key=dummy_key, dry_run=True)
        
        # Create vote plans
        total_weight = sum(decoded['weights'])
        vote_plans = []
        for i, (pool, weight) in enumerate(zip(decoded['pools'], decoded['weights'])):
            percentage = (weight / total_weight * 100) if total_weight > 0 else 0
            vote_plans.append(VotePlan(
                pool_name=f"Pool {i+1}",
                pool_id=pool,
                voting_percentage=percentage
            ))
        
        # Generate encoding
        sim_result = voter.simulate_vote(vote_plans, token_id=decoded['token_id'])
        generated_input = sim_result.get('encoded_data', '')
        
        if generated_input:
            if generated_input == actual_input:
                return {'status': 'MATCHES', 'encoding': generated_input}
            else:
                return {'status': 'MISMATCH', 'encoding': generated_input, 'actual': actual_input}
        else:
            return {'status': 'NO_ENCODING'}
            
    except Exception as e:
        return {'status': 'ERROR', 'error': str(e)}


def show_validation_details(wallet: str):
    """Show validation details for all transactions"""
    print("\n" + "="*70)
    print("ENCODING VALIDATION DETAILS")
    print("="*70)
    print()
    
    vote_txs, merge_txs = find_all_voting_transactions(wallet)
    
    if not vote_txs:
        print("No vote() transactions to validate")
        if merge_txs:
            print(f"\nNote: Found {len(merge_txs)} merge() transaction(s)")
            print("      merge() uses different encoding and cannot be validated this way")
        return
    
    print(f"Validating encoding for {len(vote_txs)} vote() transaction(s)...")
    print()
    print("How validation works:")
    print("  1. Decode your actual transaction from blockchain")
    print("  2. Generate encoding with same parameters (using dummy key)")
    print("  3. Compare byte-for-byte")
    print("  4. If match ? Code is correct ?")
    print()
    
    matches = 0
    for i, tx_data in enumerate(vote_txs, 1):
        decoded = tx_data['decoded']
        print(f"[{i}/{len(vote_txs)}] Transaction: {tx_data['hash']}")
        print(f"  Block: {tx_data['block']:,}")
        if tx_data.get('timestamp'):
            print(f"  Time: {format_timestamp(tx_data['timestamp'])}")
        token_id = decoded['token_id']
        token_name = get_token_id_name(token_id)
        print(f"  Token: {token_name}")
        print(f"  Token ID: {token_id}")
        print(f"  Pools: {len(decoded['pools'])}")
        for j, pool in enumerate(decoded['pools'], 1):
            weight = decoded['weights'][j-1]
            pool_name = get_pool_name(pool, try_hard=True)
            print(f"    Pool {j}: {pool_name}")
            print(f"      Address: {pool} (weight: {weight})")
        
        print(f"\n  Validating encoding...")
        validation = validate_encoding_for_transaction(tx_data)
        
        if validation['status'] == 'MATCHES':
            print(f"  [OK] ENCODING MATCHES EXACTLY [OK]")
            print(f"  This proves our code generates identical transaction encoding!")
            matches += 1
        elif validation['status'] == 'MISMATCH':
            print(f"  ? Encoding mismatch")
            gen = validation['encoding']
            act = validation['actual']
            print(f"    Generated length: {len(gen)}")
            print(f"    Actual length: {len(act)}")
            print(f"    Function selector match: {gen[:10] == act[:10]}")
        else:
            print(f"  ? Status: {validation['status']}")
            if 'error' in validation:
                print(f"    Error: {validation['error']}")
        
        print()
    
    # Summary
    print("="*70)
    print("VALIDATION SUMMARY")
    print("="*70)
    print(f"Transactions validated: {len(vote_txs)}")
    print(f"Perfect matches: {matches}")
    print()
    if matches == len(vote_txs) and len(vote_txs) > 0:
        print("[OK] ALL TRANSACTIONS VALIDATE PERFECTLY [OK]")
        print("Your code generates encoding identical to actual transactions!")
        print("This proves the implementation is correct.")
    elif matches < len(vote_txs):
        print("[X]  SOME VALIDATIONS FAILED")
        print("Do not proceed until all pass!")


def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Show complete voting history and validation details'
    )
    parser.add_argument(
        'wallet',
        nargs='?',
        default=DEFAULT_WALLET,
        help='Wallet address (default: from BLACKHOLE_WALLET_ADDRESS env var or placeholder)'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=None,
        help='Limit to last N epochs (weeks) to show (default: all epochs)'
    )
    parser.add_argument(
        '--validate',
        action='store_true',
        help='Also show encoding validation details'
    )
    parser.add_argument(
        '--friendly',
        action='store_true',
        help='Show human-friendly output format in markdown (default: detailed technical output)'
    )
    parser.add_argument(
        '--short',
        action='store_true',
        help='Show compact one-line-per-vote format (requires --friendly)'
    )
    
    args = parser.parse_args()
    
    # Validate short requires friendly
    if args.short and not args.friendly:
        parser.error("--short requires --friendly")
    
    # Show history
    if args.friendly:
        show_voting_history_friendly(args.wallet, limit=args.limit, short=args.short)
    else:
        show_voting_history(args.wallet, limit=args.limit, human_friendly=False)
    
    # Show validation if requested
    if args.validate:
        show_validation_details(args.wallet)


if __name__ == "__main__":
    main()
