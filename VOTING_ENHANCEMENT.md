# Voting Transaction Enhancement

## Summary

Enhanced the Avalanche Transaction Narrator (v1.2.0) to decode and display detailed information about Blackhole DEX voting transactions.

## What Changed

### Before
```
Voted on Blackhole DEX pools
```

### After
```
Voted on 3 Blackhole DEX pools with veBLACK NFT #4438: WAVAX/USDC (50.0%), BTC.b/WAVAX (25.0%), WETH.e/WAVAX (25.0%)
```

## Features Added

1. **ABI Decoding**: Integrated `eth-abi` library to decode the `vote()` function parameters
2. **Pool Token Resolution**: Queries AlgebraPool contracts to get token pairs
3. **Token Symbol Resolution**: Fetches token symbols for human-readable pool names
4. **Weight Distribution**: Shows percentage allocation across voted pools

## Technical Details

### New Dependencies
- Added `eth-abi>=4.0.0` to `requirements.txt`

### New Methods in `AvalancheTransactionNarrator`

1. **`decode_vote_transaction(input_data: str)`**
   - Decodes the vote function call to extract:
     - Token ID (veBLACK NFT used for voting)
     - Pool addresses (array of pool addresses voted for)
     - Weights (voting power distribution)

2. **`get_pool_tokens(pool_address: str)`**
   - Queries AlgebraPool contract to get token0 and token1 addresses
   - Uses `eth_call` to invoke `token0()` and `token1()` functions

3. **Enhanced `describe_vote(tx: Dict, token_transfers: List[Dict])`**
   - Now provides detailed voting information including:
     - Number of pools voted for
     - veBLACK NFT token ID
     - Token pairs for each pool
     - Weight distribution percentages

## Example Transaction

Transaction: [0x50a36fc4bd932e4abdeff08d7d6f6a2bae7b3a491384e6d1c6b96f563d289053](https://snowtrace.io/tx/0x50a36fc4bd932e4abdeff08d7d6f6a2bae7b3a491384e6d1c6b96f563d289053)

### Decoded Information
- **veBLACK NFT ID**: #4438
- **Pools Voted**: 3
- **Weight Distribution**:
  1. WAVAX/USDC: 50.0% (500 basis points)
  2. BTC.b/WAVAX: 25.0% (250 basis points)
  3. WETH.e/WAVAX: 25.0% (250 basis points)

## Usage

```bash
# Analyze recent transactions including voting
python3 avalanche_transaction_narrator.py "0xc081b59fe4fb3de77e641342b210bebf882d0ea4" -d 7
```

Output will include detailed voting information for any voting transactions found:
```
### [TX] Other Activities (1)
- **November 21, 2025 at 06:34:35 PM MST / November 22, 2025 at 01:34:35 AM UTC:** Voted on 3 Blackhole DEX pools with veBLACK NFT #4438: WAVAX/USDC (50.0%), BTC.b/WAVAX (25.0%), WETH.e/WAVAX (25.0%)
```

## Tests

Added comprehensive tests to verify:
1. Vote transaction decoding works correctly
2. Pool token resolution produces expected results
3. Description includes all relevant details (NFT ID, pools, percentages)
4. Graceful fallback when `eth-abi` is not available

All tests passing ✓

## Backward Compatibility

- If `eth-abi` is not installed, the narrator will fall back to the basic description: "Voted on Blackhole DEX pools"
- No breaking changes to existing functionality
- All existing tests continue to pass

## Documentation Updated

- `docs/README_transaction_narrator.md` - Added voting details to features list
- `README.md` - Updated version and features
- Added example output in documentation

## Version

- Previous: v1.1.0
- Current: **v1.2.0** (minor version bump for new feature)
