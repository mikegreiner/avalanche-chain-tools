# How to Identify Blackhole Voting Contracts

This guide explains how to identify the Blackhole voting contract addresses needed for automated voting.

## Required Contracts

1. **Voting Contract** - The contract that handles pool voting
2. **veBLACK Contract** - Voting escrow contract for checking voting power
3. **Pool Contracts** - Individual pool contract addresses (mapped from pool names)

## Method 1: Documentation (Recommended)

1. Visit https://docs.blackhole.xyz
2. Navigate to sections about:
   - "Voting" or "Vote"
   - "Contract Addresses"
   - "veBLACK" or "Voting Escrow"
   - "Gauges" (if Blackhole uses a gauge system)
3. Look for contract addresses listed in the documentation
4. Verify addresses on Snowtrace.io

## Method 2: Inspect Voting Transaction

This is the most reliable method:

1. **Perform a manual vote:**
   - Go to https://blackhole.xyz/vote
   - Select a pool and vote (use a small test amount)
   - Complete the transaction via Metamask

2. **Find the transaction:**
   - Copy the transaction hash from Metamask or Snowtrace
   - View on Snowtrace: https://snowtrace.io/tx/[tx_hash]

3. **Extract contract address:**
   - The `To:` address in the transaction is the voting contract
   - Copy this address

4. **Get the ABI:**
   ```bash
   # Replace [CONTRACT_ADDRESS] and [API_KEY] with actual values
   curl "https://api.snowtrace.io/api?module=contract&action=getabi&address=[CONTRACT_ADDRESS]&apikey=[API_KEY]"
   ```

## Method 3: Browser DevTools Network Inspection

1. **Open DevTools:**
   - Visit https://blackhole.xyz/vote
   - Press F12 or Right-click ? Inspect
   - Go to Network tab

2. **Filter for contract calls:**
   - Filter by "eth_call" or "rpc"
   - Select a pool and click vote button (don't confirm)
   - Look for contract addresses in requests

3. **Look for contract addresses in:**
   - Request payloads
   - Response data
   - JavaScript console errors/messages

## Method 4: Reverse Engineer from UI

1. **Check page source:**
   - Right-click ? View Page Source
   - Search for "0x" to find addresses
   - Look in JavaScript variables

2. **Check localStorage/sessionStorage:**
   - Open DevTools ? Application tab
   - Check Local Storage for contract addresses
   - Check Session Storage

3. **Check API responses:**
   - Filter Network tab for "api" or "json"
   - Look at responses from `/api/` endpoints
   - Contract addresses may be in pool data

## Method 5: Research Scripts

Use the provided research scripts:

```bash
# Find contracts from website
python3 scripts/find_voting_contracts.py

# Scrape documentation (may take time)
python3 scripts/scrape_blackhole_docs.py
```

## Identifying veBLACK Contract

The veBLACK (Voting Escrow BLACK) contract:

1. **Check BLACK token interactions:**
   - BLACK token: `0xcd94a87696fac69edae3a70fe5725307ae1c43f6`
   - Look for contracts that:
     - Accept BLACK as input
     - Mint veBLACK tokens
     - Have "VotingEscrow" or "ve" in the name

2. **Check documentation:**
   - Look for "veBLACK" or "voting escrow" sections
   - May be mentioned alongside staking documentation

3. **Analyze token holders:**
   - Check Snowtrace for BLACK token
   - Large holders might be the veBLACK contract

## Mapping Pool Names to Addresses

Pools in the recommender have names like "CL200-WAVAX/USDC" but the voting contract needs addresses.

**Option 1: From API Response**
- The pool recommender may fetch pool data from an API
- Check if API responses include pool contract addresses
- Modify `_extract_pools_from_elements()` to capture pool IDs/addresses

**Option 2: From Voting Page**
- Inspect pool rows on the voting page
- Pool addresses may be in:
  - Data attributes (`data-pool-id`, `data-address`)
  - Hidden elements
  - JavaScript variables

**Option 3: Reverse Lookup**
- Each pool type has standard patterns
- CL200 pools may follow a naming/address pattern
- vAMM pools may have a different pattern

## Verification Steps

Once you have candidate addresses:

1. **Verify on Snowtrace:**
   - Check contract is verified
   - Review contract source code
   - Check recent transactions

2. **Verify Functions:**
   - Look for voting-related functions:
     - `vote(address pool, uint256 amount)`
     - `voteForGauge(address gauge, uint256 weight)`
     - `setVote(address pool, uint256 weight)`

3. **Test with small amount:**
   - Use dry-run mode first
   - Test with minimal voting power
   - Verify transaction on Snowtrace

## Current Status

- ? Research scripts created
- ? Framework for voting automation ready
- ?? Voting contract address: **NEEDS IDENTIFICATION**
- ?? veBLACK contract address: **NEEDS IDENTIFICATION**
- ?? Pool address mapping: **NEEDS IMPLEMENTATION**

## Next Steps

1. **Immediate:** Manually vote once and capture the contract address
2. **Get ABI:** Fetch contract ABI from Snowtrace
3. **Update config:** Add addresses to `config.yaml`
4. **Test:** Run voting module in dry-run mode
5. **Verify:** Test with small real vote before full automation

## Resources

- **Blackhole Docs:** https://docs.blackhole.xyz
- **Blackhole App:** https://blackhole.xyz/vote
- **Snowtrace:** https://snowtrace.io
- **Research Scripts:** `scripts/find_voting_contracts.py`, `scripts/scrape_blackhole_docs.py`
- **Research Results:** `voting_contract_research.json`
