# Testing Strategy with One Vote Per Epoch Constraint

## The Challenge

**Blackhole voting allows only ONE vote per epoch (week).**

This means:
- ?? **No second chances** - if you get it wrong, wait a week
- ?? **Must be PERFECT** on first attempt
- ?? **Can't iterate** and fix mistakes

## Solution: Maximum Validation Before Real Transaction

Since we can't "practice" with real transactions, we validate encoding **perfectly** before risking your one vote.

## Three-Layer Validation Approach

### Layer 1: Encoding Validation (No Key - Zero Risk)

**Test transaction decoding against actual blockchain data:**

```bash
python3 scripts/safe_encoding_validation.py
```

**Validates:**
- ? Transaction structure
- ? Parameter extraction
- ? Encoding format understanding

**Risk:** ZERO - Read-only queries

### Layer 2: Comprehensive Past Transaction Validation (Dummy Key - Zero Risk)

**Test encoding generation against ALL your past voting transactions:**

```bash
python3 scripts/validate_all_past_transactions.py [wallet_address]
```

**What it does:**
- Finds ALL your voting transactions
- Decodes each one
- Generates encoding with same parameters (using dummy key)
- Compares structure and format

**Exit Criteria:** ALL transactions must encode correctly

**Risk:** ZERO - Uses dummy key, dry-run mode

### Layer 3: Pre-Flight Checklist (Test Wallet or Dummy Key)

**Before real transaction, run comprehensive checks:**

```bash
python3 scripts/pre_flight_checklist.py \
  --token-id YOUR_TOKEN_ID \
  --pools POOL1,POOL2 \
  --percentages 60,40
```

**Checks:**
- [ ] Token ID valid
- [ ] Pool addresses verified
- [ ] Weights/percentages correct
- [ ] Gas estimate reasonable
- [ ] Encoding format valid
- [ ] Balance sufficient

**Risk:** ZERO - Dry-run mode

## Why This Works

Even though there's no testnet and only one vote per epoch:

? **Encoding validation proves correctness:**
- If our code encodes past transactions correctly
- And we use same encoding logic for new transactions
- Then new transactions will be correct

? **Dummy key allows testing:**
- Can test encoding generation
- Can test structure
- No risk to real funds

? **Comprehensive validation:**
- Test against ALL past transactions
- Not just one
- Higher confidence

## Recommended Testing Sequence

### Step 1: Basic Validation (No Key)

```bash
# Decode and validate structure
python3 scripts/safe_encoding_validation.py

# Test with dummy key
python3 scripts/test_with_dummy_key.py
```

### Step 2: Comprehensive Validation (Dummy Key)

```bash
# Test against ALL past transactions
python3 scripts/validate_all_past_transactions.py

# Should show all transactions encode correctly
```

### Step 3: Pre-Flight Check (Before Real Transaction)

```bash
# With your actual parameters
python3 scripts/pre_flight_checklist.py \
  --token-id YOUR_TOKEN_ID \
  --pools POOL1,POOL2 \
  --percentages 60,40
```

### Step 4: Dry-Run (Final Check)

```python
# Use your actual token ID and pools
voter = BlackholeVoter(private_key=..., dry_run=True)
result = voter.simulate_vote(vote_plans, token_id=your_token_id)

# Review everything carefully
```

### Step 5: Real Transaction (Only After ALL Pass)

```python
# Only proceed when 100% confident
voter = BlackholeVoter(private_key=..., dry_run=False)
result = voter.execute_vote(vote_plans, token_id=your_token_id, confirm=True)
```

## Success Criteria

**Before real transaction, ALL must pass:**

1. ? Encoding validation (no key)
2. ? Dummy key encoding test
3. ? All past transactions validate
4. ? Pre-flight checklist passes
5. ? Dry-run produces expected transaction
6. ? Manual parameter verification

**If ANY fail ? Do not proceed, fix issue first**

## The Reality

**Testnet:** ? Not available

**One vote per epoch:** ?? Critical constraint

**Solution:** ? Maximum validation before real transaction

**Approach:**
- Validate encoding against ALL past transactions
- Use dummy key for encoding generation testing
- Comprehensive pre-flight checks
- Dry-run mode for final validation

**Result:**
- High confidence in correctness
- Validated against real past transactions
- No risk during validation
- Perfect on first real attempt

## Key Insight

Since you can't practice with real transactions, we validate encoding **perfectly** instead:

**Past transactions ? Encoding validation ? Confidence ? Real transaction**

If encoding matches ALL past transactions exactly, and we use the same logic, then new transactions will be correct.

## Next Steps

1. **Run comprehensive validation:**
   ```bash
   python3 scripts/validate_all_past_transactions.py
   ```

2. **Review results:**
   - All must pass
   - If any fail ? Fix code

3. **When ready for real transaction:**
   - Run pre-flight checklist
   - Review all parameters
   - Execute with confidence
