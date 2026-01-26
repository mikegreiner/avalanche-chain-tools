# RPC Voting Discovery Guide

## Overview

This guide explains how to use the Python discovery scripts to explore the Voter contract and understand the RPC endpoints needed for implementing direct RPC-driven voting.

## Prerequisites

```bash
pip install web3 requests
```

## Discovery Scripts

### 1. Discover Voter ABI (`scripts/discover_voter_abi.py`)

**Purpose:** Find the exact function signature for `voter.vote()` and understand parameter formats.

**Usage:**
```bash
cd scripts
python discover_voter_abi.py
```

**What it does:**
1. Fetches verified contract ABI from Snowtrace
2. Analyzes recent vote transactions to extract function selectors
3. Tests different possible vote function signatures
4. Identifies the correct function signature and parameter types

**Expected outputs:**
- Exact function signature: `vote(address[] _poolVote, uint256[] _weights)`
- Function selector (4-byte hash)
- Weight format: wei (1e18), absolute votes, or percentage
- ABI JSON for the vote function

**Example output:**
```
Function: vote
  Signature: vote(address[],uint256[])
  Selector: 0x12345678
  Parameters:
    - _poolVote: address[]
    - _weights: uint256[]
```

### 2. Discover Voting Power (`scripts/discover_voting_power.py`)

**Purpose:** Understand how to query user's veBLACK balance and available voting power.

**Usage:**
```bash
python discover_voting_power.py <user_address>
```

**Example:**
```bash
python discover_voting_power.py 0x1234567890123456789012345678901234567890
```

**What it does:**
1. Queries veBLACK token balance for the user
2. Queries user's total allocated votes (already spent this epoch)
3. Calculates available voting power (balance - allocated)
4. Tests locked balance details (lock amount and expiry)

**Expected outputs:**
- veBLACK balance (total voting power)
- Allocated votes (currently used)
- Available votes (remaining to allocate)
- Lock details (amount and expiry date)

**Example output:**
```
veBLACK Balance:        10,000.00
Allocated Votes:         5,000.00
Available Votes:         5,000.00
```

### 3. Discover Previous Votes (`scripts/discover_previous_votes.py`)

**Purpose:** Find how to detect if a user has already voted and what pools they voted for.

**Usage:**
```bash
python discover_previous_votes.py <user_address>
```

**What it does:**
1. Tests if there's a direct function to list user's voted pools
2. Batch-checks all known pools to find which have user votes
3. Attempts to read Vote events from blockchain (requires archive node)
4. Tests epoch/period functions to understand voting cycles

**Expected outputs:**
- List of pools user has voted for
- Vote weight for each pool
- Total allocated votes
- Current epoch information

**Example output:**
```
CURRENT VOTES SUMMARY
WAVAX/USDC                      2,000.00 votes
USDC/USDt                       1,500.00 votes
WAVAX/BLACK                     1,500.00 votes
----------------------------------------------
TOTAL                           5,000.00 votes
```

## Discovery Workflow

### Step 1: Find Vote Function (Week 1, Day 1-2)

```bash
# Run voter ABI discovery
python discover_voter_abi.py

# Expected discoveries:
# - Function signature: vote(address[],uint256[])
# - Selector: 0x????????
# - Weight format: uint256 in wei (1e18)
```

**If ABI is not verified on Snowtrace:**
- Manually analyze recent vote transactions
- Extract function selector from transaction input data
- Reverse-engineer parameters from successful transactions

**Validation:**
- Compare discovered signature with web UI transaction data
- Test encoding with known pool addresses
- Verify weight calculations match expected values

### Step 2: Find Voting Power Functions (Week 1, Day 3)

```bash
# Run voting power discovery with a known voter address
# Find voter addresses at: https://blackhole.xyz/vote

python discover_voting_power.py 0x<known_voter_address>

# Expected discoveries:
# - balanceOf(address) on veBLACK token
# - usedWeights(address) on Voter contract
# - Available = balanceOf - usedWeights
```

**If functions don't exist:**
- Try alternative names: `votes()`, `votingPower()`, `getVotes()`
- Check veBLACK contract for voting power getter
- Fallback: Use total votes calculation

**Validation:**
- Compare balances with web UI display
- Verify allocated votes match pool weights sum
- Test with multiple user addresses

### Step 3: Find Previous Votes Functions (Week 1, Day 4-5)

```bash
# Run previous votes discovery
python discover_previous_votes.py 0x<known_voter_address>

# Expected discoveries:
# - votes(address user, address pool) → uint256
# - OR poolVote(address user, uint256 index) → address
# - OR batch-check all pools (fallback)
```

**If direct function doesn't exist:**
- Implement batch-checking all pools
- Optimize with multicall (batch 20-50 pools per call)
- Cache results in chrome.storage

**Validation:**
- Compare discovered votes with web UI display
- Verify vote weights sum to allocated total
- Test with users who have voted for many pools

## Converting Python to JavaScript

