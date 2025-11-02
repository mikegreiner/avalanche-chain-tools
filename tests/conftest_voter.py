"""
Additional fixtures for voter tests
"""

import pytest
import json
import os
from unittest.mock import MagicMock, patch


@pytest.fixture
def actual_vote_transaction():
    """Actual vote transaction data from blockchain"""
    return {
        "tx_hash": "0x4d7488026056bf83b3a0a2cd292b2d009708be76c47681630dfdf88f29cf7ac8",
        "to": "0xe30d0c8532721551a51a9fec7fb233759964d9e3",
        "wallet": "0x0000000000000000000000000000000000000001",
        "input_data": "0x7ac09bf70000000000000000000000000000000000000000000000000000000000001156000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000010000000000000000000000008fef4fe4970a5d6bfa7c65871a2ebfd0f42aa822000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000003e8",
        "parameters": {
            "token_id": 4438,
            "pools": ["0x8fef4fe4970a5d6bfa7c65871a2ebfd0f42aa822"],
            "weights": [1000]
        }
    }


@pytest.fixture
def voter_contract_address():
    """Voter contract implementation address"""
    return "0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525"


@pytest.fixture
def voting_escrow_address():
    """VotingEscrow contract address"""
    return "0xeac562811cc6abdbb2c9ee88719eca4ee79ad763"


@pytest.fixture
def voter_abi():
    """Load voter contract ABI"""
    abi_path = 'voter_contract_abi.json'
    if os.path.exists(abi_path):
        with open(abi_path, 'r') as f:
            return json.load(f)
    return []


@pytest.fixture
def escrow_abi():
    """Load VotingEscrow ABI"""
    abi_path = 'voting_contract_abi.json'
    if os.path.exists(abi_path):
        with open(abi_path, 'r') as f:
            return json.load(f)
    return []


@pytest.fixture
def mock_voter_with_contract(voter_abi, escrow_abi, voter_contract_address, voting_escrow_address):
    """Mock voter instance with contracts set up"""
    with patch('blackhole_voter.load_config') as mock_config, \
         patch('blackhole_voter.Account') as mock_account_class, \
         patch('blackhole_voter.Web3') as mock_web3_class:
        
        # Mock config
        mock_config.return_value = {
            'blackhole_voter': {
                'voting_contract_address': voter_contract_address,
                'voting_escrow_address': voting_escrow_address,
                'rpc_url': 'https://api.avax.network/ext/bc/C/rpc'
            }
        }
        
        # Mock account
        mock_account = MagicMock()
        mock_account.address = "0x0000000000000000000000000000000000000001"
        mock_account_class.from_key.return_value = mock_account
        
        # Mock web3
        mock_w3 = MagicMock()
        mock_w3.is_connected.return_value = True
        mock_w3.eth.get_transaction_count.return_value = 0
        mock_w3.eth.gas_price = 30000000000
        mock_w3.middleware_onion.inject = MagicMock()
        
        # Mock contracts
        mock_voter_contract = MagicMock()
        mock_escrow_contract = MagicMock()
        
        def contract_factory(address, abi):
            addr_lower = address.lower()
            if addr_lower == voter_contract_address.lower():
                return mock_voter_contract
            elif addr_lower == voting_escrow_address.lower():
                return mock_escrow_contract
            return MagicMock()
        
        mock_w3.eth.contract.side_effect = contract_factory
        mock_web3_class.return_value = mock_w3
        
        yield {
            'account': mock_account,
            'w3': mock_w3,
            'voter_contract': mock_voter_contract,
            'escrow_contract': mock_escrow_contract
        }
