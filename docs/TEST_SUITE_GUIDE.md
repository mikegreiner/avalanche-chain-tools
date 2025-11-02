# Voting Implementation Test Suite Guide

## Test Strategy

The test suite validates our voting implementation by comparing dry-run transaction encoding against **actual on-chain transactions** from your wallet.

### Core Principle

**Use past votes as test cases** - if our dry-run produces identical transaction input data to what was actually sent, we know the implementation is correct.

## Test Files

### 1. `tests/test_voter_transaction_matching.py`
**Purpose:** Validate transaction structure and decoding

**Tests:**
- `test_transaction_decoding` - Decodes actual transactions and verifies parameters
- `test_transaction_structure_validation` - Validates transaction structure
- `test_find_voting_transactions` - Finds voting transactions from wallet

**Run:**
```bash
pytest tests/test_voter_transaction_matching.py -v
```

### 2. `tests/test_blackhole_voter.py`
**Purpose:** Test voter implementation with mocks

**Tests:**
- `test_vote_transaction_encoding` - Validates encoding matches actual transaction
- `test_token_id_query` - Tests VotingEscrow token ID queries
- `test_vote_plan_weight_normalization` - Tests weight calculation

**Run:**
```bash
pytest tests/test_blackhole_voter.py -v
```

### 3. `scripts/test_voter_with_real_transactions.py`
**Purpose:** Standalone validation script

**Usage:**
```bash
python3 scripts/test_voter_with_real_transactions.py
```

## Known Test Transaction

**Transaction Hash:** `0x4d7488026056bf83b3a0a2cd292b2d009708be76c47681630dfdf88f29cf7ac8`

**Parameters:**
- Token ID: 4438
- Pool: `0x8fef4fe4970a5d6bfa7c65871a2ebfd0f42aa822`
- Weight: 1000 (100%)

**Expected Input Data:**
```
0x7ac09bf70000000000000000000000000000000000000000000000000000000000001156...
```

## Validation Process

### Step 1: Decode Actual Transaction
```python
from scripts.test_voter_with_real_transactions import decode_vote_transaction

tx_hash = "0x4d7488026056bf83b3a0a2cd292b2d009708be76c47681630dfdf88f29cf7ac8"
actual = decode_vote_transaction(tx_hash)

# Extract parameters
token_id = actual['token_id']
pools = actual['pools']
weights = actual['weights']
expected_input = actual['input_data']
```

### Step 2: Create VotePlan and Run Dry-Run
```python
from blackhole_voter import BlackholeVoter, VotePlan

voter = BlackholeVoter(private_key="...", dry_run=True)

vote_plan = VotePlan(
    pool_name="Test Pool",
    pool_id=pools[0],
    voting_percentage=100.0
)

result = voter.simulate_vote([vote_plan], token_id=token_id)
dry_run_input = result['encoded_data']
```

### Step 3: Compare
```python
assert dry_run_input == expected_input, \
    f"Encoded data mismatch!\nExpected: {expected_input}\nGot: {dry_run_input}"
```

## Test Scenarios

### Scenario 1: Single Pool (100%)
- **Test Transaction:** `0x4d7488026056bf83b3a0a2cd292b2d009708be76c47681630dfdf88f29cf7ac8`
- **Parameters:** 1 pool, 100% weight
- **Validation:** Encoded data must match exactly

### Scenario 2: Multiple Pools
- **Find:** Transaction with 2+ pools
- **Test:** Array encoding for multiple addresses/weights
- **Validation:** Verify all pools and weights encoded correctly

### Scenario 3: Different Weights
- **Test:** Non-equal weight distribution (e.g., 60%, 40%)
- **Validation:** Verify weight normalization

## Running All Tests

```bash
# Run transaction matching tests
pytest tests/test_voter_transaction_matching.py -v

# Run voter implementation tests  
pytest tests/test_blackhole_voter.py -v

# Run all voter tests
pytest tests/test_*voter*.py -v

# Run with coverage
pytest tests/test_*voter*.py --cov=blackhole_voter --cov-report=html
```

## Expected Test Results

### ? Passing Tests
- Transaction decoding works correctly
- Parameters extracted match expected
- Transaction structure is valid
- Function selector matches (`0x7ac09bf7`)

### ?? Requires Full Setup
- Byte-for-byte encoding match (needs web3.py with contract ABI)
- Gas estimation
- Full transaction signing simulation

## Debugging Failed Tests

If encoding doesn't match:

1. **Check function selector:**
   ```python
   assert encoded_data[:10] == '0x7ac09bf7'
   ```

2. **Check token ID encoding:**
   ```python
   token_id_hex = encoded_data[10:74]
   assert int(token_id_hex, 16) == expected_token_id
   ```

3. **Check array encoding:**
   - Verify offset positions
   - Check array lengths
   - Validate address encoding (checksummed vs lowercase)

4. **Check weight encoding:**
   - Verify weight values match expected
   - Check normalization if percentages don't sum to 100%

## Next Steps

Once tests pass:
1. ? Verify encoding matches actual transactions
2. ? Test with multiple pools
3. ? Test with different weight distributions
4. ? Test edge cases (empty arrays, single pool, etc.)
5. ?? Test with real private key (use testnet or minimal funds)
