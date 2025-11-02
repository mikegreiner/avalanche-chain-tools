# Quick Start: Safe Testing Guide

## The Safest Possible Testing Approach

### Step 1: Encoding Validation (Zero Risk - Do This First!)

```bash
# This validates our code produces correct transaction encoding
# NO blockchain interaction, NO private key needed
python3 scripts/safe_encoding_validation.py
```

**What it does:**
- Fetches actual transaction from blockchain (read-only)
- Decodes it to extract parameters
- If you have private key set: generates encoding and compares byte-for-byte

**If this passes:** Implementation is correct, safe to proceed

**If this fails:** Do not proceed - fix the issue first

### Step 2: Read-Only Testing (Zero Risk)

```bash
# Set your private key (only for read operations)
export BLACKHOLE_VOTER_PRIVATE_KEY=your_key_here

# Test read-only operations
python3 scripts/safe_read_only_test.py
```

**What it does:**
- Connects to blockchain (read-only)
- Checks your wallet balance
- Queries your lock token IDs
- Checks voting power

**Risk:** None - all operations are read-only

**If this passes:** Contract interactions work correctly

### Step 3: Dry-Run Testing (Zero Risk)

```python
from blackhole_voter import BlackholeVoter, VotePlan
import os

# Initialize in DRY-RUN mode (critical!)
voter = BlackholeVoter(
    private_key=os.getenv('BLACKHOLE_VOTER_PRIVATE_KEY'),
    dry_run=True  # ? MUST be True!
)

# Get your token ID (from Step 2)
token_ids = voter.get_lock_token_ids()
token_id = token_ids[0]

# Create vote plan (use known-good pool address)
vote_plan = VotePlan(
    pool_name="Test Pool",
    pool_id="0x8fef4fe4970a5d6bfa7c65871a2ebfd0f42aa822",  # Known good pool
    voting_percentage=100.0
)

# Generate transaction (doesn't send it)
result = voter.simulate_vote([vote_plan], token_id=token_id)

print("Transaction Details:")
print(f"  Gas: {result['transaction']['estimated_gas']}")
print(f"  Contract: {result['transaction']['contract_address']}")
print(f"  Token ID: {result['transaction']['parameters']['token_id']}")
print(f"  Pools: {result['transaction']['parameters']['pool_addresses']}")
print(f"  Weights: {result['transaction']['parameters']['weights']}")
print(f"  Encoded: {result['encoded_data'][:50]}...")
```

**Risk:** None - transaction is never sent

**Review output:**
- Gas estimate reasonable? (< 500k)
- Contract address correct?
- Parameters match expectations?

### Step 4: Minimal Test Transaction (Very Low Risk)

**Only proceed if Steps 1-3 all pass!**

```python
from blackhole_voter import BlackholeVoter, VotePlan
import os

# Initialize for REAL transaction
voter = BlackholeVoter(
    private_key=os.getenv('BLACKHOLE_VOTER_PRIVATE_KEY'),
    dry_run=False  # Real transaction mode
)

# Use same parameters as dry-run
token_id = your_token_id  # From Step 2
vote_plan = VotePlan(
    pool_name="Known Pool",
    pool_id="0x8fef4fe4970a5d6bfa7c65871a2ebfd0f42aa822",  # Pool you've voted on before
    voting_percentage=100.0
)

# Execute with confirmation prompt
result = voter.execute_vote([vote_plan], token_id=token_id, confirm=True)

# Script will prompt: "Confirm transaction? (yes/no):"
# Review all details before typing "yes"
```

**Risk:** Minimal - only gas cost (~$0.01-0.05)

**What to verify:**
- Transaction succeeds
- Votes applied correctly
- Check on Snowtrace explorer

## Testing Checklist

Before ANY transaction:

- [ ] **Step 1 passed:** Encoding validation
- [ ] **Step 2 passed:** Read-only tests
- [ ] **Step 3 passed:** Dry-run produces correct output
- [ ] **Double-check:**
  - Contract address correct
  - Token ID correct (verify on explorer)
  - Pool address correct
  - Voting percentage ? 100%
  - Gas estimate reasonable
- [ ] **Confirm:** Transaction details look correct

## Recommended Testing Sequence

1. ? **Always start with Step 1** (encoding validation)
   - Zero risk
   - Validates entire encoding logic
   - Takes 30 seconds

2. ? **Then Step 2** (read-only testing)
   - Verifies contract connectivity
   - Gets your token IDs
   - Zero risk

3. ? **Then Step 3** (dry-run)
   - Generates actual transaction structure
   - Validates gas estimates
   - Zero risk

4. ?? **Only then Step 4** (real transaction)
   - Minimal test with known-good pool
   - Start with 100% on single pool
   - Verify success before trying multiple pools

## Emergency: What If Something Goes Wrong?

### Transaction Fails:
- **Check gas limit** - May need to increase
- **Verify token ID** - Still valid? Check explorer
- **Check nonce** - May be out of sync
- **Review error** - Contract may have specific requirements

### Transaction Succeeds But Wrong:
- **Check transaction receipt** - What actually happened?
- **Check logs** - Look for Vote events
- **Verify on explorer** - Pool vote counts updated?

### Want to Stop:
- **Dry-run mode:** Just exit script - nothing sent
- **Real mode:** Type "no" when prompted for confirmation

## Key Safety Features

1. **Dry-run is default:** Script defaults to `dry_run=True`
2. **Confirmation prompts:** Real transactions require manual confirmation
3. **Detailed logging:** Review all output before confirming
4. **Read-only first:** Validate everything before writing
5. **Encoding validation:** Prove correctness before risking funds

## Summary

**Safest approach:**
1. Run `safe_encoding_validation.py` (validates code)
2. Run `safe_read_only_test.py` (validates connectivity)
3. Do dry-run with your actual parameters (validates transaction structure)
4. Only then try minimal real transaction (validates end-to-end)

**Never skip Step 1** - It's the most important validation with zero risk.
