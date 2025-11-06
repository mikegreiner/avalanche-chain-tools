#!/usr/bin/env python3
"""
Avalanche Chain Tools - Shared Utilities

Common functions and constants used across all Avalanche chain analysis tools.
"""

import requests
import time
import logging
import yaml
import os
from pathlib import Path
from datetime import datetime
from decimal import Decimal, getcontext
from typing import Dict, Optional, Any, Union
import pytz

# Set up basic logging first (before config loading)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Custom exception classes
class AvalancheToolError(Exception):
    """Base exception for all Avalanche Chain Tools errors"""
    pass


class AvalancheAPIError(AvalancheToolError):
    """Raised when Snowtrace API returns an error"""
    def __init__(self, message: str, api_error: Optional[str] = None):
        super().__init__(message)
        self.api_error = api_error


class NetworkError(AvalancheToolError):
    """Raised when network requests fail"""
    def __init__(self, message: str, original_error: Optional[Exception] = None):
        super().__init__(message)
        self.original_error = original_error


class TransactionNotFoundError(AvalancheToolError):
    """Raised when a transaction cannot be found"""
    pass


class BlockNotFoundError(AvalancheToolError):
    """Raised when a block cannot be found"""
    pass


class TokenNotFoundError(AvalancheToolError):
    """Raised when token information cannot be retrieved"""
    pass


class InvalidInputError(AvalancheToolError):
    """Raised when user input is invalid"""
    pass

# Configuration loading
def load_config(config_path: Optional[str] = None) -> Dict[str, Any]:
    """Load configuration from YAML file"""
    if config_path is None:
        config_path = Path(__file__).parent / "config.yaml"
    else:
        config_path = Path(config_path)
    
    if not config_path.exists():
        # Return defaults if config file doesn't exist
        return {}
    
    try:
        with open(config_path, 'r') as f:
            return yaml.safe_load(f) or {}
    except Exception as e:
        # Use print if logger not yet initialized
        try:
            logger.warning(f"Could not load config file {config_path}: {e}")
        except:
            print(f"Warning: Could not load config file {config_path}: {e}")
        return {}

# Load configuration
_config = load_config()

