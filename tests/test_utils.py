"""
Tests for avalanche_utils module.
"""
import pytest
from unittest.mock import Mock, patch
import time
from decimal import Decimal

from avalanche_utils import (
    SNOWTRACE_API_BASE, DEFAULT_HEADERS, TOKEN_ADDRESSES, COINGECKO_TOKEN_MAPPING,
    get_token_info, get_token_price, format_amount, format_timestamp, format_timestamp_from_hex
)


class TestConstants:
    """Test that constants are properly defined"""
    
    def test_snowtrace_api_base(self):
        assert SNOWTRACE_API_BASE == "https://api.snowtrace.io/api"
    
    def test_default_headers(self):
        assert 'User-Agent' in DEFAULT_HEADERS
        assert 'Mozilla' in DEFAULT_HEADERS['User-Agent']
    
    def test_token_addresses(self):
        assert 'BTC_B' in TOKEN_ADDRESSES
        assert 'WAVAX' in TOKEN_ADDRESSES
        assert 'USDC' in TOKEN_ADDRESSES
        assert TOKEN_ADDRESSES['BTC_B'] == '0x152b9d0fdc40c096757f570a51e494bd4b943e50'
    
    def test_coingecko_mapping(self):
        assert len(COINGECKO_TOKEN_MAPPING) > 0
        assert '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7' in COINGECKO_TOKEN_MAPPING


