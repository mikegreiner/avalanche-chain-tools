# Latest API Logs Analysis - January 20, 2026 01:52:45

## Summary

Analysis of the latest captured API logs: `blackhole-api-logs-2026-01-20T01_52_45.591Z.json`

### Key Metrics

- **Total Requests**: 173 (increased from 68 in previous capture)
- **RPC Calls**: 152 (87.9%)
- **API Endpoints**: 6 (3.5%)
- **Pool-Related HTTP Endpoints**: 0
- **vAMM/sAMM Endpoints Found**: 0

### Request Breakdown

| Type | Count | Percentage |
|------|-------|------------|
| RPC Calls (Multicall3) | 152 | 87.9% |
| API Endpoints | 6 | 3.5% |
| Analytics | 6 | 3.5% |
| Other | 9 | 5.2% |

## API Endpoints Discovered

### Token Details Endpoint (6 requests)
- **URL**: `https://resources.blackhole.xyz/token-details.json`
- **Status**: 200 (all successful)
- **Content**: Token metadata dictionary keyed by token address
- **Purpose**: Provides token information (symbol, name, decimals, etc.)
- **Note**: Not pool-related, just token metadata

### Missing Endpoints

Still no HTTP API endpoints found for:
- ❌ vAMM pools
- ❌ sAMM pools
- ❌ CL pools (though we know `cl-pools.json` exists)

## Key Observations

### 1. RPC-Heavy Architecture
The site heavily relies on RPC calls (87.9% of requests) rather than HTTP API endpoints. This suggests:
- Pool data is fetched directly from blockchain contracts
- The site uses Multicall3 to batch multiple contract calls
- HTTP APIs may only be used for static metadata (like token details)

### 2. No Pool Endpoints in This Capture
Despite capturing 173 requests, no pool-related HTTP endpoints were found. This could mean:
- Pool endpoints are only called on initial page load (before capture started)
- Pool data is fetched via RPC calls to contracts
- Pool data might be embedded in the initial HTML/DOM

### 3. Increased Activity
The capture shows more requests (173 vs 68), suggesting:
- More user interaction during this capture
- More RPC calls as the page loads additional data
- Possibly more navigation between pages

## Comparison with Previous Capture

| Metric | Previous (01:45) | Latest (01:52) | Change |
|--------|-----------------|----------------|--------|
| Total Requests | 68 | 173 | +154% |
| RPC Calls | 61 | 152 | +149% |
| API Endpoints | 2 | 6 | +200% |
| Pool Endpoints | 0 | 0 | No change |

## Implications for vAMM/sAMM Discovery

### Current Understanding
1. **CL Pools**: Have HTTP API endpoint (`cl-pools.json`) - confirmed to exist
2. **vAMM/sAMM Pools**: No HTTP API endpoints found in any capture
3. **RPC Pattern**: Site uses Multicall3 to batch contract calls

### Likely Mechanism
vAMM and sAMM pools are likely fetched via:
1. **RPC calls to factory contracts** that create these pools
2. **RPC calls to registry contracts** that maintain pool lists
3. **RPC calls to the voter contract** which may register all pool types
4. **DOM/JavaScript** - pool data embedded in page HTML or loaded via JavaScript

## Recommendations

### 1. Capture Initial Page Load
- Start API Discovery tool before navigating to the voting page
- Capture requests from the very beginning of page load
- This may catch pool endpoint calls that happen immediately

### 2. Monitor RPC Calls More Closely
- Focus on decoding Multicall3 requests
- Identify which contracts are being called
- Look for patterns when vAMM/sAMM pools appear in UI

### 3. Inspect Page Source
- Check if pool data is embedded in initial HTML
- Look for JavaScript variables containing pool data
- Check for lazy-loaded data structures

### 4. Query Contracts Directly
- Query the voter contract for all registered pools
- Find and query vAMM/sAMM factory contracts
- Check for pool registry contracts

### 5. Try Known Endpoint Patterns
Based on the CL pools pattern, try:
- `https://resources.blackhole.xyz/vamm-pools-list/vamm-pools.json`
- `https://resources.blackhole.xyz/samm-pools-list/samm-pools.json`
- These may exist but require specific headers or authentication

## Next Steps

1. **Early Capture**: Start API Discovery before page load
2. **RPC Analysis**: Deep dive into Multicall3 calls to identify contracts
3. **Contract Research**: Find vAMM/sAMM factory and registry contracts
4. **DOM Inspection**: Check page source for embedded pool data
5. **Endpoint Testing**: Try accessing suspected endpoints with proper headers

## Conclusion

The latest capture confirms the pattern: **Blackhole DEX primarily uses RPC calls for pool data, not HTTP API endpoints**. While CL pools have a known HTTP endpoint, vAMM and sAMM pools appear to be fetched exclusively via blockchain RPC calls. 

To discover these pools, we need to:
1. Identify the contracts that manage vAMM/sAMM pools
2. Query these contracts directly via RPC
3. Or find the mechanism the site uses to discover these pools (which may be in the initial page load we haven't captured yet)
