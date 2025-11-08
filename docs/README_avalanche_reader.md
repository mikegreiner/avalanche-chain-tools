# Avalanche C-Chain Transaction Reader

A Python script that reads Avalanche C-Chain transactions from Snowtrace.io and extracts token transfer information.

## Features

- Fetches transaction data from Snowtrace.io API
- Parses ERC-20 token transfer events
- Calculates total tokens received by the transaction sender
- Fetches token metadata (name, symbol, decimals)
- Gets current USD prices from multiple sources (Snowtrace, DefiLlama, CoinGecko, DexScreener)
- Calculates and displays total USD value of all tokens
- Shows human-readable transaction date and time in both local timezone and UTC
- Creates clickable links to transaction, address, and token contract pages on Snowtrace.io
- Outputs results in markdown format, sorted alphabetically by token symbol

## Installation

```bash
pip install -r requirements.txt
```

## Usage

### Basic Usage
```bash
# Using full Snowtrace URL
python3 avalanche_transaction_reader.py "https://snowtrace.io/tx/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"

# Using just the transaction hash
python3 avalanche_transaction_reader.py "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
```

### Save to File
```bash
python3 avalanche_transaction_reader.py "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" -o analysis.md

# Or save to an output directory (recommended, gitignored)
python3 avalanche_transaction_reader.py "0x..." -o output/analysis.md
```

### Customize Header Size
```bash
# Start with ## instead of # (useful for embedding in larger documents)
python3 avalanche_transaction_reader.py "0x..." --header-size 2
```

## Example Output

```markdown
# Tokens Received

**Transaction:** [0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890](https://snowtrace.io/tx/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890)
**Recipient:** [0x1234567890123456789012345678901234567890](https://snowtrace.io/address/0x1234567890123456789012345678901234567890)
**Date & Time:** October 22, 2025 at 07:24:45 PM MDT / October 23, 2025 at 01:24:45 AM UTC

**Total USD Value:** $27.17

- **BLACK**: 64.594005 ($8.52)
  - Name: BLACKHOLE
  - Contract: `0xcd94a87696fac69edae3a70fe5725307ae1c43f6`

- **BTC.b**: 0.000045 ($4.87)
  - Name: Bitcoin
  - Contract: `0x152b9d0fdc40c096757f570a51e494bd4b943e50`

- **USDC**: 5.138437 ($5.14)
  - Name: USD Coin
  - Contract: `0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e`

- **WAVAX**: 0.452194 ($8.63)
  - Name: Wrapped AVAX
  - Contract: [0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7](https://snowtrace.io/token/0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7)
```

## Version

Check the script version:
```bash
python3 avalanche_transaction_reader.py --version
```

Current version: **1.1.0**

## Notes

- The script accepts either full Snowtrace.io URLs or just transaction hashes (0x...)
- The script analyzes token transfers where the transaction sender is the recipient
- USD prices are fetched from multiple sources:
  - Snowtrace API (for AVAX/WAVAX)
  - DefiLlama API (free, no rate limits, good coverage)
  - CoinGecko API (with retry logic for rate limits)
  - DexScreener API (free alternative)
- The script displays total USD value of all tokens received
- Unknown tokens will show "Price not available" in the individual entries
- The script handles ERC-20 Transfer events with proper decimal formatting
- Use `--header-size` to customize markdown header sizes (default: 1, range: 1-5)