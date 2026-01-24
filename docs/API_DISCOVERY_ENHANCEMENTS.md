# API Discovery Tool Enhancements

## Overview
Enhanced the existing API Discovery tool in the browser extension to better capture and analyze network requests, with special focus on discovering vAMM, sAMM, and other pool type endpoints.

## Enhancements Made

### 1. Enhanced Request Analysis (`lib/api-discovery.js`)
- **Automatic Categorization**: Requests are now automatically categorized as:
  - Pool-related (CL, vAMM, sAMM)
  - RPC calls
  - API endpoints
  - Other

- **Pool Type Detection**: Automatically detects:
  - CL pools (from `cl-pools-list/cl-pools.json`)
  - vAMM pools (from `vamm-pools-list/vamm-pools.json` or response content)
  - sAMM pools (from `samm-pools-list/samm-pools.json` or response content)

- **RPC Call Parsing**: Extracts:
  - RPC method name (e.g., `eth_call`)
  - Contract addresses being called
  - Function selectors (first 4 bytes of call data)

- **Response Analysis**: Analyzes response bodies to detect:
  - Pool data structures (arrays with token0/token1)
  - Pool count in responses
  - Pool type indicators in content

### 2. Enhanced UI (`sidepanel.html` & `sidepanel.js`)

#### Statistics Dashboard
- Real-time counters showing:
  - Total requests captured
  - Pool-related API endpoints found
  - RPC calls intercepted
  - vAMM pool endpoints
  - sAMM pool endpoints

#### Filtering & Search
- **Search Bar**: Filter by URL, method, contract address, or RPC method
- **Category Filter**: Filter by Pool, API, RPC, or Other
- **Pool Type Filter**: Filter by CL, vAMM, or sAMM

#### Enhanced Display
- **Color-coded Requests**:
  - 🏊 Green border: Pool-related requests
  - 🔗 Blue border: RPC calls
  - 🌐 Orange border: API endpoints
  - ⚡ Orange badge: vAMM pools
  - 🔄 Purple badge: sAMM pools
  - 📊 Green badge: CL pools

- **Detailed Information**:
  - RPC method and contract address (for RPC calls)
  - Endpoint type and pool data detection
  - Expandable response previews
  - Status code color coding

#### Enhanced Export
- Exports include:
  - Metadata (timestamp, counts)
  - Analysis summaries for each request
  - Full request/response data

## Usage

1. **Open the Extension Side Panel** on the Blackhole voting page
2. **Navigate to "API Discovery" tab**
3. **Interact with the voting page** - requests are automatically captured
4. **Use filters** to find specific types of requests:
   - Search for "vamm" or "samm" to find pool endpoints
   - Filter by "RPC Calls" to see blockchain interactions
   - Filter by "Pool Related" to see all pool data requests
5. **Download logs** for further analysis

## What to Look For

### vAMM Pool Endpoints
- Look for requests to `resources.blackhole.xyz/vamm-pools-list/`
- Check for responses containing vAMM pool data
- Note any RPC calls to vAMM factory contracts

### sAMM Pool Endpoints
- Look for requests to `resources.blackhole.xyz/samm-pools-list/`
- Check for responses containing sAMM pool data
- Note any RPC calls to sAMM factory contracts

### RPC Patterns
- Function selectors that might indicate pool listing functions
- Contract addresses that might be factory or registry contracts
- Batch calls that fetch multiple pools

## Next Steps

1. **Capture Real Traffic**: Use the enhanced tool while browsing the voting page to capture actual requests
2. **Analyze Patterns**: Look for:
   - Endpoints that return 403 (exist but need proper headers)
   - RPC calls that fetch pool lists
   - GraphQL or other API patterns
3. **Test Discovered Endpoints**: Try accessing discovered endpoints with proper headers
4. **Document Findings**: Update pool data provider with discovered endpoints

## Technical Details

### Request Analysis Logic
The analysis function checks:
1. URL patterns (resources.blackhole.xyz, rpc endpoints)
2. Request body content (RPC method, contract addresses)
3. Response body content (pool data structures)
4. Headers and content types

### Performance
- Limits display to prevent performance issues
- Uses efficient filtering for large request logs
- Statistics update in real-time

## Files Modified

1. `extension/lib/api-discovery.js` - Enhanced request interception and analysis
2. `extension/sidepanel.html` - Added statistics and filters UI
3. `extension/sidepanel.js` - Enhanced display and filtering logic
