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
from typing import Dict, List, Tuple, Optional, Any, Union
import argparse
import pytz

from avalanche_utils import (
    SNOWTRACE_API_BASE, DEFAULT_HEADERS, KNOWN_TOKEN_METADATA, API_KEY_TOKEN,
    get_token_info, format_amount, format_timestamp,
    AvalancheAPIError, NetworkError, logger
)
from avalanche_base import AvalancheTool

# Version number (semantic versioning: MAJOR.MINOR.PATCH)
__version__ = "1.1.0"

class AvalancheTransactionNarrator(AvalancheTool):
    def __init__(self, snowtrace_api_base: Optional[str] = None, 
                 headers: Optional[Dict[str, str]] = None) -> None:
        """Initialize the transaction narrator"""
        super().__init__(snowtrace_api_base, headers)
        
        # Known contract addresses for classification with correct decimals (matches utility module)
        self.known_contracts: Dict[str, Dict[str, Union[str, int]]] = KNOWN_TOKEN_METADATA
        
        # Blackhole DEX specific contract addresses
        self.blackhole_contracts = {
            '0xeac562811cc6abdbb2c9ee88719eca4ee79ad763': 'VotingEscrow',
            '0x88a49cfcee0ed5b176073dde12186c4c922a9cd0': 'RewardsClaimer',
            '0x59aa177312ff6bdf39c8af6f46dae217bf76cbf6': 'RewardsDistributor',
            # Pool addresses
            '0xfd9a46c213532401ef61f8d34e67a3653b70837a': 'BlackholePool',
            '0x40435bdffa4e5b936788b33a2fd767105c67bef7': 'BlackholePool',
            # Router
            '0x04e1dee021cd12bba022a72806441b43d8212fec': 'BlackholeRouter',
        }
        
        # Cache for contract names we've looked up
        self._contract_name_cache = {}
        
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
            '0x379607f5': 'claimReward',  # Blackhole rewards claimer
            # Blackhole voting functions
            '0x7ac09bf7': 'vote',  # vote(uint256,address[],uint256[]) on Voter contract
            '0xd1c2babb': 'merge',  # merge(uint256,uint256) on VotingEscrow - merges locks
            '0x7715ee75': 'distributeRewards',  # Rewards distribution function
        }
    
    def get_address_transactions(self, address: str, start_block: int, end_block: int) -> List[Dict]:
        """Fetch all transactions for an address within a block range"""
        all_transactions = []
        page = 1
        offset = 10000
        
        while True:
            url = f"{self.snowtrace_api_base}?module=account&action=txlist&address={address}&startblock={start_block}&endblock={end_block}&page={page}&offset={offset}&sort=desc&apikey={API_KEY_TOKEN}"
            
            try:
                response = requests.get(url, headers=self.headers, timeout=self.get_api_timeout())
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
        url = f"{self.snowtrace_api_base}?module=proxy&action=eth_blockNumber&apikey={API_KEY_TOKEN}"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=self.get_api_timeout())
            response.raise_for_status()
            data = response.json()
            result = data.get('result', '0x0') or '0x0'
            if result == '0x':
                result = '0x0'
            return int(result, 16)
        except requests.RequestException as e:
            raise NetworkError(f"Failed to fetch latest block: {e}", original_error=e)
    
    def get_block_by_timestamp(self, timestamp: int) -> int:
        """
        Get block number closest to a given timestamp using Snowtrace API.
        
        Args:
            timestamp: Unix timestamp
            
        Returns:
            Block number closest to the timestamp
        """
        try:
            # Use Snowtrace API to get block by timestamp
            url = f"{self.snowtrace_api_base}?module=block&action=getblocknobytime&timestamp={timestamp}&closest=before&apikey={API_KEY_TOKEN}"
            response = requests.get(url, headers=self.headers, timeout=self.get_api_timeout())
            response.raise_for_status()
            data = response.json()
            
            if data.get('status') == '1':
                return int(data.get('result', '0'))
            else:
                logger.warning(f"API error getting block for timestamp {timestamp}: {data.get('message', 'Unknown error')}")
                # Fallback to estimation
                return self._estimate_block_by_timestamp(timestamp)
        except Exception as e:
            logger.warning(f"Error fetching block by timestamp: {e}")
            # Fallback to estimation
            return self._estimate_block_by_timestamp(timestamp)
    
    def _estimate_block_by_timestamp(self, timestamp: int) -> int:
        """
        Fallback method to estimate block number by timestamp.
        
        Args:
            timestamp: Unix timestamp
            
        Returns:
            Estimated block number
        """
        latest_block = self.get_latest_block_number()
        current_time = int(time.time())
        time_diff = current_time - timestamp
        blocks_ago = time_diff // 2  # 2 seconds per block for Avalanche
        return max(0, latest_block - blocks_ago)
    
    def get_token_info(self, token_address: str) -> Dict[str, Any]:
        """Get token information (name, symbol, decimals)"""
        return get_token_info(token_address, headers=self.headers, known_contracts=self.known_contracts)
    
    def get_transaction_receipt(self, tx_hash: str) -> Optional[Dict]:
        """Get transaction receipt with logs"""
        url = f"{self.snowtrace_api_base}?module=proxy&action=eth_getTransactionReceipt&txhash={tx_hash}&apikey={API_KEY_TOKEN}"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=self.get_api_timeout())
            response.raise_for_status()
            data = response.json()
            
            if 'error' in data:
                return None
                
            return data.get('result', {})
        except Exception as e:
            return None
    
    def format_amount(self, amount: int, decimals: int) -> str:
        """Format token amount with proper decimal places"""
        return format_amount(amount, decimals, precision='standard')
    
    def format_timestamp(self, timestamp: int) -> str:
        """Convert timestamp to human-readable format with both local and UTC times"""
        return format_timestamp(timestamp, include_utc=True)
    
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
        
        # Check transaction status (success/failure) from receipt
        if receipt:
            status_hex = receipt.get('status', '')
            if status_hex == '0x1':
                classification['status'] = 'success'
            elif status_hex == '0x0':
                classification['status'] = 'failed'
            
            # Get gas information
            if receipt.get('gasUsed'):
                gas_used_hex = receipt['gasUsed']
                classification['gas_used'] = int(gas_used_hex, 16) if isinstance(gas_used_hex, str) else gas_used_hex
            if receipt.get('gas'):
                gas_limit_hex = receipt['gas']
                classification['gas_limit'] = int(gas_limit_hex, 16) if isinstance(gas_limit_hex, str) else gas_limit_hex
        
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
                value_hex = log.get('data', '0x0')
                # Handle empty hex string ('0x')
                if value_hex == '0x' or not value_hex or len(value_hex) <= 2:
                    value = 0
                else:
                    try:
                        value = int(value_hex, 16)
                    except ValueError:
                        value = 0
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
                elif func_name == 'vote':
                    classification['type'] = 'vote'
                    classification['description'] = self.describe_vote(tx, token_transfers)
                elif func_name == 'merge':
                    classification['type'] = 'merge'
                    classification['description'] = self.describe_merge(tx, token_transfers, classification.get('status', 'unknown'))
                elif func_name == 'distributeRewards':
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
                # Try to classify based on contract address (Blackhole contracts)
                to_addr = tx.get('to', '').lower()
                if to_addr in self.blackhole_contracts:
                    contract_name = self.blackhole_contracts[to_addr]
                    if contract_name == 'VotingEscrow' and classification['type'] == 'unknown':
                        # Check function signature to distinguish vote vs merge
                        input_data = tx.get('input', '')
                        func_sig = input_data[:10] if len(input_data) >= 10 else ''
                        if func_sig == '0x7ac09bf7':
                            classification['type'] = 'vote'
                            classification['description'] = self.describe_vote(tx, token_transfers)
                        elif func_sig == '0xd1c2babb':
                            classification['type'] = 'merge'
                            classification['description'] = self.describe_merge(tx, token_transfers)
                        else:
                            # Could be a vote, but check transaction input length
                            # vote() has long input (arrays), merge() is short (2 uint256)
                            if len(input_data) > 200:
                                classification['type'] = 'vote'
                                classification['description'] = self.describe_vote(tx, token_transfers)
                            elif len(input_data) >= 138:
                                classification['type'] = 'merge'
                                classification['description'] = self.describe_merge(tx, token_transfers, classification.get('status', 'unknown'))
                    elif contract_name in ['RewardsClaimer', 'RewardsDistributor'] and classification['type'] == 'unknown':
                        classification['type'] = 'claim'
                        classification['description'] = self.describe_claim(token_transfers, tx)
                
                # Try to classify based on token transfers
                if classification['type'] == 'unknown':
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
                path_desc = " ? ".join([t['token_info']['symbol'] for t in path_tokens])
                return f"Blackhole DEX multi-step swap: {sent_desc} ? {path_desc} ? {received_desc}"
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
        # The token address is the 'to' address in the transaction
        token_address = tx.get('to', '')
        if not token_address:
            return "Token approval (no token address)"
        
        # Get token info
        token_info = self.get_token_info(token_address)
        token_symbol = token_info.get('symbol', 'Unknown Token')
        
        # Decode approval parameters: approve(address spender, uint256 amount)
        # Function signature: 0x095ea7b3
        # Input: 0x095ea7b3 + 32 bytes spender + 32 bytes amount
        input_data = tx.get('input', '')
        if len(input_data) >= 138:  # 10 (function sig) + 64 (spender) + 64 (amount)
            try:
                spender_hex = input_data[10:74]  # Skip function sig (10 chars)
                amount_hex = input_data[74:138]
                
                spender_address = '0x' + spender_hex[-40:].lower()
                amount = int(amount_hex, 16)
                
                # Format amount based on token decimals
                decimals = token_info.get('decimals', 18)
                formatted_amount = self.format_amount(amount, decimals)
                
                # Get spender info if it's a known contract
                spender_name = None
                spender_address_lower = spender_address.lower()
                
                # Check cache first
                if spender_address_lower in self._contract_name_cache:
                    spender_name = self._contract_name_cache[spender_address_lower]
                else:
                    # Check blackhole contracts first
                    spender_name = self.blackhole_contracts.get(spender_address_lower)
                    # Also check known contracts (for tokens, but some might be contracts)
                    if not spender_name:
                        spender_info = self.known_contracts.get(spender_address_lower, {})
                        spender_name = spender_info.get('name', '')
                    
                    # If still not found, try looking up from Snowtrace API
                    if not spender_name:
                        try:
                            url = f"{self.snowtrace_api_base}?module=contract&action=getsourcecode&address={spender_address}&apikey={API_KEY_TOKEN}"
                            response = requests.get(url, headers=self.headers, timeout=self.get_api_timeout())
                            if response.status_code == 200:
                                data = response.json()
                                result = data.get('result', [{}])
                                if result:
                                    contract_name = result[0].get('ContractName', '')
                                    if contract_name and contract_name != '':
                                        spender_name = contract_name
                        except Exception:
                            pass  # Silently fail - we'll just show the address
                    
                    # Cache the result (even if None)
                    self._contract_name_cache[spender_address_lower] = spender_name
                
                if spender_name:
                    spender_desc = spender_name
                else:
                    spender_desc = f"{spender_address[:8]}...{spender_address[-6:]}"
                
                # Handle infinite approvals (max uint256 = 2^256 - 1)
                # Typical infinite approvals are exactly max uint256 or very close to it
                MAX_UINT256 = 2**256 - 1
                if amount == MAX_UINT256 or amount >= MAX_UINT256 - 10**15:
                    return f"Approved {spender_desc} to spend unlimited {token_symbol}"
                elif amount == 0:
                    return f"Revoked approval for {spender_desc} to spend {token_symbol}"
                else:
                    return f"Approved {spender_desc} to spend {formatted_amount} {token_symbol}"
            except (ValueError, IndexError):
                pass
        
        # Fallback: at least show the token
        return f"Approved spending of {token_symbol} tokens"
    
    def describe_vote(self, tx: Dict, token_transfers: List[Dict]) -> str:
        """Describe a voting transaction"""
        to_address = tx.get('to', '').lower()
        
        # Check if this is a Blackhole voting transaction
        # vote() goes to voter contract, not VotingEscrow
        voter_contracts = [
            '0xe30d0c8532721551a51a9fec7fb233759964d9e3',  # Voter proxy
            '0x6bd81e7eafa4b21d5ad069b452ab4b8bb40c4525'    # Voter implementation
        ]
        
        if to_address in [c.lower() for c in voter_contracts]:
            return "Voted on Blackhole DEX pools"
        
        return "Voted on pools"
    
    def describe_merge(self, tx: Dict, token_transfers: List[Dict], status: str = 'unknown') -> str:
        """Describe a merge transaction (merging NFT locks)"""
        to_address = tx.get('to', '').lower()
        voting_escrow = '0xeac562811cc6abdbb2c9ee88719eca4ee79ad763'
        
        base_desc = "Merged veBLACK locks"
        if to_address == voting_escrow.lower():
            # Try to decode merge parameters
            input_data = tx.get('input', '')
            if len(input_data) >= 138:
                try:
                    from_token = int(input_data[10:74], 16)
                    to_token = int(input_data[74:138], 16)
                    base_desc = f"Merged veBLACK lock #{from_token} into lock #{to_token}"
                except (ValueError, IndexError):
                    pass
        
        # Add status indicator
        if status == 'failed':
            return f"{base_desc} [FAILED]"
        elif status == 'success':
            return base_desc
        
        return base_desc
    
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
                    path_desc = " ? ".join([t['token_info']['symbol'] for t in path_tokens])
                    return f"Blackhole DEX multi-step swap: {sent_desc} ? {path_desc} ? {received_desc}"
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
                value_hex = log.get('data', '0x0')
                # Handle empty hex string ('0x')
                if value_hex == '0x' or not value_hex or len(value_hex) <= 2:
                    value = 0
                else:
                    try:
                        value = int(value_hex, 16)
                    except ValueError:
                        value = 0
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
                value_hex = log.get('data', '0x0')
                # Handle empty hex string ('0x')
                if value_hex == '0x' or not value_hex or len(value_hex) <= 2:
                    value = 0
                else:
                    try:
                        value = int(value_hex, 16)
                    except ValueError:
                        value = 0
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
                path_desc = " ? ".join([t['token_info']['symbol'] for t in path_tokens])
                return f"Blackhole DEX multi-step swap: {sent_desc} ? {path_desc} ? {received_desc}"
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
            
            # Get block range using API (more accurate than estimation)
            latest_block = self.get_latest_block_number()
            
            # Use API to get exact block numbers for timestamps (more accurate)
            try:
                start_block = self.get_block_by_timestamp(start_timestamp)
                end_block = self.get_block_by_timestamp(end_timestamp)
                # Add buffer to ensure we don't miss transactions
                start_block = max(0, start_block - 1000)  # 1000 blocks before start
                end_block = min(latest_block, end_block + 1000)  # 1000 blocks after end
            except Exception as e:
                # Fallback to estimation if API call fails
                logger.warning(f"Failed to get blocks by timestamp, using estimation: {e}")
                blocks_ago = (int(time.time()) - start_timestamp) // 2
                start_block = max(0, latest_block - blocks_ago - 2000)  # Larger buffer for estimation
                end_block = latest_block
            
            logger.debug(f"Block range: {start_block} to {end_block}")
            
            # Fetch transactions
            transactions = self.get_address_transactions(address, start_block, end_block)
            logger.info(f"Found {len(transactions)} total transactions in block range")
            
            # Filter for recent transactions
            recent_transactions = []
            for tx in transactions:
                tx_timestamp = int(tx['timeStamp'])
                if start_timestamp <= tx_timestamp <= end_timestamp:
                    recent_transactions.append(tx)
            
            logger.info(f"Found {len(recent_transactions)} transactions in the last {days} day(s)")
            
            if not recent_transactions:
                # If no transactions found in narrow range, try wider range to see if address has any recent activity
                if not transactions:
                    # Try a much wider range (last 30 days) to check if address is active
                    logger.debug("No transactions in narrow range, checking wider range...")
                    wider_start_block = max(0, latest_block - (30 * 24 * 60 * 60 // 2))  # ~30 days
                    wider_transactions = self.get_address_transactions(address, wider_start_block, latest_block)
                    
                    if wider_transactions:
                        # Address has transactions but not in requested range
                        newest_tx = max(wider_transactions, key=lambda x: int(x.get('timeStamp', 0)))
                        newest_ts = int(newest_tx.get('timeStamp', 0))
                        newest_dt = datetime.fromtimestamp(newest_ts) if newest_ts else None
                        
                        msg = f"# Transaction Narrative - {address}\n\n"
                        msg += f"No transactions found in the last {days} day(s).\n\n"
                        if newest_dt:
                            days_since_last = (datetime.now() - newest_dt).days
                            msg += f"**Note:** This address has transactions, but the most recent one was {days_since_last} day(s) ago.\n"
                            msg += f"- Most recent transaction: {newest_dt.strftime('%B %d, %Y at %I:%M %p UTC')}\n"
                            msg += f"- Requested range: {start_time.strftime('%B %d, %Y')} to {end_time.strftime('%B %d, %Y')}\n\n"
                            msg += f"Try using `-d {days_since_last + 1}` or more days to see these transactions.\n"
                        else:
                            msg += f"Try increasing the days with `-d {days + 7}`.\n"
                        return msg
                    else:
                        # No transactions found at all
                        return f"# Transaction Narrative - {address}\n\nNo transactions found in the last {days} day(s).\n\n**Note:** No transactions were found for this address. The address may be inactive or new.\n"
                else:
                    # Found transactions but outside date range - provide helpful message
                    newest_tx = max(transactions, key=lambda x: int(x.get('timeStamp', 0)))
                    newest_ts = int(newest_tx.get('timeStamp', 0))
                    newest_dt = datetime.fromtimestamp(newest_ts) if newest_ts else None
                    
                    msg = f"# Transaction Narrative - {address}\n\n"
                    msg += f"No transactions found in the last {days} day(s).\n\n"
                    if newest_dt:
                        days_since = (datetime.now() - newest_dt).days
                        msg += f"**Note:** This address has transactions, but they are outside the requested date range.\n"
                        msg += f"- Most recent transaction: {newest_dt.strftime('%B %d, %Y at %I:%M %p UTC')} ({days_since} day(s) ago)\n"
                        msg += f"- Requested range: {start_time.strftime('%B %d, %Y')} to {end_time.strftime('%B %d, %Y')}\n\n"
                        msg += f"Try using `-d {days_since + 1}` or more days to see these transactions.\n"
                    else:
                        msg += f"Try increasing the days with `-d {days + 7}`.\n"
                    return msg
            
            # Group transactions into sequences (especially swap sequences)
            sequences = self.group_swap_sequences(recent_transactions)
            
            # Classify all transactions to get status info before organizing
            # This ensures status is available when generating descriptions
            for sequence in sequences:
                for tx in sequence['transactions']:
                    # Pre-classify to ensure status is available
                    _ = self.classify_transaction(tx)
            
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
                narrative += f"### [NFT] Supermassive NFT Activities ({len(activities['supermassive_claims'])})\n"
                for seq in activities['supermassive_claims']:
                    tx = seq['transactions'][0]
                    timestamp_str = self.format_timestamp(int(tx['timeStamp']))
                    narrative += f"- **{timestamp_str}:** {seq['description']}\n"
                narrative += "\n"
            
            if activities['voting_rewards']:
                narrative += f"### ??? Voting Rewards ({len(activities['voting_rewards'])})\n"
                for seq in activities['voting_rewards']:
                    tx = seq['transactions'][0]
                    timestamp_str = self.format_timestamp(int(tx['timeStamp']))
                    narrative += f"- **{timestamp_str}:** {seq['description']}\n"
                narrative += "\n"
            
            if activities['swaps']:
                narrative += f"### [SWAP] Token Swaps ({len(activities['swaps'])})\n"
                for seq in activities['swaps']:
                    tx = seq['transactions'][0]
                    timestamp_str = self.format_timestamp(int(tx['timeStamp']))
                    narrative += f"- **{timestamp_str}:** {seq['description']}\n"
                narrative += "\n"
            
            if activities['other']:
                narrative += f"### [TX] Other Activities ({len(activities['other'])})\n"
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
                    
                    activity_indicator = {
                        'supermassive_claims': '[NFT]',
                        'voting_rewards': '[REWARD]',
                        'swaps': '[SWAP]',
                        'other': '[TX]'
                    }.get(activity_type, '[TX]')
                    
                    # Get transaction status
                    tx_classification = self.classify_transaction(tx)
                    status = tx_classification.get('status', 'unknown')
                    status_indicator = ''
                    if status == 'failed':
                        status_indicator = ' [FAILED]'
                    elif status == 'success':
                        status_indicator = ' [SUCCESS]'
                    
                    narrative += f"### {timestamp_str} - {activity_indicator} {sequence['type'].replace('_', ' ').title()}{status_indicator}\n\n"
                    narrative += f"**Transaction:** {tx_link}\n"
                    narrative += f"**Description:** {sequence['description']}\n"
                    
                    # Add gas information for failed transactions
                    if status == 'failed':
                        gas_used = tx_classification.get('gas_used')
                        gas_limit = tx_classification.get('gas_limit')
                        if gas_used:
                            narrative += f"**Gas Used:** {gas_used:,}"
                            if gas_limit:
                                pct = (gas_used / gas_limit * 100) if gas_limit > 0 else 0
                                narrative += f" / {gas_limit:,} ({pct:.1f}%)\n"
                            else:
                                narrative += "\n"
                        narrative += "**Reason:** Transaction reverted (likely insufficient gas limit)\n"
                    
                    narrative += "\n"
            
            return narrative
            
        except Exception as e:
            return f"Error generating narrative: {str(e)}"

def main():
    parser = argparse.ArgumentParser(description='Generate human-friendly transaction narratives for an Avalanche C-Chain address')
    parser.add_argument('address', help='Avalanche C-Chain address to analyze')
    parser.add_argument('-d', '--days', type=int, default=1, help='Number of days to analyze (default: 1)')
    parser.add_argument('-o', '--output', help='Output file (optional)')
    parser.add_argument(
        '--version',
        action='version',
        version=f'%(prog)s {__version__}'
    )
    
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