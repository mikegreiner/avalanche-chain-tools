#!/usr/bin/env python3
"""
Blackhole DEX Pool Voter

This module provides automated voting functionality for Blackhole DEX liquidity pools.
It integrates with the pool recommender to automatically vote on recommended pools.

Security Features:
- Secure private key management via environment variables
- Dry-run mode for testing without sending transactions
- Transaction validation before signing
- Comprehensive logging and audit trail
- Manual confirmation option

Usage:
    # Dry-run mode (simulate voting)
    python3 blackhole_voter.py --dry-run --pools-json recommendations.json
    
    # Live voting (requires confirmation)
    python3 blackhole_voter.py --pools-json recommendations.json --confirm
"""

import os
import json
import sys
import logging
from typing import List, Dict, Optional, Tuple
from decimal import Decimal, getcontext
from dataclasses import dataclass, asdict
from datetime import datetime
import argparse

try:
    from web3 import Web3
    try:
        from web3.middleware import geth_poa_middleware
    except ImportError:
        # web3.py v6+ uses different middleware structure
        # POA middleware is now built-in for Avalanche
        geth_poa_middleware = None  # Will skip middleware injection if not available
    from eth_account import Account
    WEB3_AVAILABLE = True
except ImportError:
    WEB3_AVAILABLE = False
    geth_poa_middleware = None
    print("Warning: web3 not available. Install with: pip install web3 eth-account")

# Import from existing modules
try:
    from avalanche_utils import logger, load_config
    _config = load_config()
except ImportError:
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    _config = {}

# Version
__version__ = "1.0.0"

# Set precision for decimal calculations
_precision = _config.get('decimal_precision', 50)
getcontext().prec = _precision

# Avalanche C-Chain RPC endpoint (public)
AVALANCHE_RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
AVALANCHE_CHAIN_ID = 43114  # Avalanche C-Chain

@dataclass
class VotePlan:
    """Represents a voting plan for a single pool"""
    pool_name: str
    pool_id: str  # Contract address or identifier
    voting_percentage: float  # Percentage of voting power (0-100)
    estimated_reward: Optional[float] = None  # USD value
    pool_type: Optional[str] = None
    

@dataclass
class TransactionDetails:
    """Details of a transaction to be executed"""
    function_name: str
    contract_address: str
    parameters: Dict
    estimated_gas: Optional[int] = None
    gas_price: Optional[int] = None
    nonce: Optional[int] = None
    tx_hash: Optional[str] = None


