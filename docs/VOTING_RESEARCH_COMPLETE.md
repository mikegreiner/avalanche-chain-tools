# Voting Research Complete - Summary

## ? FULLY UNDERSTOOD VOTING MECHANISM

### How Voting Works

**Primary Method:** Call `vote()` directly on voter contract

**Contract:** `0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525` (voter implementation)  
**Function:** `vote(uint256 _tokenId, address[] _poolVote, uint256[] _weights)`  
**Selector:** `0x7ac09bf7` ? VERIFIED

### What Happens When You Vote

1. User selects pools and weights on UI
2. UI calls `vote()` on voter contract with:
   - Token ID (lock NFT ID)
   - Array of pool addresses
   - Array of weights
3. Voter contract:
   - Stores pools/weights for that token ID
   - Immediately distributes votes to pools
   - Emits voting events

### Optional: Merge Locks

**Separate Operation:** `merge(uint256 _from, uint256 _to)` on VotingEscrow
- Merges two locks together
- Calls `voter.poke(_to)` to update votes
- Uses pools already set via previous `vote()` call

## Contract Addresses (All Verified)

1. **VotingEscrow:** `0xeac562811cc6abdbb2c9ee88719eca4ee79ad763`
   - veBLACK contract
   - Lock management
   - Has `merge()` function

2. **Voter Proxy:** `0xe30d0c8532721551a51a9fec7fb233759964d9e3`
   - Proxy for voter implementation

3. **Voter Implementation:** `0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525` ? **USE THIS**
   - Actual voting contract
   - Has `vote(uint256, address[], uint256[])` function
   - ABI verified and saved

## Verified Transactions

1. **vote() call:**
   - Hash: `0x4d7488026056bf83b3a0a2cd292b2d009708be76c47681630dfdf88f29cf7ac8`
   - Token ID: 4438
   - Pool: `0x8fef4fe4970a5d6bfa7c65871a2ebfd0f42aa822`
   - Weight: 1000 (100%)

2. **merge() call:**
   - Hash: `0xdef326742486f3c20e4590e0a194ac68b6dbcef487b187e887a719900a8f95d3`
   - Merges token 20156 into token 4438
   - Triggers voting via `poke()`

## Implementation Ready

**Status:** ? Ready for implementation

**Blockers Removed:**
- ? Contract address identified
- ? Function signature verified
- ? ABI available
- ? Transaction decoded
- ? Mechanism understood

**Remaining Work:**
- ?? Map pool names to addresses
- ?? Get user's token ID(s)
- ?? Test implementation
- ?? Handle weight normalization (if needed)

## Files Created

1. `voter_contract_abi.json` - Voter contract ABI
2. `voting_contract_abi.json` - VotingEscrow ABI
3. `docs/COMPLETE_VOTING_MECHANISM.md` - Complete mechanism
4. `docs/VOTING_IMPLEMENTATION_GUIDE.md` - Implementation guide
5. `scripts/decode_vote_transaction.py` - Decoding script
6. `config.yaml` - Updated with voter contract address

## Confidence Level

**95%** - Mechanism fully understood, ready to implement with testing
