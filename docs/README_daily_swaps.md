# Avalanche C-Chain Daily Swap Analyzer

A Python script that analyzes daily swap transactions for a given Avalanche C-Chain address, focusing on swaps to BTC.b and providing a comprehensive markdown summary.

## Features

- Analyzes all transactions for a given address on a specific date
- Filters for swap transactions to BTC.b (Bitcoin on Avalanche)
- Shows detailed breakdown of each swap with token amounts and USD values
- Calculates totals for BTC.b received and USD value swapped
- Displays human-readable timestamps in both local timezone and UTC
- Creates clickable links to transactions, addresses, and token contracts on Snowtrace.io
- Supports analysis of any date (default: today)

## Installation

```bash
pip install -r requirements.txt
```

## Usage

### Analyze Today's Swaps
```bash
python3 avalanche_daily_swaps.py "0x1234567890123456789012345678901234567890"
```

### Analyze Specific Date
```bash
python3 avalanche_daily_swaps.py "0x1234567890123456789012345678901234567890" -d "2025-10-22"
```

### Save to File
```bash
python3 avalanche_daily_swaps.py "0x1234567890123456789012345678901234567890" -o swaps_analysis.md

# Or save to an output directory (recommended, gitignored)
python3 avalanche_daily_swaps.py "0x..." -o output/swaps_analysis.md
```

## Example Output

```markdown
# Daily Swap Analysis - October 22, 2025

**Address:** [0x1234567890123456789012345678901234567890](https://snowtrace.io/address/0x1234567890123456789012345678901234567890)
**Date:** October 22, 2025
**Total Swaps:** 3

**Total BTC.b Received:** 0.000206 ($22.27)
**Total USD Value Swapped:** $22.38

## Swap #1

**Transaction:** [0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890](https://snowtrace.io/tx/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890)
**Time:** October 22, 2025 at 07:52:35 PM MDT / October 23, 2025 at 01:52:35 AM UTC
**BTC.b Received:** 0.000047

**Tokens Swapped:**
- **USDC**: 5.138437 ($5.14)
  - Name: USD Coin
  - Contract: [0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e](https://snowtrace.io/token/0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e)

## Swap #2

**Transaction:** [0x1111111111111111111111111111111111111111111111111111111111111111](https://snowtrace.io/tx/0x1111111111111111111111111111111111111111111111111111111111111111)
**Time:** October 22, 2025 at 07:52:02 PM MDT / October 23, 2025 at 01:52:02 AM UTC
**BTC.b Received:** 0.000079

**Tokens Swapped:**
- **BLACK**: 65 ($8.60)
  - Name: BLACKHOLE
  - Contract: [0xcd94a87696fac69edae3a70fe5725307ae1c43f6](https://snowtrace.io/token/0xcd94a87696fac69edae3a70fe5725307ae1c43f6)

## Swap #3

**Transaction:** [0x2222222222222222222222222222222222222222222222222222222222222222](https://snowtrace.io/tx/0x2222222222222222222222222222222222222222222222222222222222222222)
**Time:** October 22, 2025 at 07:51:21 PM MDT / October 23, 2025 at 01:51:21 AM UTC
**BTC.b Received:** 0.00008

**Tokens Swapped:**
- **WAVAX**: 0.452194 ($8.64)
  - Name: Wrapped AVAX
  - Contract: [0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7](https://snowtrace.io/token/0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7)
```

## How It Works

1. **Fetches Transactions**: Gets all transactions for the address on the specified date
2. **Identifies Swaps**: Looks for transactions where BTC.b was received and other tokens were sent
3. **Parses Transfer Logs**: Analyzes ERC-20 Transfer events to extract token amounts
4. **Calculates Values**: Gets current USD prices and calculates total values
5. **Formats Output**: Creates a comprehensive markdown report with clickable links

## Notes

- The script focuses specifically on swaps TO BTC.b (Bitcoin on Avalanche)
- USD prices are fetched from multiple sources (Snowtrace + CoinGecko)
- All addresses, transactions, and contracts are clickable links to Snowtrace.io
- Timestamps are shown in both local timezone and UTC
- The script handles rate limiting and provides detailed error messages