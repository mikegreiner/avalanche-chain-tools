# Changelog

All notable changes to the published tools will be documented in this file.

## [Unreleased]

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