class BlackholeVoter:
    """
    Automated voting system for Blackhole DEX pools.
    
    Features:
    - Secure key management
    - Dry-run mode
    - Transaction validation
    - Gas estimation
    - Nonce management
    """
    
    def __init__(
        self,
        private_key: Optional[str] = None,
        rpc_url: Optional[str] = None,
        voting_contract_address: Optional[str] = None,
        dry_run: bool = True
    ):
        """
        Initialize the voter.
        
        Args:
            private_key: Private key for signing transactions (or from env)
            rpc_url: Avalanche RPC URL (defaults to public endpoint)
            voting_contract_address: Voting contract address (or from config)
            dry_run: If True, simulate transactions without sending
        """
        if not WEB3_AVAILABLE:
            raise ImportError(
                "web3 and eth-account required. Install with: pip install web3 eth-account"
            )
        
        # Load configuration
        voting_config = _config.get('blackhole_voter', {})
        
        # Get private key from parameter or environment
        if private_key is None:
            private_key = os.getenv('BLACKHOLE_VOTER_PRIVATE_KEY')
        
        if private_key is None:
            raise ValueError(
                "Private key required. Set BLACKHOLE_VOTER_PRIVATE_KEY environment variable "
                "or pass via --private-key (NOT RECOMMENDED - use env var)"
            )
        
        # Remove '0x' prefix if present
        if private_key.startswith('0x'):
            private_key = private_key[2:]
        
        # Initialize account
        try:
            self.account = Account.from_key(private_key)
            self.wallet_address = self.account.address
        except Exception as e:
            raise ValueError(f"Invalid private key: {e}")
        
        # Initialize Web3 connection
        self.rpc_url = rpc_url or voting_config.get('rpc_url', AVALANCHE_RPC_URL)
        self.w3 = Web3(Web3.HTTPProvider(self.rpc_url))
        
        # Add POA middleware for Avalanche (if available)
        if geth_poa_middleware is not None:
            try:
                self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
            except Exception:
                # Middleware injection may fail in newer web3.py versions
                # Avalanche is EVM-compatible, may not need POA middleware
                pass
        
        # Verify connection
        if not self.w3.is_connected():
            raise ConnectionError(f"Failed to connect to Avalanche RPC: {self.rpc_url}")
        
        logger.info(f"Connected to Avalanche C-Chain at {self.rpc_url}")
        logger.info(f"Wallet address: {self.wallet_address}")
        
        # Voting contract address
        self.voting_contract_address = (
            voting_contract_address or 
            voting_config.get('voting_contract_address') or
            _config.get('blackhole', {}).get('voting_contract')
        )
        
        if not self.voting_contract_address and not dry_run:
            raise ValueError(
                "Voting contract address required. Set in config.yaml under "
                "blackhole_voter.voting_contract_address or blackhole.voting_contract"
            )
        
        self.dry_run = dry_run
        if dry_run:
            logger.warning("DRY-RUN MODE: Transactions will be simulated but not sent")
        
        # Contract ABI - try to load from file if not in config
        # Load voter contract ABI (for voting)
        self.voting_contract_abi = voting_config.get('voting_contract_abi')
        if not self.voting_contract_abi:
            # Try to load from saved ABI file
            try:
                import json
                abi_file = 'voter_contract_abi.json'
                with open(abi_file, 'r') as f:
                    self.voting_contract_abi = json.load(f)
                    logger.info(f"Loaded voter contract ABI from {abi_file}")
            except FileNotFoundError:
                logger.warning("No voter ABI file found - save ABI to voter_contract_abi.json")
            except Exception as e:
                logger.warning(f"Could not load voter ABI file: {e}")
        
        # Load VotingEscrow address and ABI (for token ID queries)
        self.voting_escrow_address = (
            voting_config.get('voting_escrow_address') or
            _config.get('blackhole', {}).get('voting_escrow')
        )
        
        self.voting_escrow_abi = None
        if self.voting_escrow_address:
            try:
                import json
                escrow_abi_file = 'voting_contract_abi.json'
                with open(escrow_abi_file, 'r') as f:
                    self.voting_escrow_abi = json.load(f)
                    logger.info(f"Loaded VotingEscrow ABI from {escrow_abi_file}")
            except FileNotFoundError:
                logger.warning("VotingEscrow ABI not found - token ID queries may not work")
            except Exception as e:
                logger.warning(f"Could not load VotingEscrow ABI: {e}")
        
        if self.voting_contract_address:
            self.contract = self._load_contract()
        else:
            self.contract = None
            logger.warning("No voting contract address configured - using placeholder")
        
        # Load VotingEscrow contract for token ID queries
        if self.voting_escrow_address and self.voting_escrow_abi:
            try:
                self.escrow_contract = self.w3.eth.contract(
                    address=Web3.to_checksum_address(self.voting_escrow_address),
                    abi=self.voting_escrow_abi
                )
                logger.info(f"Loaded VotingEscrow contract: {self.voting_escrow_address}")
            except Exception as e:
                logger.warning(f"Failed to load VotingEscrow contract: {e}")
                self.escrow_contract = None
        else:
            self.escrow_contract = None
    
    def _load_contract(self):
        """Load the voting contract"""
        if not self.voting_contract_address:
            return None
        
        if not self.voting_contract_abi:
            logger.warning("No contract ABI configured - contract interactions may be limited")
            return None
        
        try:
            contract = self.w3.eth.contract(
                address=Web3.to_checksum_address(self.voting_contract_address),
                abi=self.voting_contract_abi
            )
            logger.info(f"Loaded voting contract: {self.voting_contract_address}")
            return contract
        except Exception as e:
            logger.error(f"Failed to load contract: {e}")
            return None
    
    def get_balance(self) -> Decimal:
        """Get AVAX balance of wallet"""
        balance_wei = self.w3.eth.get_balance(self.wallet_address)
        balance_avax = Web3.from_wei(balance_wei, 'ether')
        return Decimal(str(balance_avax))
    
    def get_voting_power(self) -> Optional[Decimal]:
        """
        Get current veBLACK voting power.
        
        VotingEscrow contract's getVotes(address) returns voting power.
        Returns None if contract is not configured.
        """
        if not self.escrow_contract:
            logger.warning("VotingEscrow contract not loaded - cannot check voting power")
            return None
        
        try:
            # getVotes(address) returns current voting power
            voting_power_wei = self.escrow_contract.functions.getVotes(self.wallet_address).call()
            voting_power = Decimal(str(voting_power_wei)) / Decimal('10') ** Decimal('18')
            logger.info(f"Current voting power: {voting_power} veBLACK")
            return voting_power
        except Exception as e:
            logger.warning(f"Could not get voting power: {e}")
            return None
    
    def get_lock_token_ids(self) -> List[int]:
        """
        Get list of lock token IDs for this wallet.
        
        VotingEscrow uses NFT-based locks. Queries ERC-721 balanceOf and tokenOfOwnerByIndex.
        
        Returns:
            List of token IDs (empty if no locks or contract not loaded)
        """
        if not self.escrow_contract:
            logger.warning("VotingEscrow contract not loaded - cannot get token IDs")
            return []
        
        try:
            # Get balance of NFTs owned by this wallet
            balance = self.escrow_contract.functions.balanceOf(self.wallet_address).call()
            
            if balance == 0:
                logger.info("No lock tokens found for this wallet")
                return []
            
            # Get each token ID
            token_ids = []
            for i in range(balance):
                try:
                    token_id = self.escrow_contract.functions.tokenOfOwnerByIndex(
                        self.wallet_address, i
                    ).call()
                    token_ids.append(token_id)
                except Exception as e:
                    logger.warning(f"Could not get token ID at index {i}: {e}")
            
            logger.info(f"Found {len(token_ids)} lock token ID(s): {token_ids}")
            return token_ids
            
        except Exception as e:
            logger.warning(f"Could not get lock token IDs: {e}")
            return []
    
    def prepare_vote_transaction(
        self,
        vote_plans: List[VotePlan],
        token_id: Optional[int] = None
    ) -> TransactionDetails:
        """
        Prepare a vote transaction for multiple pools.
        
        Args:
            vote_plans: List of voting plans (one or more pools)
            token_id: Lock token ID to vote with (if None, uses first available)
            
        Returns:
            TransactionDetails object with all transaction information
            
        Raises:
            ValueError: If contract not loaded, no token ID, or invalid parameters
        """
        if not self.contract:
            raise ValueError("Voting contract not loaded. Configure contract address and ABI.")
        
        # Get token ID if not provided
        if token_id is None:
            token_ids = self.get_lock_token_ids()
            if not token_ids:
                raise ValueError(
                    "No lock token ID found. Create a lock first or specify token_id."
                )
            token_id = token_ids[0]
            logger.info(f"Using token ID: {token_id}")
        
        # Extract pool addresses and weights from vote plans
        pool_addresses = []
        weights = []
        total_percentage = sum(vp.voting_percentage for vp in vote_plans)
        
        # Normalize percentages to ensure they sum to 100
        if abs(total_percentage - 100.0) > 0.01:  # Allow small floating point errors
            logger.warning(
                f"Voting percentages sum to {total_percentage}%, normalizing to 100%"
            )
            # Normalize weights (will be re-normalized by contract, but this helps)
            normalization_factor = 100.0 / total_percentage if total_percentage > 0 else 1.0
        else:
            normalization_factor = 1.0
        
        for vote_plan in vote_plans:
            # Pool ID should be the contract address
            pool_address = vote_plan.pool_id
            if not pool_address.startswith('0x'):
                raise ValueError(
                    f"Pool ID must be a contract address (got: {pool_address}). "
                    f"Pool name: {vote_plan.pool_name}"
                )
            
            # Convert percentage to weight (using scale of 1000 = 100%)
            # Contract will normalize, but we use a consistent scale
            weight = int(vote_plan.voting_percentage * normalization_factor * 10)
            if weight == 0 and vote_plan.voting_percentage > 0:
                weight = 1  # Minimum weight of 1 for non-zero percentage
            
            pool_addresses.append(Web3.to_checksum_address(pool_address))
            weights.append(weight)
        
        logger.info(f"Preparing vote for {len(vote_plans)} pool(s) with token ID {token_id}")
        logger.info(f"Pools: {[vp.pool_name for vp in vote_plans]}")
        logger.info(f"Weights: {weights}")
        
        # Get nonce
        nonce = self.w3.eth.get_transaction_count(self.wallet_address)
        
        # Build the vote() function call
        try:
            # Use web3 contract to encode function call
            function_call = self.contract.functions.vote(
                token_id,
                pool_addresses,
                weights
            )
            
            # Estimate gas
            try:
                if not self.dry_run:
                    estimated_gas = function_call.estimate_gas({'from': self.wallet_address})
                    # Add 20% buffer for safety
                    estimated_gas = int(estimated_gas * 1.2)
                else:
                    # In dry-run, we can't estimate gas (dummy address has no state)
                    # Use default gas based on array size: ~100k base + ~50k per pool
                    estimated_gas = 100000 + (len(vote_plans) * 50000)
            except Exception as e:
                logger.warning(f"Could not estimate gas: {e}, using default")
                # Default gas based on array size: ~100k base + ~50k per pool
                estimated_gas = 100000 + (len(vote_plans) * 50000)
            
            # Get current gas price
            try:
                gas_price_wei = self.w3.eth.gas_price
            except Exception:
                # Fallback gas price (in gwei)
                gas_price_gwei = 30
                gas_price_wei = Web3.to_wei(gas_price_gwei, 'gwei')
            
            # Build transaction
            transaction = function_call.build_transaction({
                'from': self.wallet_address,
                'nonce': nonce,
                'gas': estimated_gas,
                'gasPrice': gas_price_wei,
                'chainId': AVALANCHE_CHAIN_ID
            })
            
            # Extract encoded data for dry-run comparison
            encoded_data = transaction.get('data', '')
            
            return TransactionDetails(
                function_name="vote",
                contract_address=self.voting_contract_address,
                parameters={
                    "token_id": token_id,
                    "pool_addresses": pool_addresses,
                    "weights": weights,
                    "encoded_data": encoded_data  # For testing
                },
                estimated_gas=estimated_gas,
                gas_price=gas_price_wei,
                nonce=nonce
            )
            
        except Exception as e:
            logger.error(f"Failed to prepare vote transaction: {e}")
            raise ValueError(f"Could not prepare vote transaction: {e}")
    
    def simulate_vote(
        self,
        vote_plans: List[VotePlan],
        token_id: Optional[int] = None
    ) -> Dict:
        """
        Simulate a vote transaction without sending it.
        
        Args:
            vote_plans: List of voting plans
            token_id: Lock token ID (if None, uses first available)
        
        Returns:
            Dictionary with simulation results including encoded transaction data
        """
        tx_details = self.prepare_vote_transaction(vote_plans, token_id)
        
        estimated_cost = tx_details.estimated_gas * tx_details.gas_price
        estimated_cost_avax = Web3.from_wei(estimated_cost, 'ether')
        
        return {
            "vote_plans": [asdict(vp) for vp in vote_plans],
            "transaction": asdict(tx_details),
            "estimated_cost_avax": str(estimated_cost_avax),
            "estimated_cost_usd": None,  # Could fetch AVAX price
            "status": "simulated",
            "encoded_data": tx_details.parameters.get("encoded_data", "")
        }
    
    def execute_vote(
        self,
        vote_plans: List[VotePlan],
        token_id: Optional[int] = None,
        confirm: bool = True
    ) -> Dict:
        """
        Execute a vote transaction.
        
        Args:
            vote_plans: List of voting plans (can be single pool or multiple)
            token_id: Lock token ID (if None, uses first available)
            confirm: If True, require manual confirmation before sending
            
        Returns:
            Dictionary with transaction results
        """
        if self.dry_run:
            logger.info("DRY-RUN: Simulating vote")
            return self.simulate_vote(vote_plans, token_id)
        
        tx_details = self.prepare_vote_transaction(vote_plans, token_id)
        
        # Display transaction details
        logger.info(f"\n{'='*60}")
        logger.info(f"Vote Transaction Details")
        logger.info(f"{'='*60}")
        logger.info(f"Token ID: {tx_details.parameters['token_id']}")
        logger.info(f"Pools ({len(vote_plans)}):")
        for vp in vote_plans:
            logger.info(f"  - {vp.pool_name}: {vp.voting_percentage}%")
        logger.info(f"Contract: {tx_details.contract_address}")
        logger.info(f"Gas Limit: {tx_details.estimated_gas}")
        logger.info(f"Gas Price: {Web3.from_wei(tx_details.gas_price, 'gwei')} gwei")
        logger.info(f"Nonce: {tx_details.nonce}")
        
        estimated_cost = tx_details.estimated_gas * tx_details.gas_price
        estimated_cost_avax = Web3.from_wei(estimated_cost, 'ether')
        logger.info(f"Estimated Cost: {estimated_cost_avax} AVAX")
        logger.info(f"{'='*60}\n")
        
        if confirm:
            response = input("Confirm transaction? (yes/no): ")
            if response.lower() not in ['yes', 'y']:
                logger.info("Transaction cancelled by user")
                return {
                    "status": "cancelled",
                    "vote_plans": [asdict(vp) for vp in vote_plans]
                }
        
        # Build and sign transaction using contract
        try:
            # Use contract to build transaction
            token_id = tx_details.parameters['token_id']
            pool_addresses = tx_details.parameters['pool_addresses']
            weights = tx_details.parameters['weights']
            
            function_call = self.contract.functions.vote(
                token_id,
                pool_addresses,
                weights
            )
            
            transaction = function_call.build_transaction({
                'from': self.wallet_address,
                'nonce': tx_details.nonce,
                'gas': tx_details.estimated_gas,
                'gasPrice': tx_details.gas_price,
                'chainId': AVALANCHE_CHAIN_ID
            })
            
            signed_txn = self.account.sign_transaction(transaction)
            
            # Send transaction
            tx_hash = self.w3.eth.send_raw_transaction(signed_txn.rawTransaction)
            tx_hash_hex = tx_hash.hex()
            
            logger.info(f"Transaction sent: {tx_hash_hex}")
            logger.info(f"View on Snowtrace: https://snowtrace.io/tx/{tx_hash_hex}")
            
            # Wait for receipt
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            
            if receipt.status == 1:
                logger.info("? Transaction confirmed successfully")
            else:
                logger.error("? Transaction failed")
            
            return {
                "status": "success" if receipt.status == 1 else "failed",
                "vote_plans": [asdict(vp) for vp in vote_plans],
                "transaction": asdict(tx_details),
                "tx_hash": tx_hash_hex,
                "receipt": {
                    "block_number": receipt.blockNumber,
                    "gas_used": receipt.gasUsed,
                    "status": receipt.status
                }
            }
            
        except Exception as e:
            logger.error(f"Transaction failed: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return {
                "status": "error",
                "vote_plans": [asdict(vp) for vp in vote_plans],
                "error": str(e)
            }
    
    def vote_on_pools(
        self,
        vote_plans: List[VotePlan],
        confirm_each: bool = True,
        auto_confirm: bool = False
    ) -> List[Dict]:
        """
        Vote on multiple pools.
        
        Args:
            vote_plans: List of voting plans
            confirm_each: Confirm each vote individually
            auto_confirm: Automatically confirm all (dangerous - use with caution)
            
        Returns:
            List of transaction results
        """
        results = []
        
        logger.info(f"\nPreparing to vote on {len(vote_plans)} pool(s)")
        
        # Check balance
        balance = self.get_balance()
        logger.info(f"Wallet AVAX balance: {balance}")
        
        if balance < Decimal('0.01'):
            logger.warning("Low AVAX balance - transactions may fail")
        
        # Get token ID once (use first available)
        token_ids = self.get_lock_token_ids()
        if not token_ids:
            logger.error("No lock token IDs found. Cannot vote without a lock.")
            return [{
                "status": "error",
                "error": "No lock token IDs found"
            }]
        
        token_id = token_ids[0]
        if len(token_ids) > 1:
            logger.warning(f"Multiple token IDs found: {token_ids}. Using first: {token_id}")
        
        # Execute single vote transaction with all pools
        # The vote() function takes multiple pools in one transaction
        try:
            logger.info(f"\nPreparing vote for {len(vote_plans)} pool(s) with token ID {token_id}")
            
            if self.dry_run:
                result = self.simulate_vote(vote_plans, token_id)
            else:
                confirm = confirm_each and not auto_confirm
                result = self.execute_vote(vote_plans, token_id, confirm=confirm)
            
            results.append(result)
            
        except Exception as e:
            logger.error(f"Error executing vote: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            results.append({
                "status": "error",
                "vote_plans": [asdict(vp) for vp in vote_plans],
                "error": str(e)
            })
        
        return results


