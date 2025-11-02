# CRITICAL: One Vote Per Epoch Constraint

## The Problem

**Blackhole voting allows only ONE vote per epoch (week).**

This means:
- ?? **If you get it wrong once, you can't test again until next week**
- ?? **No ability to iterate and fix issues quickly**
- ?? **Must be PERFECT on first attempt**

## Why This Changes Everything

This constraint makes encoding validation **absolutely critical**. We cannot afford to:
- Make encoding mistakes
- Send wrong parameters
- Get token IDs wrong
- Use incorrect pool addresses

## Enhanced Safety Measures Needed

### Level 1: Multi-Transaction Encoding Validation

**Test against ALL your past voting transactions, not just one:**

1. Find all your voting transactions
2. Decode each one
3. Generate encoding for each with same parameters
4. Compare byte-for-byte
5. **ALL must match exactly**

### Level 2: Pre-Flight Checks

Before ANY real transaction:

- [ ] Encoding matches actual transaction exactly
- [ ] Token ID verified on explorer
- [ ] Pool addresses verified on explorer
- [ ] Voting percentages sum to ? 100%
- [ ] Gas estimate reasonable
- [ ] Contract address correct
- [ ] Review transaction details carefully

### Level 3: Comprehensive Encoding Test

Create a test that validates:
- Single pool voting
- Multiple pool voting
- Different weight distributions
- Edge cases

## Enhanced Validation Strategy

### Step 1: Find ALL Past Transactions

```python
# Find all your voting transactions
# Test encoding against EACH one
# Must pass ALL tests before proceeding
```

### Step 2: Multi-Transaction Validation

```python
# For each past transaction:
#   1. Decode parameters
#   2. Generate encoding with same parameters
#   3. Compare byte-for-byte
#   4. Verify match

# If ANY transaction doesn't match ? DO NOT PROCEED
```

### Step 3: Pre-Flight Checklist

Before voting:
- [ ] All past transactions encode correctly
- [ ] Current token ID verified
- [ ] Pool addresses verified
- [ ] Weights correct
- [ ] Gas estimate reasonable
- [ ] Manual review of all parameters

## Testing Strategy Given Constraint

### Before Real Transaction (Critical)

1. **Multi-Transaction Encoding Test**
   - Validate against ALL past transactions
   - Every single one must match exactly

2. **Parameter Verification**
   - Query current token IDs
   - Verify pool addresses
   - Check voting power

3. **Dry-Run with Exact Parameters**
   - Use your actual token ID
   - Use actual pool addresses
   - Review encoding carefully

### Real Transaction (Only After ALL Checks Pass)

4. **Single Test Transaction**
   - Must be PERFECT
   - No second chances this epoch
   - Review everything twice

## Recommended Approach

### Option A: Enhanced Validation Suite (Do First)

Create comprehensive test that:
- Finds ALL your voting transactions
- Validates encoding for EACH
- Tests multiple scenarios
- Validates edge cases

### Option B: Test Wallet Still Valuable

Even with constraint, test wallet helps because:
- Can validate code works correctly
- Can test dry-run mode
- Can verify encoding generation
- Isolated from main wallet

**But:** Still only one vote per epoch, even with test wallet!

### Option C: Perfect Encoding Validation

**Most Important:**
- Validate encoding against multiple past transactions
- Ensure 100% match on ALL transactions
- Test edge cases thoroughly
- Only proceed when 100% confident

## Implementation Priority

**Before any real transaction, we MUST:**

1. ? Create multi-transaction validation script
2. ? Test encoding against ALL past transactions
3. ? Verify ALL pass exactly
4. ? Add comprehensive pre-flight checks
5. ? Document epoch constraint clearly

## The Bottom Line

**One vote per epoch = Zero tolerance for errors**

We need to be **absolutely certain** encoding is correct before risking your one vote for the week.

Next step: Create comprehensive validation that tests against ALL past transactions.
