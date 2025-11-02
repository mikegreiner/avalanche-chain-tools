# Blackhole DEX Pool Voter

Automated voting system for Blackhole DEX liquidity pools that integrates with the pool recommender.

## ?? Security Warning

**This tool handles real cryptocurrency transactions.** Always:
- Use dry-run mode first to test
- Start with small amounts
- Use a dedicated voting wallet with limited funds
- Never commit private keys to version control
- Store private keys securely (environment variables, not files)

## Features

- **Secure Key Management**: Uses environment variables for private keys
- **Dry-Run Mode**: Simulate transactions without sending
- **Transaction Validation**: Verify all parameters before signing
- **Gas Estimation**: Automatic gas calculation
- **Nonce Management**: Handles transaction ordering automatically
- **Manual Confirmation**: Review each transaction before sending
- **Comprehensive Logging**: Full audit trail of all actions

## Installation

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

This will install `web3` and `eth-account` along with other dependencies.

### 2. Configure Private Key

**CRITICAL: Never commit your private key to version control!**

Set your private key as an environment variable:

```bash
# Linux/macOS
export BLACKHOLE_VOTER_PRIVATE_KEY="your_private_key_here_without_0x_prefix"

# Windows (PowerShell)
$env:BLACKHOLE_VOTER_PRIVATE_KEY="your_private_key_here_without_0x_prefix"

# Windows (CMD)
set BLACKHOLE_VOTER_PRIVATE_KEY=your_private_key_here_without_0x_prefix
```

### 3. Find Voting Contract Address

The voting contract address needs to be identified. Use the research script:

```bash
python3 scripts/research_voting_contract.py
```

This will scan the Blackhole website and analyze contracts to find the voting contract.

Once identified, add it to `config.yaml`:

```yaml
blackhole_voter:
  voting_contract_address: "0x..."
  voting_contract_abi: [...]  # Get from Snowtrace
```

## Usage

### Basic Workflow

1. **Get pool recommendations:**
   ```bash
   python3 blackhole_pool_recommender.py --voting-power 15000 --json -o recommendations.json
   ```

2. **Review recommendations** (dry-run mode):
   ```bash
   python3 blackhole_voter.py --pools-json recommendations.json --dry-run
   ```

3. **Execute votes** (with confirmation):
   ```bash
   python3 blackhole_voter.py --pools-json recommendations.json --confirm
   ```

### Command-Line Options

| Option | Description |
|--------|-------------|
| `--pools-json` | JSON file from pool recommender (required) |
| `--private-key` | Private key (NOT RECOMMENDED - use env var) |
| `--dry-run` | Simulate without sending (default: true) |
| `--confirm` | Require confirmation for each transaction |
| `--auto-confirm` | Auto-confirm all (dangerous!) |
| `--rpc-url` | Custom Avalanche RPC URL |
| `--voting-contract` | Voting contract address override |

### Examples

**Dry-run to see what would happen:**
```bash
python3 blackhole_voter.py \
  --pools-json recommendations.json \
  --dry-run
```

**Live voting with manual confirmation:**
```bash
python3 blackhole_voter.py \
  --pools-json recommendations.json \
  --confirm
```

**Automated voting (use with extreme caution):**
```bash
python3 blackhole_voter.py \
  --pools-json recommendations.json \
  --auto-confirm
```

## Architecture

### Security Architecture

1. **Key Management**:
   - Private keys stored in environment variables (never in files)
   - Keys never logged or displayed
   - Supports hardware wallet integration (future)

2. **Transaction Validation**:
   - Validates contract address before signing
   - Checks gas prices against limits
   - Verifies wallet has sufficient balance
   - Validates transaction parameters

3. **Dry-Run Mode**:
   - Simulates all transactions
   - Shows exact transaction details
   - No blockchain interactions

4. **Confirmation System**:
   - Displays full transaction details
   - Requires explicit user confirmation
   - Can be disabled for automation (risky)

