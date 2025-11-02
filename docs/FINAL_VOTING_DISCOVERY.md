# FINAL VOTING DISCOVERY - Complete Mechanism

## ? BREAKTHROUGH: Voting Mechanism Understood

### How Voting Actually Works

**Step 1: Set Pools/Weights (on Voter Contract)**
- User selects pools and weights on UI
- UI calls `vote(uint256 _tokenId, address[] _poolVote, uint256[] _weights)` **directly on voter contract**
- Pools/weights are stored in voter contract storage for that token ID
- **Transaction:** Goes to voter contract (`0xe30d0c8532721551a51a9fec7fb233759964d9e3` proxy or `0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525` implementation)
- **Input:** Long (450+ hex chars) - contains arrays

**Step 2: Trigger Voting via merge() (Optional)**
- User calls `merge(uint256 _from, uint256 _to)` on VotingEscrow
- `merge()` merges lock `_from` into lock `_to`
- `merge()` calls `IVoter(voter).poke(_to)` to update votes
- `poke()` reads pools/weights from voter contract storage (set in Step 1)
- Voting events are emitted
- **Transaction:** Goes to VotingEscrow (`0xeac562811cc6abdbb2c9ee88719eca4ee79ad763`)
- **Input:** Short (138 hex chars) - just 2 uint256 params

## Key Contracts

1. **VotingEscrow:** `0xeac562811cc6abdbb2c9ee88719eca4ee79ad763`
   - Manages veBLACK locks
   - Has `merge()` function
   - Calls `voter.poke()` after merge

2. **Voter Contract Proxy:** `0xe30d0c8532721551a51a9fec7fb233759964d9e3`
   - Proxy for voter implementation

3. **Voter Contract Implementation:** `0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525`
   - Has `vote(uint256, address[], uint256[])` function
   - Stores pools/weights in storage
   - Has `poke(uint256)` function to trigger voting

## Function Signatures

- **vote():** `vote(uint256 _tokenId, address[] _poolVote, uint256[] _weights)` on voter contract
- **merge():** `merge(uint256 _from, uint256 _to)` on VotingEscrow (calls voter.poke())
- **poke():** `poke(uint256 _tokenId)` on voter contract (uses stored pools/weights)

## Why Transactions Look Different

**Transaction 1 (vote() with arrays):**
- To: Voter contract
- Function: `vote(uint256, address[], uint256[])`
- Input: Long (450+ chars) - contains arrays
- Purpose: Set pools/weights in voter contract storage

**Transaction 2 (merge() trigger):**
- To: VotingEscrow
- Function: `merge(uint256, uint256)` (selector `0xd1c2babb`)
- Input: Short (138 chars) - just 2 uint256
- Purpose: Merge locks and trigger voting via poke()

## Implementation Strategy

To implement automated voting:

1. **Call vote() on voter contract:**
   ```python
   voter_contract.functions.vote(
       token_id,
       pool_addresses,  # array
       weights          # array (as percentages, will be normalized)
   ).transact({...})
   ```

2. **Optionally call merge() if merging locks:**
   ```python
   voting_escrow.functions.merge(from_token_id, to_token_id).transact({...})
   ```

3. **Or just call poke() directly:**
   ```python
   voter_contract.functions.poke(token_id).transact({...})
   ```

## Critical Implementation Details

- **Voter Contract:** Use implementation address `0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525` (not proxy)
- **Pool Addresses:** Need to map pool names to addresses
- **Weights:** Pass as uint256 array (will be normalized by contract)
- **Token ID:** Need to get user's lock token ID(s)

## Security Notes

- ? **vote() on voter contract** is the primary voting mechanism
- ? **merge() is optional** - only needed if merging locks
- ? **poke() can be called directly** to trigger voting with existing pools
- ?? **Need to verify:** Do pools persist across epochs, or must be set each time?
