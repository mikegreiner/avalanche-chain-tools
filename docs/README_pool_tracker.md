# Pool Tracking Tool

A Python script that tracks changes in recommended pools over time, helping you identify which pools receive the most late-breaking votes and which pools' rewards hold up best (least dilution) until the voting window closes.

## Overview

This script monitors recommended pools over time to help you understand:
1. Which pools receive the most late-breaking votes
2. Which pools' rewards hold up best (least dilution) as voting progresses
3. How profitability scores change over time
4. Which pools become more or less attractive as the voting window closes

## Installation

```bash
pip install -r requirements.txt
```

**Note:** This script depends on `blackhole_pool_recommender.py` and requires ChromeDriver for Selenium:
- Download from: https://chromedriver.chromium.org/
- Or install via package manager: `sudo apt-get install chromium-chromedriver` (Linux)

## Usage

### Initialize Tracking (First Run)

```bash
python3 track_pool_changes.py --init --top 10 --voting-power 15000
```

This saves the current recommended pools as a baseline for comparison. The baseline is stored in `pool_tracking_data.json` (or `{output}_baseline.json` if `--output` is specified).

**Options:**
- `--top N`: Number of top pools to track (default: 10)
- `--voting-power N`: Your voting power in veBLACK (for estimated rewards tracking)
- `--hide-vamm`: Hide vAMM pools from results
- `--min-rewards N`: Minimum total rewards in USD to include
- `--max-pool-percentage N`: Maximum percentage of pool voting power (filters out pools where you'd have too large a share)
- `--no-cache`: Skip cache and fetch fresh data (will still refresh the cache)
- `--cache-info`: Show detailed cache information and exit
- `--clear-cache`: Clear/delete cache files and exit
- `-o, --output NAME`: Output file base name (e.g., `output/pool_tracking`). Files will be saved as `{base}_baseline.json` and `{base}_history.json`

**Example:**
```bash
# Initialize with all filtering options
python3 track_pool_changes.py --init --top 30 --voting-power 18169.28 --min-rewards 5000 --max-pool-percentage 0.5 -o output/pool_tracking_2025-11-05
```

### Save Periodic Snapshots

```bash
python3 track_pool_changes.py --snapshot --top 10 --voting-power 15000
```

This saves a timestamped snapshot of the current pool state to the history file. Use this periodically (e.g., hourly or every 15 minutes) to track changes over time.

**Options:** Same as `--init` (all filtering options apply)

**Example:**
```bash
# Save a snapshot with the same filters used during init
python3 track_pool_changes.py --snapshot --top 30 --voting-power 18169.28 --min-rewards 5000 --max-pool-percentage 0.5 -o output/pool_tracking_2025-11-05
```

**Automated Snapshots (Cron):**
```bash
# Run every 15 minutes
*/15 * * * * cd /path/to/avalanche-chain-tools && /usr/bin/python3 track_pool_changes.py --snapshot --top 30 --voting-power 18169.28 --min-rewards 5000 --max-pool-percentage 0.5 -o output/pool_tracking_2025-11-05 >> output/pool_tracking.log 2>> output/pool_tracking_errors.log
```

### View History and Trends

```bash
python3 track_pool_changes.py --history
```

This displays the history of pool changes and trends across all snapshots.

**Options:**
- `-o, --output NAME`: Specify the output file base name to view history for a specific tracking file

**Example:**
```bash
# View history for a specific tracking file
python3 track_pool_changes.py --history -o output/pool_tracking_2025-11-05
```

**Output Sections:**

1. **POOL ATTRACTIVENESS SUMMARY**: Quick overview showing which pools got more/less attractive, sorted by overall goodness score
   - `??` = Significantly more attractive
   - `?` = More attractive
   - `?` = Neutral/similar
   - `?` = Less attractive
   - `??` = Significantly less attractive

2. **TOP POOLS BY OVERALL PERFORMANCE**: Detailed view sorted by profitability score (highest first), then least dilution
   - Shows changes in: Estimated Reward, Profitability Score, Rewards/Vote, Total Rewards, VAPR, Votes
   - Includes direction indicators (?, ?, ?) for each metric

3. **TOP POOLS BY VOTES ADDED**: Pools sorted by how many votes were added since the first snapshot
   - Shows which pools received the most late-breaking votes
   - Includes all metrics for comparison

## How It Works

### Data Storage

The script stores data in JSON files:
- **Baseline file** (`pool_tracking_data.json` or `{output}_baseline.json`): Stores the initial snapshot
- **History file** (`pool_tracking_history.json` or `{output}_history.json`): Stores all periodic snapshots

Each snapshot includes:
- Timestamp (UTC)
- User voting power (if provided)
- Pool data: name, pool_id, pool_type, total_rewards, current_votes, rewards_per_vote, vapr, profitability_score, estimated_reward (if voting power provided)

### Trend Analysis

The script analyzes trends across all snapshots:
- **Votes Change**: How many votes were added/removed
- **Total Rewards Change**: Absolute and percentage change in total rewards
- **VAPR Change**: Change in voting APR
- **Rewards per Vote Change**: Indicates dilution (lower = more dilution)
- **Estimated Reward Change**: Change in your estimated reward (if voting power provided)
- **Profitability Score Change**: Change in the recommender's profitability score

### Goodness Score Calculation

The "goodness score" combines multiple metrics to rank pools:
- Estimated reward change (most important - direct impact on user)
- Rewards per vote change (indicates dilution)
- APR change (higher is better)
- Total rewards change (higher is better)
- Votes change (lower is better - less dilution)

### Sorting

The "TOP POOLS BY OVERALL PERFORMANCE" section is sorted by:
1. **Primary**: Profitability score (highest first)
2. **Secondary**: Rewards per vote (least dilution as tiebreaker)

This prioritizes the recommender's profitability score while accounting for dilution.

## Best Practices

1. **Initialize Once**: Run `--init` once at the start of a voting period (e.g., when you first decide on your pools)

2. **Regular Snapshots**: Run `--snapshot` periodically (e.g., every 15 minutes or hourly) to track changes over time

3. **Consistent Filters**: Use the same filtering options (`--top`, `--voting-power`, `--min-rewards`, etc.) for both `--init` and `--snapshot` to ensure consistent tracking

4. **Review History**: Use `--history` periodically to see which pools are holding up best and which are getting diluted

5. **Output Organization**: Use `--output` to organize tracking files by date or epoch (e.g., `output/pool_tracking_2025-11-05`)

6. **Retention**: The script retains up to 2000 snapshots (about 3 weeks at 15-minute intervals, or ~83 days at hourly intervals)

## Examples

### Complete Workflow

```bash
# 1. Initialize tracking at the start of voting period
python3 track_pool_changes.py --init --top 30 --voting-power 18169.28 --min-rewards 5000 --max-pool-percentage 0.5 -o output/pool_tracking_2025-11-05

# 2. Set up cron job for periodic snapshots (every 15 minutes)
# Edit crontab: crontab -e
# Add: */15 * * * * cd /path/to/avalanche-chain-tools && /usr/bin/python3 track_pool_changes.py --snapshot --top 30 --voting-power 18169.28 --min-rewards 5000 --max-pool-percentage 0.5 -o output/pool_tracking_2025-11-05 >> output/pool_tracking.log 2>> output/pool_tracking_errors.log

# 3. Check history periodically
python3 track_pool_changes.py --history -o output/pool_tracking_2025-11-05
```

### Filtering Options

```bash
# Track only top 20 pools with minimum $10,000 rewards
python3 track_pool_changes.py --init --top 20 --min-rewards 10000

# Track pools excluding vAMM pools
python3 track_pool_changes.py --init --top 15 --hide-vamm

# Track pools where you won't exceed 0.5% of voting power
python3 track_pool_changes.py --init --top 20 --voting-power 15000 --max-pool-percentage 0.5

# Combine all filters
python3 track_pool_changes.py --init --top 30 --voting-power 18169.28 --hide-vamm --min-rewards 5000 --max-pool-percentage 0.5
```

## Troubleshooting

### No Snapshots Found

If `--history` shows "No snapshots found", make sure:
- You've run `--init` first to create the baseline
- You've run `--snapshot` at least once to create snapshots
- You're using the same `--output` option for all commands

### Missing Profitability Scores

Profitability scores are calculated by the pool recommender. If they're missing in history output, ensure:
- The pool recommender is working correctly
- You're using the same version of `blackhole_pool_recommender.py` for all runs

### Empty Log Files

If cron job logs are empty but snapshots aren't being created:
- Check the error log: `cat output/pool_tracking_errors.log`
- Verify Python path in cron job matches your system
- Ensure all dependencies are installed
- Check that ChromeDriver is accessible

## Check Version

```bash
python3 track_pool_changes.py --version
```

Displays the current version of the script.

## Related Tools

- **Pool Recommender** (`blackhole_pool_recommender.py`): Recommends the most profitable pools for voting
- See [README_pool_recommender.md](README_pool_recommender.md) for more details
