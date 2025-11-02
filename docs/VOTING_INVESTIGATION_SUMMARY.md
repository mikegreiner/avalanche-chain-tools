# Voting Function Investigation Summary

## Current Status

### ? Completed
1. **Identified VotingEscrow Contract**: `0xeac562811cc6abdbb2c9ee88719eca4ee79ad763`
   - This is both veBLACK and voting contract
   - ABI saved to `voting_contract_abi.json`
   - Updated `config.yaml` with address

2. **Function Selector Identified**: `0xd1c2babb`
   - Appears in voting transactions
   - Likely `vote(address[],uint256[])` or similar
   - Added to transaction narrator function signatures

3. **Transaction Narrator Improvements**:
   - Added Blackhole contract addresses
   - Added voting function signatures
   - Added `describe_vote()` method
   - Classifies voting transactions automatically

4. **Pool Addresses Found**:
   - `0xfd9a46c213532401ef61f8d34e67a3653b70837a`
   - `0x40435bdffa4e5b936788b33a2fd767105c67bef7`

### ?? Outstanding Issues

1. **Vote Function Signature**: 
   - Selector `0xd1c2babb` confirmed in transactions
   - NOT in VotingEscrow standard ABI
   - Transaction input is very short (138 hex chars)
   - Possible explanations:
     - Function not exposed in standard ABI
     - VotingEscrow delegates to internal voter contract
     - Different function signature than expected

2. **Transaction Input Analysis**:
   - Input: `0xd1c2babb0000000000000000000000000000000000000000000000000000000000004ebc0000000000000000000000000000000000000000000000000000000000001156`
   - Only 138 hex chars = 68 bytes total
   - Values: 20156 (0x4ebc) and 4438 (0x1156)
   - Too short for `vote(address[],uint256[])` which should have array data
   - **Hypothesis**: Function might be `vote(uint256, uint256)` or similar, not arrays

3. **Voter Contract**:
   - `voter()` function call returned `None`
   - Either no voter contract set, or function signature incorrect
   - Need to verify correct function selector for `voter()`

## Next Steps

1. **Check VotingEscrow Source Code**:
   - Visit Snowtrace contract page
   - Search for function with selector `0xd1c2babb`
   - Or search for "vote" functions

2. **Decode Transaction Receipt**:
   - Check events/logs in voting transaction
   - May reveal pool addresses that received votes
   - Can help understand voting mechanism

3. **Alternative Voting Methods**:
   - Check if `voting(uint256 tokenId)` is the correct function
   - May need to use lock token ID instead of direct pool voting
   - Review VotingEscrow ABI for `voting()` function usage

4. **Pool Address Mapping**:
   - Extract pool addresses from voting page HTML
   - Or create mapping file from known pools
   - Enhance pool recommender to capture addresses

## Files Updated

- `config.yaml` - Added VotingEscrow address
- `blackhole_voter.py` - Updated to load ABI, get voting power
- `avalanche_transaction_narrator.py` - Added voting detection
- `docs/CONTRACT_ADDRESSES.md` - Contract documentation
- `docs/VOTING_CONTRACT_FINDINGS.md` - Detailed findings
- `voting_contract_abi.json` - Contract ABI saved

## Transaction Narrator TODOs (Future Work)

- [ ] Detect pool voting events in transaction logs
- [ ] Extract pool addresses from vote transaction logs
- [ ] Improve vote transaction descriptions with pool details
- [ ] Add activity grouping for voting transactions
