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
