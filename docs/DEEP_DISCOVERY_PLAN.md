# Deep API Discovery Plan

## Actions to Capture with Discovery Tab

Please perform these actions ONE AT A TIME with API discovery enabled, and save the logs after each:

### 1. **Page Load** 
- Clear browser cache
- Navigate to https://blackhole.xyz/vote
- Wait for page to fully load
- Save log as: `page-load.json`

### 2. **Sort by VAPR**
- Click the VAPR column header to sort
- Wait for any loading indicators
- Save log as: `sort-by-vapr.json`

### 3. **Change Page Size**
- Change items per page dropdown
- Save log as: `change-page-size.json`

### 4. **Navigate Pages**
- Click to page 2, then page 3
- Save log as: `navigate-pages.json`

### 5. **Search for Specific Pool**
- Use the search bar to search for "WAVAX/USDC"
- Save log as: `search-pool.json`

### 6. **Inspect Pool Details**
- Hover over or click on a pool to see details
- Save log as: `pool-details.json`

### 7. **Check Vote Panel**
- Click to open the voting panel at bottom
- Save log as: `vote-panel.json`

## What to Look For

In the captured logs, we need to find:
- Any GraphQL queries
- Any REST API calls to `/api/` endpoints
- Any calls with "reward", "fee", "epoch", "vapr" in URL or params
- Any POST requests with JSON payloads
- Any calls to contracts OTHER than the multicall we already know

## Files to Check

Also, let me analyze:
1. The site's JavaScript bundle (might have API endpoints hardcoded)
2. Service worker (if any)
3. LocalStorage/SessionStorage keys
4. Network timing (to see which calls happen when)

Please start with action #1 (page load) and share the log file.