### Transaction Flow

```
1. Load vote plans from JSON
2. Check wallet balance and voting power
3. For each pool:
   a. Prepare transaction (gas estimation, nonce)
   b. Display transaction details
   c. Request confirmation (if enabled)
   d. Sign transaction
   e. Send to network
   f. Wait for confirmation
   g. Log results
4. Generate summary and save results
```

## Configuration

### config.yaml

```yaml
blackhole_voter:
  rpc_url: "https://api.avax.network/ext/bc/C/rpc"
  voting_contract_address: "0x..."  # To be configured
  voting_contract_abi: [...]  # To be configured
  veblack_contract: "0x..."  # For checking voting power
  require_confirmation: true
  max_gas_price_gwei: 50
```

## Current Limitations

The following are placeholders and need to be implemented:

1. **Voting Contract**: Contract address and ABI need to be identified
   - Use `scripts/research_voting_contract.py` to find it
   - Get ABI from Snowtrace.io
   - Add to config.yaml

2. **veBLACK Contract**: For checking voting power
   - Need to identify veBLACK contract address
   - Need contract ABI

3. **Pool ID Mapping**: Map pool names to contract addresses
   - Pool recommender provides names, not contract addresses
   - Need to map names to pool contract addresses

4. **Transaction Data**: Actual contract function calls
   - Current implementation has placeholder transaction data
   - Need actual function signatures and parameters

## Next Steps

### Phase 1: Research (Current)
- [x] Create voting module structure
- [x] Add security architecture
- [x] Implement dry-run mode
- [ ] Identify voting contract address
- [ ] Get voting contract ABI
- [ ] Identify veBLACK contract
- [ ] Map pool names to contract addresses

### Phase 2: Integration
- [ ] Implement actual contract function calls
- [ ] Add pool ID resolution
- [ ] Test with small testnet transactions
- [ ] Validate on mainnet with tiny amounts

### Phase 3: Enhancement
- [ ] Add hardware wallet support
- [ ] Implement batch transaction optimization
- [ ] Add retry logic for failed transactions
- [ ] Gas price optimization
- [ ] Historical voting tracking

## Troubleshooting

### "Private key required"
Set `BLACKHOLE_VOTER_PRIVATE_KEY` environment variable.

### "Voting contract not loaded"
Add `voting_contract_address` and `voting_contract_abi` to config.yaml.

### "Cannot determine voting power"
Configure `veblack_contract` in config.yaml.

### "Transaction failed"
- Check wallet has sufficient AVAX for gas
- Verify contract address is correct
- Check gas price limits
- Verify transaction parameters

### Connection errors
Try a different RPC endpoint:
```bash
python3 blackhole_voter.py --rpc-url "https://avalanche.public-rpc.com"
```

## Security Best Practices

1. **Use a dedicated voting wallet**:
   - Don't use your main wallet
   - Keep minimal funds for gas + voting
   - Transfer rewards out regularly

2. **Test first**:
   - Always use dry-run mode first
   - Test with small amounts
   - Verify transactions on Snowtrace

3. **Monitor transactions**:
   - Check transaction hashes on Snowtrace
   - Review gas costs
   - Monitor for unexpected activity

4. **Keep keys secure**:
   - Never commit private keys
   - Use environment variables
   - Consider hardware wallets for large amounts

5. **Stay updated**:
   - Contract addresses can change
   - Monitor for contract upgrades
   - Keep software updated

## Support

For issues or questions:
1. Check this documentation
2. Review the code comments
3. Test in dry-run mode first
4. Verify contract addresses are correct

## Disclaimer

**USE AT YOUR OWN RISK**

This software interacts with blockchain contracts and can result in loss of funds if misconfigured or misused. Always:
- Test thoroughly before using with real funds
- Understand what transactions are being sent
- Verify all contract addresses
- Start with small amounts
- Keep software and documentation updated
