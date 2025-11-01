#!/usr/bin/env python3
"""
Avalanche C-Chain Daily Swap Analyzer

This script analyzes daily swap transactions for a given Avalanche C-Chain address,
focusing on swaps to BTC.b and providing a comprehensive markdown summary.
"""

import requests
import json
import sys
import re
import time
from datetime import datetime, timedelta
from decimal import Decimal, getcontext
from typing import Dict, List, Tuple, Optional
import argparse
import pytz

# Set precision for decimal calculations
getcontext().prec = 50

class AvalancheDailySwapAnalyzer:
    def __init__(self):
        self.snowtrace_api_base = "https://api.snowtrace.io/api"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        # BTC.b contract address
        self.btc_b_address = "0x152b9d0fdc40c096757f570a51e494bd4b943e50"
        
    def get_address_transactions(self, address: str, start_block: int, end_block: int) -> List[Dict]:
        """Fetch all transactions for an address within a block range"""
        all_transactions = []
        page = 1
        offset = 10000  # Max per page
        
        while True:
            url = f"{self.snowtrace_api_base}?module=account&action=txlist&address={address}&startblock={start_block}&endblock={end_block}&page={page}&offset={offset}&sort=desc&apikey=YourApiKeyToken"
            
            try:
                response = requests.get(url, headers=self.headers, timeout=15)
                response.raise_for_status()
                data = response.json()
                
                if data.get('status') != '1':
                    print(f"Warning: API returned status {data.get('status')}: {data.get('message', 'Unknown error')}")
                    break
                
                transactions = data.get('result', [])
                if not transactions:
                    break
                    
                all_transactions.extend(transactions)
                print(f"Fetched page {page}: {len(transactions)} transactions")
                
                # If we got fewer than the offset, we've reached the end
                if len(transactions) < offset:
                    break
                    
                page += 1
                
                # Safety limit to prevent infinite loops
                if page > 10:
                    print("Warning: Reached page limit (10), stopping")
                    break
                    
            except requests.RequestException as e:
                print(f"Error fetching page {page}: {e}")
                break
        
        return all_transactions
    
    def get_latest_block_number(self) -> int:
        """Get the latest block number"""
        url = f"{self.snowtrace_api_base}?module=proxy&action=eth_blockNumber&apikey=YourApiKeyToken"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if 'error' in data:
                raise Exception(f"API Error: {data['error']}")
            
            return int(data.get('result', '0x0'), 16)
        except requests.RequestException as e:
            raise Exception(f"Failed to fetch latest block: {e}")
    
    def get_block_by_timestamp(self, timestamp: int) -> int:
        """Get block number closest to a given timestamp using Snowtrace API"""
        try:
            # Use Snowtrace API to get block by timestamp
            url = f"{self.snowtrace_api_base}?module=block&action=getblocknobytime&timestamp={timestamp}&closest=before&apikey=YourApiKeyToken"
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if data.get('status') == '1':
                return int(data.get('result', '0'))
            else:
                print(f"Warning: API error getting block for timestamp {timestamp}: {data.get('message', 'Unknown error')}")
                # Fallback to estimation
                return self._estimate_block_by_timestamp(timestamp)
        except Exception as e:
            print(f"Warning: Error fetching block by timestamp: {e}")
            # Fallback to estimation
            return self._estimate_block_by_timestamp(timestamp)
    
    def _estimate_block_by_timestamp(self, timestamp: int) -> int:
        """Fallback method to estimate block number by timestamp"""
        latest_block = self.get_latest_block_number()
        current_time = int(time.time())
        time_diff = current_time - timestamp
        blocks_ago = time_diff // 2  # 2 seconds per block for Avalanche
        return max(0, latest_block - blocks_ago)
    
    def get_token_info(self, token_address: str) -> Dict:
        """Get token information (name, symbol, decimals)"""
        url = f"{self.snowtrace_api_base}?module=token&action=tokeninfo&contractaddress={token_address}&apikey=YourApiKeyToken"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if 'error' in data or data.get('status') != '1':
                return {'name': 'Unknown', 'symbol': 'UNKNOWN', 'decimals': 18}
            
            result = data.get('result', [])
            if isinstance(result, list) and len(result) > 0:
                token_data = result[0]
                return {
                    'name': token_data.get('tokenName', 'Unknown'),
                    'symbol': token_data.get('symbol', 'UNKNOWN'),
                    'decimals': int(token_data.get('divisor', 18))
                }
            else:
                return {'name': 'Unknown', 'symbol': 'UNKNOWN', 'decimals': 18}
        except Exception as e:
            print(f"Warning: Error fetching token info for {token_address}: {e}")
            return {'name': 'Unknown', 'symbol': 'UNKNOWN', 'decimals': 18}
    
    def get_token_balance(self, address: str, token_address: str) -> int:
        """Get current token balance for an address"""
        url = f"{self.snowtrace_api_base}?module=account&action=tokenbalance&contractaddress={token_address}&address={address}&tag=latest&apikey=YourApiKeyToken"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if data.get('status') != '1':
                print(f"Warning: Failed to get balance for {token_address}: {data.get('message', 'Unknown error')}")
                return 0
            
            return int(data.get('result', '0'))
        except Exception as e:
            print(f"Warning: Error fetching balance for {token_address}: {e}")
            return 0
    
    def get_token_price(self, token_address: str) -> float:
        """Get current token price in USD from multiple sources"""
        token_address_lower = token_address.lower()
        
        # Try Snowtrace API first for AVAX price
        if token_address_lower == '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7':  # WAVAX
            try:
                url = f"{self.snowtrace_api_base}?module=stats&action=ethprice&apikey=YourApiKeyToken"
                response = requests.get(url, headers=self.headers, timeout=5)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('status') == '1':
                        return float(data['result']['ethusd'])
            except:
                pass
        
        # Try CoinGecko contract address search first (more reliable for Avalanche tokens)
        try:
            search_url = f"https://api.coingecko.com/api/v3/coins/avalanche/contract/{token_address_lower}"
            response = requests.get(search_url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                price = data.get('market_data', {}).get('current_price', {}).get('usd', 0.0)
                if price > 0:
                    return price
        except Exception as e:
            print(f"Warning: Contract search failed for {token_address}: {e}")
        
        # Try CoinGecko simple price API as fallback (with rate limiting)
        try:
            token_mapping = {
                '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7': 'avalanche-2',  # AVAX
                '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e': 'usd-coin',     # USDC
                '0xcd94a87696fac69edae3a70fe5725307ae1c43f6': 'blackhole',    # BLACK
                '0x152b9d0fdc40c096757f570a51e494bd4b943e50': 'bitcoin',      # BTC.b
            }
            
            coingecko_id = token_mapping.get(token_address_lower)
            if coingecko_id:
                time.sleep(0.5)  # Rate limiting
                price_url = f"https://api.coingecko.com/api/v3/simple/price?ids={coingecko_id}&vs_currencies=usd"
                response = requests.get(price_url, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    if 'status' not in data:
                        return data.get(coingecko_id, {}).get('usd', 0.0)
        except Exception as e:
            print(f"Warning: Simple price API failed for {token_address}: {e}")
        
        return 0.0
    
    def parse_swap_transaction(self, tx: Dict) -> Optional[Dict]:
        """Parse a transaction to extract swap information"""
        try:
            # Get transaction receipt to check for token transfers
            tx_hash = tx['hash']
            receipt_url = f"{self.snowtrace_api_base}?module=proxy&action=eth_getTransactionReceipt&txhash={tx_hash}&apikey=YourApiKeyToken"
            
            response = requests.get(receipt_url, headers=self.headers, timeout=10)
            if response.status_code != 200:
                return None
                
            receipt_data = response.json()
            if 'error' in receipt_data:
                return None
                
            logs = receipt_data.get('result', {}).get('logs', [])
            
            # Look for transfers involving BTC.b
            btc_b_transfers = []
            other_transfers = []
            
            for log in logs:
                if len(log.get('topics', [])) >= 3 and log['topics'][0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef':
                    from_addr = '0x' + log['topics'][1][-40:]
                    to_addr = '0x' + log['topics'][2][-40:]
                    value_hex = log['data']
                    value = int(value_hex, 16)
                    token_addr = log['address']
                    
                    # Check if this involves our target address
                    if from_addr.lower() == tx['from'].lower() or to_addr.lower() == tx['from'].lower():
                        if token_addr.lower() == self.btc_b_address.lower():
                            btc_b_transfers.append({
                                'from': from_addr,
                                'to': to_addr,
                                'value': value,
                                'token_address': token_addr
                            })
                        else:
                            other_transfers.append({
                                'from': from_addr,
                                'to': to_addr,
                                'value': value,
                                'token_address': token_addr
                            })
            
            # Check if this is a swap to BTC.b (received BTC.b and sent other tokens)
            btc_b_received = sum(t['value'] for t in btc_b_transfers if t['to'].lower() == tx['from'].lower())
            other_sent = [t for t in other_transfers if t['from'].lower() == tx['from'].lower()]
            
            if btc_b_received > 0 and other_sent:
                # This looks like a swap to BTC.b
                swap_data = {
                    'tx_hash': tx_hash,
                    'timestamp': int(tx['timeStamp']),
                    'btc_b_received': btc_b_received,
                    'tokens_sent': []
                }
                
                # Process each token sent
                for transfer in other_sent:
                    token_info = self.get_token_info(transfer['token_address'])
                    formatted_amount = self.format_amount(transfer['value'], token_info['decimals'])
                    price = self.get_token_price(transfer['token_address'])
                    usd_value = float(formatted_amount) * price if price > 0 else 0
                    
                    swap_data['tokens_sent'].append({
                        'token_address': transfer['token_address'],
                        'amount': formatted_amount,
                        'usd_value': usd_value,
                        'token_info': token_info
                    })
                
                return swap_data
                
        except Exception as e:
            print(f"Warning: Error parsing transaction {tx.get('hash', 'unknown')}: {e}")
            
        return None
    
    def format_amount(self, amount: int, decimals: int) -> str:
        """Format token amount with proper decimal places"""
        divisor = 10 ** decimals
        formatted = Decimal(amount) / Decimal(divisor)
        return f"{formatted:.6f}".rstrip('0').rstrip('.')
    
    def format_timestamp(self, timestamp: int) -> str:
        """Convert timestamp to human-readable format with both local and UTC times"""
        try:
            # Create UTC datetime
            dt_utc = datetime.fromtimestamp(timestamp, tz=pytz.UTC)
            
            # Get local timezone
            local_tz = datetime.now().astimezone().tzinfo
            
            # Convert to local time
            dt_local = dt_utc.astimezone(local_tz)
            
            # Format both times
            utc_str = dt_utc.strftime("%B %d, %Y at %I:%M:%S %p UTC")
            local_str = dt_local.strftime("%B %d, %Y at %I:%M:%S %p %Z")
            
            return f"{local_str} / {utc_str}"
        except Exception as e:
            return f"Unknown timestamp (Error: {e})"
    
    def analyze_daily_swaps(self, address: str, target_date: str = None) -> str:
        """Analyze daily swap transactions for the given address"""
        try:
            # Parse target date or use today
            if target_date:
                target_dt = datetime.strptime(target_date, "%Y-%m-%d")
            else:
                target_dt = datetime.now()
            
            print(f"Target date: {target_dt}")
            print(f"Current time: {datetime.now()}")
            
            # Calculate start and end of day in UTC
            start_of_day = target_dt.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = start_of_day + timedelta(days=1)
            
            start_timestamp = int(start_of_day.timestamp())
            end_timestamp = int(end_of_day.timestamp())
            
            # Also search a few days before and after to catch any nearby transactions
            search_start = start_of_day - timedelta(days=3)
            search_end = end_of_day + timedelta(days=3)
            search_start_timestamp = int(search_start.timestamp())
            search_end_timestamp = int(search_end.timestamp())
            
            print(f"Analyzing swaps for {address} on {target_dt.strftime('%Y-%m-%d')}")
            print(f"Target time range: {start_of_day} to {end_of_day} UTC")
            print(f"Search time range: {search_start} to {search_end} UTC")
            print(f"Target timestamp range: {start_timestamp} to {end_timestamp}")
            print(f"Search timestamp range: {search_start_timestamp} to {search_end_timestamp}")
            
            # Get block range for the wider search
            start_block = self.get_block_by_timestamp(search_start_timestamp)
            end_block = self.get_block_by_timestamp(search_end_timestamp)
            
            # Add a much larger buffer to ensure we don't miss transactions
            start_block = max(0, start_block - 1000)  # 1000 blocks before start of day
            end_block = end_block + 1000  # 1000 blocks after end of day
            
            print(f"Block range: {start_block} to {end_block}")
            
            # Fetch transactions
            transactions = self.get_address_transactions(address, start_block, end_block)
            print(f"Found {len(transactions)} total transactions")
            
            # If no transactions found, try a much wider range
            if len(transactions) == 0:
                print("No transactions found in block range, trying wider range...")
                latest_block = self.get_latest_block_number()
                # Try last 100,000 blocks
                wide_start = max(0, latest_block - 100000)
                transactions = self.get_address_transactions(address, wide_start, latest_block)
                print(f"Found {len(transactions)} total transactions in wider range")
            
            # Debug: Show transaction timestamps
            print("Transaction timestamps in range:")
            for i, tx in enumerate(transactions[:10]):  # Show first 10
                tx_timestamp = int(tx['timeStamp'])
                tx_dt = datetime.fromtimestamp(tx_timestamp, tz=pytz.UTC)
                print(f"  {i+1}. {tx_dt} (timestamp: {tx_timestamp})")
            
            # Show all unique dates with transactions
            if transactions:
                print("\nAll transaction dates found:")
                unique_dates = set()
                for tx in transactions:
                    tx_timestamp = int(tx['timeStamp'])
                    tx_dt = datetime.fromtimestamp(tx_timestamp, tz=pytz.UTC)
                    unique_dates.add(tx_dt.strftime('%Y-%m-%d'))
                
                for date in sorted(unique_dates):
                    print(f"  - {date}")
            
            # Filter for target date transactions and parse swaps
            daily_swaps = []
            daily_transactions = []
            nearby_swaps = []
            nearby_transactions = []
            
            for tx in transactions:
                tx_timestamp = int(tx['timeStamp'])
                tx_dt = datetime.fromtimestamp(tx_timestamp, tz=pytz.UTC)
                
                # Check if it's on the target date
                if start_timestamp <= tx_timestamp < end_timestamp:
                    daily_transactions.append(tx)
                    swap_data = self.parse_swap_transaction(tx)
                    if swap_data:
                        daily_swaps.append(swap_data)
                # Check if it's in the nearby range (3 days before/after)
                elif search_start_timestamp <= tx_timestamp < search_end_timestamp:
                    nearby_transactions.append(tx)
                    swap_data = self.parse_swap_transaction(tx)
                    if swap_data:
                        nearby_swaps.append(swap_data)
            
            print(f"Found {len(daily_transactions)} transactions on target date")
            print(f"Found {len(nearby_transactions)} transactions in nearby range (±3 days)")
            print(f"Found {len(nearby_swaps)} swap transactions in nearby range")
            
            print(f"Found {len(daily_swaps)} swap transactions to BTC.b")
            
            if not daily_swaps and not nearby_swaps:
                return f"# Daily Swap Analysis - {target_dt.strftime('%B %d, %Y')}\n\n**Address:** [{address}](https://snowtrace.io/address/{address})\n\nNo swap transactions to BTC.b found for this date or nearby dates (±3 days).\n"
            elif not daily_swaps and nearby_swaps:
                # Use nearby swaps if no exact date matches
                daily_swaps = nearby_swaps
                print(f"Using {len(nearby_swaps)} nearby swap transactions since none found on exact date")
            
            # Get BTC.b info for totals
            btc_b_info = self.get_token_info(self.btc_b_address)
            btc_b_price = self.get_token_price(self.btc_b_address)
            
            # Get current BTC.b balance for the address
            current_btc_b_balance = self.get_token_balance(address, self.btc_b_address)
            current_btc_b_formatted = self.format_amount(current_btc_b_balance, btc_b_info['decimals'])
            current_btc_b_usd = float(current_btc_b_formatted) * btc_b_price if btc_b_price > 0 else 0
            
            # Calculate totals
            total_btc_b = sum(swap['btc_b_received'] for swap in daily_swaps)
            total_btc_b_formatted = self.format_amount(total_btc_b, btc_b_info['decimals'])
            total_btc_b_usd = float(total_btc_b_formatted) * btc_b_price if btc_b_price > 0 else 0
            
            # Aggregate all tokens swapped
            token_totals = {}
            total_usd_sent = 0
            
            for swap in daily_swaps:
                for token in swap['tokens_sent']:
                    token_addr = token['token_address']
                    if token_addr not in token_totals:
                        token_totals[token_addr] = {
                            'token_info': token['token_info'],
                            'total_amount': 0,
                            'total_usd': 0
                        }
                    
                    # Add to totals
                    token_totals[token_addr]['total_amount'] += float(token['amount'])
                    token_totals[token_addr]['total_usd'] += token['usd_value']
                    total_usd_sent += token['usd_value']
            
            # Generate markdown output
            markdown = f"# Daily Swap Analysis - {target_dt.strftime('%B %d, %Y')}\n\n"
            markdown += f"**Address:** [{address}](https://snowtrace.io/address/{address})\n"
            markdown += f"**Date:** {target_dt.strftime('%B %d, %Y')}\n"
            markdown += f"**Total Swaps:** {len(daily_swaps)}\n\n"
            
            # Show current BTC.b balance
            if current_btc_b_usd > 0:
                markdown += f"**Current BTC.b Balance:** {current_btc_b_formatted} (${current_btc_b_usd:.2f})\n"
            else:
                markdown += f"**Current BTC.b Balance:** {current_btc_b_formatted} (Price not available)\n"
            markdown += "\n"
            
            if total_btc_b_usd > 0:
                markdown += f"**Total BTC.b Received:** {total_btc_b_formatted} (${total_btc_b_usd:.2f})\n"
            else:
                markdown += f"**Total BTC.b Received:** {total_btc_b_formatted} (Price not available)\n"
            
            markdown += f"**Total USD Value Swapped:** ${total_usd_sent:.2f}\n\n"
            
            # List all tokens swapped (alphabetically)
            markdown += "## Tokens Swapped (Alphabetical)\n\n"
            sorted_tokens = sorted(token_totals.items(), key=lambda x: x[1]['token_info']['symbol'])
            
            for token_addr, data in sorted_tokens:
                symbol = data['token_info']['symbol']
                name = data['token_info']['name']
                amount = data['total_amount']
                usd_value = data['total_usd']
                
                usd_str = f" (${usd_value:.2f})" if usd_value > 0 else " (Price not available)"
                markdown += f"- **{symbol}**: {amount:.6f}{usd_str}\n"
                markdown += f"  - Name: {name}\n"
                markdown += f"  - Contract: [{token_addr}](https://snowtrace.io/token/{token_addr})\n\n"
            
            # List each swap
            for i, swap in enumerate(daily_swaps, 1):
                btc_b_amount = self.format_amount(swap['btc_b_received'], btc_b_info['decimals'])
                timestamp_str = self.format_timestamp(swap['timestamp'])
                
                markdown += f"## Swap #{i}\n\n"
                markdown += f"**Transaction:** [{swap['tx_hash']}](https://snowtrace.io/tx/{swap['tx_hash']})\n"
                markdown += f"**Time:** {timestamp_str}\n"
                markdown += f"**BTC.b Received:** {btc_b_amount}\n\n"
                
                markdown += "**Tokens Swapped:**\n"
                for token in swap['tokens_sent']:
                    usd_str = f" (${token['usd_value']:.2f})" if token['usd_value'] > 0 else " (Price not available)"
                    markdown += f"- **{token['token_info']['symbol']}**: {token['amount']}{usd_str}\n"
                    markdown += f"  - Name: {token['token_info']['name']}\n"
                    markdown += f"  - Contract: [{token['token_address']}](https://snowtrace.io/token/{token['token_address']})\n\n"
            
            return markdown
            
        except Exception as e:
            return f"Error analyzing daily swaps: {str(e)}"

def main():
    parser = argparse.ArgumentParser(description='Analyze daily swap transactions for an Avalanche C-Chain address')
    parser.add_argument('address', help='Avalanche C-Chain address to analyze')
    parser.add_argument('-d', '--date', help='Target date in YYYY-MM-DD format (default: today)')
    parser.add_argument('-o', '--output', help='Output file (optional)')
    
    args = parser.parse_args()
    
    analyzer = AvalancheDailySwapAnalyzer()
    result = analyzer.analyze_daily_swaps(args.address, args.date)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(result)
        print(f"Results written to {args.output}")
    else:
        print(result)

if __name__ == "__main__":
    main()