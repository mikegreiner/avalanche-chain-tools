# Voting Implementation Checklist

## ? Research Complete

### Contracts Identified
- [x] VotingEscrow: `0xeac562811cc6abdbb2c9ee88719eca4ee79ad763`
- [x] Voter Proxy: `0xe30d0c8532721551a51a9fec7fb233759964d9e3`
- [x] Voter Implementation: `0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525` ?

### Functions Verified
- [x] `vote(uint256,address[],uint256[])` - selector `0x7ac09bf7` ?
- [x] `merge(uint256,uint256)` - selector `0xd1c2babb` ?
- [x] Transaction decoded successfully ?

### ABIs Available
- [x] VotingEscrow ABI: `voting_contract_abi.json`
- [x] Voter contract ABI: `voter_contract_abi.json`

## ?? Implementation Steps

### 1. Update blackhole_voter.py
- [ ] Change `voting_contract_address` to voter implementation
- [ ] Load voter ABI from `voter_contract_abi.json`
- [ ] Implement `vote()` function call with array encoding
- [ ] Use web3 Contract class for proper encoding

### 2. Token ID Management
- [ ] Implement `get_lock_token_ids()` to query VotingEscrow
- [ ] Use ERC-721 functions: `balanceOf()`, `tokenOfOwnerByIndex()`
- [ ] Handle multiple token IDs (if user has multiple locks)

### 3. Pool Address Mapping
- [ ] Extract pool addresses from voting page HTML
- [ ] Or create mapping file: pool_name ? contract_address
- [ ] Enhance pool recommender to capture addresses
- [ ] Verify pool addresses match actual contracts

### 4. Weight Calculation
- [ ] Verify weight format (integers vs normalized)
- [ ] Implement percentage ? weight conversion
- [ ] Handle weight normalization if needed

### 5. Testing
- [ ] Test with dry-run mode
- [ ] Test with minimal test transaction
- [ ] Verify transaction receipt and events
- [ ] Confirm pools received votes correctly

### 6. Error Handling
- [ ] Validate pool addresses
- [ ] Check token ID ownership
- [ ] Handle insufficient voting power
- [ ] Handle epoch/voting window restrictions

## Known Pool Addresses

From decoded transactions:
- `0x8fef4fe4970a5d6bfa7c65871a2ebfd0f42aa822` (used in vote transaction)
- `0xfd9a46c213532401ef61f8d34e67a3653b70837a` (from merge transaction events)
- `0x40435bdffa4e5b936788b33a2fd767105c67bef7` (from merge transaction events)

## Configuration Updated

? `config.yaml` updated with voter contract address  
? Documentation complete  
? Ready for code implementation
