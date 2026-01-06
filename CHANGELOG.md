# Changelog

All notable changes to the published tools will be documented in this file.

## [Unreleased]

## [1.5.2] - 2026-01-05

### Fixed - Pool Recommender (`blackhole_pool_recommender.py`)
- **Version**: 1.5.2
- **Bug Fix**: Fixed vote count extraction to handle "K" (thousands) suffix
  - Previously, "580.81K" was incorrectly parsed as 0 because the script only looked for "M" (millions) or raw numbers >= 1000
  - Updated all vote extraction regex patterns to support both "K" and "M" multipliers
  - Fixed share percentage and estimated reward calculations for pools with thousand-scale vote counts
  - Applied fix to all extraction locations: forward slot check, reverse slot check, and fallback text search

## [1.5.1] - 2025-12-29

### Fixed - Pool Recommender (`blackhole_pool_recommender.py`)
- **Version**: 1.5.1
- **Critical Bug Fix**: Fixed reward extraction to handle "k" (thousands) and "M" (millions) suffixes
  - Previously, "$26.49k" was incorrectly parsed as $26.49 instead of $26,490
  - Updated all reward extraction regex patterns to capture and apply suffix multipliers
  - Fixed estimated reward calculations that were showing incorrect values (e.g., $0.03 instead of $31.70)
  - Now correctly handles formats like "$26.49k", "$1.5M", "$100k", etc.
  - Applied fix to all extraction locations: fees, incentives, total rewards, and fallback searches
- **Testing**: Added comprehensive test suite for k/M suffix parsing
  - Tests for "k" suffix (thousands)
  - Tests for "M" suffix (millions)
  - Tests for multiple values (fees + incentives)
  - Tests for "Total" pattern matching with suffixes

### Fixed & Enhanced - Pool Recommender (`blackhole_pool_recommender.py`)
- **Version**: 1.5.0
- **Critical Bug Fix**: Fixed JavaScript syntax error in pool selection script
  - Changed outer function from `(function()` to `(async function()` to support `await` calls
  - Script now runs correctly when pasted into browser console
  - Resolved issue where script would not execute (just returned newline)
- **Enhanced Pool Discovery**: Significantly improved pool selection reliability
  - Case-insensitive address matching (handles checksummed vs lowercase addresses)
  - Searches all pools including hidden ones (handles dynamic filtering)
  - Makes hidden pools visible before selecting them
  - Waits for page/React to finish rendering before searching
  - Multiple search strategies with fallbacks:
    - Strategy 1: Address search in HTML/text (case-insensitive)
    - Strategy 2: Enhanced data attribute search
    - Strategy 3: Multiple name variations (with/without prefixes, token pairs)
    - Strategy 4: Deep search through React props and data attributes
- **Diagnostic Features**: Added comprehensive debugging output
  - Logs pool visibility (visible vs hidden counts)
  - Detects multiple pool sections/containers
  - Checks for search/filter inputs that might hide pools
  - Lists all pools found with their status and addresses
  - Shows which target pools are present/missing
- **Helper Functions**: Added utility functions for visibility handling
  - `isElementVisible()` - checks if pools are actually visible
  - `ensureElementVisible()` - makes hidden pools visible and scrolls into view
  - `waitForPools()` - waits for pools to be available before searching
- **Documentation**: Added wallet extension conflict troubleshooting
  - New section explaining common wallet conflicts (Keplr/ASI, multiple Ethereum wallets)
  - Symptoms and solutions for resolving extension conflicts
  - Example scenarios and step-by-step resolution guide
  - Reference in main README for easy discovery

### Enhanced - Transaction Narrator (`avalanche_transaction_narrator.py`)
- **Version**: 1.3.0
- **Supermassive NFT Claim Details**: Enhanced claim transaction descriptions to include comprehensive NFT information
  - Shows veBLACK NFT token ID for all claim transactions from RewardsClaimer contract
  - Displays **total locked BLACK amount** and **voting power** by querying VotingEscrow contract via web3.py
  - Uses `web3.py` library for proper ABI encoding/decoding and contract calls
  - Supports permalocked NFTs (displays "permalocked" status) and time-locked NFTs (shows expiration date)
  - Automatically detects and parses RewardsClaimer and VotingEscrow events from transaction logs
  - Example outputs:
    - Permalocked NFT: `Claimed 12.34 BLACK rewards from veBLACK NFT #4438 (18226.40 veBLACK permalocked)`
    - Time-locked NFT: `Claimed rewards from veBLACK NFT #1234 (103.27 BLACK locked until 2029-07-04, 93.04 veBLACK voting power)`
  - For permalocked NFTs, voting power equals locked amount, so only displayed once for clarity
  - **New dependency**: Added `web3>=6.0.0` to requirements.txt
  - Works for both regular claims and burn/claim operations

### Enhanced - Pool Recommender (`blackhole_pool_recommender.py`)
- **Version**: 1.3.2
- **Single-Line Display Mode**: Added `--single-line` option for compact, aligned output format
  - Displays each pool on a single line with pool name, estimated reward, and share percentage
  - Pool names are left-aligned, dollar amounts are right-aligned (bolded), share percentages are left-aligned
  - More compact and easier to scan than the default multi-line format
  - Requires `--voting-power` to display estimated rewards
  - Example: `1. CL200-SPX/USDC:        $1,423.94 (29.17% share)`

### Fixed - Pool Recommender (`blackhole_pool_recommender.py`)
- **Version**: 1.3.1
- **VAPR Extraction Bug Fix**: Fixed VAPR extraction to correctly handle comma-separated numbers
  - Updated regex patterns to match numbers with commas (e.g., "1,684.6%" instead of truncating to "1%")
  - All VAPR extraction points now properly remove commas before converting to float
  - Fixes display issue where large VAPR values (e.g., 1,684.6%) were incorrectly shown as smaller values (e.g., 697.20%)
  - Added tests to verify comma-separated VAPR extraction

### Enhanced - Pool Recommender (`blackhole_pool_recommender.py`)
- **Version**: 1.2.0 (new)
- **Caching System**: Added automatic caching of pool data to speed up subsequent runs
  - Caches all pools (not filtered) so different filter combinations work with cached data
  - Shared cache across all tools (pool recommender, pool tracker, etc.)
  - Configurable cache expiry (default: 60 minutes / 1 hour)
  - Cache status shown on each run with local and UTC times
  - `--no-cache` option to skip cache and fetch fresh data (still refreshes cache)
  - `--cache-info` option to show detailed cache information
  - `--clear-cache` option to manually clear cache files
  - Warning when cached data seems incomplete (< 10 pools)
  - Cache directory configurable in `config.yaml`

### Enhanced - Pool Tracking (`track_pool_changes.py`)
- **Version**: 1.1.0 (new)
- **Caching Support**: Now uses shared cache from pool recommender
  - Faster runs when cache is available
  - `--no-cache` option to skip cache and fetch fresh data
  - `--cache-info` option to show detailed cache information
  - `--clear-cache` option to manually clear cache files

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
