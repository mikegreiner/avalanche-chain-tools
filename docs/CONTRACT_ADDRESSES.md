# Blackhole Voting Contract Addresses

This document contains the identified contract addresses for Blackhole voting automation.

## ? Identified Contracts

### 1. VotingEscrow (veBLACK) Contract
**Address:** `0xeac562811cc6abdbb2c9ee88719eca4ee79ad763`

**Status:** ? CONFIRMED

**Purpose:** 
- This is both the veBLACK voting escrow contract AND the voting contract
- Users lock BLACK tokens here to get veBLACK voting power
- Users call `voting(uint256)` with their lock token ID to vote

**Key Functions:**
- `voting(uint256 tokenId)` - Vote with a specific lock token ID
- `getVotes(address account)` - Get voting power for an address
- `create_lock(uint256 amount, uint256 unlock_time, bool permanent)` - Create a lock
- `voter()` - Returns the voter contract address (if any)

**ABI:** Available at `voting_contract_abi.json`

**Notes:**
- Function selector `0xd1c2babb` appears in voting transactions but is not in the standard ABI
- This might be an internal function or called through a delegate
- The `voting(uint256)` function likely triggers voting through a voter contract

### 2. Rewards Claimer Contract
**Address:** `0x88a49cfcee0ed5b176073dde12186c4c922a9cd0`

**Status:** ? CONFIRMED (from restake transaction)

**Purpose:** Claims voting rewards

**Function:** `claimReward(uint256 tokenId)` (selector: `0x379607f5`)

### 3. Rewards Distribution Contract
**Address:** `0x59aa177312ff6bdf39c8af6f46dae217bf76cbf6`

**Status:** ?? PROXY CONTRACT

**Purpose:** Proxy contract that distributes voting rewards

**Type:** TransparentUpgradeableProxy

**Note:** This is a proxy - need to find implementation contract for actual voting interface

## Pool Addresses Found

From voting transaction analysis:
- `0xfd9a46c213532401ef61f8d34e67a3653b70837a` - Pool address
- `0x40435bdffa4e5b936788b33a2fd767105c67bef7` - Pool address  
- `0xe30d0c8532721551a51a9fec7fb233759964d9e3` - May be gauge or voter contract

## Voting Function Analysis

### Transaction: `0xdef326742486f3c20e4590e0a194ac68b6dbcef487b187e887a719900a8f95d3`

**Contract:** `0xeac562811cc6abdbb2c9ee88719eca4ee79ad763` (VotingEscrow)  
**Function Selector:** `0xd1c2babb`  
**Function Name:** Likely `vote(address[] pools, uint256[] weights)` or similar

**Analysis:**
- The VotingEscrow contract ABI shows `voting(uint256)` which takes a token ID
- However, the actual vote transaction uses selector `0xd1c2babb`
- This suggests either:
  1. VotingEscrow internally calls a voter contract
  2. The function signature is not in the standard ABI (might be in source code)
  3. There's a separate voter contract that VotingEscrow delegates to

## Recommended Configuration

```yaml
blackhole_voter:
  # VotingEscrow contract (handles both veBLACK and voting)
  voting_contract_address: "0xeac562811cc6abdbb2c9ee88719eca4ee79ad763"
  
  # veBLACK is the same as VotingEscrow
  veblack_contract: "0xeac562811cc6abdbb2c9ee88719eca4ee79ad763"
  
  # Get ABI from voting_contract_abi.json (saved)
  voting_contract_abi: # Load from voting_contract_abi.json
```

## Next Steps

1. **Identify Voter Contract:**
   - Check if VotingEscrow has a `voter()` function
   - The voter contract may have the `vote(address[], uint256[])` function
   - Function selector `0xd1c2babb` might be in the voter contract

2. **Decode Voting Function:**
   - Analyze transaction input for `0xd1c2babb`
   - Determine exact function signature
   - May need to check contract source code on Snowtrace

3. **Map Pool Names to Addresses:**
   - Pool addresses extracted from transactions: `0xfd9a46c213532401ef61f8d34e67a3653b70837a`, `0x40435bdffa4e5b936788b33a2fd767105c67bef7`
   - Need to map pool names from recommender to these addresses
   - May require additional API endpoint or page inspection

## Research Transactions

1. **Restake Transaction:**
   - Hash: `0x43b53cf7cd0111961b38366a1d2bbd414668311841ebb7d287343b4bb901c30b`
   - Contract: `0x88a49cfcee0ed5b176073dde12186c4c922a9cd0` (Rewards Claimer)

2. **Voting Reward Transaction:**
   - Hash: `0xc8f81aa5f0709d05836fabf8b13c7e31d73223ce86bf03319df7bcdaf5b3748c`
   - Contract: `0x59aa177312ff6bdf39c8af6f46dae217bf76cbf6` (Rewards Proxy)

3. **Voting Transaction:**
   - Hash: `0xdef326742486f3c20e4590e0a194ac68b6dbcef487b187e887a719900a8f95d3`
   - Contract: `0xeac562811cc6abdbb2c9ee88719eca4ee79ad763` (VotingEscrow)
   - Function: `0xd1c2babb`

## Verification

To verify these addresses:
1. Visit https://snowtrace.io/address/0xeac562811cc6abdbb2c9ee88719eca4ee79ad763
2. Check contract name: "VotingEscrow"
3. Review recent voting transactions
4. Check contract source code for vote function signature
