# Avalanche Chain Tools

A collection of Python tools for analyzing Avalanche C-Chain transactions, swaps, and Blackhole DEX pool recommendations.

## Tools

### 1. Avalanche Transaction Reader
**Script:** `avalanche_transaction_reader.py`

Reads Avalanche C-Chain transactions from Snowtrace.io and extracts token transfer information with USD value calculations.

**Features:**
- Fetches transaction data from Snowtrace.io API
- Parses ERC-20 token transfer events
- Calculates total tokens received by the transaction sender
- Fetches token metadata and USD prices (Snowtrace + CoinGecko)
- Outputs formatted markdown with clickable links

**Usage:**
```bash
# Using full Snowtrace URL or transaction hash
python3 avalanche_transaction_reader.py "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"

# Save to file (or use output/ directory - gitignored)
python3 avalanche_transaction_reader.py "0x..." -o analysis.md
```

**Documentation:** See [docs/README_avalanche_reader.md](docs/README_avalanche_reader.md)

---

### 2. Avalanche Transaction Narrator
**Script:** `avalanche_transaction_narrator.py`

Generates human-friendly descriptions of recent transactions for a given Avalanche C-Chain address, organizing activities by type (swaps, voting rewards, Supermassive NFT activities, etc.).

**Features:**
- Analyzes recent transactions for an address
- Organizes transactions into meaningful activity types
- Generates chronological narrative with emoji indicators
- Identifies Blackhole DEX swaps, voting rewards, and Supermassive NFT activities

**Usage:**
```bash
# Analyze last day's transactions
python3 avalanche_transaction_narrator.py "0x1234567890123456789012345678901234567890"

# Analyze last 7 days
python3 avalanche_transaction_narrator.py "0x1234567890123456789012345678901234567890" -d 7

# Save to file (or use output/ directory - gitignored)
python3 avalanche_transaction_narrator.py "0x..." -o narrative.md
```

---

### 3. Avalanche Daily Swap Analyzer
**Script:** `avalanche_daily_swaps.py`

Analyzes daily swap transactions for a given Avalanche C-Chain address, focusing on swaps to BTC.b.

**Features:**
- Analyzes all transactions for an address on a specific date
- Filters for swap transactions to BTC.b (Bitcoin on Avalanche)
- Shows detailed breakdown of each swap with token amounts and USD values
- Calculates totals for BTC.b received and USD value swapped

**Usage:**
```bash
# Analyze today's swaps
python3 avalanche_daily_swaps.py "0x1234567890123456789012345678901234567890"

# Analyze specific date
python3 avalanche_daily_swaps.py "0x1234567890123456789012345678901234567890" -d "2025-10-22"

# Save to file (or use output/ directory - gitignored)
python3 avalanche_daily_swaps.py "0x..." -o swaps_analysis.md
```

**Documentation:** See [docs/README_daily_swaps.md](docs/README_daily_swaps.md)

---

### 4. Blackhole DEX Pool Recommender
**Script:** `blackhole_pool_recommender.py`

Analyzes liquidity pools on Blackhole DEX and recommends the most profitable pools for voting, accounting for dilution and estimating personal rewards.

**Features:**
- Fetches pool data from https://blackhole.xyz/vote
- Analyzes pools accounting for dilution (rewards per vote)
- Calculates profitability score factoring in dilution
- Estimates personal USD rewards based on voting power
- Recommends top pools sorted by estimated reward

**Usage:**
```bash
# Recommend top 5 pools
python3 blackhole_pool_recommender.py

# Customize number of recommendations
python3 blackhole_pool_recommender.py --top 3

# Estimate rewards based on your voting power
python3 blackhole_pool_recommender.py --voting-power 15000

# Hide vAMM pools
python3 blackhole_pool_recommender.py --voting-power 15000 --hide-vamm

# Debug mode (shows browser)
python3 blackhole_pool_recommender.py --no-headless
```

**Documentation:** See [docs/README_pool_recommender.md](docs/README_pool_recommender.md)

---

## Installation

### Requirements

Install Python dependencies:
```bash
pip install -r requirements.txt
```

### Additional Setup

For **Blackhole Pool Recommender**, you'll also need ChromeDriver:
- **Linux:** `sudo apt-get install chromium-chromedriver`
- **macOS:** `brew install chromedriver`
- **Windows:** Download from https://chromedriver.chromium.org/

## Project Structure

```
.
??? README.md                           # This file
??? requirements.txt                    # Python dependencies
?
??? avalanche_transaction_reader.py     # Transaction reader tool
??? avalanche_transaction_narrator.py   # Transaction narrator tool
??? avalanche_daily_swaps.py           # Daily swap analyzer
??? blackhole_pool_recommender.py      # Pool recommender
?
??? scripts/                            # Helper scripts
?   ??? inspect_blackhole_page.py      # Page inspection helper
?   ??? find_api_endpoint.py           # API endpoint finder
?
??? docs/                               # Documentation
?   ??? README_avalanche_reader.md
?   ??? README_daily_swaps.md
?   ??? README_pool_recommender.md
?   ??? IMPLEMENTATION_NOTES.md
?   ??? TEST_RESULTS.md
?
??? debug/                              # Debug scripts (development)
    ??? ...
```

## Notes

- All scripts use the Snowtrace.io API for transaction data
- USD prices are fetched from multiple sources (Snowtrace + CoinGecko)
- The Blackhole Pool Recommender uses Selenium for web scraping (with API fallback)
- All addresses, transactions, and contracts in outputs are clickable links to Snowtrace.io
- Timestamps are shown in both local timezone and UTC
- **Output files**: You can save generated files to an `output/` directory (gitignored) or any location you prefer

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