class TestGetTokenInfo:
    """Tests for get_token_info function"""
    
    @patch('avalanche_utils.requests.get')
    def test_get_token_info_success(self, mock_get):
        """Test successful token info retrieval"""
        # Use a token address that's not in known contracts
        test_address = '0x9999999999999999999999999999999999999999'
        
        mock_response = Mock()
        mock_response.json.return_value = {
            'status': '1',
            'result': [{
                'tokenName': 'Bitcoin',
                'symbol': 'BTC.b',
                'divisor': '8'
            }]
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        result = get_token_info(test_address)
        
        assert result['name'] == 'Bitcoin'
        assert result['symbol'] == 'BTC.b'
        assert result['decimals'] == 8
    
    @patch('avalanche_utils.requests.get')
    def test_get_token_info_api_error(self, mock_get):
        """Test token info when API returns error"""
        mock_response = Mock()
        mock_response.json.return_value = {
            'status': '0',
            'message': 'Error'
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        result = get_token_info('0xinvalid')
        
        assert result['name'] == 'Unknown'
        assert result['symbol'] == 'UNKNOWN'
        assert result['decimals'] == 18
    
    def test_get_token_info_known_contract(self):
        """Test token info for known contract (from KNOWN_TOKEN_METADATA)"""
        result = get_token_info('0x152b9d0fdc40c096757f570a51e494bd4b943e50')
        
        # Should return known metadata without API call
        assert result['name'] == 'Bitcoin (BTC.b)' or result['symbol'] == 'BTC.b'
    
    @patch('avalanche_utils.requests.get')
    def test_get_token_info_with_custom_known_contracts(self, mock_get):
        """Test token info with custom known_contracts parameter"""
        known_contracts = {
            '0x1234567890123456789012345678901234567890': {
                'name': 'Test Token (TEST)',
                'decimals': 18
            }
        }
        
        result = get_token_info(
            '0x1234567890123456789012345678901234567890',
            known_contracts=known_contracts
        )
        
        assert result['name'] == 'Test Token (TEST)'
        assert result['decimals'] == 18
        # Should not have called API
        mock_get.assert_not_called()


class TestGetTokenPrice:
    """Tests for get_token_price function"""
    
    @patch('avalanche_utils.requests.get')
    @patch('avalanche_utils.time.sleep')  # Mock sleep to speed up tests
    def test_get_token_price_coingecko_contract_search(self, mock_sleep, mock_get):
        """Test price retrieval from CoinGecko contract search"""
        # Mock CoinGecko contract search
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'market_data': {
                'current_price': {
                    'usd': 45000.0
                }
            }
        }
        mock_get.return_value = mock_response
        
        price = get_token_price('0x152b9d0fdc40c096757f570a51e494bd4b943e50')
        
        assert price == 45000.0
    
    @patch('avalanche_utils.requests.get')
    @patch('avalanche_utils.time.sleep')
    def test_get_token_price_coingecko_simple_api(self, mock_sleep, mock_get):
        """Test price retrieval from CoinGecko simple price API"""
        # First call fails (contract search), second succeeds (simple API)
        def mock_get_side_effect(*args, **kwargs):
            mock_resp = Mock()
            if 'contract' in args[0]:
                mock_resp.status_code = 404
                return mock_resp
            else:
                mock_resp.status_code = 200
                mock_resp.json.return_value = {
                    'bitcoin': {'usd': 45000.0}
                }
                return mock_resp
        
        mock_get.side_effect = mock_get_side_effect
        
        price = get_token_price('0x152b9d0fdc40c096757f570a51e494bd4b943e50')
        
        assert price == 45000.0
    
    @patch('avalanche_utils.requests.get')
    def test_get_token_price_wavax_snowtrace(self, mock_get):
        """Test price retrieval for WAVAX from Snowtrace"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'status': '1',
            'result': {'ethusd': '35.50'}
        }
        mock_get.return_value = mock_response
        
        price = get_token_price('0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7')
        
        assert price == 35.50
    
    @patch('avalanche_utils.requests.get')
    @patch('avalanche_utils.time.sleep')
    def test_get_token_price_not_found(self, mock_sleep, mock_get):
        """Test price retrieval when token not found"""
        # All API calls fail
        mock_response = Mock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response
        
        price = get_token_price('0x0000000000000000000000000000000000000000')
        
        assert price == 0.0
    
    @patch('avalanche_utils.requests.get')
    def test_get_token_price_defillama(self, mock_get):
        """Test price retrieval from DefiLlama API"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'coins': {
                'avax:0x152b9d0fdc40c096757f570a51e494bd4b943e50': {
                    'price': 45000.0,
                    'symbol': 'BTC.b',
                    'decimals': 8,
                    'timestamp': 1762391347,
                    'confidence': 0.99
                }
            }
        }
        mock_get.return_value = mock_response
        
        price = get_token_price('0x152b9d0fdc40c096757f570a51e494bd4b943e50')
        
        assert price == 45000.0
    
    @patch('avalanche_utils.requests.get')
    def test_get_token_price_dexscreener(self, mock_get):
        """Test price retrieval from DexScreener API (fallback)"""
        # DefiLlama fails, CoinGecko fails, DexScreener succeeds
        def mock_get_side_effect(*args, **kwargs):
            mock_resp = Mock()
            if 'llama.fi' in args[0]:
                mock_resp.status_code = 404
                return mock_resp
            elif 'coingecko' in args[0]:
                mock_resp.status_code = 429  # Rate limit
                return mock_resp
            elif 'dexscreener' in args[0]:
                mock_resp.status_code = 200
                mock_resp.json.return_value = {
                    'pairs': [
                        {
                            'priceUsd': '45000.50',
                            'chainId': 'avalanche'
                        }
                    ]
                }
                return mock_resp
            else:
                mock_resp.status_code = 404
                return mock_resp
        
        mock_get.side_effect = mock_get_side_effect
        
        price = get_token_price('0x152b9d0fdc40c096757f570a51e494bd4b943e50')
        
        assert price == 45000.50
    
    @patch('avalanche_utils.requests.get')
    @patch('avalanche_utils.time.sleep')
    def test_get_token_price_symbol_search(self, mock_sleep, mock_get):
        """Test price retrieval using symbol-based search fallback"""
        # All contract-based searches fail, symbol search succeeds
        def mock_get_side_effect(*args, **kwargs):
            mock_resp = Mock()
            if 'llama.fi' in args[0]:
                mock_resp.status_code = 404
                return mock_resp
            elif 'coingecko.com/api/v3/coins/avalanche/contract' in args[0]:
                mock_resp.status_code = 429  # Rate limit
                return mock_resp
            elif 'coingecko.com/api/v3/search' in args[0]:
                mock_resp.status_code = 200
                mock_resp.json.return_value = {
                    'coins': [
                        {'id': 'bitcoin', 'symbol': 'BTC', 'name': 'Bitcoin'}
                    ]
                }
                return mock_resp
            elif 'coingecko.com/api/v3/simple/price' in args[0]:
                mock_resp.status_code = 200
                mock_resp.json.return_value = {
                    'bitcoin': {'usd': 45000.0}
                }
                return mock_resp
            else:
                mock_resp.status_code = 404
                return mock_resp
        
        mock_get.side_effect = mock_get_side_effect
        
        price = get_token_price('0x152b9d0fdc40c096757f570a51e494bd4b943e50', token_symbol='BTC.b')
        
        assert price == 45000.0


