# Safe Testing Guide - Lowest Risk Approach

## Testing Philosophy

**Principle:** Never risk real funds. Test incrementally with increasing validation at each step.

## Testing Levels (Lowest to Highest Risk)

### Level 0: Code Validation (Zero Risk)
? **Status:** Already done
- Syntax checks pass
- Unit tests validate logic
- Transaction structure validation passes

### Level 1: Encoding Validation (Zero Risk)
**What:** Verify our code produces identical transaction encoding to actual transactions
**Risk:** None - no blockchain interaction required

#### Steps:
1. **Extract actual transaction encoding**
   ```python
   # From known transaction
   tx_hash = "0x4d7488026056bf83b3a0a2cd292b2d009708be76c47681630dfdf88f29cf7ac8"
   actual_input = fetch_transaction_input(tx_hash)
   ```

2. **Run dry-run with same parameters**
   ```python
   voter = BlackholeVoter(private_key="...", dry_run=True)
   vote_plan = VotePlan(
       pool_id="0x8fef4fe4970a5d6bfa7c65871a2ebfd0f42aa822",
       voting_percentage=100.0,
       pool_name="Test"
   )
   result = voter.simulate_vote([vote_plan], token_id=4438)
   dry_run_input = result['encoded_data']
   ```

3. **Compare byte-for-byte**
   ```python
   assert dry_run_input == actual_input, "Encoding mismatch!"
   ```

**Exit Criteria:** Encoded data matches actual transaction exactly

### Level 2: Testnet Testing (Minimal Risk - Testnet Funds Only)
**What:** Test on Avalanche Fuji testnet with testnet tokens
**Risk:** None - testnet tokens have no value

#### Setup:
1. **Get Fuji testnet AVAX:**
   - Use faucet: https://faucet.avax.network/
   - Or: https://faucet.quicknode.com/avalanche/fuji

2. **Configure for testnet:**
   ```yaml
   # config.yaml or command line
   rpc_url: "https://api.avax-test.network/ext/bc/C/rpc"
   chain_id: 43113  # Fuji testnet
   ```

3. **Verify testnet contract addresses:**
   - Check if Blackhole has testnet deployment
   - If not, this level may not be applicable

**Note:** Many DeFi protocols don't deploy to testnet. Check Blackhole docs.

### Level 3: Read-Only Mainnet Validation (Zero Risk)
**What:** Query actual contract state without sending transactions
**Risk:** None - read-only operations

#### Tests:
1. **Token ID Verification**
   ```python
   voter = BlackholeVoter(private_key="...", dry_run=True)
   token_ids = voter.get_lock_token_ids()
   # Verify these match what you see in explorer
   ```

2. **Voting Power Check**
   ```python
   voting_power = voter.get_voting_power()
   # Should match veBLACK balance
   ```

3. **Contract State Validation**
   ```python
   # Check current votes for your token ID
   # Verify pool addresses are correct
   ```

**Exit Criteria:** All read operations return expected values

### Level 4: Dry-Run on Mainnet (Zero Risk)
**What:** Build transactions on mainnet but don't send
**Risk:** None - transactions never broadcast

#### Steps:
1. **Use real contract addresses** (mainnet)
2. **Use real token IDs** (your actual lock)
3. **Generate transaction but don't send**
   ```python
   voter = BlackholeVoter(
       private_key=os.getenv('BLACKHOLE_VOTER_PRIVATE_KEY'),
       dry_run=True  # CRITICAL: Must be True
   )
   result = voter.simulate_vote(vote_plans, token_id=your_token_id)
   ```

4. **Validate output:**
   - Check gas estimate is reasonable
   - Verify encoded data structure
   - Compare with known transaction format

**Exit Criteria:** 
- Gas estimates reasonable
- Transaction structure correct
- All parameters match expectations

### Level 5: Minimal Test Transaction (Very Low Risk)
**What:** Send smallest possible transaction on mainnet
**Risk:** Minimal - gas cost only (~$0.01-0.05)

