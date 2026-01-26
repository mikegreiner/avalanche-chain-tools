# RPC Voting Discoveries

## Summary of Findings

**Date:** 2026-01-25
**Status:** Discovery Phase Complete - Ready for Implementation

---

## Key Discovery: Vote Function Signature

### Function Signature
```solidity
function vote(uint256 tokenId, address[] memory _poolVote, uint256[] memory _weights)
```

### Function Selector
```
0x7ac09bf7
```

### This is a veNFT System!

**Critical Discovery:** veBLACK is an NFT-based voting system (like Velodrome/Aerodrome), not a simple ERC20 token balance system.

**Implications:**
- Users hold veBLACK as NFTs, each with a token ID
- Each NFT has its own voting power (based on locked BLACK amount and duration)
- Users must specify their NFT token ID when voting
- A user could potentially have multiple veBLACK NFTs

---

## Contract Information

### Voter Contract
- **Address:** `0xe30d0c8532721551a51a9fec7fb233759964d9e3`
- **Verified:** ✓ Yes (on Snowtrace)
- **Functions Found:** 6 functions in ABI

### veBLACK Token
- **Address:** `0xEac562811cc6abDbB2c9EE88719eCA4eE79Ad763`
- **Type:** NFT (ERC721-like with voting extensions)
- **Voting Power:** Time-weighted locked BLACK tokens

---

## Transaction Analysis

### Sample Vote Transaction
- **Hash:** `0xc4f963f3f8edd6f241640e151f86b4d386594e1a043dd1f9f4ffaa105010387a`
- **From:** `0x093584cfA6b2863520913c9bC9CaEB7a6Eaf990c`
- **Block:** 76550316

### Decoded Parameters
```javascript
{
  tokenId: 26015,              // veBLACK NFT ID
  pools: [
    "0xA02Ec3Ba8d17887567672b2CDCAF525534636Ea0"
  ],
  weights: [
    1000                       // 1000 wei (0.000000000000001 votes)
  ]
}
```

### Weight Format
- **Units:** Wei (1e18)
- **Precision:** Full uint256 precision
- **Calculation:** User's voting power × percentage ÷ 100
- **Example:** 10,000 veBLACK voting power, 20% allocation = 2000 × 1e18 wei

---

## Implementation Requirements

### 1. Get User's veBLACK NFT Token ID(s)

**New Requirement:** We need to find which veBLACK NFT(s) the user owns.

**Possible Approaches:**

#### Option A: Query NFT balance and enumerate
```javascript
// Get number of NFTs user owns
balanceOf(address owner) → uint256

// Get NFT ID by index
tokenOfOwnerByIndex(address owner, uint256 index) → uint256
```

#### Option B: Query tokenId from veBLACK
```javascript
// Some veNFT contracts have:
tokenOfOwner(address owner) → uint256  // If user can only have one NFT
```

#### Option C: User inputs their token ID
- Simplest approach for MVP
- Show hint: "Find your veBLACK NFT ID at blackhole.xyz/vote"
- Validate it exists and belongs to user

**Decision Needed:** Which approach to implement?

### 2. Get Voting Power for NFT

**Required Function:**
```javascript
// Get voting power for specific NFT
balanceOfNFT(uint256 tokenId) → uint256

// Or possibly:
votingPower(uint256 tokenId) → uint256
```

**To Discover:**
- Test `balanceOfNFT(tokenId)` on veBLACK contract
- Test `votingPower(tokenId)` if balanceOfNFT doesn't exist
- Fallback: Read from web UI or ask user to input voting power

### 3. Encode Vote Transaction

**Already Solved:** ✓

```javascript
// Using ethers.js v6:
const abiCoder = new ethers.AbiCoder();
const encoded = abiCoder.encode(
  ['uint256', 'address[]', 'uint256[]'],
  [tokenId, poolAddresses, weights]
);
const calldata = '0x7ac09bf7' + encoded.slice(2);

// Submit via MetaMask:
await window.ethereum.request({
  method: 'eth_sendTransaction',
  params: [{
    from: userAddress,
    to: '0xe30d0c8532721551a51a9fec7fb233759964d9e3',
    data: calldata
  }]
});
```

---

## Updated Implementation Plan

### Phase 1A: NFT Token ID Discovery (NEW)

**Priority:** HIGH
**Estimated Time:** 2-3 days

**Tasks:**
1. Create Python script to test veBLACK NFT functions:
   - `balanceOf(address)`
   - `tokenOfOwnerByIndex(address, uint256)`
   - `balanceOfNFT(uint256)`
   - `votingPower(uint256)` or `voting_power(uint256)`

2. Test with known voter addresses from blackhole.xyz/vote

3. Implement JavaScript version in `extension/lib/veblack-nft-client.js`

4. Add UI to side panel:
   - Auto-detect user's veBLACK NFT(s)
   - If multiple NFTs, let user select which one to vote with
   - Show voting power for selected NFT

