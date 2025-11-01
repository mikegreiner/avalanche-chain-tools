"""
Tests for avalanche_transaction_reader module.
"""
import pytest
from unittest.mock import Mock, patch
from avalanche_transaction_reader import AvalancheTransactionReader
from avalanche_utils import InvalidInputError


class TestTransactionReader:
    """Tests for AvalancheTransactionReader class"""
    
    def test_init(self):
        """Test that reader initializes correctly"""
        reader = AvalancheTransactionReader()
        assert reader.snowtrace_api_base is not None
        assert reader.headers is not None
        assert 'User-Agent' in reader.headers
    
    def test_extract_tx_hash_from_input_hash(self):
        """Test extracting hash from direct hash input"""
        reader = AvalancheTransactionReader()
        hash_input = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
        
        result = reader.extract_tx_hash_from_input(hash_input)
        
        assert result == hash_input
    
    def test_extract_tx_hash_from_input_url(self):
        """Test extracting hash from Snowtrace URL"""
        reader = AvalancheTransactionReader()
        url = "https://snowtrace.io/tx/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
        expected = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
        
        result = reader.extract_tx_hash_from_input(url)
        
        assert result == expected
    
    def test_extract_tx_hash_from_input_invalid(self):
        """Test extracting hash from invalid input"""
        reader = AvalancheTransactionReader()
        
        with pytest.raises(InvalidInputError):
            reader.extract_tx_hash_from_input("invalid input")
    
    @patch('avalanche_transaction_reader.requests.get')
    def test_get_transaction_data_success(self, mock_get):
        """Test successful transaction data retrieval"""
        reader = AvalancheTransactionReader()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            'result': {
                'from': '0x1111111111111111111111111111111111111111',
                'to': '0x2222222222222222222222222222222222222222',
                'hash': '0xabcdef',
                'value': '0x0'
            }
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        result = reader.get_transaction_data('0xabcdef')
        
        assert result['from'] == '0x1111111111111111111111111111111111111111'
    
    @patch('avalanche_transaction_reader.requests.get')
    def test_get_transaction_receipt_success(self, mock_get):
        """Test successful transaction receipt retrieval"""
        reader = AvalancheTransactionReader()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            'result': {
                'blockNumber': '0x123456',
                'logs': []
            }
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        result = reader.get_transaction_receipt('0xabcdef')
        
        assert 'logs' in result
    
    def test_parse_transfer_logs(self):
        """Test parsing ERC-20 transfer logs"""
        reader = AvalancheTransactionReader()
        
        logs = [
            {
                'topics': [
                    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                    '0x0000000000000000000000001111111111111111111111111111111111111111',
                    '0x0000000000000000000000002222222222222222222222222222222222222222'
                ],
                'data': '0x00000000000000000000000000000000000000000000000000000002540be400',
                'address': '0x152b9d0fdc40c096757f570a51e494bd4b943e50'
            }
        ]
        
        transfers = reader.parse_transfer_logs(logs)
        
        assert len(transfers) == 1
        assert transfers[0]['from'] == '0x1111111111111111111111111111111111111111'
        assert transfers[0]['to'] == '0x2222222222222222222222222222222222222222'
        assert transfers[0]['value'] == 10000000000
    
    def test_calculate_token_totals(self):
        """Test calculating token totals for an address"""
        reader = AvalancheTransactionReader()
        
        transfers = [
            {
                'from': '0x1111111111111111111111111111111111111111',
                'to': '0x2222222222222222222222222222222222222222',
                'value': 100000000,
                'token_address': '0x152b9d0fdc40c096757f570a51e494bd4b943e50'
            },
            {
                'from': '0x1111111111111111111111111111111111111111',
                'to': '0x2222222222222222222222222222222222222222',
                'value': 50000000,
                'token_address': '0x152b9d0fdc40c096757f570a51e494bd4b943e50'
            }
        ]
        
        totals = reader.calculate_token_totals(transfers, '0x2222222222222222222222222222222222222222')
        
        assert '0x152b9d0fdc40c096757f570a51e494bd4b943e50' in totals
        assert totals['0x152b9d0fdc40c096757f570a51e494bd4b943e50']['total_amount'] == 150000000
    
    @patch('avalanche_transaction_reader.get_token_info')
    @patch('avalanche_transaction_reader.get_token_price')
    @patch('avalanche_transaction_reader.format_amount')
    def test_process_transaction_mock(self, mock_format, mock_price, mock_info):
        """Test processing a transaction with mocked dependencies"""
        reader = AvalancheTransactionReader()
        
        # Setup mocks
        mock_info.return_value = {'name': 'Bitcoin', 'symbol': 'BTC.b', 'decimals': 8}
        mock_price.return_value = 45000.0
        mock_format.return_value = '1.0'
        
        # Mock the transaction data and receipt
        with patch.object(reader, 'extract_tx_hash_from_input', return_value='0xabc'):
            with patch.object(reader, 'get_transaction_data') as mock_tx_data:
                with patch.object(reader, 'get_transaction_receipt') as mock_receipt:
                    with patch.object(reader, 'get_block_info') as mock_block:
                        
                        mock_tx_data.return_value = {
                            'from': '0x2222222222222222222222222222222222222222'
                        }
                        mock_receipt.return_value = {
                            'blockNumber': '0x123',
                            'logs': [
                                {
                                    'topics': [
                                        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                                        '0x0000000000000000000000001111111111111111111111111111111111111111',
                                        '0x0000000000000000000000002222222222222222222222222222222222222222'
                                    ],
                                    'data': '0x00000000000000000000000000000000000000000000000000000002540be400',
                                    'address': '0x152b9d0fdc40c096757f570a51e494bd4b943e50'
                                }
                            ]
                        }
                        mock_block.return_value = {'timestamp': '0x60a1e8c0'}
                        
                        result = reader.process_transaction('0xabc')
                        
                        assert 'Tokens Received' in result
                        assert 'BTC.b' in result