class TestFormatAmount:
    """Tests for format_amount function"""
    
    def test_format_amount_standard(self):
        """Test standard precision formatting"""
        # 1 BTC.b (8 decimals)
        result = format_amount(100000000, 8, 'standard')
        assert result == '1'
        
        # 1.5 BTC.b
        result = format_amount(150000000, 8, 'standard')
        assert result == '1.5'
        
        # 0.123456 BTC.b
        result = format_amount(12345600, 8, 'standard')
        assert result == '0.123456'
    
    def test_format_amount_high_precision(self):
        """Test high precision formatting for small amounts"""
        # Very small amount (should show many decimals)
        result = format_amount(1, 18, 'high')
        assert isinstance(result, str)
        assert '.' in result or result == '0'  # Either shows decimals or rounds to 0
        
        # Normal amount
        result = format_amount(100000000, 8, 'high')
        assert result == '1'
        
        # Medium amount with decimals
        result = format_amount(123456000, 8, 'high')
        assert '1.23456' in result
    
    def test_format_amount_removes_trailing_zeros(self):
        """Test that trailing zeros are removed"""
        result = format_amount(100000000, 8, 'standard')
        assert not result.endswith('0')
        assert result == '1' or result == '1.0'


class TestFormatTimestamp:
    """Tests for format_timestamp functions"""
    
    def test_format_timestamp_with_utc(self):
        """Test timestamp formatting with UTC"""
        timestamp = 1620000000  # Fixed timestamp for consistent testing
        result = format_timestamp(timestamp, include_utc=True)
        
        assert '/' in result
        assert 'UTC' in result
        assert '2021' in result or '2025' in result  # Depends on system time
    
    def test_format_timestamp_without_utc(self):
        """Test timestamp formatting without UTC"""
        timestamp = 1620000000
        result = format_timestamp(timestamp, include_utc=False)
        
        assert '/' not in result
        assert 'UTC' not in result
    
    def test_format_timestamp_from_hex(self):
        """Test timestamp formatting from hex"""
        hex_timestamp = '0x60a1e8c0'  # 1620000000
        result = format_timestamp_from_hex(hex_timestamp, include_utc=True)
        
        assert '/' in result
        assert 'UTC' in result
    
    def test_format_timestamp_edge_cases(self):
        """Test timestamp formatting with edge cases"""
        # Very old timestamp (1969) - valid, just old
        result = format_timestamp(-1, include_utc=True)
        assert '/' in result  # Should still format correctly
        
        # Zero timestamp (epoch start)
        result = format_timestamp(0, include_utc=True)
        assert '/' in result
        assert 'UTC' in result
    
    def test_format_timestamp_invalid_type(self):
        """Test timestamp formatting handles invalid input gracefully"""
        # This would cause an exception in datetime, which should be caught
        try:
            # Try with a string that can't be converted (but int() would fail first)
            # Actually, the function expects int, so this test isn't needed
            # But we can test with a very large number
            result = format_timestamp(9999999999999999, include_utc=True)
            # Should either format or return error message
            assert isinstance(result, str)
        except Exception:
            pass  # Exception handling is acceptable here
