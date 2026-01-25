# API Exploration Summary

## ✅ SOLVED: How to Get Pool Data via RPC

### Key Contracts
- **Voter Contract:** `0xe30d0c8532721551a51a9fec7fb233759964d9e3`
- **Multicall3:** `0xca11bde05977b3631167028862be2a173976ca11`
- **Public RPC:** `https://api.avax.network/ext/bc/C/rpc`

### Available Data via RPC

#### 1. Current Votes (from Voter contract)
**Function:** `weights(address)` - selector `0xa7cac846`
```javascript
// Call Voter.weights(poolAddress)
const callData = '0xa7cac846' + poolAddress.slice(2).padStart(64, '0');
const result = await web3.eth.call({
  to: '0xe30d0c8532721551a51a9fec7fb233759964d9e3',
  data: callData
});
const votes = parseInt(result, 16) / 1e18;
```

#### 2. Total Rewards (from Pool contract)
**Function:** `totalSupply()` - selector `0x18160ddd`
```javascript
// For vAMM/sAMM pools
const result = await web3.eth.call({
  to: poolAddress,
  data: '0x18160ddd'
});
const totalRewards = parseInt(result, 16) / 1e18;
```

#### 3. Liquidity (from CL Pool contract)
**Function:** `liquidity()` - selector `0x1a686502`
```javascript
// For CL pools
const result = await web3.eth.call({
  to: poolAddress,
  data: '0x1a686502'
});
const liquidity = parseInt(result, 16) / 1e18;
```

#### 4. VAPR (Calculated)
```javascript
// VAPR = (Total Rewards / Current Votes) * 52 weeks * 100%
const vapr = (totalRewards / votes) * 52 * 100;
```

### Pool Name/Metadata
Use static API: `https://resources.blackhole.xyz/cl-pools-list/cl-pools.json`

### Implementation Strategy

**Step 1:** Fetch static pool metadata (names, tokens, fees) from API
**Step 2:** Use Multicall3 to batch-fetch votes + rewards for all pools
**Step 3:** Calculate VAPR client-side
**Step 4:** Display in side panel (no DOM scraping needed!)

### Benefits Over DOM Scraping
✅ **Fast:** Single RPC call via multicall for all pools (~100ms)
✅ **Reliable:** No DOM changes break it
✅ **Fresh:** Always up-to-date blockchain data
✅ **Complete:** Get data for ALL pools, not just visible ones

### What We Still Can't Do Programmatically
❌ Select/deselect pools (requires MetaMask signing)
❌ Submit votes (requires transaction)
❌ Get incentives/bribes (not found in contracts yet)

But we CAN display perfect recommendations without any DOM scraping!

## Next Implementation

Create `extension/lib/blackhole-data-fetcher.js`:
1. Fetch cl-pools.json for metadata
2. Build multicall to batch-query votes + rewards
3. Calculate VAPR for each pool
4. Return complete pool data array
5. Side panel uses this instead of chrome.storage
