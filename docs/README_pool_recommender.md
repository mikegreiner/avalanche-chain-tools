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
Generated: 2025-01-15 14:30:00

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
Generated: 2025-01-15 14:30:00
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
   Your Estimated Reward: $4,170.52 (18.96% share)
   Profitability Score: 75.04

2. CL200-XAUt0/USDt
   Type: [CL200] 0.5%
   Total Rewards: $5,483.00
   VAPR: 820.80%
   Current Votes: 289,896
   Rewards per Vote: $0.0189
   Your Estimated Reward: $282.77 (5.16% share)
   Profitability Score: 37.69
```

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

## Notes

- **Dilution**: The script accounts for dilution - pools with more votes give less per vote
- **Rewards per Vote**: This metric shows how diluted rewards are. Higher = less diluted = better per-vote returns
- **Sorting**: When `--voting-power` is provided, pools are sorted by your estimated reward (most relevant), otherwise by profitability score
- **Epoch Timing**: Pool profitability changes up until epoch close as votes shift. Run this script close to epoch close for most accurate recommendations
- **Diversification**: Consider diversifying votes across multiple pools to reduce risk
- **Estimates**: Reward estimates assume you vote ALL your voting power in each pool individually. In reality, votes dilute rewards as more people vote
- **vAMM Pools**: Some users may not be able to vote for vAMM pools. Use `--hide-vamm` to exclude them from results