#### Prerequisites:
- ? All previous levels pass
- ? Encoding validation passes (Level 1)
- ? Dry-run looks correct (Level 4)

#### Steps:
1. **Use smallest voting power**
   - If you have multiple token IDs, use the one with least value
   - Or wait for smallest possible voting window

2. **Vote on single, known-good pool**
   - Use pool you've voted on before
   - Verify pool address is correct

3. **Manual confirmation required**
   ```python
   voter = BlackholeVoter(
       private_key=os.getenv('BLACKHOLE_VOTER_PRIVATE_KEY'),
       dry_run=False,  # Real transaction
       require_confirmation=True  # Will prompt for confirmation
   )
   result = voter.execute_vote(vote_plans, token_id=your_token_id, confirm=True)
   ```

4. **Verify transaction on explorer**
   - Check transaction succeeded
   - Verify votes were applied correctly
   - Check pool received votes as expected

**Exit Criteria:** Transaction succeeds and votes are correctly applied

### Level 6: Production Use (Normal Risk)
**What:** Use for regular voting operations
**Risk:** Normal transaction risk (gas costs, contract bugs)

## Recommended Testing Sequence

### Phase 1: Validation (Do First)
1. ? **Level 0:** Code validation (done)
2. ?? **Level 1:** Encoding validation (next step)
3. ?? **Level 3:** Read-only validation

### Phase 2: Testing (Do Second)
4. ?? **Level 4:** Dry-run on mainnet
5. ?? **Level 5:** Minimal test transaction (if Level 1 passes)

### Phase 3: Production (Only After All Pass)
6. ?? **Level 6:** Regular use

## Safety Checklist

Before ANY transaction:
- [ ] Dry-run mode produces expected output
- [ ] Gas estimate is reasonable (< 500k gas)
- [ ] Contract address is correct (double-check)
- [ ] Token ID is correct (verify on explorer)
- [ ] Pool addresses are correct (verify)
- [ ] Voting percentages sum to ? 100%
- [ ] Private key stored securely (env var, not in code)
- [ ] Confirmation prompt enabled
- [ ] Review transaction details before confirming

## Emergency Procedures

### If Transaction Fails:
1. **Check gas limit** - May need to increase
2. **Verify contract state** - Token ID still valid?
3. **Check nonce** - Manually verify current nonce
4. **Review error message** - Contract may have reverted

### If Transaction Succeeds But Wrong:
1. **Check transaction receipt** - Verify what actually happened
2. **Check contract logs** - Look for Vote events
3. **Verify on explorer** - Check pool vote counts

## Tools for Validation

### Transaction Decoder
```bash
# Decode actual transaction to compare
python3 scripts/decode_vote_transaction.py <tx_hash>
```

### Encoding Validator
```bash
# Compare encoding byte-for-byte
python3 scripts/validate_voter_encoding.py
```

### Dry-Run Script
```python
# Safe testing script
from blackhole_voter import BlackholeVoter, VotePlan
import os

voter = BlackholeVoter(
    private_key=os.getenv('BLACKHOLE_VOTER_PRIVATE_KEY'),
    dry_run=True  # SAFE: No transactions sent
)

# Test with your actual parameters
vote_plans = [VotePlan(...)]
result = voter.simulate_vote(vote_plans, token_id=your_token_id)

print(f"Encoded: {result['encoded_data'][:100]}...")
print(f"Gas: {result['transaction']['estimated_gas']}")
```

## Minimum Viable Test

**Absolute minimum to validate before risking funds:**

1. ? Encoding matches known good transaction
2. ? Read operations return expected values
3. ? Dry-run generates valid transaction structure
4. ? Gas estimate is reasonable

If all 4 pass ? Safe to try minimal transaction

## Recommendation

**Start Here:**
1. Run Level 1 (encoding validation) - This is the critical test
2. Run Level 3 (read-only checks)
3. Run Level 4 (dry-run with real parameters)
4. **Only proceed to Level 5 if all pass**

**Never skip Level 1** - It's zero risk and validates the entire encoding logic.
