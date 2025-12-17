# Blackhole DEX Pool Recommender

A Python script that analyzes liquidity pools on Blackhole DEX and recommends the most profitable pools for voting. It factors in dilution (current votes) and can estimate your personal rewards based on your voting power.

## Overview

This script helps automate the process of selecting the most profitable liquidity pools for voting on Blackhole DEX. It:
1. Fetches pool data from https://blackhole.xyz/vote
2. Analyzes pools accounting for dilution (rewards per vote)
3. Calculates a profitability score factoring in dilution
4. Can estimate your personal USD rewards based on your voting power
5. Recommends the top 1-5 pools (sorted by estimated reward when voting power is provided)

## Installation

```bash
pip install -r requirements.txt
```

**Note:** You'll also need ChromeDriver installed for Selenium to work:
- Download from: https://chromedriver.chromium.org/
- Or install via package manager: `sudo apt-get install chromium-chromedriver` (Linux)

## Usage

### Basic Usage
```bash
python3 blackhole_pool_recommender.py
```

This will recommend the top 5 most profitable pools.

### Customize Number of Recommendations
```bash
python3 blackhole_pool_recommender.py --top 3
```

### Estimate Rewards Based on Your Voting Power
```bash
python3 blackhole_pool_recommender.py --voting-power 15000
```

This will:
- Calculate your estimated USD rewards for each pool
- Sort pools by your estimated reward (most relevant to you)
- Show your estimated share percentage for each pool

### Hide vAMM Pools (if you cannot vote for them)
```bash
python3 blackhole_pool_recommender.py --voting-power 15000 --hide-vamm
```

This will filter out all vAMM pools from the results.

### Filter by Minimum Total Rewards
```bash
python3 blackhole_pool_recommender.py --min-rewards 1000
```

This filters out pools with total rewards less than the specified minimum (in USD). This helps focus on larger pools where rewards are more likely to remain stable even as more votes come in.

**Example:**
```bash
# Only show pools with at least $500 in total rewards
python3 blackhole_pool_recommender.py --top 10 --min-rewards 500

# Combine with other filters
python3 blackhole_pool_recommender.py --voting-power 15000 --min-rewards 1000 --hide-vamm
```

### Filter by Maximum Pool Percentage
```bash
python3 blackhole_pool_recommender.py --voting-power 15000 --max-pool-percentage 0.5
```

This filters out pools where adding your full voting power would give you more than the specified percentage of the total pool's voting power. This helps avoid pools where you'd have too large a share, which may indicate smaller or less established pools.

**Note:** This filter requires `--voting-power` to be specified, as it needs to calculate your percentage share.

**Example:**
```bash
# Hide pools where you'd have more than 0.5% of the voting power
python3 blackhole_pool_recommender.py --voting-power 15000 --max-pool-percentage 0.5

# Combine with other filters
python3 blackhole_pool_recommender.py --voting-power 15000 --max-pool-percentage 0.5 --min-rewards 1000 --hide-vamm
```

### Sort Options

The pool recommender supports multiple sorting methods to help you find the best pools for your needs:

```bash
# Sort by stability (useful near epoch close when votes are pouring in)
python3 blackhole_pool_recommender.py --voting-power 15000 --sort-by stability

# Sort by profitability score (ignores voting power, focuses on pool characteristics)
python3 blackhole_pool_recommender.py --sort-by profitability

# Sort by estimated reward (default when voting power is provided)
python3 blackhole_pool_recommender.py --voting-power 15000 --sort-by reward

# Auto mode (default): uses reward if voting power provided, else profitability
python3 blackhole_pool_recommender.py --voting-power 15000 --sort-by auto
```

**Sort Methods:**
- **`auto`** (default): Automatically chooses the best method - uses `reward` if `--voting-power` is provided, otherwise uses `profitability`
- **`reward`**: Sorts by estimated USD reward based on your voting power (requires `--voting-power`)
- **`profitability`**: Sorts by profitability score (rewards per vote, pool size, etc.)
- **`stability`**: Sorts by stability-adjusted score, which combines estimated rewards with stability metrics. Higher stability means the pool is less likely to see dramatic changes as votes pour in near epoch close.

**Stability Scoring:**
The stability score is based on vote density (votes per dollar of rewards). Pools with higher vote density are more "saturated" and less likely to see dramatic changes. The stability-adjusted score combines your estimated rewards (70%) with stability (30%), helping you maximize rewards while accounting for volatility.

### Caching

The pool recommender automatically caches pool data to speed up subsequent runs. By default, cached data is used for 1 hour (60 minutes, configurable in `config.yaml`).

