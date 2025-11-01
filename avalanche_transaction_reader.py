#!/usr/bin/env python3
"""
Avalanche C-Chain Transaction Reader

This script reads an Avalanche C-Chain transaction from Snowtrace.io and extracts
token transfer information, calculating USD equivalents and formatting as markdown.
"""

import requests
import json
import sys
import re
import time
from datetime import datetime
from decimal import Decimal, getcontext
from typing import Dict, List, Tuple
import argparse
import pytz

# Set precision for decimal calculations
getcontext().prec = 50

class AvalancheTransactionReader:
    def __init__(self):
        self.snowtrace_api_base = "https://api.snowtrace.io/api"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
    def extract_tx_hash_from_input(self, input_str: str) -> str:
        """Extract or validate transaction hash from URL or direct hash input"""
        # Pattern to match transaction hash
        pattern = r'0x[a-fA-F0-9]{64}'
        match = re.search(pattern, input_str)
        if match:
            return match.group(0)
        else:
            raise ValueError("Could not extract or find a valid transaction hash. Please provide either a full Snowtrace URL or a transaction hash (0x...)")
    
    def get_transaction_data(self, tx_hash: str) -> Dict:
        """Fetch transaction data from Snowtrace API"""
        url = f"{self.snowtrace_api_base}?module=proxy&action=eth_getTransactionByHash&txhash={tx_hash}&apikey=YourApiKeyToken"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if 'error' in data:
                raise Exception(f"API Error: {data['error']}")
            
            return data.get('result', {})
        except requests.RequestException as e:
            raise Exception(f"Failed to fetch transaction data: {e}")
    
    def get_transaction_receipt(self, tx_hash: str) -> Dict:
        """Fetch transaction receipt to get logs (token transfers)"""
        url = f"{self.snowtrace_api_base}?module=proxy&action=eth_getTransactionReceipt&txhash={tx_hash}&apikey=YourApiKeyToken"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if 'error' in data:
                raise Exception(f"API Error: {data['error']}")
            
            return data.get('result', {})
        except requests.RequestException as e:
            raise Exception(f"Failed to fetch transaction receipt: {e}")
    
    def get_block_info(self, block_number: str) -> Dict:
        """Fetch block information to get timestamp"""
        url = f"{self.snowtrace_api_base}?module=proxy&action=eth_getBlockByNumber&tag={block_number}&boolean=true&apikey=YourApiKeyToken"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if 'error' in data:
                raise Exception(f"API Error: {data['error']}")
            
            return data.get('result', {})
        except requests.RequestException as e:
            raise Exception(f"Failed to fetch block info: {e}")
    
    def format_timestamp(self, timestamp_hex: str) -> str:
        """Convert hex timestamp to human-readable format with both local and UTC times"""
        try:
            # Convert hex to decimal
            timestamp = int(timestamp_hex, 16)
            
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
    
    def get_token_info(self, token_address: str) -> Dict:
        """Get token information (name, symbol, decimals)"""
        # Get token info from Snowtrace API
        url = f"{self.snowtrace_api_base}?module=token&action=tokeninfo&contractaddress={token_address}&apikey=YourApiKeyToken"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if 'error' in data or data.get('status') != '1':
                print(f"Warning: Could not get token info for {token_address}")
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
            # Map known token addresses to CoinGecko IDs
            token_mapping = {
                '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7': 'avalanche-2',  # AVAX
                '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e': 'usd-coin',     # USDC
                '0xcd94a87696fac69edae3a70fe5725307ae1c43f6': 'blackhole',    # BLACK
                '0x152b9d0fdc40c096757f570a51e494bd4b943e50': 'bitcoin',      # BTC.b
            }
            
            coingecko_id = token_mapping.get(token_address_lower)
            if coingecko_id:
                # Add a small delay to avoid rate limiting
                time.sleep(0.5)
                price_url = f"https://api.coingecko.com/api/v3/simple/price?ids={coingecko_id}&vs_currencies=usd"
                response = requests.get(price_url, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    if 'status' not in data:  # No error status
                        return data.get(coingecko_id, {}).get('usd', 0.0)
                    else:
                        print(f"Warning: CoinGecko rate limit hit for {coingecko_id}")
        except Exception as e:
            print(f"Warning: Simple price API failed for {token_address}: {e}")
        
        return 0.0
    
    def parse_transfer_logs(self, logs: List[Dict]) -> List[Dict]:
        """Parse ERC-20 Transfer event logs"""
        transfers = []
        
        # ERC-20 Transfer event signature: Transfer(address,address,uint256)
        transfer_topic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        
        for log in logs:
            if len(log.get('topics', [])) >= 3 and log['topics'][0] == transfer_topic:
                # Extract from, to, and value from log
                from_addr = '0x' + log['topics'][1][-40:]  # Remove 0x and take last 40 chars
                to_addr = '0x' + log['topics'][2][-40:]
                value_hex = log['data']
                
                # Convert hex value to decimal
                value = int(value_hex, 16)
                
                transfers.append({
                    'from': from_addr,
                    'to': to_addr,
                    'value': value,
                    'token_address': log['address']
                })
        
        return transfers
    
    def calculate_token_totals(self, transfers: List[Dict], target_address: str) -> Dict[str, Dict]:
        """Calculate total received tokens for target address"""
        token_totals = {}
        
        for transfer in transfers:
            if transfer['to'].lower() == target_address.lower():
                token_addr = transfer['token_address']
                
                if token_addr not in token_totals:
                    token_totals[token_addr] = {
                        'total_amount': 0,
                        'transfers': []
                    }
                
                token_totals[token_addr]['total_amount'] += transfer['value']
                token_totals[token_addr]['transfers'].append(transfer)
        
        return token_totals
    
    def format_amount(self, amount: int, decimals: int) -> str:
        """Format token amount with proper decimal places"""
        divisor = 10 ** decimals
        formatted = Decimal(amount) / Decimal(divisor)
        return f"{formatted:.6f}".rstrip('0').rstrip('.')
    
    def process_transaction(self, input_str: str) -> str:
        """Main method to process transaction and return markdown output"""
        try:
            # Extract or validate transaction hash
            tx_hash = self.extract_tx_hash_from_input(input_str)
            print(f"Processing transaction: {tx_hash}")
            
            # Get transaction data and receipt
            tx_data = self.get_transaction_data(tx_hash)
            tx_receipt = self.get_transaction_receipt(tx_hash)
            
            if not tx_data:
                return "Error: Could not fetch transaction data"
            
            # Get block timestamp
            block_number = tx_receipt.get('blockNumber', '0x0')
            block_info = self.get_block_info(block_number)
            timestamp_str = self.format_timestamp(block_info.get('timestamp', '0x0'))
            
            # Get the 'from' address (who is receiving tokens in this case)
            from_address = tx_data.get('from', '').lower()
            print(f"Analyzing token transfers for address: {from_address}")
            
            # Parse transfer logs
            logs = tx_receipt.get('logs', [])
            transfers = self.parse_transfer_logs(logs)
            
            if not transfers:
                return "No token transfers found in this transaction"
            
            print(f"Found {len(transfers)} token transfers")
            
            # Calculate token totals for the receiving address
            token_totals = self.calculate_token_totals(transfers, from_address)
            
            if not token_totals:
                return "No tokens received in this transaction"
            
            # Get token information and format output
            results = []
            for token_addr, data in token_totals.items():
                token_info = self.get_token_info(token_addr)
                formatted_amount = self.format_amount(data['total_amount'], token_info['decimals'])
                price = self.get_token_price(token_addr)
                usd_value = float(formatted_amount) * price if price > 0 else 0
                
                results.append({
                    'symbol': token_info['symbol'],
                    'amount': formatted_amount,
                    'usd_value': usd_value,
                    'name': token_info['name'],
                    'token_address': token_addr
                })
            
            # Sort alphabetically by symbol
            results.sort(key=lambda x: x['symbol'])
            
            # Calculate total USD value
            total_usd = sum(result['usd_value'] for result in results)
            tokens_with_price = [r for r in results if r['usd_value'] > 0]
            tokens_without_price = [r for r in results if r['usd_value'] == 0]
            
            # Generate markdown output
            markdown = "# Tokens Received\n\n"
            markdown += f"**Transaction:** [{tx_hash}](https://snowtrace.io/tx/{tx_hash})\n"
            markdown += f"**Recipient:** [{from_address}](https://snowtrace.io/address/{from_address})\n"
            markdown += f"**Date & Time:** {timestamp_str}\n\n"
            
            if total_usd > 0:
                markdown += f"**Total USD Value:** ${total_usd:.2f}\n\n"
            
            for result in results:
                usd_str = f" (${result['usd_value']:.2f})" if result['usd_value'] > 0 else " (Price not available)"
                markdown += f"- **{result['symbol']}**: {result['amount']}{usd_str}\n"
                markdown += f"  - Name: {result['name']}\n"
                markdown += f"  - Contract: [{result['token_address']}](https://snowtrace.io/token/{result['token_address']})\n\n"
            
            if tokens_without_price:
                markdown += f"**Note:** {len(tokens_without_price)} token(s) without available price data\n"
            
            return markdown
            
        except Exception as e:
            return f"Error processing transaction: {str(e)}"

def main():
    parser = argparse.ArgumentParser(description='Read Avalanche C-Chain transaction from Snowtrace.io')
    parser.add_argument('input', help='Snowtrace.io transaction URL or transaction hash (0x...)')
    parser.add_argument('-o', '--output', help='Output file (optional)')
    
    args = parser.parse_args()
    
    reader = AvalancheTransactionReader()
    result = reader.process_transaction(args.input)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(result)
        print(f"Results written to {args.output}")
    else:
        print(result)

if __name__ == "__main__":
    main()