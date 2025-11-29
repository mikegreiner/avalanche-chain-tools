# Avalanche C-Chain Transaction Narrator

A Python script that analyzes recent transactions for a given Avalanche C-Chain address and generates human-friendly descriptions of what happened, organizing activities by type (swaps, voting rewards, Supermassive NFT activities, etc.).

## Features

- Analyzes recent transactions for an address over a specified time period
- Organizes transactions into meaningful activity types (swaps, claims, voting, NFT operations)
- Generates chronological narrative with activity indicators: `[NFT]`, `[SWAP]`, `[TX]`, `[REWARD]`
- Identifies Blackhole DEX operations:
  - Swaps (single-step and multi-step)
  - Voting transactions with detailed pool information:
    - veBLACK NFT token ID used for voting
    - Pool token pairs (e.g., WAVAX/USDC, BTC.b/WAVAX)
    - Voting weight distribution percentages
  - Voting rewards claims
  - Supermassive NFT reward claims and restaking
  - Merge operations (combining veBLACK locks)
- Shows transaction status (`[SUCCESS]` or `[FAILED]`) for all transactions
- Displays gas information for failed transactions
- **Extracts revert reasons for failed transactions** using multiple methods:
  - RPC transaction tracing (most reliable)
  - Direct RPC calls to simulate transaction
  - Snowtrace API fallback
  - Decodes Error(string) and Panic(uint256) revert reasons
- **Caching for receipts and transaction data** to reduce duplicate API calls and improve performance
- Enhanced approval descriptions showing:
  - Token name (e.g., "WAVAX", "BTC.b", "BLACK")
  - Contract name (e.g., "BlackholeRouter", "VotingEscrow") instead of truncated addresses
  - Approval amount with proper formatting
  - Special handling for infinite approvals and revocations
- Correctly distinguishes between `merge()` and `vote()` transactions
- Creates clickable links to transactions on Snowtrace.io
- Outputs formatted markdown with human-readable timestamps (both local timezone and UTC)

## Installation

```bash
pip install -r requirements.txt
```

## Usage

### Analyze Last Day's Transactions

```bash
python3 avalanche_transaction_narrator.py "0x1234567890123456789012345678901234567890"
```

### Analyze Last 7 Days

```bash
python3 avalanche_transaction_narrator.py "0x1234567890123456789012345678901234567890" -d 7
```

### Analyze Last 30 Days

```bash
python3 avalanche_transaction_narrator.py "0x1234567890123456789012345678901234567890" -d 30
```

### Save to File

```bash
python3 avalanche_transaction_narrator.py "0x1234567890123456789012345678901234567890" -o narrative.md

# Or save to an output directory (recommended, gitignored)
python3 avalanche_transaction_narrator.py "0x..." -d 7 -o output/narrative.md
```

### Check Version

```bash
python3 avalanche_transaction_narrator.py --version
```

## Example Output

```markdown
# Transaction Narrative - 0x1234567890123456789012345678901234567890

**Period:** November 01, 2025 to November 02, 2025
**Total Transactions:** 5

## Today's DeFi Activities

**Total Activities:** 5

### [NFT] Supermassive NFT Activities (1)
- **November 02, 2025 at 07:40:59 AM MST / November 02, 2025 at 02:40:59 PM UTC:** Merged veBLACK lock #1234 into lock #5678

### [SWAP] Token Swaps (2)
- **November 02, 2025 at 08:15:23 AM MST / November 02, 2025 at 03:15:23 PM UTC:** Blackhole DEX swap: 100 WAVAX for 89.5 USDC
- **November 02, 2025 at 08:20:10 AM MST / November 02, 2025 at 03:20:10 PM UTC:** Blackhole DEX multi-step swap: 50 USDC ? WAVAX ? 0.0023 BTC.b

### [TX] Other Activities (3)
- **November 02, 2025 at 07:36:25 AM MST / November 02, 2025 at 02:36:25 PM UTC:** Approved BlackholeRouter to spend unlimited WAVAX
- **November 02, 2025 at 08:14:50 AM MST / November 02, 2025 at 03:14:50 PM UTC:** Approved BlackholeRouter to spend 1000 USDC
- **November 02, 2025 at 09:30:15 AM MST / November 02, 2025 at 04:30:15 PM UTC:** Voted on 3 Blackhole DEX pools with veBLACK NFT #4438: WAVAX/USDC (50.0%), BTC.b/WAVAX (25.0%), WETH.e/WAVAX (25.0%)

## Detailed Transaction Log

### November 02, 2025 at 07:36:25 AM MST / November 02, 2025 at 02:36:25 PM UTC - [TX] Approval [SUCCESS]

**Transaction:** [0x2bdc5e54...](https://snowtrace.io/tx/0x2bdc5e54ca313e9be6646ce0c7d4372e8acdbe9434bc55f4b3d4bc452d524c62)
**Description:** Approved BlackholeRouter to spend unlimited WAVAX

### November 02, 2025 at 07:40:59 AM MST / November 02, 2025 at 02:40:59 PM UTC - [NFT] Merge [SUCCESS]

**Transaction:** [0x0c055ba6...](https://snowtrace.io/tx/0x0c055ba6c753569bc726192b8dcbe6f4341aa2840c08f12a539867b31d722a93)
**Description:** Merged veBLACK lock #1234 into lock #5678

### November 02, 2025 at 08:15:23 AM MST / November 02, 2025 at 03:15:23 PM UTC - [SWAP] Swap [SUCCESS]

**Transaction:** [0xdef32674...](https://snowtrace.io/tx/0xdef326742486f3c20e4590e0a194ac68b6dbcef487b187e887a719900a8f95d3)
**Description:** Blackhole DEX swap: 100 WAVAX for 89.5 USDC

### November 02, 2025 at 08:20:10 AM MST / November 02, 2025 at 03:20:10 PM UTC - [SWAP] Swap [SUCCESS]

**Transaction:** [0x315cf264...](https://snowtrace.io/tx/0x315cf264e9fa99e5370343ce2a039c39dfd36f82c4a9bc3e57c014b7f984867b)
**Description:** Blackhole DEX multi-step swap: 50 USDC ? WAVAX ? 0.0023 BTC.b
```

