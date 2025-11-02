# Complete Voting Mechanism - FINAL UNDERSTANDING

## ? CONFIRMED: Two-Step Voting Process

### Step 1: Set Pools and Vote
**Transaction:** `0x4d7488026056bf83b3a0a2cd292b2d009708be76c47681630dfdf88f29cf7ac8`

**Contract:** Voter Proxy `0xe30d0c8532721551a51a9fec7fb233759964d9e3`  
**Implementation:** `0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525`

**Function:** `vote(uint256 _tokenId, address[] _poolVote, uint256[] _weights)`
- **Selector:** `0x7ac09bf7` ? CONFIRMED by 4byte.directory
- **Input:** 458 hex chars (contains arrays)
- **Purpose:** Set pools and weights, AND trigger voting immediately

### Step 2: Merge Locks (Optional)
**Transaction:** `0xdef326742486f3c20e4590e0a194ac68b6dbcef487b187e887a719900a8f95d3`

**Contract:** VotingEscrow `0xeac562811cc6abdbb2c9ee88719eca4ee79ad763`

**Function:** `merge(uint256 _from, uint256 _to)`
- **Selector:** `0xd1c2babb` ? CONFIRMED by 4byte.directory
- **Input:** 138 hex chars (just 2 uint256)
- **Purpose:** Merge lock `_from` into lock `_to`
- **Side Effect:** Calls `IVoter(voter).poke(_to)` which triggers voting with existing pools

## Key Insight

**vote() on voter contract does BOTH:**
1. ? Sets pools/weights in storage
2. ? Immediately triggers voting

**merge() on VotingEscrow:**
1. ? Merges two locks
2. ? Calls `voter.poke(_to)` to update votes (uses pools already set via vote())

## Implementation Strategy

### Primary Method: Direct vote() Call

```python
# Call vote() directly on voter contract
voter_contract = w3.eth.contract(
    address=voter_implementation_address,
    abi=voter_abi
)

transaction = voter_contract.functions.vote(
    token_id,
    pool_addresses,  # List of addresses
    weights          # List of uint256 (will be normalized by contract)
).build_transaction({
    'from': wallet_address,
    'nonce': nonce,
    'gas': estimated_gas,
    'gasPrice': gas_price,
    'chainId': 43114
})

signed = account.sign_transaction(transaction)
tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
```

### Alternative: Two-Step (vote then merge)

1. Call `vote()` on voter contract to set pools
2. Call `merge()` on VotingEscrow if merging locks (optional)

## Voter Contract Addresses

**Proxy:** `0xe30d0c8532721551a51a9fec7fb233759964d9e3`  
**Implementation:** `0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525`

**Recommendation:** Use implementation address directly for voting
- Proxy may add overhead
- Implementation has verified ABI

## What We Learned

1. ? **vote() is on voter contract, not VotingEscrow**
2. ? **vote() takes arrays and triggers voting immediately**
3. ? **merge() is separate** - used for merging locks
4. ? **merge() calls poke()** - updates votes with existing pools
5. ? **Function selectors verified** via 4byte.directory

## Next Steps for Implementation

1. ? Use voter contract implementation: `0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525`
2. ? Call `vote(uint256, address[], uint256[])` with:
   - Token ID
   - Pool addresses array
   - Weights array (as percentages or raw values)
3. ?? Map pool names to addresses
4. ?? Get user's lock token ID(s)
5. ?? Test with minimal funds first
