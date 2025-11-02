# Testing Strategy Given Epoch Constraint

## The Constraint

**You can only vote ONCE per epoch (week).**

This fundamentally changes our testing approach because:
- ? No ability to iterate and fix mistakes
- ? No "try and see what happens"
- ? Must be PERFECT on first attempt

## Enhanced Validation Required

### Level 1: Multi-Transaction Validation (CRITICAL)

**Test against ALL your past voting transactions:**

```bash
python3 scripts/validate_all_past_transactions.py [wallet_address]
```

**What it does:**
- Finds ALL your voting transactions
- Decodes each one
- Generates encoding for each
- Compares byte-for-byte
- **ALL must pass**

**Exit Criteria:** 100% of past transactions must encode correctly

### Level 2: Pre-Flight Checklist (MANDATORY)

Before ANY real transaction, run:

```bash
python3 scripts/pre_flight_checklist.py \
  --token-id YOUR_TOKEN_ID \
  --pools POOL1,POOL2 \
  --percentages 60,40
```

**Checks:**
- [ ] Token ID valid
- [ ] Pool addresses valid
- [ ] Weights/percentages correct
- [ ] Gas estimate reasonable
- [ ] Encoding format correct
- [ ] Balance sufficient

**Exit Criteria:** ALL checks must pass

### Level 3: Comprehensive Dry-Run (REQUIRED)

```python
voter = BlackholeVoter(private_key=..., dry_run=True)
result = voter.simulate_vote(vote_plans, token_id=your_token_id)

# Review EVERY detail:
# - Token ID
# - Pool addresses
# - Weights
# - Gas estimate
# - Encoded data structure
```

**Exit Criteria:** Everything looks perfect

## Testing Without Real Transaction

### What We CAN Test Safely:

? **Encoding validation against past transactions**
- No risk
- Proves code correctness
- Can test unlimited times

? **Dry-run mode**
- No risk
- Generates actual transaction
- Can test unlimited times

? **Read-only operations**
- No risk
- Query token IDs
- Check voting power
- Can test unlimited times

### What We CANNOT Test Safely:

? **Real voting transactions**
- Only one chance per epoch
- Must be perfect
- Can't iterate

## Recommended Testing Sequence

### Phase 1: Comprehensive Validation (Do This First)

1. **Validate against ALL past transactions**
   ```bash
   python3 scripts/validate_all_past_transactions.py
   ```
   - Must pass 100%
   - If ANY fail ? Fix code, don't proceed

2. **Run pre-flight checklist**
   ```bash
   python3 scripts/pre_flight_checklist.py --token-id ... --pools ... --percentages ...
   ```
   - All checks must pass

3. **Dry-run with exact parameters**
   ```python
   # Use your actual token ID and pools
   # Review everything carefully
   ```

### Phase 2: Manual Verification (Before Real Transaction)

- [ ] Token ID verified on Snowtrace
- [ ] Pool addresses verified on Snowtrace
- [ ] Voting percentages confirmed
- [ ] Gas estimate reasonable
- [ ] All past transactions validated
- [ ] Pre-flight checklist passed

### Phase 3: Real Transaction (Only After ALL Above Pass)

- Use confirmation prompt
- Review transaction details one last time
- Double-check everything
- Execute with confidence

## The Reality Check

**Given epoch constraint:**

**Best approach:**
- ? Maximum validation before real transaction
- ? Test against all past transactions
- ? Comprehensive pre-flight checks
- ? Multiple validation layers

**Alternative considerations:**
- ?? Test wallet still only gets one vote per epoch
- ?? Can't "practice" with real transactions
- ?? Must rely on encoding validation

**Bottom line:**
- Encoding validation becomes CRITICAL
- Pre-flight checks become MANDATORY
- Dry-run becomes ESSENTIAL

## Success Criteria

**Before real transaction, you MUST:**

1. ? Validate encoding against ALL past transactions (100% pass rate)
2. ? Pass pre-flight checklist (all checks)
3. ? Dry-run produces expected transaction
4. ? Manual verification of all parameters
5. ? Confidence level: 100%

**If any doubt remains ? Wait for next epoch**

## Tools Created

1. **`scripts/validate_all_past_transactions.py`**
   - Tests encoding against ALL your past votes
   - Must pass 100%

2. **`scripts/pre_flight_checklist.py`**
   - Comprehensive pre-transaction checks
   - Mandatory before real voting

3. **`scripts/safe_encoding_validation.py`**
   - Validates encoding structure
   - Zero risk

## Next Steps

1. Run comprehensive validation:
   ```bash
   python3 scripts/validate_all_past_transactions.py
   ```

2. If all pass ? Proceed to pre-flight checklist

3. If any fail ? Fix code, re-test, don't proceed until perfect

4. Only vote when 100% confident