def load_vote_plans_from_json(json_file: str) -> List[VotePlan]:
    """Load vote plans from pool recommender JSON output"""
    with open(json_file, 'r') as f:
        data = json.load(f)
    
    vote_plans = []
    pools = data.get('pools', [])
    
    for pool in pools:
        # Default to 100% voting power per pool (user can adjust)
        percentage = 100.0 / len(pools) if pools else 100.0
        
        vote_plan = VotePlan(
            pool_name=pool.get('name', 'Unknown'),
            pool_id=pool.get('pool_id') or pool.get('name'),  # Use name as ID if no ID
            voting_percentage=percentage,
            estimated_reward=pool.get('estimated_user_reward'),
            pool_type=pool.get('pool_type')
        )
        vote_plans.append(vote_plan)
    
    return vote_plans


def main():
    parser = argparse.ArgumentParser(
        description='Automated voting for Blackhole DEX pools'
    )
    parser.add_argument(
        '--pools-json',
        required=True,
        help='JSON file from pool recommender (--json output)'
    )
    parser.add_argument(
        '--private-key',
        help='Private key (NOT RECOMMENDED - use BLACKHOLE_VOTER_PRIVATE_KEY env var)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        default=True,
        help='Dry run mode (simulate without sending transactions)'
    )
    parser.add_argument(
        '--confirm',
        action='store_true',
        help='Require confirmation for each transaction'
    )
    parser.add_argument(
        '--auto-confirm',
        action='store_true',
        help='Auto-confirm all transactions (dangerous!)'
    )
    parser.add_argument(
        '--rpc-url',
        help='Custom Avalanche RPC URL'
    )
    parser.add_argument(
        '--voting-contract',
        help='Voting contract address'
    )
    
    args = parser.parse_args()
    
    try:
        # Load vote plans
        vote_plans = load_vote_plans_from_json(args.pools_json)
        
        if not vote_plans:
            logger.error("No vote plans found in JSON file")
            sys.exit(1)
        
        # Initialize voter
        voter = BlackholeVoter(
            private_key=args.private_key,
            rpc_url=args.rpc_url,
            voting_contract_address=args.voting_contract,
            dry_run=args.dry_run
        )
        
        # Execute votes
        results = voter.vote_on_pools(
            vote_plans,
            confirm_each=args.confirm,
            auto_confirm=args.auto_confirm
        )
        
        # Summary
        logger.info("\n" + "="*60)
        logger.info("VOTING SUMMARY")
        logger.info("="*60)
        
        success = sum(1 for r in results if r.get('status') == 'success')
        simulated = sum(1 for r in results if r.get('status') == 'simulated')
        failed = sum(1 for r in results if r.get('status') in ['failed', 'error'])
        
        logger.info(f"Total votes: {len(results)}")
        if not args.dry_run:
            logger.info(f"Successful: {success}")
            logger.info(f"Failed: {failed}")
        else:
            logger.info(f"Simulated: {simulated}")
        
        # Save results
        output_file = args.pools_json.replace('.json', '_voting_results.json')
        with open(output_file, 'w') as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "dry_run": args.dry_run,
                "results": results
            }, f, indent=2)
        
        logger.info(f"\nResults saved to: {output_file}")
        
    except Exception as e:
        logger.error(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
