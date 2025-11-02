# Voter Contract Discovery - BREAKTHROUGH

## ? FOUND: Voter Contract Implementation

**Proxy Address:** `0xe30d0c8532721551a51a9fec7fb233759964d9e3`  
**Implementation Address:** `0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525`

**Status:** ? CONFIRMED - This is the actual voter contract!

## Critical Discovery: Identical Transaction Parameters

**ALL 5 voting transactions have IDENTICAL parameters:**
- Param 1: 20156 (0x4ebc)
- Param 2: 4438 (0x1156) ? Token ID

**This means:**
- This is **NOT** `vote(uint256, address[], uint256[])` with arrays
- Arrays would vary between transactions
- The function must be something else entirely!

## Working Hypothesis

The function selector `0xd1c2babb` is likely:

1. **`poke(uint256 _tokenId, uint256 _someFlag)`** - Triggers voting with pre-set pools
2. **`reset(uint256 _tokenId, uint256 _flag)`** - Resets and votes with existing pools
3. **A wrapper function** that uses pools set in a previous transaction

### Why This Makes Sense

- `poke()` function exists in IVoter interface
- VotingEscrow calls `IVoter(voter).poke(_tokenId)` 
- Pools/weights might be stored in voter contract storage
- Transaction just triggers voting with existing data

## Next Steps

1. ? Get voter contract ABI (`0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525`)
2. ? Find `vote()` function signature on voter contract
3. ?? Verify function selector `0xd1c2babb` matches expected function
4. ?? Understand how pools/weights are set before voting
5. ?? Check if there's a separate transaction that sets pools

## Voter Contract Functions (from IVoter interface)

- `vote(uint256 _tokenId, address[] _poolVote, uint256[] _weights)` - Main vote function
- `poke(uint256 _tokenId)` - Trigger voting with existing pools
- `reset(uint256 _tokenId)` - Reset votes
- `poolVoteLength(uint tokenId)` - Get number of pools voted for
- `poolVote(uint id, uint _index)` - Get pool address by index
- `votes(uint id, address _pool)` - Get vote weight for pool

## Configuration Update Needed

Once verified, update `config.yaml`:

```yaml
blackhole_voter:
  voting_contract_address: "0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525"  # Voter implementation
  voting_contract_proxy: "0xe30d0c8532721551a51a9fec7fb233759964d9e3"      # Voter proxy
```
