# Blackhole Voting Contract Research

This document summarizes the research findings for Blackhole voting contracts.

## Voting Contracts Found

### 1. GCROC Contract
**Address:** `0x02d159a0c393b3a982c4acb3d03816a42d94f1ab`

**Functions:**
- `DEV_FUND_POOL_ALLOCATION()` - view
- `REWARD_POOL_ALLOCATION()` - view  
- `distributeReward(address)` - nonpayable
- `rewardsDistributed()` - view

**Analysis:** This appears to be a rewards distribution contract, not the main voting contract.

**Status:** ?? Likely related to rewards, but may not be the voting interface

### 2. StakedAvUSDV2 Contract  
**Address:** `0x06d47f3fb376649c3a9dafe069b3d6e35572219e`

**Functions:**
- `redistributeLockedAmount(address,address)` - nonpayable

**Analysis:** This is a staking contract, not a voting contract.

**Status:** ? Not the voting contract

### 3. StakedUSDeOFT Contract
**Address:** `0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2`

**Functions:**
- `redistributeBlackListedFunds(address,uint256)` - nonpayable

**Analysis:** This is a staking/redistribution contract.

**Status:** ? Not the voting contract

## Known Token Addresses

From existing configuration:
- **BLACK Token:** `0xcd94a87696fac69edae3a70fe5725307ae1c43f6`
- **WAVAX:** `0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7`
- **USDC:** `0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e`
- **BTC.b:** `0x152b9d0fdc40c096757f570a51e494bd4b943e50`

## Next Steps

### Recommended Approach

1. **Check Documentation Manually:**
   - Visit https://docs.blackhole.xyz
   - Look for "Contract Addresses" or "Voting" sections
   - Check for veBLACK (Voting Escrow BLACK) documentation
   - Look for Gauge/Token Voting documentation

2. **Inspect Network Requests:**
   - Open browser DevTools on https://blackhole.xyz/vote
   - Check Network tab for API calls
   - Look for responses containing contract addresses
   - Check for `/api/` endpoints

3. **Analyze Voting Transactions:**
   - Find a recent voting transaction on Snowtrace
   - Check the `to` address (that's the voting contract)
   - Get the ABI from Snowtrace

4. **Check for veBLACK Contract:**
   - veBLACK is typically the voting escrow token
   - May interact with BLACK token (`0xcd94a87696fac69edae3a70fe5725307ae1c43f6`)
   - Look for contracts that accept BLACK and mint veBLACK

### Alternative: Reverse Engineering from UI

The voting page at https://blackhole.xyz/vote must call a contract. You can:

1. Open DevTools ? Network tab
2. Filter for "eth_call" or contract interactions
3. Vote manually and capture the transaction
4. Extract contract address from the transaction data

## Useful Resources

- **Blackhole Docs:** https://docs.blackhole.xyz
- **Blackhole App:** https://blackhole.xyz/vote
- **Snowtrace Explorer:** https://snowtrace.io
- **Research Script:** `scripts/find_voting_contracts.py`

## Notes

- The contracts found so far appear to be related to rewards distribution or staking
- The actual voting contract may use a different pattern (gauge voting, veToken voting, etc.)
- Blackhole may use a gauge system similar to Curve Finance
- veBLACK (voting escrow BLACK) is likely separate from the voting contract itself
