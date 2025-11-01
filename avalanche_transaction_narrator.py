#!/usr/bin/env python3
"""
Avalanche C-Chain Transaction Narrator

This script analyzes recent transactions for a given Avalanche C-Chain address
and generates human-friendly descriptions of what happened.
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

class AvalancheTransactionNarrator:
    def __init__(self):
        self.snowtrace_api_base = "https://api.snowtrace.io/api"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        # Known contract addresses for classification with correct decimals
        self.known_contracts = {
            '0xcd94a87696fac69edae3a70fe5725307ae1c43f6': {'name': 'BLACKHOLE (BLACK)', 'decimals': 18},
            '0x152b9d0fdc40c096757f570a51e494bd4b943e50': {'name': 'Bitcoin (BTC.b)', 'decimals': 8},
            '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7': {'name': 'Wrapped AVAX (WAVAX)', 'decimals': 18},
            '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e': {'name': 'USD Coin (USDC)', 'decimals': 6},
            '0x09fa58228bb791ea355c90da1e4783452b9bd8c3': {'name': 'SuperVerse (SUPER)', 'decimals': 18},
        }
        
        # Blackhole DEX specific contract addresses (add known ones)
        self.blackhole_contracts = {
            # Add known Blackhole DEX contract addresses here
            # These would be the staking, rewards, and Supermassive NFT contracts
        }
        
        # Common function signatures for transaction classification
        self.function_signatures = {
            '0xa9059cbb': 'transfer',
            '0x23b872dd': 'transferFrom',
            '0x095ea7b3': 'approve',
            '0x7ff36ab5': 'swapExactETHForTokens',
            '0x18cbafe5': 'swapExactTokensForETH',
            '0x38ed1739': 'swapExactTokensForTokens',
            '0x5c11d795': 'swapExactTokensForTokensSupportingFeeOnTransferTokens',
            '0x02751cec': 'removeLiquidity',
            '0xe8e33700': 'addLiquidity',
            '0x4e71d92d': 'claim',
            '0x2e1a7d4d': 'withdraw',
            '0x3d18b912': 'getReward',
            '0x379607f5': 'claimReward',
        }
    
    def get_address_transactions(self, address: str, start_block: int, end_block: int) -> List[Dict]:
        """Fetch all transactions for an address within a block range"""
        all_transactions = []
        page = 1
        offset = 10000
        
        while True:
            url = f"{self.snowtrace_api_base}?module=account&action=txlist&address={address}&startblock={start_block}&endblock={end_block}&page={page}&offset={offset}&sort=desc&apikey=YourApiKeyToken"
            
            try:
                response = requests.get(url, headers=self.headers, timeout=15)
                response.raise_for_status()
                data = response.json()
                
                if data.get('status') != '1':
                    break
                
                transactions = data.get('result', [])
                if not transactions:
                    break
                    
                all_transactions.extend(transactions)
                
                if len(transactions) < offset:
                    break
                    
                page += 1
                if page > 5:  # Limit to prevent too many API calls
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
            return int(data.get('result', '0x0'), 16)
        except requests.RequestException as e:
            raise Exception(f"Failed to fetch latest block: {e}")
    
    def get_token_info(self, token_address: str) -> Dict:
        """Get token information (name, symbol, decimals)"""
        if token_address in self.known_contracts:
            contract_info = self.known_contracts[token_address]
            return {
                'name': contract_info['name'], 
                'symbol': contract_info['name'].split(' ')[-1].strip('()'), 
                'decimals': contract_info['decimals']
            }
        
        url = f"{self.snowtrace_api_base}?module=token&action=tokeninfo&contractaddress={token_address}&apikey=YourApiKeyToken"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if data.get('status') != '1':
                return {'name': 'Unknown Token', 'symbol': 'UNKNOWN', 'decimals': 18}
            
            result = data.get('result', [])
            if isinstance(result, list) and len(result) > 0:
                token_data = result[0]
                
                
                return {
                    'name': token_data.get('tokenName', 'Unknown Token'),
                    'symbol': token_data.get('symbol', 'UNKNOWN'),
                    'decimals': int(token_data.get('divisor', 18))
                }
            else:
                return {'name': 'Unknown Token', 'symbol': 'UNKNOWN', 'decimals': 18}
        except Exception as e:
            return {'name': 'Unknown Token', 'symbol': 'UNKNOWN', 'decimals': 18}
    
    def get_transaction_receipt(self, tx_hash: str) -> Optional[Dict]:
        """Get transaction receipt with logs"""
        url = f"{self.snowtrace_api_base}?module=proxy&action=eth_getTransactionReceipt&txhash={tx_hash}&apikey=YourApiKeyToken"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if 'error' in data:
                return None
                
            return data.get('result', {})
        except Exception as e:
            return None
    
    def format_amount(self, amount: int, decimals: int) -> str:
        """Format token amount with proper decimal places"""
        divisor = 10 ** decimals
        formatted = Decimal(amount) / Decimal(divisor)
        
        # Use more precision for small amounts to avoid showing 0
        if formatted >= 1:
            return f"{formatted:.6f}".rstrip('0').rstrip('.')
        elif formatted >= 0.000001:
            return f"{formatted:.8f}".rstrip('0').rstrip('.')
        else:
            # For very small amounts, show more decimal places
            return f"{formatted:.12f}".rstrip('0').rstrip('.')
    
    def format_timestamp(self, timestamp: int) -> str:
        """Convert timestamp to human-readable format"""
        try:
            dt_utc = datetime.fromtimestamp(timestamp, tz=pytz.UTC)
            local_tz = datetime.now().astimezone().tzinfo
            dt_local = dt_utc.astimezone(local_tz)
            return dt_local.strftime("%B %d, %Y at %I:%M:%S %p %Z")
        except Exception as e:
            return f"Unknown time (Error: {e})"
    
    def classify_transaction(self, tx: Dict, receipt: Optional[Dict] = None) -> Dict:
        """Classify a transaction and extract relevant information"""
        classification = {
            'type': 'unknown',
            'description': '',
            'tokens_involved': [],
            'amounts': {},
            'contract_interaction': None,
            'is_contract_creation': tx.get('to', '') == '',
            'value_eth': float(int(tx.get('value', '0x0'), 16)) / 1e18,
            'is_blackhole_dex': False
        }
        
        # Check if it's a contract creation
        if classification['is_contract_creation']:
            classification['type'] = 'contract_creation'
            classification['description'] = 'Deployed a new smart contract'
            return classification
        
        # Get transaction receipt for more details
        if not receipt:
            receipt = self.get_transaction_receipt(tx['hash'])
        
        if not receipt:
            classification['type'] = 'simple_transfer'
            classification['description'] = f"Simple AVAX transfer of {classification['value_eth']:.4f} AVAX"
            return classification
        
        # Analyze logs for token transfers
        logs = receipt.get('logs', [])
        token_transfers = []
        
        for log in logs:
            if len(log.get('topics', [])) >= 3 and log['topics'][0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef':
                from_addr = '0x' + log['topics'][1][-40:]
                to_addr = '0x' + log['topics'][2][-40:]
                value_hex = log['data']
                value = int(value_hex, 16)
                token_addr = log['address']
                
                if value > 0:  # Only include non-zero transfers
                    token_info = self.get_token_info(token_addr)
                    formatted_amount = self.format_amount(value, token_info['decimals'])
                    
                    token_transfers.append({
                        'from': from_addr,
                        'to': to_addr,
                        'amount': formatted_amount,
                        'token_info': token_info,
                        'token_address': token_addr
                    })
        
        # Check for Blackhole DEX specific patterns
        blackhole_tokens = [t for t in token_transfers if 'BLACK' in t['token_info']['symbol']]
        if blackhole_tokens:
            classification['is_blackhole_dex'] = True
        
        # Analyze transaction input data
        input_data = tx.get('input', '0x')
        function_sig = input_data[:10] if len(input_data) >= 10 else ''
        
        # First, check if this looks like a swap based on token transfers
        if token_transfers:
            sent_tokens = [t for t in token_transfers if t['from'].lower() == tx['from'].lower() and float(t['amount']) > 0]
            received_tokens = [t for t in token_transfers if t['to'].lower() == tx['from'].lower() and float(t['amount']) > 0]
            
            if sent_tokens and received_tokens:
                # This looks like a swap
                classification['type'] = 'swap'
                classification['description'] = self.describe_swap(token_transfers, tx)
            else:
                # Not a swap, continue with other classification
                pass
        
        # If not classified as swap yet, use function signature
        if classification['type'] == 'unknown':
            if function_sig in self.function_signatures:
                func_name = self.function_signatures[function_sig]
                
                if func_name in ['swapExactETHForTokens', 'swapExactTokensForETH', 'swapExactTokensForTokens', 'swapExactTokensForTokensSupportingFeeOnTransferTokens']:
                    classification['type'] = 'swap'
                    classification['description'] = self.describe_swap(token_transfers, tx)
                elif func_name in ['claim', 'getReward', 'claimReward']:
                    classification['type'] = 'claim'
                    classification['description'] = self.describe_claim(token_transfers, tx)
                elif func_name in ['transfer', 'transferFrom']:
                    classification['type'] = 'transfer'
                    classification['description'] = self.describe_transfer(token_transfers, tx)
                elif func_name in ['approve']:
                    classification['type'] = 'approval'
                    classification['description'] = self.describe_approval(token_transfers, tx)
                else:
                    classification['type'] = 'contract_interaction'
                    classification['description'] = f"Contract interaction: {func_name}"
            else:
                # Try to classify based on token transfers
                if len(token_transfers) == 0:
                    if classification['value_eth'] > 0:
                        classification['type'] = 'simple_transfer'
                        classification['description'] = f"Simple AVAX transfer of {classification['value_eth']:.4f} AVAX"
                    else:
                        classification['type'] = 'contract_interaction'
                        classification['description'] = "Contract interaction (unknown function)"
                else:
                    classification['type'] = 'token_operation'
                    classification['description'] = self.describe_token_operation(token_transfers, tx)
        
        classification['tokens_involved'] = token_transfers
        return classification
    
    def describe_swap(self, token_transfers: List[Dict], tx: Dict) -> str:
        """Describe a swap transaction"""
        if len(token_transfers) < 2:
            return "Token swap (insufficient data to determine details)"
        
        # Find tokens sent and received
        sent_tokens = []
        received_tokens = []
        
        for transfer in token_transfers:
            if transfer['from'].lower() == tx['from'].lower():
                sent_tokens.append(transfer)
            elif transfer['to'].lower() == tx['from'].lower():
                received_tokens.append(transfer)
        
        if not sent_tokens or not received_tokens:
            return "Token swap (unable to determine direction)"
        
        # Filter out zero amounts
        sent_tokens = [t for t in sent_tokens if float(t['amount']) > 0]
        received_tokens = [t for t in received_tokens if float(t['amount']) > 0]
        
        if not sent_tokens or not received_tokens:
            return "Token swap (zero amounts detected)"
        
        # Check if this is a multi-step swap (more than 2 tokens involved)
        all_tokens = sent_tokens + received_tokens
        unique_tokens = set(t['token_info']['symbol'] for t in all_tokens)
        
        if len(unique_tokens) > 2:
            # This is likely a multi-step swap on Blackhole DEX
            sent_desc = ", ".join([f"{t['amount']} {t['token_info']['symbol']}" for t in sent_tokens])
            received_desc = ", ".join([f"{t['amount']} {t['token_info']['symbol']}" for t in received_tokens])
            
            # Try to identify the swap path
            path_tokens = []
            for transfer in all_tokens:
                if transfer['token_info']['symbol'] not in [t['token_info']['symbol'] for t in path_tokens]:
                    path_tokens.append(transfer)
            
            if len(path_tokens) > 2:
                path_desc = " → ".join([t['token_info']['symbol'] for t in path_tokens])
                return f"Blackhole DEX multi-step swap: {sent_desc} → {path_desc} → {received_desc}"
            else:
                return f"Blackhole DEX swap: {sent_desc} for {received_desc}"
        else:
            # Simple swap
            sent_desc = ", ".join([f"{t['amount']} {t['token_info']['symbol']}" for t in sent_tokens])
            received_desc = ", ".join([f"{t['amount']} {t['token_info']['symbol']}" for t in received_tokens])
            return f"Swapped {sent_desc} for {received_desc}"
    
    def describe_claim(self, token_transfers: List[Dict], tx: Dict) -> str:
        """Describe a claim transaction"""
        if not token_transfers:
            return "Claimed rewards (no token transfers detected)"
        
        # Filter out zero amounts
        non_zero_transfers = [t for t in token_transfers if float(t['amount']) > 0]
        
        claimed_tokens = []
        burned_tokens = []
        
        for transfer in non_zero_transfers:
            if transfer['to'].lower() == tx['from'].lower():
                claimed_tokens.append(f"{transfer['amount']} {transfer['token_info']['symbol']}")
            elif transfer['to'].lower() == '0x0000000000000000000000000000000000000000':
                # Tokens sent to zero address (burned)
                burned_tokens.append(f"{transfer['amount']} {transfer['token_info']['symbol']}")
        
        if claimed_tokens:
            # Check if this looks like a Blackhole DEX operation
            if any('BLACK' in token for token in claimed_tokens):
                # Check if there are any outgoing transfers (indicating restaking)
                outgoing_transfers = [t for t in non_zero_transfers if t['from'].lower() == tx['from'].lower()]
                if outgoing_transfers:
                    return f"Claimed and restaked Blackhole DEX Supermassive rewards: {', '.join(claimed_tokens)}"
                else:
                    return f"Claimed Blackhole DEX Supermassive rewards: {', '.join(claimed_tokens)}"
            else:
                # Check if this is voting rewards (multiple different token types)
                unique_symbols = set()
                for token in claimed_tokens:
                    symbol = token.split()[-1]  # Get the symbol part
                    unique_symbols.add(symbol)
                
                if len(unique_symbols) > 1:
                    return f"Claimed voting rewards: {', '.join(claimed_tokens)}"
                else:
                    return f"Claimed rewards: {', '.join(claimed_tokens)}"
        elif burned_tokens:
            # If no tokens were claimed but tokens were burned, this might be a burn/claim operation
            if any('BLACK' in token for token in burned_tokens):
                return f"Burned {', '.join(burned_tokens)} (claim operation)"
            else:
                return f"Burned {', '.join(burned_tokens)}"
        else:
            return "Claimed rewards (unable to determine amount)"
    
    def describe_transfer(self, token_transfers: List[Dict], tx: Dict) -> str:
        """Describe a transfer transaction"""
        if not token_transfers:
            return "Token transfer (no transfers detected)"
        
        transfer_desc = []
        for transfer in token_transfers:
            if transfer['from'].lower() == tx['from'].lower():
                transfer_desc.append(f"Sent {transfer['amount']} {transfer['token_info']['symbol']}")
            elif transfer['to'].lower() == tx['from'].lower():
                transfer_desc.append(f"Received {transfer['amount']} {transfer['token_info']['symbol']}")
        
        return "; ".join(transfer_desc) if transfer_desc else "Token transfer"
    
    def describe_approval(self, token_transfers: List[Dict], tx: Dict) -> str:
        """Describe an approval transaction"""
        if not token_transfers:
            return "Token approval (no token involved)"
        
        token = token_transfers[0]['token_info']['symbol']
        return f"Approved spending of {token} tokens"
    
    def describe_token_operation(self, token_transfers: List[Dict], tx: Dict) -> str:
        """Describe a general token operation"""
        if not token_transfers:
            return "Token operation (no transfers detected)"
        
        # Filter out zero amounts
        non_zero_transfers = [t for t in token_transfers if float(t['amount']) > 0]
        
        if not non_zero_transfers:
            return "Token operation (zero amounts detected)"
        
        # Check for Blackhole DEX specific patterns
        blackhole_tokens = [t for t in non_zero_transfers if 'BLACK' in t['token_info']['symbol']]
        
        # Check if this looks like a swap (sent some tokens, received others)
        sent_tokens = [t for t in non_zero_transfers if t['from'].lower() == tx['from'].lower()]
        received_tokens = [t for t in non_zero_transfers if t['to'].lower() == tx['from'].lower()]
        
        if sent_tokens and received_tokens:
            # This looks like a swap - check if it's a multi-step Blackhole DEX swap
            all_tokens = sent_tokens + received_tokens
            unique_tokens = set(t['token_info']['symbol'] for t in all_tokens)
            
            if len(unique_tokens) > 2:
                # Multi-step swap on Blackhole DEX
                sent_desc = ", ".join([f"{t['amount']} {t['token_info']['symbol']}" for t in sent_tokens])
                received_desc = ", ".join([f"{t['amount']} {t['token_info']['symbol']}" for t in received_tokens])
                
                # Create swap path
                path_tokens = []
                for transfer in all_tokens:
                    if transfer['token_info']['symbol'] not in [t['token_info']['symbol'] for t in path_tokens]:
                        path_tokens.append(transfer)
                
                if len(path_tokens) > 2:
                    path_desc = " → ".join([t['token_info']['symbol'] for t in path_tokens])
                    return f"Blackhole DEX multi-step swap: {sent_desc} → {path_desc} → {received_desc}"
                else:
                    return f"Blackhole DEX swap: {sent_desc} for {received_desc}"
            else:
                # Simple swap
                sent_desc = ", ".join([f"{t['amount']} {t['token_info']['symbol']}" for t in sent_tokens])
                received_desc = ", ".join([f"{t['amount']} {t['token_info']['symbol']}" for t in received_tokens])
                return f"Swapped {sent_desc} for {received_desc}"
        
        # Check if this looks like a Blackhole DEX claim/restake operation
        if blackhole_tokens and received_tokens:
            # Check if there are outgoing transfers (indicating restaking)
            if sent_tokens:
                claimed_amounts = [f"{t['amount']} {t['token_info']['symbol']}" for t in received_tokens if 'BLACK' in t['token_info']['symbol']]
                if claimed_amounts:
                    return f"Claimed and restaked Blackhole DEX Supermassive rewards: {', '.join(claimed_amounts)}"
            
            # Just claiming without restaking
            claimed_amounts = [f"{t['amount']} {t['token_info']['symbol']}" for t in received_tokens if 'BLACK' in t['token_info']['symbol']]
            if claimed_amounts:
                return f"Claimed Blackhole DEX Supermassive rewards: {', '.join(claimed_amounts)}"
        
        # Otherwise describe as individual operations
        operations = []
        for transfer in non_zero_transfers:
            if transfer['from'].lower() == tx['from'].lower():
                operations.append(f"Sent {transfer['amount']} {transfer['token_info']['symbol']}")
            elif transfer['to'].lower() == tx['from'].lower():
                operations.append(f"Received {transfer['amount']} {transfer['token_info']['symbol']}")
        
        return "; ".join(operations) if operations else "Token operation"
    
    def group_swap_sequences(self, transactions: List[Dict]) -> List[Dict]:
        """Group related transactions into swap sequences"""
        sequences = []
        i = 0
        
        while i < len(transactions):
            tx = transactions[i]
            classification = self.classify_transaction(tx)
            
            # Check if this is the start of a swap sequence (approval)
            if classification['type'] == 'approval':
                # Look ahead for the actual swap transaction
                sequence = [tx]
                j = i + 1
                
                # Look for the next non-approval transaction that might be the swap
                while j < len(transactions) and j < i + 3:  # Look up to 2 transactions ahead
                    next_tx = transactions[j]
                    next_classification = self.classify_transaction(next_tx)
                    
                    if next_classification['type'] in ['swap', 'token_operation']:
                        # Check if this looks like a swap
                        if self.is_swap_transaction(next_tx):
                            sequence.append(next_tx)
                            break
                    j += 1
                
                if len(sequence) > 1:
                    sequences.append({
                        'type': 'swap_sequence',
                        'transactions': sequence,
                        'description': self.describe_swap_sequence(sequence)
                    })
                    i = j + 1  # Skip the transactions we've grouped
                else:
                    sequences.append({
                        'type': 'approval',
                        'transactions': [tx],
                        'description': classification['description']
                    })
                    i += 1
            else:
                sequences.append({
                    'type': classification['type'],
                    'transactions': [tx],
                    'description': classification['description']
                })
                i += 1
        
        return sequences
    
    def is_swap_transaction(self, tx: Dict) -> bool:
        """Check if a transaction looks like a swap"""
        receipt = self.get_transaction_receipt(tx['hash'])
        if not receipt:
            return False
        
        logs = receipt.get('logs', [])
        token_transfers = []
        
        for log in logs:
            if len(log.get('topics', [])) >= 3 and log['topics'][0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef':
                from_addr = '0x' + log['topics'][1][-40:]
                to_addr = '0x' + log['topics'][2][-40:]
                value_hex = log['data']
                value = int(value_hex, 16)
                token_addr = log['address']
                
                if value > 0:  # Only non-zero transfers
                    token_transfers.append({
                        'from': from_addr,
                        'to': to_addr,
                        'value': value,
                        'token_address': token_addr
                    })
        
        # Check if there are both sent and received tokens
        sent_tokens = [t for t in token_transfers if t['from'].lower() == tx['from'].lower()]
        received_tokens = [t for t in token_transfers if t['to'].lower() == tx['from'].lower()]
        
        return len(sent_tokens) > 0 and len(received_tokens) > 0
    
    def describe_swap_sequence(self, sequence: List[Dict]) -> str:
        """Describe a complete swap sequence"""
        if len(sequence) < 2:
            return "Incomplete swap sequence"
        
        # The second transaction should be the actual swap
        swap_tx = sequence[1]
        receipt = self.get_transaction_receipt(swap_tx['hash'])
        
        if not receipt:
            return "Swap sequence (unable to analyze details)"
        
        # Analyze the swap transaction
        logs = receipt.get('logs', [])
        token_transfers = []
        
        for log in logs:
            if len(log.get('topics', [])) >= 3 and log['topics'][0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef':
                from_addr = '0x' + log['topics'][1][-40:]
                to_addr = '0x' + log['topics'][2][-40:]
                value_hex = log['data']
                value = int(value_hex, 16)
                token_addr = log['address']
                
                if value > 0:
                    token_info = self.get_token_info(token_addr)
                    formatted_amount = self.format_amount(value, token_info['decimals'])
                    
                    
                    token_transfers.append({
                        'from': from_addr,
                        'to': to_addr,
                        'amount': formatted_amount,
                        'token_info': token_info,
                        'token_address': token_addr
                    })
        
        # Find sent and received tokens
        sent_tokens = [t for t in token_transfers if t['from'].lower() == swap_tx['from'].lower()]
        received_tokens = [t for t in token_transfers if t['to'].lower() == swap_tx['from'].lower()]
        
        
        if not sent_tokens or not received_tokens:
            return "Blackhole DEX swap sequence (unable to determine details)"
        
        # Check if it's a multi-step swap
        all_tokens = sent_tokens + received_tokens
        unique_tokens = set(t['token_info']['symbol'] for t in all_tokens)
        
        sent_desc = ", ".join([f"{t['amount']} {t['token_info']['symbol']}" for t in sent_tokens])
        received_desc = ", ".join([f"{t['amount']} {t['token_info']['symbol']}" for t in received_tokens])
        
        if len(unique_tokens) > 2:
            # Multi-step swap
            path_tokens = []
            for transfer in all_tokens:
                if transfer['token_info']['symbol'] not in [t['token_info']['symbol'] for t in path_tokens]:
                    path_tokens.append(transfer)
            
            if len(path_tokens) > 2:
                path_desc = " → ".join([t['token_info']['symbol'] for t in path_tokens])
                return f"Blackhole DEX multi-step swap: {sent_desc} → {path_desc} → {received_desc}"
            else:
                return f"Blackhole DEX swap: {sent_desc} for {received_desc}"
        else:
            return f"Blackhole DEX swap: {sent_desc} for {received_desc}"

    def organize_activities(self, sequences: List[Dict]) -> Dict:
        """Organize sequences into logical activity groups"""
        activities = {
            'supermassive_claims': [],
            'voting_rewards': [],
            'swaps': [],
            'other': []
        }
        
        for sequence in sequences:
            if sequence['type'] == 'claim':
                # Check if it's Supermassive or voting rewards
                tx = sequence['transactions'][0]
                classification = self.classify_transaction(tx)
                if 'Supermassive' in classification['description']:
                    activities['supermassive_claims'].append(sequence)
                elif 'voting' in classification['description'].lower():
                    activities['voting_rewards'].append(sequence)
                else:
                    activities['other'].append(sequence)
            elif sequence['type'] == 'swap_sequence':
                activities['swaps'].append(sequence)
            elif sequence['type'] == 'swap':
                # Individual swap transactions
                activities['swaps'].append(sequence)
            else:
                activities['other'].append(sequence)
        
        return activities

    def generate_narrative(self, address: str, days: int = 1) -> str:
        """Generate a human-friendly narrative of recent transactions"""
        try:
            # Calculate time range
            end_time = datetime.now()
            start_time = end_time - timedelta(days=days)
            
            start_timestamp = int(start_time.timestamp())
            end_timestamp = int(end_time.timestamp())
            
            print(f"Analyzing transactions for {address} from {start_time.strftime('%Y-%m-%d')} to {end_time.strftime('%Y-%m-%d')}")
            
            # Get block range
            latest_block = self.get_latest_block_number()
            # Estimate blocks (2 seconds per block for Avalanche)
            blocks_ago = (int(time.time()) - start_timestamp) // 2
            start_block = max(0, latest_block - blocks_ago - 1000)  # Add buffer
            
            # Fetch transactions
            transactions = self.get_address_transactions(address, start_block, latest_block)
            print(f"Found {len(transactions)} total transactions")
            
            # Filter for recent transactions
            recent_transactions = []
            for tx in transactions:
                tx_timestamp = int(tx['timeStamp'])
                if start_timestamp <= tx_timestamp <= end_timestamp:
                    recent_transactions.append(tx)
            
            print(f"Found {len(recent_transactions)} transactions in the last {days} day(s)")
            
            if not recent_transactions:
                return f"# Transaction Narrative - {address}\n\nNo transactions found in the last {days} day(s).\n"
            
            # Group transactions into sequences (especially swap sequences)
            sequences = self.group_swap_sequences(recent_transactions)
            
            # Organize sequences into activity groups
            activities = self.organize_activities(sequences)
            
            # Generate narrative
            narrative = f"# Transaction Narrative - {address}\n\n"
            narrative += f"**Period:** {start_time.strftime('%B %d, %Y')} to {end_time.strftime('%B %d, %Y')}\n"
            narrative += f"**Total Transactions:** {len(recent_transactions)}\n\n"
            
            # Add activity summary
            narrative += "## Today's DeFi Activities\n\n"
            
            total_activities = sum(len(items) for items in activities.values())
            narrative += f"**Total Activities:** {total_activities}\n\n"
            
            # Tell the story in chronological order
            all_sequences = []
            for activity_type, sequences in activities.items():
                for seq in sequences:
                    all_sequences.append((activity_type, seq))
            
            # Sort by timestamp
            all_sequences.sort(key=lambda x: int(x[1]['transactions'][0]['timeStamp']))
            
            # Group by activity type for summary
            if activities['supermassive_claims']:
                narrative += f"### 🎯 Supermassive NFT Activities ({len(activities['supermassive_claims'])})\n"
                for seq in activities['supermassive_claims']:
                    tx = seq['transactions'][0]
                    timestamp_str = self.format_timestamp(int(tx['timeStamp']))
                    narrative += f"- **{timestamp_str}:** {seq['description']}\n"
                narrative += "\n"
            
            if activities['voting_rewards']:
                narrative += f"### 🗳️ Voting Rewards ({len(activities['voting_rewards'])})\n"
                for seq in activities['voting_rewards']:
                    tx = seq['transactions'][0]
                    timestamp_str = self.format_timestamp(int(tx['timeStamp']))
                    narrative += f"- **{timestamp_str}:** {seq['description']}\n"
                narrative += "\n"
            
            if activities['swaps']:
                narrative += f"### 🔄 Token Swaps ({len(activities['swaps'])})\n"
                for seq in activities['swaps']:
                    tx = seq['transactions'][0]
                    timestamp_str = self.format_timestamp(int(tx['timeStamp']))
                    narrative += f"- **{timestamp_str}:** {seq['description']}\n"
                narrative += "\n"
            
            if activities['other']:
                narrative += f"### 📋 Other Activities ({len(activities['other'])})\n"
                for seq in activities['other']:
                    tx = seq['transactions'][0]
                    timestamp_str = self.format_timestamp(int(tx['timeStamp']))
                    narrative += f"- **{timestamp_str}:** {seq['description']}\n"
                narrative += "\n"
            
            # Add detailed transaction log
            narrative += "## Detailed Transaction Log\n\n"
            
            for activity_type, sequence in all_sequences:
                if sequence['type'] == 'swap_sequence':
                    # Handle swap sequences
                    tx = sequence['transactions'][0]
                    timestamp_str = self.format_timestamp(int(tx['timeStamp']))
                    
                    narrative += f"### {timestamp_str} - Blackhole DEX Swap\n\n"
                    narrative += f"**Description:** {sequence['description']}\n"
                    narrative += f"**Steps:** {len(sequence['transactions'])} transaction(s)\n"
                    
                    for i, tx in enumerate(sequence['transactions']):
                        tx_link = f"[{tx['hash'][:10]}...](https://snowtrace.io/tx/{tx['hash']})"
                        step_name = "Approval" if i == 0 else f"Swap Step {i}"
                        narrative += f"- **{step_name}:** {tx_link}\n"
                    
                    narrative += "\n"
                else:
                    # Handle individual transactions
                    tx = sequence['transactions'][0]
                    timestamp_str = self.format_timestamp(int(tx['timeStamp']))
                    tx_link = f"[{tx['hash'][:10]}...](https://snowtrace.io/tx/{tx['hash']})"
                    
                    activity_emoji = {
                        'supermassive_claims': '🎯',
                        'voting_rewards': '🗳️',
                        'swaps': '🔄',
                        'other': '📋'
                    }.get(activity_type, '📋')
                    
                    narrative += f"### {timestamp_str} - {activity_emoji} {sequence['type'].replace('_', ' ').title()}\n\n"
                    narrative += f"**Transaction:** {tx_link}\n"
                    narrative += f"**Description:** {sequence['description']}\n"
                    narrative += "\n"
            
            return narrative
            
        except Exception as e:
            return f"Error generating narrative: {str(e)}"

def main():
    parser = argparse.ArgumentParser(description='Generate human-friendly transaction narratives for an Avalanche C-Chain address')
    parser.add_argument('address', help='Avalanche C-Chain address to analyze')
    parser.add_argument('-d', '--days', type=int, default=1, help='Number of days to analyze (default: 1)')
    parser.add_argument('-o', '--output', help='Output file (optional)')
    
    args = parser.parse_args()
    
    narrator = AvalancheTransactionNarrator()
    result = narrator.generate_narrative(args.address, args.days)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(result)
        print(f"Narrative written to {args.output}")
    else:
        print(result)

if __name__ == "__main__":
    main()