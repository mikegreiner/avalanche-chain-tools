# Usage Guide: Running Tools with Your Wallet Address

After sanitizing the codebase, all personal wallet addresses have been removed and replaced with placeholders. This guide explains how to use the tools with your actual wallet address.

## Quick Start

### 1. Set Up Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your wallet address:

```bash
# Your wallet address (for voting history, transaction analysis, etc.)
BLACKHOLE_WALLET_ADDRESS=0xYourWalletAddressHere

# Your private key (only needed for voting, not for viewing history)
BLACKHOLE_VOTER_PRIVATE_KEY=0xYourPrivateKeyHere
```

**Important:** The `.env` file is already in `.gitignore` and will never be committed.

### 2. Install python-dotenv (Optional but Recommended)

```bash
pip install python-dotenv
```

This allows scripts to automatically load your `.env` file. If you don't install it, you'll need to pass wallet addresses via command-line arguments.

## Usage Patterns

### Pattern 1: Command-Line Argument (Always Works)

Most tools take wallet addresses as command-line arguments:

```bash
# Transaction narrator
python3 avalanche_transaction_narrator.py 0xYourWalletAddressHere

# Daily swap analyzer
python3 avalanche_daily_swaps.py 0xYourWalletAddressHere -d "2025-10-22"
```

### Pattern 2: Environment Variable (Recommended for Repeated Use)

With `python-dotenv` installed, some scripts can read from `.env` automatically:

```bash
export BLACKHOLE_WALLET_ADDRESS=0xYourWalletAddressHere
python3 avalanche_transaction_narrator.py $BLACKHOLE_WALLET_ADDRESS
```

Or use a `.env` file (see Quick Start above).

### Pattern 3: Export Environment Variable

If you prefer not to use `.env`, export the variable in your shell:

```bash
export BLACKHOLE_WALLET_ADDRESS=0xYourWalletAddressHere
# Then use in commands
python3 avalanche_transaction_narrator.py $BLACKHOLE_WALLET_ADDRESS
```

## Script-Specific Usage

### Transaction Narrator

The narrator takes wallet address as a required argument:

```bash
# Analyze last day's transactions
python3 avalanche_transaction_narrator.py 0xYourWalletAddressHere

# Last 7 days
python3 avalanche_transaction_narrator.py 0xYourWalletAddressHere -d 7

# Save to file
python3 avalanche_transaction_narrator.py 0xYourWalletAddressHere -o narrative.md
```

### Transaction Reader

Reads and analyzes individual transactions:

```bash
# Using transaction hash
python3 avalanche_transaction_reader.py 0xYourTransactionHashHere

# Save to file
python3 avalanche_transaction_reader.py 0xYourTransactionHashHere -o analysis.md
```

### Daily Swap Analyzer

Analyzes daily swap transactions for a wallet:

```bash
# Analyze today's swaps
python3 avalanche_daily_swaps.py 0xYourWalletAddressHere

# Analyze specific date
python3 avalanche_daily_swaps.py 0xYourWalletAddressHere -d "2025-10-22"
```

### Pool Recommender

The pool recommender doesn't require wallet addresses (it analyzes all pools):

```bash
# Recommend top pools
python3 blackhole_pool_recommender.py

# With custom voting power
python3 blackhole_pool_recommender.py --voting-power 15000
```

**Note:** Voting automation scripts (like `blackhole_voter.py` and `show_voting_history.py`) are available on the `feature/automated-voting` branch and use similar environment variable patterns.

## Testing

For running tests with wallet addresses:

```bash
# Set environment variable for tests
export BLACKHOLE_WALLET_ADDRESS=0xYourWalletAddressHere
pytest tests/

# Or use pytest's env variable support
BLACKHOLE_WALLET_ADDRESS=0xYourWalletAddressHere pytest tests/
```

## Environment Variables Reference

| Variable | Purpose | Required For |
|----------|---------|--------------|
| `BLACKHOLE_WALLET_ADDRESS` | Your wallet address | Transaction analysis, testing (optional - can use command-line args) |
| `BLACKHOLE_VOTER_PRIVATE_KEY` | Private key for signing | Automated voting (production - feature branch only) |
| `BLACKHOLE_TEST_WALLET_KEY` | Test wallet private key | Automated voting (testing - feature branch only) |

## Security Best Practices

1. **Never commit `.env`**: Already in `.gitignore`, but double-check before commits
2. **Use environment variables**: Don't pass sensitive data via command-line
3. **Separate test and production keys**: Use different wallets/keys for testing
4. **Review before pushing**: Always check `git status` and `git diff` before pushing

## Troubleshooting

### Script shows placeholder address instead of mine

**Solution:** Make sure `.env` file exists and contains `BLACKHOLE_WALLET_ADDRESS`, or pass wallet as command-line argument.

### Script can't find my wallet address

**Solution:** 
1. Check `.env` file exists: `cat .env`
2. Verify variable name: `grep BLACKHOLE_WALLET_ADDRESS .env`
3. Ensure `python-dotenv` is installed: `pip install python-dotenv`

### Private key not found for voting

**Solution:** Set `BLACKHOLE_VOTER_PRIVATE_KEY` in `.env` file (never commit this file).

## Example `.env` File

```bash
# Copy from .env.example and customize

# Wallet address for viewing history/analysis
BLACKHOLE_WALLET_ADDRESS=0x1234567890123456789012345678901234567890

# Private key for voting (KEEP SECRET!)
BLACKHOLE_VOTER_PRIVATE_KEY=0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890

# Optional: Test wallet key
# BLACKHOLE_TEST_WALLET_KEY=0x...
```

Remember: The `.env` file is gitignored and will never be committed to version control.
