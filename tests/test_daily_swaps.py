"""
Tests for avalanche_daily_swaps module.
"""
import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timedelta
from avalanche_daily_swaps import AvalancheDailySwapAnalyzer


class TestDailySwapsAnalyzer:
    """Tests for AvalancheDailySwapAnalyzer class"""
    
    def test_init(self):
        """Test that analyzer initializes correctly"""
        analyzer = AvalancheDailySwapAnalyzer()
        assert analyzer.snowtrace_api_base is not None
        assert analyzer.btc_b_address == '0x152b9d0fdc40c096757f570a51e494bd4b943e50'
    
    @patch('avalanche_daily_swaps.requests.get')
    def test_get_latest_block_number(self, mock_get):
        """Test getting latest block number"""
        analyzer = AvalancheDailySwapAnalyzer()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            'result': '0x123456'
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        block = analyzer.get_latest_block_number()
        
        assert block == 0x123456
    
    @patch('avalanche_daily_swaps.requests.get')
    def test_get_block_by_timestamp(self, mock_get):
        """Test getting block number by timestamp"""
        analyzer = AvalancheDailySwapAnalyzer()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            'status': '1',
            'result': '12345'
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        timestamp = int((datetime.now() - timedelta(days=1)).timestamp())
        block = analyzer.get_block_by_timestamp(timestamp)
        
        assert block == 12345
    
    @patch('avalanche_daily_swaps.requests.get')
    def test_get_token_balance(self, mock_get):
        """Test getting token balance"""
        analyzer = AvalancheDailySwapAnalyzer()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            'status': '1',
            'result': '100000000'  # 1 BTC.b (8 decimals)
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        balance = analyzer.get_token_balance(
            '0x2222222222222222222222222222222222222222',
            '0x152b9d0fdc40c096757f570a51e494bd4b943e50'
        )
        
        assert balance == 100000000
    
    @patch('avalanche_daily_swaps.requests.get')
    def test_parse_swap_transaction_btc_received(self, mock_get):
        """Test parsing a swap transaction where BTC.b is received"""
        analyzer = AvalancheDailySwapAnalyzer()
        
        # Mock receipt with BTC.b received
        mock_receipt = Mock()
        mock_receipt.status_code = 200
        mock_receipt.json.return_value = {
            'result': {
                'logs': [
                    {
                        'topics': [
                            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                            '0x0000000000000000000000001111111111111111111111111111111111111111',
                            '0x0000000000000000000000002222222222222222222222222222222222222222',  # recipient
                        ],
                        'data': '0x00000000000000000000000000000000000000000000000000000002540be400',  # 10000000000
                        'address': '0x152b9d0fdc40c096757f570a51e494bd4b943e50'  # BTC.b
                    },
                    {
                        'topics': [
                            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                            '0x0000000000000000000000002222222222222222222222222222222222222222',  # sender
                            '0x0000000000000000000000003333333333333333333333333333333333333333',
                        ],
                        'data': '0x000000000000000000000000000000000000000000000000000000e8d4a51000',  # 1000000000000 (USDC)
                        'address': '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e'  # USDC
                    }
                ]
            }
        }
        mock_get.return_value = mock_receipt
        
        tx = {
            'hash': '0xabc123',
            'from': '0x2222222222222222222222222222222222222222',
            'timeStamp': str(int(datetime.now().timestamp()))
        }
        
        with patch.object(analyzer, 'get_token_info') as mock_info:
            with patch.object(analyzer, 'get_token_price') as mock_price:
                mock_info.return_value = {'name': 'USD Coin', 'symbol': 'USDC', 'decimals': 6}
                mock_price.return_value = 1.0
                
                result = analyzer.parse_swap_transaction(tx)
                
                assert result is not None
                assert result['btc_b_received'] == 10000000000
                assert len(result['tokens_sent']) > 0
    
    def test_format_amount(self):
        """Test amount formatting"""
        analyzer = AvalancheDailySwapAnalyzer()
        
        result = analyzer.format_amount(100000000, 8)  # 1 BTC.b
        assert result == '1'
        
        result = analyzer.format_amount(150000000, 8)  # 1.5 BTC.b
        assert result == '1.5'
    
    def test_format_timestamp(self):
        """Test timestamp formatting"""
        analyzer = AvalancheDailySwapAnalyzer()
        
        timestamp = int(datetime.now().timestamp())
        result = analyzer.format_timestamp(timestamp)
        
        assert '/' in result
        assert 'UTC' in result