# Reconfigure logging with config if available
_log_config = _config.get('logging', {})
if _log_config:
    log_level = getattr(logging, _log_config.get('level', 'INFO').upper(), logging.INFO)
    log_format = _log_config.get('format', '%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    log_datefmt = _log_config.get('datefmt', '%Y-%m-%d %H:%M:%S')
    logging.basicConfig(level=log_level, format=log_format, datefmt=log_datefmt, force=True)

# Set precision for decimal calculations (with config override support)
_precision = _config.get('decimal_precision', 50)
getcontext().prec = _precision

# Constants (with config override support)
SNOWTRACE_API_BASE = _config.get('api', {}).get('snowtrace_base', "https://api.snowtrace.io/api")
API_KEY_TOKEN = _config.get('api', {}).get('api_key', "YourApiKeyToken")

# Timeout values (with config override support)
_api_timeout_config = _config.get('api', {}).get('timeout', {})
API_TIMEOUT_DEFAULT = _api_timeout_config.get('default', 10)
API_TIMEOUT_QUICK = _api_timeout_config.get('quick', 5)

# Default headers for API requests
DEFAULT_HEADERS = _config.get('api', {}).get('headers', {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
})

# Known token addresses (with config override support)
TOKEN_ADDRESSES = _config.get('tokens', {
    'WAVAX': '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7',
    'USDC': '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',
    'BLACK': '0xcd94a87696fac69edae3a70fe5725307ae1c43f6',
    'BTC_B': '0x152b9d0fdc40c096757f570a51e494bd4b943e50',
    'SUPER': '0x09fa58228bb791ea355c90da1e4783452b9bd8c3',
})

# CoinGecko token ID mapping (with config override support)
COINGECKO_TOKEN_MAPPING = _config.get('coingecko', {
    '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7': 'avalanche-2',  # AVAX
    '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e': 'usd-coin',     # USDC
    '0xcd94a87696fac69edae3a70fe5725307ae1c43f6': 'blackhole',    # BLACK
    '0x152b9d0fdc40c096757f570a51e494bd4b943e50': 'bitcoin',      # BTC.b
    '0x09fa58228bb791ea355c90da1e4783452b9bd8c3': 'superfarm',    # SUPER (SuperVerse)
})

# Known token metadata (for narrator's special handling, with config override support)
KNOWN_TOKEN_METADATA = _config.get('known_tokens', {
    '0xcd94a87696fac69edae3a70fe5725307ae1c43f6': {'name': 'BLACKHOLE (BLACK)', 'decimals': 18},
    '0x152b9d0fdc40c096757f570a51e494bd4b943e50': {'name': 'Bitcoin (BTC.b)', 'decimals': 8},
    '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7': {'name': 'Wrapped AVAX (WAVAX)', 'decimals': 18},
    '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e': {'name': 'USD Coin (USDC)', 'decimals': 6},
    '0x09fa58228bb791ea355c90da1e4783452b9bd8c3': {'name': 'SuperVerse (SUPER)', 'decimals': 18},
})


def get_token_info(token_address: str, headers: Optional[Dict] = None, 
                   known_contracts: Optional[Dict] = None) -> Dict:
    """
    Get token information (name, symbol, decimals) from Snowtrace API.
    
    Args:
        token_address: Token contract address
        headers: Optional custom headers (defaults to DEFAULT_HEADERS)
        known_contracts: Optional dict of known contracts for fast lookup
        
    Returns:
        Dict with 'name', 'symbol', and 'decimals' keys
    """
    if headers is None:
        headers = DEFAULT_HEADERS
    
    # Check known contracts first (for narrator's special handling)
    if known_contracts and token_address in known_contracts:
        contract_info = known_contracts[token_address]
        # Handle narrator's format where name includes symbol in parentheses
        name = contract_info['name']
        if '(' in name and ')' in name:
            symbol = name.split(' ')[-1].strip('()')
        else:
            symbol = 'UNKNOWN'
        return {
            'name': name,
            'symbol': symbol,
            'decimals': contract_info['decimals']
        }
    
    # Check global known metadata
    if token_address in KNOWN_TOKEN_METADATA:
        contract_info = KNOWN_TOKEN_METADATA[token_address]
        name = contract_info['name']
        if '(' in name and ')' in name:
            symbol = name.split(' ')[-1].strip('()')
        else:
            symbol = 'UNKNOWN'
        return {
            'name': name,
            'symbol': symbol,
            'decimals': contract_info['decimals']
        }
    
    # Fetch from API
    url = f"{SNOWTRACE_API_BASE}?module=token&action=tokeninfo&contractaddress={token_address}&apikey={API_KEY_TOKEN}"
    
    try:
        response = requests.get(url, headers=headers, timeout=API_TIMEOUT_DEFAULT)
        response.raise_for_status()
        data = response.json()
        
        if 'error' in data or data.get('status') != '1':
            # Determine default name based on which tool is calling
            default_name = 'Unknown Token' if known_contracts else 'Unknown'
            logger.warning(f"Could not get token info for {token_address}")
            return {'name': default_name, 'symbol': 'UNKNOWN', 'decimals': 18}
        
        result = data.get('result', [])
        if isinstance(result, list) and len(result) > 0:
            token_data = result[0]
            return {
                'name': token_data.get('tokenName', 'Unknown'),
                'symbol': token_data.get('symbol', 'UNKNOWN'),
                'decimals': int(token_data.get('divisor', 18))
            }
        else:
            default_name = 'Unknown Token' if known_contracts else 'Unknown'
            return {'name': default_name, 'symbol': 'UNKNOWN', 'decimals': 18}
    except Exception as e:
        default_name = 'Unknown Token' if known_contracts else 'Unknown'
        logger.warning(f"Error fetching token info for {token_address}: {e}")
        return {'name': default_name, 'symbol': 'UNKNOWN', 'decimals': 18}


def get_token_price(token_address: str, headers: Optional[Dict] = None, 
                     token_symbol: Optional[str] = None) -> float:
    """
    Get current token price in USD from multiple sources.
    
    Tries:
    1. Snowtrace API (for AVAX/WAVAX)
    2. DefiLlama API (free, no rate limits)
    3. CoinGecko contract address search
    4. CoinGecko simple price API (if mapped)
    5. CoinGecko symbol search (if token_symbol provided)
    6. DexScreener API (free alternative)
    
    Args:
        token_address: Token contract address
        headers: Optional custom headers (defaults to DEFAULT_HEADERS)
        token_symbol: Optional token symbol for symbol-based search fallback
        
    Returns:
        Token price in USD, or 0.0 if not found
    """
    if headers is None:
        headers = DEFAULT_HEADERS
    
    token_address_lower = token_address.lower()
    
    # Try Snowtrace API first for AVAX price
    if token_address_lower == TOKEN_ADDRESSES['WAVAX'].lower():
        try:
            url = f"{SNOWTRACE_API_BASE}?module=stats&action=ethprice&apikey={API_KEY_TOKEN}"
            response = requests.get(url, headers=headers, timeout=API_TIMEOUT_QUICK)
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == '1':
                    return float(data['result']['ethusd'])
        except Exception:
            pass
    
    # Try DefiLlama API (free, no rate limits, good coverage)
    try:
        defillama_url = f"https://coins.llama.fi/prices/current/avax:{token_address_lower}"
        response = requests.get(defillama_url, timeout=API_TIMEOUT_DEFAULT)
        if response.status_code == 200:
            data = response.json()
            coin_key = f"avax:{token_address_lower}"
            if coin_key in data.get('coins', {}):
                coin_data = data['coins'][coin_key]
                price = coin_data.get('price', 0.0)
                if price and price > 0:
                    logger.debug(f"Found price for {token_address} via DefiLlama: ${price}")
                    return float(price)
    except Exception as e:
        logger.debug(f"DefiLlama API failed for {token_address}: {e}")
    
    # Try CoinGecko contract address search (more reliable for Avalanche tokens)
    try:
        search_url = f"https://api.coingecko.com/api/v3/coins/avalanche/contract/{token_address_lower}"
        response = requests.get(search_url, timeout=API_TIMEOUT_DEFAULT)
        if response.status_code == 200:
            data = response.json()
            # Check for rate limiting
            if 'error' in data:
                error_msg = data.get('error', 'Unknown error')
                if 'rate limit' in error_msg.lower():
                    logger.warning(f"CoinGecko rate limit for {token_address}")
                    # Wait and retry once
                    time.sleep(2)
                    response = requests.get(search_url, timeout=API_TIMEOUT_DEFAULT)
                    if response.status_code == 200:
                        data = response.json()
                        if 'error' not in data:
                            price = data.get('market_data', {}).get('current_price', {}).get('usd', 0.0)
                            if price and price > 0:
                                return float(price)
                else:
                    logger.debug(f"CoinGecko error for {token_address}: {error_msg}")
            else:
                price = data.get('market_data', {}).get('current_price', {}).get('usd', 0.0)
                if price and price > 0:
                    return float(price)
        elif response.status_code == 429:
            logger.warning(f"CoinGecko rate limit (429) for {token_address}, waiting and retrying...")
            # Wait and retry once
            time.sleep(2)
            response = requests.get(search_url, timeout=API_TIMEOUT_DEFAULT)
            if response.status_code == 200:
                data = response.json()
                if 'error' not in data:
                    price = data.get('market_data', {}).get('current_price', {}).get('usd', 0.0)
                    if price and price > 0:
                        return float(price)
        else:
            logger.debug(f"CoinGecko contract search returned status {response.status_code} for {token_address}")
    except requests.exceptions.RequestException as e:
        logger.warning(f"Contract search network error for {token_address}: {e}")
    except Exception as e:
        logger.warning(f"Contract search failed for {token_address}: {e}")
    
    # Try CoinGecko simple price API as fallback (with rate limiting)
    try:
        coingecko_id = COINGECKO_TOKEN_MAPPING.get(token_address_lower)
        if coingecko_id:
            # Add a small delay to avoid rate limiting
            time.sleep(0.5)
            price_url = f"https://api.coingecko.com/api/v3/simple/price?ids={coingecko_id}&vs_currencies=usd"
            response = requests.get(price_url, timeout=API_TIMEOUT_DEFAULT)
            if response.status_code == 200:
                data = response.json()
                if 'status' not in data:  # No error status
                    price = data.get(coingecko_id, {}).get('usd', 0.0)
                    if price and price > 0:
                        return float(price)
                else:
                    logger.warning(f"CoinGecko rate limit hit for {coingecko_id}")
            elif response.status_code == 429:
                logger.warning(f"CoinGecko rate limit (429) for simple price API, waiting...")
                time.sleep(2)
                response = requests.get(price_url, timeout=API_TIMEOUT_DEFAULT)
                if response.status_code == 200:
                    data = response.json()
                    if 'status' not in data:
                        price = data.get(coingecko_id, {}).get('usd', 0.0)
                        if price and price > 0:
                            return float(price)
    except Exception as e:
        logger.warning(f"Simple price API failed for {token_address}: {e}")
    
    # Try CoinGecko symbol search as fallback (if token_symbol provided)
    # This is especially useful when contract search hits rate limits
    if token_symbol:
        try:
            # Add a delay to avoid rate limiting
            time.sleep(0.5)
            search_url = f"https://api.coingecko.com/api/v3/search?query={token_symbol.lower()}"
            response = requests.get(search_url, timeout=API_TIMEOUT_DEFAULT)
            if response.status_code == 200:
                data = response.json()
                coins = data.get('coins', [])
                if coins:
                    # Take the first result (usually the most relevant)
                    coin_id = coins[0].get('id')
                    if coin_id:
                        # Get price using the found coin ID
                        time.sleep(0.5)  # Additional delay
                        price_url = f"https://api.coingecko.com/api/v3/simple/price?ids={coin_id}&vs_currencies=usd"
                        price_response = requests.get(price_url, timeout=API_TIMEOUT_DEFAULT)
                        if price_response.status_code == 200:
                            price_data = price_response.json()
                            if 'status' not in price_data:
                                price = price_data.get(coin_id, {}).get('usd', 0.0)
                                if price and price > 0:
                                    logger.debug(f"Found price for {token_symbol} via symbol search: ${price}")
                                    return float(price)
                        elif price_response.status_code == 429:
                            logger.warning(f"CoinGecko rate limit (429) for symbol search price, waiting...")
                            time.sleep(2)
                            price_response = requests.get(price_url, timeout=API_TIMEOUT_DEFAULT)
                            if price_response.status_code == 200:
                                price_data = price_response.json()
                                if 'status' not in price_data:
                                    price = price_data.get(coin_id, {}).get('usd', 0.0)
                                    if price and price > 0:
                                        logger.debug(f"Found price for {token_symbol} via symbol search (retry): ${price}")
                                        return float(price)
            elif response.status_code == 429:
                logger.warning(f"CoinGecko rate limit (429) for symbol search, waiting and retrying...")
                time.sleep(2)
                response = requests.get(search_url, timeout=API_TIMEOUT_DEFAULT)
                if response.status_code == 200:
                    data = response.json()
                    coins = data.get('coins', [])
                    if coins:
                        coin_id = coins[0].get('id')
                        if coin_id:
                            time.sleep(0.5)
                            price_url = f"https://api.coingecko.com/api/v3/simple/price?ids={coin_id}&vs_currencies=usd"
                            price_response = requests.get(price_url, timeout=API_TIMEOUT_DEFAULT)
                            if price_response.status_code == 200:
                                price_data = price_response.json()
                                if 'status' not in price_data:
                                    price = price_data.get(coin_id, {}).get('usd', 0.0)
                                    if price and price > 0:
                                        logger.debug(f"Found price for {token_symbol} via symbol search (retry): ${price}")
                                        return float(price)
        except requests.exceptions.RequestException as e:
            logger.debug(f"Symbol search network error for {token_symbol}: {e}")
        except Exception as e:
            logger.debug(f"Symbol search failed for {token_symbol}: {e}")
    
    # Try DexScreener API as last resort (free, no rate limits)
    try:
        dexscreener_url = f"https://api.dexscreener.com/latest/dex/tokens/{token_address_lower}"
        response = requests.get(dexscreener_url, timeout=API_TIMEOUT_DEFAULT)
        if response.status_code == 200:
            data = response.json()
            pairs = data.get('pairs', [])
            if pairs:
                # Find pair with highest liquidity/volume, or just use the first one
                # Look for pairs with USD price
                for pair in pairs:
                    price_usd = pair.get('priceUsd')
                    if price_usd:
                        try:
                            price = float(price_usd)
                            if price > 0:
                                logger.debug(f"Found price for {token_address} via DexScreener: ${price}")
                                return price
                        except (ValueError, TypeError):
                            continue
    except Exception as e:
        logger.debug(f"DexScreener API failed for {token_address}: {e}")
    
    return 0.0


def format_amount(amount: int, decimals: int, precision: str = 'auto') -> str:
    """
    Format token amount with proper decimal places.
    
    Args:
        amount: Token amount in smallest unit (wei/satoshi)
        decimals: Number of decimal places for the token
        precision: 'auto' (default), 'standard' (6 places), or 'high' (12 places)
        
    Returns:
        Formatted amount string with trailing zeros removed
    """
    divisor = 10 ** decimals
    formatted = Decimal(amount) / Decimal(divisor)
    
    if precision == 'standard':
        return f"{formatted:.6f}".rstrip('0').rstrip('.')
    elif precision == 'high':
        # Use more precision for small amounts to avoid showing 0
        if formatted >= 1:
            return f"{formatted:.6f}".rstrip('0').rstrip('.')
        elif formatted >= 0.000001:
            return f"{formatted:.8f}".rstrip('0').rstrip('.')
        else:
            return f"{formatted:.12f}".rstrip('0').rstrip('.')
    else:  # auto - standard 6 decimal places
        return f"{formatted:.6f}".rstrip('0').rstrip('.')


def format_timestamp(timestamp: int, include_utc: bool = True) -> str:
    """
    Convert timestamp to human-readable format with both local and UTC times.
    
    Args:
        timestamp: Unix timestamp (integer)
        include_utc: If True, include both local and UTC times (default: True)
        
    Returns:
        Formatted timestamp string
    """
    try:
        # Create UTC datetime
        dt_utc = datetime.fromtimestamp(timestamp, tz=pytz.UTC)
        
        # Get local timezone
        local_tz = datetime.now().astimezone().tzinfo
        
        # Convert to local time
        dt_local = dt_utc.astimezone(local_tz)
        
        if include_utc:
            # Format both times
            utc_str = dt_utc.strftime("%B %d, %Y at %I:%M:%S %p UTC")
            local_str = dt_local.strftime("%B %d, %Y at %I:%M:%S %p %Z")
            return f"{local_str} / {utc_str}"
        else:
            # Format only local time
            return dt_local.strftime("%B %d, %Y at %I:%M:%S %p %Z")
    except Exception as e:
        return f"Unknown timestamp (Error: {e})"


def format_timestamp_from_hex(timestamp_hex: str, include_utc: bool = True) -> str:
    """
    Convert hex timestamp to human-readable format.
    
    Args:
        timestamp_hex: Hexadecimal timestamp string (e.g., '0x12345678')
        include_utc: If True, include both local and UTC times (default: True)
        
    Returns:
        Formatted timestamp string
    """
    try:
        # Convert hex to decimal
        timestamp = int(timestamp_hex, 16)
        return format_timestamp(timestamp, include_utc=include_utc)
    except Exception as e:
        return f"Unknown timestamp (Error: {e})"
