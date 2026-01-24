# API Logs Analysis - January 20, 2026

## Summary

Analysis of captured API logs from `blackhole-api-logs-2026-01-20T01_45_37.866Z.json`

### Key Findings

1. **Total Requests**: 68
2. **RPC Calls**: 61 (89.7%)
3. **API Endpoints**: 2 (2.9%)
4. **Pool-Related HTTP Endpoints**: 0

### Request Breakdown

| Type | Count | Percentage |
|------|-------|------------|
| RPC Calls (Multicall3) | 61 | 89.7% |
| API Endpoints | 2 | 2.9% |
| Analytics | 2 | 2.9% |
| Other | 3 | 4.4% |

## RPC Call Analysis

### Multicall3 Pattern

**Contract**: `0xca11bde05977b3631167028862be2a173976ca11` (Multicall3)

**Function Selector**: `0x82ad56cb` (appears in 57 calls)

The site uses **Multicall3** to batch multiple RPC calls into a single request. This is an efficient pattern for:
- Fetching pool weights from the voter contract
- Getting pool data from multiple contracts
- Reducing RPC call overhead

### RPC Methods Used

- `eth_call`: 57 calls (93.4%)
- `eth_getBalance`: 4 calls (6.6%)

## API Endpoints Discovered

### 1. Token Details Endpoint
- **URL**: `https://resources.blackhole.xyz/token-details.json`
- **Status**: 200
- **Content**: Token metadata keyed by token address
- **Purpose**: Provides token information (symbol, name, decimals, etc.)

### 2. CL Pools Endpoint (Known)
- **URL**: `https://resources.blackhole.xyz/cl-pools-list/cl-pools.json`
- **Status**: 200 (when accessed directly)
- **Note**: Not captured in this log, but known to exist

## Missing Endpoints

### vAMM Pools
- **Expected**: `https://resources.blackhole.xyz/vamm-pools-list/vamm-pools.json`
- **Status**: Not found in logs
- **Likely**: Fetched via RPC calls to factory/registry contracts

### sAMM Pools
- **Expected**: `https://resources.blackhole.xyz/samm-pools-list/samm-pools.json`
- **Status**: Not found in logs
- **Likely**: Fetched via RPC calls to factory/registry contracts

## Implications

### How Pool Data is Fetched

Based on the analysis, the Blackhole DEX site appears to:

1. **CL Pools**: Fetched from HTTP API endpoint (`cl-pools.json`)
2. **vAMM/sAMM Pools**: Likely fetched via RPC calls to:
   - Factory contracts that create these pools
   - Registry contracts that maintain pool lists
   - The voter contract (for weights)

### Why No vAMM/sAMM API Endpoints?

Possible reasons:
1. **RPC-Only**: These pools are fetched directly from blockchain contracts
2. **Lazy Loading**: Endpoints exist but are only called when needed (not on initial page load)
3. **Different Pattern**: May use a different mechanism (GraphQL, WebSocket, etc.)
4. **DOM-Based**: Pool data might be embedded in the initial HTML

## Next Steps for Discovery

### 1. Monitor RPC Calls
- Use the enhanced API Discovery tool to capture RPC calls when vAMM/sAMM pools appear
- Look for calls to factory contracts
- Identify registry contracts that list pools

### 2. Check Factory Contracts
- Find vAMM factory contract address
- Find sAMM factory contract address
- Query these contracts for pool lists

### 3. Monitor Network Tab
- Watch for requests that happen when scrolling to vAMM/sAMM pools
- Check for GraphQL queries
- Look for WebSocket connections

### 4. Inspect DOM
- Check if pool data is embedded in initial page load
- Look for JavaScript variables containing pool data
- Check for lazy-loaded data

### 5. Contract Analysis
- Query the voter contract for all registered pools
- Check if there's a pool registry contract
- Look for events that register new pools

## Tools Created

1. **Enhanced API Discovery** (`extension/lib/api-discovery.js`)
   - Automatically categorizes requests
   - Detects pool types
   - Parses RPC calls

2. **Multicall Analyzer** (`scripts/analyze_multicall_logs.py`)
   - Decodes Multicall3 batch requests
   - Identifies contracts and functions called
   - Helps understand RPC patterns

## Recommendations

1. **Continue Monitoring**: Use the enhanced API Discovery tool while browsing the voting page
2. **Focus on RPC**: Since most requests are RPC calls, focus on understanding the contract interactions
3. **Factory Contracts**: Research and identify vAMM and sAMM factory contracts
4. **Voter Contract**: The voter contract likely has methods to list all pools regardless of type
5. **Event Logs**: Consider querying blockchain events for pool creation/registration

## Conclusion

The Blackhole DEX site primarily uses RPC calls (via Multicall3) to fetch pool data, rather than HTTP API endpoints. While CL pools have a dedicated API endpoint, vAMM and sAMM pools appear to be fetched directly from blockchain contracts. This suggests we need to:

1. Identify the factory/registry contracts for vAMM and sAMM pools
2. Query these contracts directly via RPC
3. Or find the mechanism the site uses to discover these pools

The enhanced API Discovery tool will help capture more detailed information as we continue to interact with the site.