**Benefits:**
- Faster subsequent runs within the cache window
- Shared cache across all tools (pool recommender, pool tracker, etc.)
- Caches all pools (not filtered), so different filter combinations work with cached data
- Cache status shown on each run (when cached data is used)

**Cache Status Display:**
When using cached data, you'll see concise cache information:
```
Using cached pool data (50 pools) - Cached: 10:23:15 UTC, Expires: 10:30:15 UTC
```

**Skip Cache (Refresh Data):**
```bash
python3 blackhole_pool_recommender.py --no-cache
```

This will skip reading from cache and fetch fresh data, but will still save the new data to cache (refreshing it).

**View Detailed Cache Information:**
```bash
python3 blackhole_pool_recommender.py --cache-info
```

This shows detailed cache information including:
- Cache file locations
- Status (Valid/Expired/Invalid with reason)
- Number of pools cached
- Validation issues (if any)
- Last refresh time and age (in mins:seconds format)
- Expiry time and time until expiry
- Cache expiry window

The cache status is determined by both:
1. **Timestamp validation**: Checks if the cache hasn't expired based on the configured expiry window
2. **Content validation**: Validates cache completeness by checking:
   - Pool count (expects 50+ pools minimum)
   - Cache file size (expects ~100 bytes per pool minimum)
   - Data quality (checks for missing essential fields)
   - Data distribution (should have pools with high rewards)

The cache is only considered valid if both timestamp and content validation pass. If content validation fails, the cache will be refreshed on the next run even if the timestamp is still valid.

**Configuration:**
Cache settings can be configured in `config.yaml`:
```yaml
pool_recommender:
  cache:
    enabled: true
    expiry_minutes: 7  # Cache expires after 7 minutes
    directory: "cache"  # Cache directory
```

### Debug Mode (shows browser)
```bash
python3 blackhole_pool_recommender.py --no-headless
```

### Save to File
```bash
# Save text output to file
python3 blackhole_pool_recommender.py --voting-power 15000 -o recommendations.txt

# Save JSON output to file
python3 blackhole_pool_recommender.py --voting-power 15000 --json -o recommendations.json

# Or save to an output directory (recommended, gitignored)
python3 blackhole_pool_recommender.py -o output/pool_recommendations.txt
```

### Single-Line Display Mode
```bash
python3 blackhole_pool_recommender.py --voting-power 15000 --single-line
```

This displays each pool on a single line with aligned dollar amounts and share percentages for easier scanning. The format is:
```
1. CL200-SPX/USDC:        $1,423.94 (29.17% share)
2. CL1-USDC/GHO:              $383.37 (53.15% share)
3. CL200-SUPER/USDC:         $290.16 (3.39% share)
```

**Features:**
- Pool names are left-aligned
- Dollar amounts are right-aligned (bolded)
- Share percentages are left-aligned
- More compact and easier to scan than the default multi-line format

**Note:** Requires `--voting-power` to display estimated rewards. Without voting power, only pool names are shown.

### Automatically Select Recommended Pools
```bash
python3 blackhole_pool_recommender.py --top 10 --voting-power 15000 --select-pools
```

This generates a JavaScript console script that automatically selects the recommended pools on the voting page. The script is:
- Saved to `blackhole_select_pools.js` (or based on `--output` filename if provided)
- Automatically copied to your clipboard (if `pyperclip` is installed)
- Ready to paste into your browser console on https://blackhole.xyz/vote

**Usage:**
1. Run the recommender with `--select-pools`
2. Open https://blackhole.xyz/vote in your browser
3. Open the browser console (F12 or right-click → Inspect → Console)
4. Paste the script (Ctrl+V or Cmd+V) and press Enter
5. The recommended pools will be automatically selected
6. Allocate your votes manually using the voting interface

**Note:** Install `pyperclip` for automatic clipboard copying:
```bash
pip install pyperclip
```

If `pyperclip` is not installed, the script will still be saved to a file and you can manually copy it.

