# Configuration Guide

The Avalanche Chain Tools support optional configuration via `config.yaml`. All tools work with sensible defaults if no configuration file is present.

## Configuration File Location

The configuration file should be named `config.yaml` and placed in the project root directory (same directory as the tool scripts).

## Configuration Options

### API Settings

```yaml
api:
  snowtrace_base: "https://api.snowtrace.io/api"
  api_key: "YourApiKeyToken"  # Replace with your Snowtrace API key
  timeout:
    default: 10  # Default timeout in seconds
    quick: 5     # Quick timeout for simple price checks
  
  headers:
    User-Agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
```

**Important:** Replace `"YourApiKeyToken"` with your actual Snowtrace API key for higher rate limits. You can get an API key from [Snowtrace.io](https://snowtrace.io/apis).

### Token Addresses

You can add or modify token addresses:

```yaml
tokens:
  WAVAX: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7"
  USDC: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e"
  BLACK: "0xcd94a87696fac69edae3a70fe5725307ae1c43f6"
  BTC_B: "0x152b9d0fdc40c096757f570a51e494bd4b943e50"
  SUPER: "0x09fa58228bb791ea355c90da1e4783452b9bd8c3"
```

### CoinGecko Token Mapping

Map token contract addresses to CoinGecko IDs for price lookups:

```yaml
coingecko:
  "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7": "avalanche-2"  # AVAX
  "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e": "usd-coin"     # USDC
  "0xcd94a87696fac69edae3a70fe5725307ae1c43f6": "blackhole"    # BLACK
  "0x152b9d0fdc40c096757f570a51e494bd4b943e50": "bitcoin"      # BTC.b
```

### Known Token Metadata

Pre-configure token metadata (name, decimals) for faster lookups without API calls:

```yaml
known_tokens:
  "0xcd94a87696fac69edae3a70fe5725307ae1c43f6":
    name: "BLACKHOLE (BLACK)"
    decimals: 18
  "0x152b9d0fdc40c096757f570a51e494bd4b943e50":
    name: "Bitcoin (BTC.b)"
    decimals: 8
  "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7":
    name: "Wrapped AVAX (WAVAX)"
    decimals: 18
  "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e":
    name: "USD Coin (USDC)"
    decimals: 6
```

### Pool Recommender Settings

Configure default settings for the Blackhole Pool Recommender:

```yaml
pool_recommender:
  default_top_n: 5  # Default number of top pools to recommend
  selenium:
    headless: true       # Run browser in headless mode (can override with --no-headless)
    implicit_wait: 10    # Selenium implicit wait time in seconds
```

**Notes:**
- `default_top_n`: Can be overridden with the `--top` command-line argument
- `headless`: Set to `false` to show the browser window by default (can override with `--no-headless`)
- `implicit_wait`: How long Selenium waits for elements to appear before timing out

### Logging Configuration

Control logging output:

```yaml
logging:
  level: "INFO"  # Options: DEBUG, INFO, WARNING, ERROR
  format: "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
  datefmt: "%Y-%m-%d %H:%M:%S"
```

**Log Levels:**
- `DEBUG`: Detailed information for debugging
- `INFO`: General informational messages (default)
- `WARNING`: Warning messages only
- `ERROR`: Error messages only

### Decimal Precision

Control decimal calculation precision:

```yaml
decimal_precision: 50  # Higher = more precision, slower calculations
```

## Example: Adding Your API Key

1. Open `config.yaml` in a text editor
2. Find the `api_key` line under `api:`
3. Replace `"YourApiKeyToken"` with your actual API key:
   ```yaml
   api:
     api_key: "YOUR_ACTUAL_API_KEY_HERE"
   ```
4. Save the file

## Example: Enabling Debug Logging

To see detailed debug output:

```yaml
logging:
  level: "DEBUG"
```

This will show detailed information about API calls, token lookups, and processing steps.

## Security Note

**Important:** If you add API keys or other sensitive information to `config.yaml`, consider:

1. Adding `config.yaml` to `.gitignore` to avoid committing secrets
2. Creating a `config.yaml.example` file with placeholder values
3. Using environment variables for sensitive data (future enhancement)

## Default Behavior

If `config.yaml` doesn't exist or has errors:
- Tools use hardcoded defaults
- All functionality still works
- You'll see a warning in logs if config loading fails
- API calls work with default rate limits
