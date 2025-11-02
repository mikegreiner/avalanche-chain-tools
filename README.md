# Avalanche Chain Tools

A collection of Python tools for analyzing Avalanche C-Chain transactions, swaps, and Blackhole DEX pool recommendations.

## Tools

### 1. Avalanche Transaction Reader
**Script:** `avalanche_transaction_reader.py`  
**Version:** 1.0.0

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

# Check version
python3 avalanche_transaction_reader.py --version
```

**Documentation:** See [docs/README_avalanche_reader.md](docs/README_avalanche_reader.md)

---

### 2. Avalanche Transaction Narrator
**Script:** `avalanche_transaction_narrator.py`  
**Version:** 1.1.0

Generates human-friendly descriptions of recent transactions for a given Avalanche C-Chain address, organizing activities by type (swaps, voting rewards, Supermassive NFT activities, etc.).

**Features:**
- Analyzes recent transactions for an address
- Organizes transactions into meaningful activity types
- Generates chronological narrative with activity indicators ([NFT], [SWAP], [TX], [REWARD])
- Identifies Blackhole DEX swaps, voting rewards, and Supermassive NFT activities
- Shows transaction status (SUCCESS/FAILED) with gas information for failed transactions
- Enhanced approval descriptions showing token and contract names (e.g., "Approved BlackholeRouter to spend WAVAX")
- Correctly distinguishes between merge() and vote() transactions

**Usage:**
```bash
# Analyze last day's transactions
python3 avalanche_transaction_narrator.py "0x1234567890123456789012345678901234567890"

# Analyze last 7 days
python3 avalanche_transaction_narrator.py "0x1234567890123456789012345678901234567890" -d 7

# Save to file (or use output/ directory - gitignored)
python3 avalanche_transaction_narrator.py "0x..." -o narrative.md

# Check version
python3 avalanche_transaction_narrator.py --version
```

**Documentation:** See [docs/README_transaction_narrator.md](docs/README_transaction_narrator.md)

---

### 3. Avalanche Daily Swap Analyzer
**Script:** `avalanche_daily_swaps.py`  
**Version:** 1.0.0

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

# Check version
python3 avalanche_daily_swaps.py --version
```

**Documentation:** See [docs/README_daily_swaps.md](docs/README_daily_swaps.md)

---

### 4. Blackhole DEX Pool Recommender
**Script:** `blackhole_pool_recommender.py`  
**Version:** 1.1.2

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

# Filter by minimum total rewards (focus on larger, more stable pools)
python3 blackhole_pool_recommender.py --min-rewards 1000

# Combine filters
python3 blackhole_pool_recommender.py --voting-power 15000 --min-rewards 500 --hide-vamm

# Debug mode (shows browser)
python3 blackhole_pool_recommender.py --no-headless

# Save to file
python3 blackhole_pool_recommender.py --voting-power 15000 -o recommendations.txt

# Check version
python3 blackhole_pool_recommender.py --version
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

### Configuration (Optional)

All tools work with default settings, but you can customize behavior via `config.yaml`:

```bash
# Edit the configuration file
nano config.yaml
```

**Key settings you might want to change:**
- **API Key**: Replace `"YourApiKeyToken"` with your Snowtrace API key for higher rate limits
- **Logging Level**: Change from `"INFO"` to `"DEBUG"` for detailed debugging output
- **Token Addresses**: Add or modify token addresses if needed

The config file is optional - all tools will work with sensible defaults if `config.yaml` doesn't exist or has errors.

**Note:** If you're adding API keys or sensitive data to `config.yaml`, consider adding it to `.gitignore` to avoid committing secrets.

## Project Structure

```
.
├── README.md                           # This file
├── requirements.txt                    # Python dependencies
├── config.yaml                         # Configuration file (optional)
│
├── avalanche_base.py                   # Base class for all tools
├── avalanche_utils.py                  # Shared utilities
├── avalanche_transaction_reader.py     # Transaction reader tool
├── avalanche_transaction_narrator.py   # Transaction narrator tool
├── avalanche_daily_swaps.py           # Daily swap analyzer
├── blackhole_pool_recommender.py      # Pool recommender
│
├── scripts/                            # Helper scripts
│   ├── inspect_blackhole_page.py      # Page inspection helper
│   └── find_api_endpoint.py           # API endpoint finder
│
├── docs/                               # Documentation
│   ├── README_avalanche_reader.md
│   ├── README_daily_swaps.md
│   ├── README_pool_recommender.md
│   ├── CONFIGURATION.md                # Configuration guide
│   ├── IMPLEMENTATION_NOTES.md
│   └── TEST_RESULTS.md
├── CONTRIBUTING.md                     # Contributing guidelines
│
├── tests/                              # Test suite
│   ├── test_utils.py
│   ├── test_transaction_reader.py
│   ├── test_daily_swaps.py
│   ├── test_transaction_narrator.py
│   └── test_pool_recommender.py
│
└── debug/                              # Debug scripts (development)
    └── ...
```

## Configuration

All tools support optional configuration via `config.yaml`. See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for details.

**Quick setup:**
- Add your Snowtrace API key to `config.yaml` for higher rate limits
- Adjust logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`)
- Customize token addresses or other settings as needed

The config file is optional - tools work with defaults if not present.

### Environment Variables

For tools that need wallet addresses or private keys, you can use a `.env` file for secure configuration. See [docs/USAGE_GUIDE.md](docs/USAGE_GUIDE.md) for details.

**Quick start:**
```bash
cp .env.example .env
# Edit .env and add your wallet address
# The .env file is gitignored and won't be committed
```

## Notes

- All scripts use the Snowtrace.io API for transaction data
- USD prices are fetched from multiple sources (Snowtrace + CoinGecko)
- The Blackhole Pool Recommender uses Selenium for web scraping (with API fallback)
- All addresses, transactions, and contracts in outputs are clickable links to Snowtrace.io
- Timestamps are shown in both local timezone and UTC
- **Output files**: You can save generated files to an `output/` directory (gitignored) or any location you prefer
- **Logging**: All tools use Python's logging module - adjust levels via `config.yaml` or environment

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! We appreciate your help in improving these tools.

### Quick Start

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes following our [contributing guidelines](CONTRIBUTING.md)
4. Write tests and ensure all tests pass (`pytest tests/`)
5. Submit a pull request

### What We're Looking For

- **Bug fixes**: Fix issues and improve reliability
- **New features**: Add functionality that aligns with the project goals
- **Documentation**: Improve docs, examples, or code comments
- **Tests**: Increase test coverage or add edge case tests
- **Code quality**: Refactoring, type hints, error handling improvements

### Development Setup

See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Complete development setup guide
- Code style guidelines
- Architecture overview
- Testing requirements
- Pull request process

**Before submitting**: Ensure all tests pass and follow the project's code style.