## How It Works

1. **Fetches Transactions**: Gets all transactions for the address within the specified time range using Snowtrace API
2. **Classifies Transactions**: Identifies transaction types by analyzing:
   - Function signatures in transaction input data
   - Contract addresses (especially Blackhole DEX contracts)
   - Token transfer events in transaction logs
   - Transaction status (success/failure) from receipts
3. **Groups Related Transactions**: Groups approval + swap transactions into complete swap sequences
4. **Organizes Activities**: Categorizes transactions into activity groups:
   - Supermassive NFT activities (claims, merges, restaking)
   - Voting rewards (multiple token types received)
   - Token swaps (including multi-step Blackhole DEX swaps)
   - Other activities (approvals, transfers, etc.)
5. **Generates Narrative**: Creates a human-friendly markdown report with:
   - Activity summary by type
   - Detailed chronological transaction log
   - Transaction status and gas information
   - Clickable links to Snowtrace.io

## Transaction Types

The narrator recognizes and describes the following transaction types:

### Swaps
- **Blackhole DEX swaps**: Identifies swaps on Blackhole DEX, including multi-step swaps
- **Standard swaps**: Generic token swap transactions

### Claims & Rewards
- **Supermassive NFT rewards**: Claims from Blackhole DEX Supermassive NFT system with detailed information:
  - veBLACK NFT token ID
  - **Total BLACK locked** in the NFT (queried from contract)
  - **Voting power** in veBLACK
  - Lock status (permalocked or expiration date)
  - Examples:
    - Permalocked: `Claimed 12.34 BLACK rewards from veBLACK NFT #4438 (18226.40 veBLACK permalocked)`
    - Time-locked: `Claimed rewards from veBLACK NFT #1234 (103.27 BLACK locked until 2029-07-04, 93.04 veBLACK voting power)`
  - Note: For permalocked NFTs, voting power equals locked amount, so only shown once
- **Voting rewards**: Multiple token types received (typical of voting rewards)
- **General claims**: Other reward claim transactions

### Voting & NFT Operations
- **Vote transactions**: Calls to the Blackhole DEX voter contract with detailed information:
  - veBLACK NFT token ID used for voting
  - Number of pools voted for
  - Token pairs for each pool (e.g., WAVAX/USDC, BTC.b/WAVAX)
  - Weight distribution percentages across pools
- **Merge operations**: Merging veBLACK NFT locks (with token IDs when available)

### Approvals
- **Token approvals**: Shows token name, contract name, and approval amount
- **Infinite approvals**: Detected and labeled as "unlimited"
- **Revocations**: Approval amount of 0 is shown as a revocation

### Other
- **Token transfers**: Standard ERC-20 transfers
- **Contract interactions**: Other contract calls

## Transaction Status

All transactions display their status:
- `[SUCCESS]`: Transaction was successfully executed
- `[FAILED]`: Transaction reverted (shows gas used and likely reason)

Failed transactions include:
- Gas used / Gas limit (percentage)
- Likely failure reason (typically insufficient gas limit)

## Activity Indicators

The narrator uses ASCII-friendly indicators instead of emojis:

- `[NFT]`: Supermassive NFT activities (claims, merges, restaking)
- `[SWAP]`: Token swap transactions
- `[REWARD]`: Voting rewards claims
- `[TX]`: Other transactions (approvals, transfers, etc.)

## Version

Check the script version:
```bash
python3 avalanche_transaction_narrator.py --version
```

Current version: **1.3.0**

## Notes

- The script analyzes transactions within a specified time range (default: last 1 day)
- USD prices are not calculated - the focus is on transaction classification and description
- All addresses, transactions, and contracts in outputs are clickable links to Snowtrace.io
- Timestamps are shown in both local timezone and UTC
- The script handles rate limiting and provides detailed error messages
- Transaction receipts are fetched to determine success/failure status
- Contract names are cached to reduce API calls
- The script automatically detects Blackhole DEX operations based on known contract addresses
- Voting transaction decoding requires the `eth-abi` package (automatically installed with requirements.txt)

## Known Limitations

- Large time ranges (>30 days) may take longer to process due to API rate limits
- Some complex contract interactions may be classified as "Other activities"
- Multi-step swap paths may show intermediate tokens with `?` separator (path inference)
- Failed transactions show gas information but may not always identify the exact failure reason

## Tips

- Start with a small time range (1-7 days) to get familiar with the output format
- Use `-d 30` or higher to see longer-term activity patterns
- Save output to a file for easier review and sharing
- If you see many transactions, increase the days parameter to capture complete swap sequences