### Pattern 1: Simple RPC Call

**Python:**
```python
selector = keccak("balanceOf(address)")
param = encode_address(user_address)
result = eth_call(VE_BLACK_TOKEN, selector + param)
balance = decode_uint256(result) / 1e18
```

**JavaScript:**
```javascript
const selector = await this.keccak256('balanceOf(address)');
const param = this.encodeAddress(userAddress);
const result = await this.ethCall(this.CONTRACTS.VE_TOKEN, selector + param);
const balance = Number(this.decodeUint256(result)) / 1e18;
```

### Pattern 2: Multiple Parameters

**Python:**
```python
selector = keccak("votes(address,address)")
param1 = encode_address(user_address)
param2 = encode_address(pool_address)
result = eth_call(VOTER, selector + param1 + param2)
votes = decode_uint256(result) / 1e18
```

**JavaScript:**
```javascript
const selector = await this.keccak256('votes(address,address)');
const param1 = this.encodeAddress(userAddress);
const param2 = this.encodeAddress(poolAddress);
const result = await this.ethCall(this.CONTRACTS.VOTER, selector + param1 + param2);
const votes = Number(this.decodeUint256(result)) / 1e18;
```

### Pattern 3: Batch RPC Calls

**Python:**
```python
for pool in pools:
    result = eth_call(voter, selector + encode_address(pool.address))
    votes = decode_uint256(result) / 1e18
```

**JavaScript:**
```javascript
const promises = pools.map(pool => {
  const data = selector + this.encodeAddress(pool.address);
  return this.ethCall(this.CONTRACTS.VOTER, data);
});

const results = await Promise.all(promises);
const votes = results.map(r => Number(this.decodeUint256(r)) / 1e18);
```

## Testing Strategy

### 1. Test with Known Addresses

Find active voter addresses from:
- https://blackhole.xyz/vote (click on any pool to see voters)
- https://snowtrace.io/address/0xe30d0c8532721551a51a9fec7fb233759964d9e3 (recent transactions)

### 2. Verify Against Web UI

For each discovered function:
1. Run Python script with known address
2. Open https://blackhole.xyz/vote in browser
3. Compare values (voting power, allocated votes, pool votes)
4. Values should match exactly

### 3. Test Edge Cases

- User with 0 veBLACK (should return 0 voting power)
- User who hasn't voted (should return 0 allocated votes)
- User with 100% allocated (available votes = 0)
- User with votes in 1 pool vs. 10+ pools

## Common Issues & Solutions

### Issue: Contract not verified on Snowtrace

**Solution:**
- Analyze recent transaction input data manually
- Extract function selector from successful vote transactions
- Use Etherscan/Snowtrace "Decode Input Data" tool

### Issue: Function returns 0 for known voter

**Solution:**
- Double-check address format (checksum vs. lowercase)
- Try alternative function names (votes vs. usedWeights)
- Verify you're calling the correct contract

### Issue: Batch-checking is too slow

**Solution:**
- Implement multicall (batch 20-50 calls per RPC request)
- Use Promise.all() for parallel execution
- Cache results in chrome.storage.local

### Issue: Weight format unclear

**Solution:**
- Test with known vote transaction from Snowtrace
- Decode transaction input data
- Compare weight values with web UI display
- Common formats: wei (1e18), absolute votes, percentage (0-100)

## Next Steps After Discovery

1. **Document Findings**
   - Create `VOTE_TRANSACTION_API.md` with all discovered functions
   - Include function signatures, selectors, and examples
   - Document weight format and calculations

2. **Create JavaScript Implementation**
   - Add functions to `blackhole-rpc-client.js` or new `voting-power-client.js`
   - Test in browser console on blackhole.xyz
   - Verify results match web UI

3. **Build Transaction Encoder**
   - Create `vote-transaction-builder.js`
   - Implement `buildVoteTransaction(pools, weights)`
   - Test encoding with known data

4. **Test with MetaMask**
   - Connect wallet in extension
   - Build test transaction
   - Submit to MetaMask (without sending)
   - Verify transaction preview shows correct data

## Additional Resources

### Snowtrace API
- Docs: https://docs.snowtrace.io/
- Get ABI: `https://api.snowtrace.io/api?module=contract&action=getabi&address=0x...`
- Get transactions: `https://api.snowtrace.io/api?module=account&action=txlist&address=0x...`

### Web3.py Documentation
- https://web3py.readthedocs.io/

### Ethereum ABI Encoding
- https://docs.soliditylang.org/en/latest/abi-spec.html

### Similar Projects (for reference)
- Curve vote transaction: https://etherscan.io/tx/0x... (find recent vote tx)
- Velodrome vote transaction: https://optimistic.etherscan.io/address/0x...

---

**Status:** Ready for discovery phase
**Estimated Time:** 3-5 days for complete discovery
**Dependencies:** Python 3.7+, web3.py, requests

*Last Updated: 2026-01-25*
