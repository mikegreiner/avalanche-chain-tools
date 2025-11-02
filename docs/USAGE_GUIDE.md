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

### Pattern 1: Environment Variable (Recommended)

With `python-dotenv` installed, most scripts will automatically read from `.env`:

```bash
# View voting history (uses BLACKHOLE_WALLET_ADDRESS from .env)
python3 scripts/show_voting_history.py

# View last 5 epochs
python3 scripts/show_voting_history.py --friendly --limit 5
```

### Pattern 2: Command-Line Argument

You can always override the environment variable by passing the wallet address directly:

```bash
# Explicit wallet address
python3 scripts/show_voting_history.py 0xYourWalletAddressHere

# With options
python3 scripts/show_voting_history.py 0xYourWalletAddressHere --friendly --limit 10
```

### Pattern 3: Export Environment Variable

If you prefer not to use `.env`, export the variable in your shell:

```bash
export BLACKHOLE_WALLET_ADDRESS=0xYourWalletAddressHere
python3 scripts/show_voting_history.py
```

## Script-Specific Usage

### Voting History Script

```bash
# Default (uses .env or placeholder)
python3 scripts/show_voting_history.py

# Friendly output
python3 scripts/show_voting_history.py --friendly

# Short format
python3 scripts/show_voting_history.py --friendly --short

# Limit to last N epochs
python3 scripts/show_voting_history.py --friendly --limit 5

# Explicit wallet
python3 scripts/show_voting_history.py 0xYourWalletAddressHere --friendly
```

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

### Blackhole Voter (Automated Voting)

The voter requires a private key (for signing transactions):

```bash
# Private key from .env
python3 blackhole_voter.py --pools-json recommendations.json --dry-run

# Explicit private key (NOT RECOMMENDED - use env var)
python3 blackhole_voter.py --pools-json recommendations.json --private-key 0x... --dry-run
```

**Security Note:** Always use environment variables for private keys. Never pass them on the command line where they might be visible in process lists.

### Validation Scripts

```bash
# Validate past transactions (uses wallet from .env or argument)
python3 scripts/validate_all_past_transactions.py

# With explicit wallet
python3 scripts/validate_all_past_transactions.py 0xYourWalletAddressHere
```

## Testing

For running tests, wallet addresses are now placeholders by default. To test with your actual wallet:

```bash
# Set environment variable for tests
export BLACKHOLE_WALLET_ADDRESS=0xYourWalletAddressHere
pytest tests/

# Or use pytest's env variable support
BLACKHOLE_WALLET_ADDRESS=0xYourWalletAddressHere pytest tests/test_voter_transaction_matching.py
```

## Environment Variables Reference

| Variable | Purpose | Required For |
|----------|---------|--------------|
| `BLACKHOLE_WALLET_ADDRESS` | Your wallet address | Voting history, transaction analysis, validation |
| `BLACKHOLE_VOTER_PRIVATE_KEY` | Private key for signing | Automated voting (production) |
| `BLACKHOLE_TEST_WALLET_KEY` | Test wallet private key | Automated voting (testing) |

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
