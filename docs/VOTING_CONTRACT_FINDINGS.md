# Blackhole Voting Contract Research Findings

## ? Identified Contracts

### 1. VotingEscrow Contract (veBLACK + Voting)
**Address:** `0xeac562811cc6abdbb2c9ee88719eca4ee79ad763`

**Status:** ? CONFIRMED - This is BOTH the veBLACK and voting contract

**Verification:**
- Verified from voting transaction: `0xdef326742486f3c20e4590e0a194ac68b6dbcef487b187e887a719900a8f95d3`
- Contract name: "VotingEscrow" on Snowtrace
- ABI retrieved and saved to `voting_contract_abi.json`

**Key Functions:**
- `voting(uint256 _tokenId)` - Vote with a lock token ID (takes token ID, not pools directly)
- `getVotes(address account)` - Get voting power for an address
- `voter()` - Returns voter contract address (may delegate to separate contract)
- `create_lock(uint256 amount, uint256 unlock_time, bool permanent)` - Create a lock
- `lockPermanent(uint256 tokenId)` - Lock permanently

**Important Note:**
- Function selector `0xd1c2babb` appears in voting transactions
- This selector is NOT in the standard ABI (might be `vote(address[],uint256[])`)
- VotingEscrow might delegate to a separate voter contract
- Or the function signature might be different than expected

### 2. Rewards Claimer Contract
**Address:** `0x88a49cfcee0ed5b176073dde12186c4c922a9cd0`

**Status:** ? CONFIRMED (from restake transaction)

**Function:** `claimReward(uint256 tokenId)` - Claims voting rewards

### 3. Rewards Distribution Contract  
**Address:** `0x59aa177312ff6bdf39c8af6f46dae217bf76cbf6`

**Status:** ?? PROXY CONTRACT

**Type:** TransparentUpgradeableProxy
**Function Selector:** `0x7715ee75` - Complex voting/distribution function

## Pool Addresses Found

From voting transaction `0xdef326742486f3c20e4590e0a194ac68b6dbcef487b187e887a719900a8f95d3`:

- `0xfd9a46c213532401ef61f8d34e67a3653b70837a` - Pool address
- `0x40435bdffa4e5b936788b33a2fd767105c67bef7` - Pool address
- `0xe30d0c8532721551a51a9fec7fb233759964d9e3` - May be gauge or voter contract

## Voting Function Mystery

**Function Selector:** `0xd1c2babb`

**Transaction:** Goes to VotingEscrow (`0xeac562811cc6abdbb2c9ee88719eca4ee79ad763`)

**Analysis:**
- This selector does NOT appear in VotingEscrow ABI
- Likely function: `vote(address[] pools, uint256[] weights)` or similar
- VotingEscrow might have:
  1. An internal voter contract it delegates to
  2. A function not visible in standard ABI
  3. Or the function signature is different

**Next Steps to Resolve:**
1. Check VotingEscrow source code on Snowtrace for `vote` function
2. Call `voter()` function on VotingEscrow to get voter contract address
3. Analyze transaction input data to decode exact function signature
4. Check if VotingEscrow inherits from a base contract with vote function

## Configuration Status

### ? Configured:
- **VotingEscrow Address:** `0xeac562811cc6abdbb2c9ee88719eca4ee79ad763`
- **veBLACK Address:** Same as VotingEscrow
- **ABI File:** `voting_contract_abi.json` (95 items)

### ?? Still Needed:
- **Actual Vote Function:** Need to determine if:
  - `voting(uint256 tokenId)` is the correct function (requires token ID)
  - Or there's a separate `vote(address[], uint256[])` function
  - Or VotingEscrow delegates to a voter contract

- **Pool Name to Address Mapping:**
  - Pool recommender provides names like "CL200-WAVAX/USDC"
  - Voting needs contract addresses like `0xfd9a46c213532401ef61f8d34e67a3653b70837a`
  - Need to create mapping or extract from page/API

## How Voting Works (Based on Analysis)

**Current Understanding:**
1. Users lock BLACK tokens in VotingEscrow ? get veBLACK (represented as NFT token ID)
2. To vote, users likely need to:
   - Either call `voting(uint256 tokenId)` with their lock token ID
   - Or call a voter contract's `vote(address[] pools, uint256[] weights)` 
3. VotingEscrow might delegate to a voter contract (check `voter()` function)

**Function Selector Analysis:**
- `0xd1c2babb` in voting transactions
- VotingEscrow ABI shows `voting(uint256)` only
- Suggests either:
  - Separate voter contract that VotingEscrow calls
  - Function signature not in standard ABI
  - Or voting works differently than expected

## Next Steps

1. **Get Voter Contract Address:**
   ```python
   # Call voter() on VotingEscrow to get voter contract
   voter_address = voting_escrow.functions.voter().call()
   ```

2. **Check Voter Contract:**
   - If `voter()` returns an address, that's likely the voting contract
   - Get ABI for that contract
   - Look for `vote(address[], uint256[])` function

3. **Alternative: Use voting(uint256):**
   - If VotingEscrow handles voting internally via `voting(uint256)`
   - Need to determine how to pass pool addresses and weights
   - Might require different approach

4. **Pool Address Mapping:**
   - Extract pool addresses from voting page
   - Or create mapping from pool names to addresses
   - Enhance pool recommender to capture pool addresses

## Research Transactions

1. **Restake Transaction:**
   - Hash: `0x43b53cf7cd0111961b38366a1d2bbd414668311841ebb7d287343b4bb901c30b`
   - To: `0x88a49cfcee0ed5b176073dde12186c4c922a9cd0` (Rewards Claimer)
   - Function: `0x379607f5` (`claimReward`)

2. **Voting Reward Transaction:**
   - Hash: `0xc8f81aa5f0709d05836fabf8b13c7e31d73223ce86bf03319df7bcdaf5b3748c`
   - To: `0x59aa177312ff6bdf39c8af6f46dae217bf76cbf6` (Rewards Proxy)
   - Function: `0x7715ee75`

3. **Voting Transaction:**
   - Hash: `0xdef326742486f3c20e4590e0a194ac68b6dbcef487b187e887a719900a8f95d3`
   - To: `0xeac562811cc6abdbb2c9ee88719eca4ee79ad763` (VotingEscrow)
   - Function: `0xd1c2babb` ? **NEEDS IDENTIFICATION**

## Summary

**Found:**
- ? VotingEscrow contract address
- ? veBLACK contract (same as VotingEscrow)
- ? Contract ABI
- ? Example pool addresses
- ? Voting function selector (`0xd1c2babb`)

**Still Need:**
- ?? Exact vote function signature
- ?? Voter contract address (if separate)
- ?? Pool name to address mapping
- ?? How to get user's lock token ID for voting

**Status:** 80% complete - Main contract identified, need to finalize voting function implementation
