"""
Tests for avalanche_transaction_narrator module.
"""
import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timedelta
from avalanche_transaction_narrator import AvalancheTransactionNarrator


class TestTransactionNarrator:
    """Tests for AvalancheTransactionNarrator class"""
    
    def test_init(self):
        """Test that narrator initializes correctly"""
        narrator = AvalancheTransactionNarrator()
        assert narrator.snowtrace_api_base is not None
        assert len(narrator.known_contracts) > 0
        assert len(narrator.function_signatures) > 0
    
    @patch('avalanche_transaction_narrator.requests.get')
    def test_get_latest_block_number(self, mock_get):
        """Test getting latest block number"""
        narrator = AvalancheTransactionNarrator()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            'result': '0x123456'
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        block = narrator.get_latest_block_number()
        
        assert block == 0x123456
    
    def test_get_token_info_uses_known_contracts(self):
        """Test that get_token_info uses known contracts"""
        narrator = AvalancheTransactionNarrator()
        
        # Should use known contract without API call
        with patch('avalanche_transaction_narrator.get_token_info') as mock_get_info:
            result = narrator.get_token_info('0x152b9d0fdc40c096757f570a51e494bd4b943e50')
            # Function should be called with known_contracts parameter
            mock_get_info.assert_called_once()
            call_args = mock_get_info.call_args
            assert 'known_contracts' in call_args.kwargs or len(call_args[1]) > 0
    
    @patch('avalanche_transaction_narrator.requests.get')
    def test_get_transaction_receipt(self, mock_get):
        """Test getting transaction receipt"""
        narrator = AvalancheTransactionNarrator()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            'result': {
                'logs': [],
                'blockNumber': '0x123'
            }
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        receipt = narrator.get_transaction_receipt('0xabc')
        
        assert receipt is not None
        assert 'logs' in receipt
    
    def test_format_amount(self):
        """Test amount formatting with high precision"""
        narrator = AvalancheTransactionNarrator()
        
        # Small amount should show many decimals
        result = narrator.format_amount(1, 18)
        assert isinstance(result, str)
        
        # Normal amount
        result = narrator.format_amount(100000000, 8)
        assert '1' in result
    
    def test_format_timestamp(self):
        """Test timestamp formatting"""
        narrator = AvalancheTransactionNarrator()
        
        timestamp = int(datetime.now().timestamp())
        result = narrator.format_timestamp(timestamp)
        
        assert '/' in result
        assert 'UTC' in result
    
    def test_classify_transaction_contract_creation(self):
        """Test classifying a contract creation transaction"""
        narrator = AvalancheTransactionNarrator()
        
        tx = {
            'to': '',  # Empty 'to' means contract creation
            'from': '0x1111111111111111111111111111111111111111',
            'value': '0x0',
            'hash': '0xabc'
        }
        
        classification = narrator.classify_transaction(tx)
        
        assert classification['type'] == 'contract_creation'
        assert 'Deployed' in classification['description']
    
    @patch.object(AvalancheTransactionNarrator, 'get_transaction_receipt')
    def test_classify_transaction_swap(self, mock_receipt):
        """Test classifying a swap transaction"""
        narrator = AvalancheTransactionNarrator()
        
        tx = {
            'from': '0x2222222222222222222222222222222222222222',
            'to': '0x3333333333333333333333333333333333333333',
            'value': '0x0',
            'hash': '0xabc',
            'input': '0x7ff36ab5'  # swapExactETHForTokens
        }
        
        # Mock receipt with token transfers
        mock_receipt.return_value = {
            'logs': [
                {
                    'topics': [
                        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                        '0x0000000000000000000000003333333333333333333333333333333333333333',
                        '0x0000000000000000000000002222222222222222222222222222222222222222',
                    ],
                    'data': '0x00000000000000000000000000000000000000000000000000000002540be400',
                    'address': '0x152b9d0fdc40c096757f570a51e494bd4b943e50'
                }
            ]
        }
        
        with patch.object(narrator, 'get_token_info') as mock_info:
            mock_info.return_value = {'name': 'Bitcoin', 'symbol': 'BTC.b', 'decimals': 8}
            
            classification = narrator.classify_transaction(tx)
            
            # Should be classified as swap or token_operation
            assert classification['type'] in ['swap', 'token_operation']
    
    def test_decode_vote_transaction(self):
        """Test decoding a voting transaction"""
        narrator = AvalancheTransactionNarrator()
        
        # Real voting transaction input data from transaction 0x50a36fc4bd932e4abdeff08d7d6f6a2bae7b3a491384e6d1c6b96f563d289053
        # vote(uint256 tokenId=4438, address[] poolVote, uint256[] weights)
        input_data = '0x7ac09bf70000000000000000000000000000000000000000000000000000000000001156000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000000300000000000000000000000041100c6d2c6920b10d12cd8d59c8a9aa2ef56fc70000000000000000000000008fef4fe4970a5d6bfa7c65871a2ebfd0f42aa8220000000000000000000000005e128ebc09c918ddae3ca1668d4ee9527dc00d78000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000001f400000000000000000000000000000000000000000000000000000000000000fa00000000000000000000000000000000000000000000000000000000000000fa'
        
        vote_data = narrator.decode_vote_transaction(input_data)
        
        # Check if eth-abi is available
        try:
            from eth_abi import decode as eth_abi_decode
            # Should successfully decode
            assert vote_data is not None
            assert vote_data['token_id'] == 4438
            assert len(vote_data['pool_addresses']) == 3
            assert len(vote_data['weights']) == 3
            assert list(vote_data['weights']) == [500, 250, 250]
            assert vote_data['pool_addresses'][0].lower() == '0x41100c6d2c6920b10d12cd8d59c8a9aa2ef56fc7'
        except ImportError:
            # If eth-abi not available, should return None
            assert vote_data is None
    
    @patch.object(AvalancheTransactionNarrator, 'get_pool_tokens')
    @patch.object(AvalancheTransactionNarrator, 'get_token_info')
    def test_describe_vote_with_pools(self, mock_get_token_info, mock_get_pool_tokens):
        """Test describing a vote transaction with pool details"""
        narrator = AvalancheTransactionNarrator()
        
        tx = {
            'to': '0xe30d0c8532721551a51a9fec7fb233759964d9e3',  # Voter contract
            'from': '0xc081b59fe4fb3de77e641342b210bebf882d0ea4',
            'input': '0x7ac09bf70000000000000000000000000000000000000000000000000000000000001156000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000000300000000000000000000000041100c6d2c6920b10d12cd8d59c8a9aa2ef56fc70000000000000000000000008fef4fe4970a5d6bfa7c65871a2ebfd0f42aa8220000000000000000000000005e128ebc09c918ddae3ca1668d4ee9527dc00d78000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000001f400000000000000000000000000000000000000000000000000000000000000fa00000000000000000000000000000000000000000000000000000000000000fa',
            'hash': '0x50a36fc4bd932e4abdeff08d7d6f6a2bae7b3a491384e6d1c6b96f563d289053'
        }
        
        # Mock pool tokens
        mock_get_pool_tokens.side_effect = [
            {'token0': '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7', 'token1': '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e'},
            {'token0': '0x152b9d0fdc40c096757f570a51e494bd4b943e50', 'token1': '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7'},
            {'token0': '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab', 'token1': '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7'}
        ]
        
        # Mock token info
        def mock_token_info_side_effect(address):
            tokens = {
                '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7': {'symbol': 'WAVAX', 'name': 'Wrapped AVAX', 'decimals': 18},
                '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e': {'symbol': 'USDC', 'name': 'USD Coin', 'decimals': 6},
                '0x152b9d0fdc40c096757f570a51e494bd4b943e50': {'symbol': 'BTC.b', 'name': 'Bitcoin', 'decimals': 8},
                '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab': {'symbol': 'WETH.e', 'name': 'Wrapped Ether', 'decimals': 18}
            }
            return tokens.get(address.lower(), {'symbol': 'UNKNOWN', 'name': 'Unknown', 'decimals': 18})
        
        mock_get_token_info.side_effect = mock_token_info_side_effect
        
        description = narrator.describe_vote(tx, [])
        
        # Check if eth-abi is available
        try:
            from eth_abi import decode as eth_abi_decode
            # Should have detailed description with pool pairs and percentages
            assert 'veBLACK NFT #4438' in description
            assert '3 Blackhole DEX pools' in description
            assert 'WAVAX/USDC' in description or 'USDC/WAVAX' in description
            assert '50.0%' in description
            assert '25.0%' in description
        except ImportError:
            # If eth-abi not available, should have basic description
            assert 'Voted on Blackhole DEX pools' in description
