# Blackhole DEX API Analysis

## Summary
Analysis of the Blackhole DEX voting page to identify and document APIs for pool selection/deselection.

## Key Findings

### 1. Static Pool Data API ✅
**Endpoint:** `https://resources.blackhole.xyz/cl-pools-list/cl-pools.json`
- **Status:** Accessible, returns 200
- **Content:** Full list of Concentrated Liquidity pools
- **Size:** ~75KB JSON
- **Data Structure:**
```json
{
  "pools": [
    {
      "id": "0x...",
      "fee": "2500",
      "token0": { "id": "0x...", "symbol": "...", "name": "...", "decimals": "18" },
      "token1": { "id": "0x...", "symbol": "...", "name": "...", "decimals": "18" },
      "liquidity": "...",
      "totalValueLockedUSD": "...",
      "volumeUSD": "...",
      "feesUSD": "..."
    }
  ]
}
```

**Use Case:** This provides static pool metadata, but NOT voting/rewards data.

### 2. RPC Calls (Multicall Pattern)
**Endpoint:** `https://lb.drpc.org/avalanche/[API_KEY]`
- **Method:** POST with JSON-RPC 2.0
- **Pattern:** Using Multicall contract `0xca11bde05977b3631167028862be2a173976ca11`
- **Function:** `0x82ad56cb` (aggregate multicall)
- **Frequency:** 301 RPC calls observed in captured logs

**What they're calling:**
- Function selector: `0xcc56b2c5` repeated across multiple pool addresses
- This appears to be querying pool-specific data (likely rewards/votes)

### 3. Contract Addresses
From the API logs, the key contracts identified:
- **Multicall3:** `0xca11bde05977b3631167028862be2a173976ca11`
- **Voter Contract:** (need to identify from pool addresses being queried)

### 4. Current Limitations
❌ **No direct voting API found** - Selection/deselection likely handled client-side
❌ **No batch select/deselect endpoint** - Must interact with smart contracts
❌ **Rewards data via RPC only** - No REST API for current rewards

## Proposed Approach

### Option A: Direct Smart Contract Interaction
**Pros:**
- Most reliable and fast
- No DOM scraping needed
- Can batch operations

**Cons:**
- Requires understanding contract ABI
- Need to decode multicall responses
- May need wallet signing for selections

**Implementation:**
1. Decode the function selector `0xcc56b2c5` to understand what data is being fetched
2. Identify the Voter contract that handles selections
3. Build direct contract calls using web3/ethers
4. Inject MetaMask/wallet integration for signing

### Option B: Hybrid Approach (Recommended)
**Use static API for metadata + RPC for live data**

1. **Pool Metadata:** Fetch from `cl-pools.json`
2. **Live Rewards/Votes:** Decode and replicate the multicall pattern
3. **Selection:** Continue using DOM (but optimized with pool address search)

This gives us the best of both worlds without requiring full smart contract integration.

### Option C: Analyze GraphQL Endpoint
The site likely uses a GraphQL endpoint (common for DeFi UIs). Need to:
1. Check network tab for GraphQL queries
2. Examine request/response patterns
3. Document the schema

## Next Steps

1. **Decode Multicall Data**
   - Extract the ABI for function `0xcc56b2c5`
   - Understand what data it returns
   - Replicate the call pattern

2. **Find Voter Contract**
   - Identify which contract handles vote submissions
   - Check if votes are stored on-chain or off-chain

3. **Test Direct API Calls**
   - Can we fetch pool data without DOM?
   - Can we submit votes programmatically?

4. **Build Proof of Concept**
   - Fetch rewards data via RPC
   - Display in side panel
   - Compare with DOM-scraped data

## Resources
- Captured API logs: `ai-tmp/blackhole-api-logs-*.json`
- Discovered endpoints: `data/discovered_endpoints.json`
- Pool data sample: `data/discovered_pools.json`
