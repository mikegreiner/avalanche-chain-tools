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
from typing import Dict, List, Tuple, Optional, Any
import argparse

from avalanche_utils import (
    SNOWTRACE_API_BASE, DEFAULT_HEADERS, API_KEY_TOKEN,
    get_token_info, get_token_price, format_amount, format_timestamp_from_hex,
    AvalancheAPIError, NetworkError, TransactionNotFoundError, BlockNotFoundError,
    InvalidInputError, logger
)
from avalanche_base import AvalancheTool

# Version number (semantic versioning: MAJOR.MINOR.PATCH)
__version__ = "1.0.0"

class AvalancheTransactionReader(AvalancheTool):
    def __init__(self, snowtrace_api_base: Optional[str] = None, 
                 headers: Optional[Dict[str, str]] = None) -> None:
        """Initialize the transaction reader"""
        super().__init__(snowtrace_api_base, headers)
        
    def extract_tx_hash_from_input(self, input_str: str) -> str:
        """
        Extract or validate transaction hash from URL or direct hash input.
        
        Args:
            input_str: Snowtrace.io URL or transaction hash (0x...)
            
        Returns:
            Valid transaction hash string
            
        Raises:
            InvalidInputError: If no valid transaction hash can be extracted
        """
        # Pattern to match transaction hash
        pattern = r'0x[a-fA-F0-9]{64}'
        match = re.search(pattern, input_str)
        if match:
            return match.group(0)
        else:
            raise InvalidInputError("Could not extract or find a valid transaction hash. Please provide either a full Snowtrace URL or a transaction hash (0x...)")
    
    def get_transaction_data(self, tx_hash: str) -> Dict[str, Any]:
        """
        Fetch transaction data from Snowtrace API.
        
        Args:
            tx_hash: Transaction hash to fetch
            
        Returns:
            Dictionary containing transaction data
            
        Raises:
            AvalancheAPIError: If API returns an error
            NetworkError: If network request fails
        """
        url = f"{self.snowtrace_api_base}?module=proxy&action=eth_getTransactionByHash&txhash={tx_hash}&apikey={API_KEY_TOKEN}"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=self.get_api_timeout())
            response.raise_for_status()
            data = response.json()
            
            if 'error' in data:
                raise AvalancheAPIError(f"API Error: {data['error']}", api_error=str(data['error']))
            
            return data.get('result', {})
        except requests.RequestException as e:
            raise NetworkError(f"Failed to fetch transaction data: {e}", original_error=e)
    
    def get_transaction_receipt(self, tx_hash: str) -> Dict:
        """Fetch transaction receipt to get logs (token transfers)"""
        url = f"{self.snowtrace_api_base}?module=proxy&action=eth_getTransactionReceipt&txhash={tx_hash}&apikey={API_KEY_TOKEN}"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=self.get_api_timeout())
            response.raise_for_status()
            data = response.json()
            
            if 'error' in data:
                raise AvalancheAPIError(f"API Error: {data['error']}", api_error=str(data['error']))
            
            result = data.get('result', {})
            if not result:
                raise TransactionNotFoundError(f"Transaction receipt not found for hash: {tx_hash}")
            return result
        except requests.RequestException as e:
            raise NetworkError(f"Failed to fetch transaction receipt: {e}", original_error=e)
    
    def get_block_info(self, block_number: str) -> Dict[str, Any]:
        """Fetch block information to get timestamp"""
        url = f"{self.snowtrace_api_base}?module=proxy&action=eth_getBlockByNumber&tag={block_number}&boolean=true&apikey={API_KEY_TOKEN}"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=self.get_api_timeout())
            response.raise_for_status()
            data = response.json()
            
            if 'error' in data:
                raise AvalancheAPIError(f"API Error: {data['error']}", api_error=str(data['error']))
            
            result = data.get('result', {})
            if not result:
                raise BlockNotFoundError(f"Block info not found for block: {block_number}")
            return result
        except requests.RequestException as e:
            raise NetworkError(f"Failed to fetch block info: {e}", original_error=e)
    
    def format_timestamp(self, timestamp_hex: str) -> str:
        """Convert hex timestamp to human-readable format with both local and UTC times"""
        return format_timestamp_from_hex(timestamp_hex, include_utc=True)
    
    def get_token_info(self, token_address: str) -> Dict:
        """Get token information (name, symbol, decimals)"""
        return get_token_info(token_address, headers=self.headers)
    
    def get_token_price(self, token_address: str) -> float:
        """Get current token price in USD from multiple sources"""
        return get_token_price(token_address, headers=self.headers)
    
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
    
    def calculate_token_totals(self, transfers: List[Dict[str, Any]], target_address: str) -> Dict[str, Dict[str, Any]]:
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
        return format_amount(amount, decimals, precision='standard')
    
    def process_transaction(self, input_str: str) -> str:
        """
        Main method to process transaction and return markdown output.
        
        Args:
            input_str: Snowtrace.io URL or transaction hash (0x...)
            
        Returns:
            Formatted markdown string with transaction details
        """
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
            
        except (AvalancheAPIError, NetworkError, TransactionNotFoundError, BlockNotFoundError) as e:
            logger.error(f"Error processing transaction: {e}")
            return f"Error processing transaction: {str(e)}"
        except Exception as e:
            logger.error(f"Unexpected error processing transaction: {e}", exc_info=True)
            return f"Error processing transaction: {str(e)}"

def main():
    parser = argparse.ArgumentParser(description='Read Avalanche C-Chain transaction from Snowtrace.io')
    parser.add_argument('input', help='Snowtrace.io transaction URL or transaction hash (0x...)')
    parser.add_argument('-o', '--output', help='Output file (optional)')
    parser.add_argument(
        '--version',
        action='version',
        version=f'%(prog)s {__version__}'
    )
    
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