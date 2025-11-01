"""
Pytest configuration and shared fixtures for Avalanche Chain Tools tests.
"""
import pytest
from unittest.mock import Mock, patch
import json


@pytest.fixture
def mock_requests():
    """Mock requests module for API calls"""
    with patch('avalanche_utils.requests') as mock_req:
        yield mock_req


@pytest.fixture
def sample_token_info_response():
    """Sample successful token info response from Snowtrace API"""
    return {
        'status': '1',
        'message': 'OK',
        'result': [{
            'tokenName': 'Bitcoin',
            'symbol': 'BTC.b',
            'divisor': '8'
        }]
    }


@pytest.fixture
def sample_price_response():
    """Sample successful price response from CoinGecko"""
    return {
        'market_data': {
            'current_price': {
                'usd': 45000.0
            }
        }
    }


@pytest.fixture
def sample_transaction_receipt():
    """Sample transaction receipt with token transfer logs"""
    return {
        'blockNumber': '0x123456',
        'logs': [
            {
                'topics': [
                    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',  # Transfer
                    '0x0000000000000000000000001111111111111111111111111111111111111111',  # from
                    '0x0000000000000000000000002222222222222222222222222222222222222222',  # to
                ],
                'data': '0x00000000000000000000000000000000000000000000000000000002540be400',  # 10000000000 (100 BTC.b with 8 decimals)
                'address': '0x152b9d0fdc40c096757f570a51e494bd4b943e50'  # BTC.b
            }
        ]
    }


@pytest.fixture
def sample_transaction_data():
    """Sample transaction data"""
    return {
        'from': '0x2222222222222222222222222222222222222222',
        'to': '0x3333333333333333333333333333333333333333',
        'hash': '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        'value': '0x0'
    }


@pytest.fixture
def sample_block_info():
    """Sample block info with timestamp"""
    return {
        'timestamp': '0x60a1e8c0',  # Hex timestamp (approx 1620000000)
        'number': '0x123456'
    }