**Troubleshooting Pool Selection:**
- If pools are not being found or selected, check the browser console for diagnostic messages
- The script searches for pools even if they're hidden and will attempt to make them visible
- If you see errors about wallet injection (e.g., "Failed to inject getOfflineSigner from keplr"), see the [Wallet Extension Conflicts](#wallet-extension-conflicts) section below

### Skip Cache (Refresh Data)
```bash
python3 blackhole_pool_recommender.py --no-cache
```

This will skip reading from cache and fetch fresh data, but will still save the new data to cache (refreshing it).

### Check Version
```bash
python3 blackhole_pool_recommender.py --version
```

Displays the current version of the script.

## How It Works

### Profitability Scoring

The script calculates a profitability score that accounts for dilution:
- **Rewards per Vote (60% weight)**: Accounts for dilution - pools with fewer votes give more per vote
- **Total Rewards (25% weight)**: Absolute size still matters
- **VAPR (15% weight)**: The Value at Pool Rate percentage

When you provide `--voting-power`, pools are sorted by **your estimated reward** instead of profitability score, which is more relevant for decision-making.

### Estimated Rewards Calculation

When you provide your voting power (e.g., `--voting-power 15000`), the script estimates your USD rewards:

```
New total votes = current_votes + your_voting_power
Your share = your_voting_power / new_total_votes
Estimated reward = your_share × total_rewards
```

This helps you compare pools based on what you'd actually receive, accounting for dilution.

### Data Fetching

The script tries multiple methods to fetch pool data:

1. **API Endpoint** (fastest): Attempts to find a direct API endpoint
2. **Selenium Scraping** (fallback): Renders the React app and extracts data from the DOM

## Customization

Since the website structure may change, you may need to adjust the selectors in the script. Use the inspection helper:

```bash
python3 inspect_blackhole_page.py
```

This will:
- Open the page in a browser
- Analyze the page structure
- Save the HTML source for inspection
- Help identify the correct selectors for pool data

Then update `blackhole_pool_recommender.py` with the correct:
- HTML selectors (CSS classes, IDs, etc.)
- Data extraction patterns
- API endpoints (if discovered)

## Example Output

### Without Voting Power
```
================================================================================
BLACKHOLE DEX POOL RECOMMENDATIONS
================================================================================
Version: 1.3.2
Generated: 2025-01-15 14:30:00
Epoch Close (UTC): 2025-01-16 23:59:59 UTC
Epoch Close (Local): 2025-01-16 16:59:59 PST

Top 5 Most Profitable Pools:

1. CL200-WETH.e/USDt
   Type: [CL200] 0.1%
   Total Rewards: $9,181.00
   VAPR: 731.70%
   Current Votes: 544,798
   Rewards per Vote: $0.0169
   Profitability Score: 44.94
```

### With Voting Power
```
================================================================================
BLACKHOLE DEX POOL RECOMMENDATIONS
================================================================================
Version: 1.3.2
Generated: 2025-01-15 14:30:00
Epoch Close (UTC): 2025-01-16 23:59:59 UTC
Epoch Close (Local): 2025-01-16 16:59:59 PST
Estimated rewards based on voting power: 15,763 veBLACK
Note: Estimates assume you vote ALL your voting power in each pool individually
      In reality, votes dilute rewards as more people vote

Top 5 Pools (sorted by estimated reward):

1. vAMM-USDC/ARTERY
   Type: [vAMM] 0.7%
   Total Rewards: $21,995.00
   VAPR: 104.10%
   Current Votes: 67,371
   Rewards per Vote: $0.3265
   >>> Your Estimated Reward: $4,170.52 (18.96% share)
   Profitability Score: 75.04

2. CL200-XAUt0/USDt
   Type: [CL200] 0.5%
   Total Rewards: $5,483.00
   VAPR: 820.80%
   Current Votes: 289,896
   Rewards per Vote: $0.0189
   >>> Your Estimated Reward: $282.77 (5.16% share)
   Profitability Score: 37.69
```

### With Single-Line Display Mode
```
================================================================================
BLACKHOLE DEX POOL RECOMMENDATIONS
================================================================================
Version: 1.3.2
Generated: 2025-01-15 14:30:00
Epoch Close (UTC): 2025-01-16 23:59:59 UTC
Epoch Close (Local): 2025-01-16 16:59:59 PST
Estimated rewards based on voting power: 15,763 veBLACK
Note: Estimates assume you vote ALL your voting power in each pool individually
      In reality, votes dilute rewards as more people vote

Top 5 Pools (sorted by estimated reward):

1. CL200-SPX/USDC:        $1,423.94 (29.17% share)
2. CL1-USDC/GHO:              $383.37 (53.15% share)
3. CL200-SUPER/USDC:         $290.16 (3.39% share)
4. vAMM-SUPER/WAVAX:         $267.37 (26.37% share)
5. vAMM-SUPER/USDC:          $236.88 (4.13% share)
```

Note: Dollar amounts are bolded in the actual output. The single-line format provides a compact, easy-to-scan view with aligned columns.

### JSON Output Example
```json
{
  "version": "1.3.2",
  "generated": "2025-01-15 14:30:00",
  "user_voting_power": 15000,
  "filters": {
    "hide_vamm": true,
    "min_rewards": 1000.0,
    "max_pool_percentage": 0.5
  },
  "pools": [
    {
      "name": "CL200-WETH.e/USDt",
      "pool_type": "CL200",
      "fee_percentage": "0.1%",
      "total_rewards": 9181.0,
      "vapr": 731.7,
      "current_votes": 544798,
      "rewards_per_vote": 0.0169,
      "profitability_score": 44.94,
      "estimated_user_reward": 250.32,
      "estimated_share_percent": 2.73,
      "new_total_votes_if_you_vote": 559798
    }
  ]
}
```

**JSON Output Fields:**
- **version**: Script version number
- **generated**: Timestamp when recommendations were generated
- **user_voting_power**: Your voting power in veBLACK (null if not provided)
- **filters**: Object showing which filters were applied:
  - **hide_vamm**: Boolean indicating if vAMM pools were filtered out
  - **min_rewards**: Minimum total rewards threshold (null if not used)
  - **max_pool_percentage**: Maximum pool voting power percentage threshold (null if not used)
- **pools**: Array of recommended pools, each containing:
  - Pool identification (name, pool_type, fee_percentage)
  - Metrics (total_rewards, vapr, current_votes, rewards_per_vote, profitability_score)
  - Estimated rewards (if user_voting_power provided): estimated_user_reward, estimated_share_percent, new_total_votes_if_you_vote

**Output Fields:**
- **Type**: Pool type (vAMM, CL200, CL1) and fee percentage
- **Total Rewards**: Total USD value of rewards in the pool
- **VAPR**: Value at Pool Rate percentage
- **Current Votes**: Current voting power in the pool
- **Rewards per Vote**: USD per vote (shows dilution effect)
- **Your Estimated Reward**: What you'd receive with your voting power
- **Profitability Score**: General profitability metric (accounts for dilution)

## Troubleshooting

### "Selenium not available"
Install Selenium: `pip install selenium`

### "ChromeDriver not found"
Install ChromeDriver. See Installation section above.

### "No pools found"
1. The website structure may have changed
2. Run `scripts/inspect_blackhole_page.py` to analyze the current structure
3. Check network requests in browser DevTools for API endpoints
4. Update the selectors in `blackhole_pool_recommender.py`

### Website blocks requests
- Try running with `--no-headless` to see what's happening
- Check if the website requires authentication
- Verify the URL is correct

### Wallet Extension Conflicts {#wallet-extension-conflicts}

Multiple wallet browser extensions can interfere with each other and with the Blackhole DEX website, causing issues such as:
- Pools not appearing or disappearing after page refresh
- Wallet connection problems
- JavaScript errors in the console
- Pool selection scripts not working correctly

**Common Conflicts:**
- **Keplr/ASI Wallet**: Keplr wallet and its forks (like ASI wallet) can conflict with MetaMask and other Ethereum-compatible wallets
- **Multiple Ethereum Wallets**: Having multiple Ethereum wallet extensions (MetaMask, Coinbase Wallet, etc.) can cause injection conflicts
- **Cosmos Wallets**: Cosmos ecosystem wallets (Keplr, Leap, etc.) may interfere with Ethereum-based DEX interactions

**Symptoms:**
- Console errors like: `Failed to inject getOfflineSigner from keplr. Probably, other wallet is trying to intercept Keplr`
- Pools visible on first page load but disappear after refresh
- Pool selection script runs but doesn't find all pools
- Wallet connection issues or unexpected disconnections

**Solutions:**
1. **Disable Conflicting Extensions**: Temporarily disable wallet extensions you're not using:
   - Go to `chrome://extensions/` (or `edge://extensions/` for Edge)
   - Disable extensions you're not actively using
   - Keep only the wallet extension you need for Blackhole DEX (typically MetaMask for Avalanche)

2. **Use Separate Browser Profiles**: Create separate browser profiles for different wallet ecosystems:
   - One profile for Ethereum/Avalanche (MetaMask)
   - Another profile for Cosmos (Keplr)
   - This prevents extension conflicts entirely

3. **Check Console Errors**: Open browser DevTools (F12) and check the Console tab for wallet-related errors:
   - Look for messages about wallet injection failures
   - Note which extensions are mentioned in error messages
   - Disable the conflicting extension(s)

4. **Test Pool Selection**: After disabling conflicting extensions:
   - Refresh the Blackhole DEX voting page
   - Verify all pools are visible
   - Run the pool selection script again
   - Check that all recommended pools are found and selected

**Example:**
If you're using MetaMask for Avalanche but also have ASI wallet (Keplr fork) installed:
1. Disable ASI wallet extension
2. Refresh https://blackhole.xyz/vote
3. Verify pools are visible and stable
4. Run the pool selection script

**Note:** You can re-enable extensions after voting - the conflict primarily affects the voting page interaction, not your wallet functionality.

## Next Steps

1. **Identify API Endpoint**: Use browser DevTools (F12 → Network tab) to find API calls when visiting the vote page. This would be faster than Selenium.

2. **Adjust Selectors**: Once you know the page structure, update the parsing logic in `_parse_pools_from_html()` or `_parse_api_response()`.

3. **Refine Scoring**: Adjust the profitability score weights based on your experience and what works best.

4. **Add Features**:
   - Add time until epoch close
   - Historical data analysis
   - Filter out non-votable pools (see code comments for approach)

## Pool Types

The script identifies three types of pools based on their naming prefixes:

- **CL200** = Concentrated Liquidity 200x: Highly efficient concentrated liquidity pools (similar to Uniswap V3) that can achieve up to 200x capital efficiency by concentrating liquidity in tighter price ranges. Typical fees: 0.05%, 0.1%, 0.5%
- **CL1** = Concentrated Liquidity 1x: Standard concentrated liquidity pools (1x efficiency). Typical fees: 0.05%, 0.1%
- **vAMM** = virtual Automated Market Maker: Virtual pools that don't hold real assets, typically used for perpetuals/synthetic asset trading. These may not be votable in some cases. Typical fees: 0.7%

If you cannot vote for vAMM pools, use the `--hide-vamm` flag to filter them out.

## Command-Line Options

| Option | Type | Description |
|--------|------|-------------|
| `--version` | flag | Display script version and exit |
| `--hide-vamm` | flag | Filter out vAMM pools from results |
| `--json` | flag | Output results as JSON instead of formatted text |
| `--max-pool-percentage N` | float | Maximum percentage of pool voting power (e.g., 0.5 for 0.5%). Filters out pools where adding your full voting power would exceed this threshold. Requires `--voting-power`. |
| `--min-rewards N` | float | Minimum total rewards in USD to include (filters smaller pools) |
| `--no-cache` | flag | Skip cache and fetch fresh data (will still refresh the cache with new data) |
| `--cache-info` | flag | Show detailed cache information and exit |
| `--clear-cache` | flag | Clear/delete cache files and exit |
| `--no-headless` | flag | Show browser window (for debugging) |
| `-o, --output FILE` | string | Save output to file |
| `--pool-name PATTERN` | string | Filter pools by name using shell-style wildcards (case-insensitive). If no wildcards are provided, automatically wraps pattern with `*` (e.g., `"btc.b"` becomes `"*btc.b*"`). Examples: `"WAVAX/*"`, `"*BLACK*"`, `"CL200-*"`, `"btc.b"`. Uses `*` for any characters and `?` for a single character. |
| `--select-pools` | flag | Generate a JavaScript console script to automatically select recommended pools. Saves script to file and copies to clipboard (if pyperclip installed). |
| `--single-line` | flag | Display each pool on a single line with aligned dollar amounts and share percentages. Requires `--voting-power`. |
| `--top N` | int | Number of top pools to recommend (default: 5) |
| `--voting-power N` | float | Your voting power in veBLACK for reward estimation |

## Notes

- **Version Tracking**: The script includes version information in both text and JSON outputs. Check version with `--version` flag.
- **Dilution**: The script accounts for dilution - pools with more votes give less per vote
- **Rewards per Vote**: This metric shows how diluted rewards are. Higher = less diluted = better per-vote returns
- **Sorting**: When `--voting-power` is provided, pools are sorted by your estimated reward (most relevant), otherwise by profitability score
- **Minimum Rewards Filter**: Use `--min-rewards` to focus on larger pools with more stable rewards. This helps avoid smaller pools that may become less attractive as votes increase.
- **Epoch Timing**: Pool profitability changes up until epoch close as votes shift. Run this script close to epoch close for most accurate recommendations
- **Diversification**: Consider diversifying votes across multiple pools to reduce risk
- **Estimates**: Reward estimates assume you vote ALL your voting power in each pool individually. In reality, votes dilute rewards as more people vote
- **vAMM Pools**: Some users may not be able to vote for vAMM pools. Use `--hide-vamm` to exclude them from results