### Phase 1B: Vote Transaction Builder (UPDATED)

**File:** `extension/lib/vote-transaction-builder.js`

**Updated Function Signature:**
```javascript
buildVoteTransaction(tokenId, pools, percentages, votingPower) {
  // 1. Validate inputs
  if (!tokenId || tokenId < 0) throw new Error('Invalid NFT token ID');
  if (!pools || pools.length === 0) throw new Error('No pools selected');
  if (Math.abs(percentages.reduce((a, b) => a + b, 0) - 100) > 0.01) {
    throw new Error('Percentages must sum to 100%');
  }

  // 2. Calculate weights in wei
  const weights = percentages.map(pct => {
    const voteAmount = (votingPower * pct / 100);
    return BigInt(Math.floor(voteAmount * 1e18));
  });

  // 3. Encode transaction
  const abiCoder = new ethers.AbiCoder();
  const encoded = abiCoder.encode(
    ['uint256', 'address[]', 'uint256[]'],
    [tokenId, pools, weights.map(w => w.toString())]
  );

  // 4. Build transaction object
  return {
    to: '0xe30d0c8532721551a51a9fec7fb233759964d9e3',
    data: '0x7ac09bf7' + encoded.slice(2),
    value: '0x0',
    tokenId,
    pools,
    weights: weights.map(w => Number(w) / 1e18),
    totalVotes: votingPower
  };
}
```

---

## Testing Checklist

### Discovery Scripts
- [x] Find vote function signature: `vote(uint256,address[],uint256[])`
- [x] Find function selector: `0x7ac09bf7`
- [x] Decode sample transactions successfully
- [x] Understand weight format (wei, 1e18)
- [ ] Find balanceOfNFT or votingPower function
- [ ] Find tokenOfOwnerByIndex or tokenOfOwner function
- [ ] Test with real user address

### Implementation
- [ ] Create veblack-nft-client.js
- [ ] Get user's NFT token ID(s)
- [ ] Get voting power for NFT
- [ ] Build vote transaction correctly
- [ ] Test transaction encoding matches real transactions
- [ ] Submit test transaction via MetaMask (on testnet if available)

---

## Questions to Answer

### High Priority
1. **How to get user's veBLACK NFT token ID?**
   - Test `tokenOfOwnerByIndex(address, uint256)` on veBLACK contract
   - Test `tokenOfOwner(address)` if it exists
   - Can users have multiple veBLACK NFTs?

2. **How to get voting power for specific NFT?**
   - Test `balanceOfNFT(uint256)` on veBLACK contract
   - Test `voting_power(uint256)` (Python/Vyper style)
   - Test `getVotes(uint256)` (OpenZeppelin style)

3. **How to get current votes for user's NFT?**
   - Test `votes(uint256, address)` - votes(tokenId, pool)
   - Test `poolVote(uint256, uint256)` - poolVote(tokenId, index)
   - Fallback: Batch-check all pools

### Medium Priority
4. **Do we need to call reset() before voting?**
   - Check if vote() replaces or adds to existing votes
   - Test reset() function selector: `0xd826f88f`

5. **Is there a max number of pools per vote?**
   - Analyze gas costs for 1, 5, 10, 20 pools
   - Check for contract limits

6. **What happens if user votes with less than 100% of voting power?**
   - Is partial allocation allowed?
   - Or must use all voting power?

---

## Next Steps

### Immediate (This Week)
1. Create `scripts/discover_veblack_nft.py` to test NFT functions
2. Run with known voter addresses from blackhole.xyz
3. Document findings in this file
4. Update implementation plan based on discoveries

### Short Term (Next Week)
1. Implement `veblack-nft-client.js` in extension
2. Create UI for NFT token ID display/selection
3. Build and test vote transaction encoder
4. Test with MetaMask on mainnet (small test votes)

### Medium Term (Following Weeks)
1. Implement complete voting flow in side panel
2. Add transaction preview
3. Add success/error handling
4. Full testing and documentation

---

## Resources

### Snowtrace Links
- Voter Contract: https://snowtrace.io/address/0xe30d0c8532721551a51a9fec7fb233759964d9e3
- veBLACK Token: https://snowtrace.io/address/0xEac562811cc6abDbB2c9EE88719eCA4eE79Ad763
- Sample Vote TX: https://snowtrace.io/tx/0xc4f963f3f8edd6f241640e151f86b4d386594e1a043dd1f9f4ffaa105010387a

### Similar Projects
- Velodrome (Optimism): veNFT voting system
- Aerodrome (Base): Fork of Velodrome
- Solidly: Original veNFT design by Andre Cronje

---

**Status:** ✅ Vote function discovered, ⚠️ NFT token ID functions to be discovered
**Next Script to Create:** `scripts/discover_veblack_nft.py`
**Blocker:** Need to understand how to get user's veBLACK NFT token ID

*Last Updated: 2026-01-25*
