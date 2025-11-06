# Changelog

All notable changes to the published tools will be documented in this file.

## [Unreleased]

### Enhanced - Token Price Lookup (`avalanche_utils.py`)
- **Multiple Price Sources**: Added DefiLlama and DexScreener APIs as alternatives to CoinGecko
  - DefiLlama API (free, no rate limits) - primary fallback
  - DexScreener API (free alternative) - last resort fallback
  - Improved price lookup success rate, especially for lesser-known tokens
- **Improved Rate Limit Handling**: 
  - Automatic retry with backoff for CoinGecko rate limits (429 errors)
  - Better error logging and debugging
  - Delays between token lookups to avoid hitting limits
- **Symbol-Based Search Fallback**: 
  - When contract lookup fails, uses token symbol to search CoinGecko
  - Helps find prices for tokens that might not be indexed by contract address
  - Automatically passed from scripts that already have token info

### Enhanced - Transaction Reader (`avalanche_transaction_reader.py`)
- **Configurable Header Sizes**: Added `--header-size` option (default: 1, range: 1-5)
  - Useful for embedding output in larger markdown documents
  - Example: `--header-size 2` starts with `##` instead of `#`
- **Better Price Lookup**: Now benefits from improved multi-source price lookup

### Enhanced - Daily Swap Analyzer (`avalanche_daily_swaps.py`)
- **ERC-721 NFT Transfer Handling**: Automatically skips NFT transfers (only processes ERC-20 token transfers)
  - Fixes parsing errors when transactions contain NFT transfers
  - Distinguishes between ERC-20 (3 topics + data) and ERC-721 (4+ topics, empty data)
- **Configurable Header Sizes**: Added `--header-size` option (default: 1, range: 1-5)
  - Useful for embedding output in larger markdown documents
  - Example: `--header-size 2` starts with `##` instead of `#`
- **Fixed Date Range Logic**: Search end date now capped to current time to prevent API errors
  - Prevents "NOTOK" errors when analyzing today's transactions
  - Falls back to estimation if API fails
- **Better Price Lookup**: Now benefits from improved multi-source price lookup

### Enhanced - Pool Tracking (`track_pool_changes.py`)
- **Profitability Score Tracking**: Added profitability score display to history output
  - Shows profitability score changes over time in both "OVERALL PERFORMANCE" and "VOTES ADDED" sections
  - Displays absolute change and percentage change (when available)
  - Includes direction indicators (?, ?, ?) for quick visual assessment
- **Improved Sorting**: "TOP POOLS BY OVERALL PERFORMANCE" section now sorts by:
  - Primary: Profitability score (highest first)
  - Secondary: Rewards per vote (least dilution as tiebreaker)
  - This provides a more intuitive ranking that prioritizes the recommender's profitability score

### Improved - Transaction Narrator (`avalanche_transaction_narrator.py`)
- **Version**: 1.1.0 (new)
- **Version tracking**: Added `--version` flag support
- **Transaction Status Tracking**: Now shows [SUCCESS] or [FAILED] status for all transactions
- **Gas Information**: Failed transactions display gas used and likely failure reason (insufficient gas)
- **Enhanced Approval Descriptions**: Approval transactions now show:
  - Token name (e.g., "WAVAX", "BTC.b", "BLACK")
  - Contract name (e.g., "BlackholeRouter", "VotingEscrow") instead of truncated addresses
  - Approval amount with proper formatting
  - Special handling for infinite approvals and revocations
- **Improved Transaction Classification**:
  - Correctly distinguishes between `merge()` and `vote()` transactions
  - Better identification of Blackhole DEX operations
- **Better Output Format**:
  - Replaced emoji placeholders with ASCII-friendly indicators ([NFT], [SWAP], [TX], [REWARD])
  - Markdown-compatible output
- **Error Handling**: Improved robustness for parsing hex data and empty transaction fields

### Enhanced - Pool Recommender (`blackhole_pool_recommender.py`)
- **Version**: 1.1.2
- **Epoch Close Time Display**: Added epoch close date/time display in both UTC and local timezone
  - Extracts epoch close time from the voting page during pool scraping
  - Displays in output headers: "Epoch Close (UTC)" and "Epoch Close (Local)"
  - Also included in JSON output format
  - Helps users know when to submit votes before the deadline
- **Pool ID Extraction**: Attempts to extract pool contract addresses from HTML data attributes
- Improved pool identification for better tracking

### Version Tracking Added
- **Transaction Reader** (`avalanche_transaction_reader.py`): Added version 1.0.0 with `--version` flag
- **Daily Swap Analyzer** (`avalanche_daily_swaps.py`): Added version 1.0.0 with `--version` flag
- All published scripts now support consistent version tracking via `--version` flag

---

## [Previous Releases]

See git history for earlier changes.
