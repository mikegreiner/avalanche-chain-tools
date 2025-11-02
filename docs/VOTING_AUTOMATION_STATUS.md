# Voting Automation Implementation Status

## ? Completed

1. **Voting Module Framework** (`blackhole_voter.py`)
   - Secure private key management (environment variables)
   - Dry-run mode for safe testing
   - Transaction validation and gas estimation
   - Nonce management
   - Manual confirmation system
   - Comprehensive logging

2. **Dependencies**
   - Added `web3>=6.0.0` to requirements.txt
   - Added `eth-account>=0.8.0` to requirements.txt

3. **Configuration**
   - Added `blackhole_voter` section to config.yaml
   - Added security settings (confirmation, gas limits)
   - Placeholders for contract addresses with TODO notes

4. **Research Tools**
   - `scripts/find_voting_contracts.py` - Automated contract discovery
   - `scripts/scrape_blackhole_docs.py` - Documentation scraper
   - `scripts/capture_blackhole_api.py` - API call interceptor

5. **Pool Recommender Enhancements**
   - Enhanced to extract `pool_id` from page when available
   - Added `pool_id` to JSON output for voting integration

6. **Documentation**
   - `docs/README_voter.md` - Complete voting module documentation
   - `docs/CONTRACT_RESEARCH.md` - Research findings summary
   - `docs/VOTING_CONTRACT_IDENTIFICATION.md` - Step-by-step identification guide

## ?? Pending (Requires Manual Identification)

### 1. Voting Contract Address
**Status:** Needs identification

**Options:**
- Check https://docs.blackhole.xyz for contract addresses
- Perform one manual vote and capture contract address from transaction
- Inspect browser DevTools Network tab on voting page
- Check research results: `voting_contract_research.json`

**Once identified:**
- Add to `config.yaml` ? `blackhole_voter.voting_contract_address`
- Get ABI from Snowtrace API
- Add ABI to `config.yaml` ? `blackhole_voter.voting_contract_abi`

### 2. veBLACK Contract Address
**Status:** Needs identification

**Purpose:** Check voting power (veBLACK balance)

**How to find:**
- Check documentation for "veBLACK" or "voting escrow"
- Analyze BLACK token (`0xcd94a87696fac69edae3a70fe5725307ae1c43f6`) interactions
- Look for contracts that accept BLACK and mint veBLACK

### 3. Pool Address Mapping
**Status:** Partially implemented

**Current:** Pool recommender extracts `pool_id` when available in page data attributes

**Needed:**
- Verify pool IDs are being extracted correctly
- If not available, implement mapping from pool names to addresses
- May require API endpoint or additional page inspection

### 4. Contract Function Implementation
**Status:** Placeholder code exists

**Needed:**
- Replace placeholder transaction data with actual contract function calls
- Implement correct function signature (e.g., `vote(address gauge, uint256 weight)`)
- Verify parameter types and encoding

## Recommended Next Steps

### Step 1: Manual Vote and Capture (Easiest)
1. Perform one manual vote on https://blackhole.xyz/vote
2. Copy transaction hash from Metamask
3. View on Snowtrace to get contract address
4. Get ABI from Snowtrace contract page
5. Add to config.yaml

### Step 2: Test in Dry-Run Mode
```bash
# Generate recommendations
python3 blackhole_pool_recommender.py --voting-power 15000 --json -o test_pools.json

# Test voting (dry-run)
export BLACKHOLE_VOTER_PRIVATE_KEY="your_key_here"
python3 blackhole_voter.py --pools-json test_pools.json --dry-run
```

### Step 3: Verify Contract Functions
- Review contract ABI to find voting function
- Update `prepare_vote_transaction()` with correct function signature
- Test transaction encoding

### Step 4: Small Test Vote
- Use minimal voting power
- Verify transaction succeeds
- Check on Snowtrace

## Files Modified/Created

**New Files:**
- `blackhole_voter.py` - Main voting module
- `scripts/find_voting_contracts.py` - Contract research tool
- `scripts/scrape_blackhole_docs.py` - Documentation scraper
- `scripts/capture_blackhole_api.py` - API interceptor
- `docs/README_voter.md` - Voting documentation
- `docs/CONTRACT_RESEARCH.md` - Research findings
- `docs/VOTING_CONTRACT_IDENTIFICATION.md` - Identification guide
- `docs/VOTING_AUTOMATION_STATUS.md` - This file

**Modified Files:**
- `requirements.txt` - Added web3 dependencies
- `config.yaml` - Added voter configuration
- `blackhole_pool_recommender.py` - Enhanced to extract pool_id

## Security Features Implemented

? Environment variable for private key (never in files)  
? Dry-run mode (default)  
? Transaction validation before signing  
? Gas price limits  
? Manual confirmation system  
? Comprehensive logging  
? Nonce management  
? Error handling  

## Architecture

```
blackhole_pool_recommender.py
  ? (generates JSON)
test_pools.json
  ? (loaded by)
blackhole_voter.py
  ? (reads config)
config.yaml (contract addresses)
  ? (signs & sends)
Avalanche C-Chain
```

## Testing Checklist

- [ ] Identify voting contract address
- [ ] Get voting contract ABI
- [ ] Add addresses to config.yaml
- [ ] Test dry-run mode
- [ ] Verify transaction parameters
- [ ] Test with small real vote
- [ ] Verify transaction on Snowtrace
- [ ] Test multiple pool voting
- [ ] Verify gas estimation accuracy
- [ ] Test error handling (insufficient balance, etc.)

## Known Limitations

1. **Pool ID Extraction:** Currently tries to extract from page, but may not always be available
2. **Contract Function Calls:** Placeholder code needs actual function signatures
3. **veBLACK Balance:** Cannot check voting power until veBLACK contract is identified
4. **Pool Name Mapping:** May need manual mapping from pool names to contract addresses

## Support

For help identifying contracts:
- See `docs/VOTING_CONTRACT_IDENTIFICATION.md`
- Run `scripts/find_voting_contracts.py`
- Check `voting_contract_research.json` for findings
