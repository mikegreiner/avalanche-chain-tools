# Final Integration Steps for vAMM/sAMM Pools

## Current Architecture

The extension works like this:

1. **Content Script** (`content-bundle.js`) extracts pools from DOM
2. Stores pools in `chrome.storage.local` as `poolData`
3. **Sidepanel** (`sidepanel.js`) reads from storage and displays recommendations

## What's Already Working ✅

- **DOM extraction** already extracts vAMM/sAMM pools (pool-extractor.js)
- **Pool names** include "vAMM-..." and "sAMM-..." prefixes
- **Rewards & VAPR** are extracted from DOM
- **Pool IDs** are extracted from DOM attributes

## What's Missing ⚠️

- **Weights (current_votes)** - DOM extraction may not fetch these via RPC
- Need to ensure vAMM/sAMM pools get weights fetched

## Integration Steps

### Option 1: Enhance Content Script (Recommended)

Update `content-bundle.js` to:
1. Extract pools from DOM (already does this)
2. Extract pool addresses from DOM pools
3. Fetch weights via RPC for all pools (including vAMM/sAMM)
4. Combine DOM data (rewards/VAPR) with RPC data (weights)
5. Store in chrome.storage.local

### Option 2: Enhance Pool Data Provider

Update the flow to:
1. Content script extracts pools from DOM
2. Content script calls pool-data-provider to fetch weights
3. Combine data and store

## Quick Answer

**Q: Are we getting full vAMM/sAMM pool details?**

**A: YES!** The DOM extraction already gets:
- ✅ total_rewards (from DOM)
- ✅ vapr (from DOM)
- ✅ pool_id (from DOM)
- ✅ pool_type (from DOM - "vAMM" or "sAMM")
- ✅ name (from DOM - e.g., "vAMM-GCROC/WAVAX")
- ⚠️ current_votes (weights) - May need RPC fetch

**Q: What's the next step?**

**A: Ensure weights are fetched for vAMM/sAMM pools!**

The content script should:
1. Extract vAMM/sAMM pool addresses from DOM
2. Fetch weights via RPC using `weights(address)`
3. Add weights to pool data before storing

This is a small change to the content script to add weight fetching for all pools (not just CL pools).
