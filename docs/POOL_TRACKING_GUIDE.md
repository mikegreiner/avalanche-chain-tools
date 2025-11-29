# Pool Tracking Guide

Complete guide to tracking pool changes, merging data, and analyzing trends both within and across epochs.

## Table of Contents

1. [Overview](#overview)
2. [Setting Up Automated Tracking](#setting-up-automated-tracking)
3. [Manual Tracking](#manual-tracking)
4. [Merging Tracking Files](#merging-tracking-files)
5. [Analyzing Pool Data](#analyzing-pool-data)
6. [Workflows](#workflows)
7. [Understanding the Data](#understanding-the-data)

---

## Overview

The pool tracking system allows you to:

- **Track pool changes over time** - Monitor how pools change as votes pour in
- **Analyze stability patterns** - Identify which pools remain stable vs volatile
- **Compare across epochs** - See long-term trends and patterns
- **Optimize voting decisions** - Use historical data to predict pool stability

### Key Files

- **`*_baseline.json`** - Initial snapshot (optional, created with `--init`)
- **`*_history.json`** - Time-series snapshots (created with `--snapshot`)
- **`pool_tracking_combined_history.json`** - Merged cross-epoch data (created manually)

---

## Setting Up Automated Tracking

### Crontab Setup

For hourly tracking (recommended), add to your crontab:

```bash
# Edit crontab
crontab -e

# Add this line (runs at :50 past each hour)
50 * * * * cd /home/greiner/Projects/Crypto/avalanche-chain-tools && /usr/bin/python3 track_pool_changes.py --snapshot --top 30 --voting-power 18169.28 --min-rewards 5000 --max-pool-percentage 0.5 -o output/pool_tracking_2025-11-12 --no-cache >> /home/greiner/Projects/Crypto/avalanche-chain-tools/output/pool_tracking.log 2>> /home/greiner/Projects/Crypto/avalanche-chain-tools/output/pool_tracking_errors.log
```

### What Gets Tracked

Each snapshot includes:
- Pool name, ID, type
- Total rewards, current votes, VAPR
- Rewards per vote
- Profitability score
- **Estimated reward** (if voting power provided)
- **Stability score** (new)
- **Stability-adjusted score** (new)
- **Vote density** (votes per dollar of rewards)

### File Naming Strategy

**Option 1: Per-Epoch Files (Recommended)**
```bash
-o output/pool_tracking_2025-11-12
```
Creates:
- `pool_tracking_2025-11-12_baseline.json` (if using `--init`)
- `pool_tracking_2025-11-12_history.json`

**Benefits:**
- Clean separation by epoch
- Easy to archive/delete old epochs
- Simple to analyze specific epochs

**Option 2: Single File**
```bash
-o output/pool_tracking
```
Creates:
- `pool_tracking_baseline.json`
- `pool_tracking_history.json`

**Benefits:**
- All data in one place
- No need to merge files

---

## Manual Tracking

### Initialize Baseline (Optional)

Create a baseline snapshot at the start of an epoch:

```bash
python3 track_pool_changes.py --init \
  --top 30 \
  --voting-power 18169.28 \
  --min-rewards 5000 \
  --max-pool-percentage 0.5 \
  -o output/pool_tracking_2025-11-12
```

### Take a Snapshot

Take a manual snapshot at any time:

```bash
python3 track_pool_changes.py --snapshot \
  --top 30 \
  --voting-power 18169.28 \
  --min-rewards 5000 \
  --max-pool-percentage 0.5 \
  -o output/pool_tracking_2025-11-12
```

### View History

View the history of changes:

```bash
python3 track_pool_changes.py --history \
  -o output/pool_tracking_2025-11-12
```

---

## Merging Tracking Files

### Why Merge?

Merging allows you to:
- Analyze trends across multiple epochs
- Identify long-term patterns
- Compare pool behavior across different epochs
- Build a comprehensive historical dataset

### Basic Merge

Merge specific epoch files:

```bash
python3 merge_pool_tracking_files.py \
  output/pool_tracking_2025-11-05_history.json \
  output/pool_tracking_2025-11-12_history.json \
  -o output/pool_tracking_combined_history.json
```

### Merge All Epoch Files

Merge all history files at once:

```bash
python3 merge_pool_tracking_files.py \
  output/*_history.json \
  -o output/pool_tracking_combined_history.json
```

### Update Combined File

After each epoch, add new data to combined file:

```bash
# Merge new epoch into existing combined file
python3 merge_pool_tracking_files.py \
  output/pool_tracking_2025-11-19_history.json \
  output/pool_tracking_combined_history.json \
  -o output/pool_tracking_combined_history.json
```

**Note:** The merge script automatically:
- Sorts by timestamp
- Removes duplicates (same timestamp + pool count)
- Limits to last 2000 entries (prevents files from growing too large)

### Merge Options

```bash
# Merge without deduplication (if you want to keep all snapshots)
python3 merge_pool_tracking_files.py \
  file1.json file2.json \
  -o combined.json \
  --no-deduplicate
```

---

## Analyzing Pool Data

You have two complementary analysis tools, each serving different purposes:

### Quick Trend View: `track_pool_changes.py --history`

**Best for:** Quick checks, seeing what changed, user-friendly overview

```bash
python3 track_pool_changes.py --history \
  -o output/pool_tracking_2025-11-12
```

**Shows:**
- Pool attractiveness summary (↑↓→ symbols)
- Top pools by overall performance
- Top pools by votes added
- First vs last snapshot comparison
- "Goodness score" (composite metric)

**Use when:**
- You want a quick overview of what changed
- You need user-friendly, easy-to-read output
- You're checking a single epoch's trends
- You want to see which pools got more/less attractive

### Deep Statistical Analysis: `analyze_pool_stability.py`

**Best for:** Research, understanding patterns, validating hypotheses, stability analysis

```bash
python3 analyze_pool_stability.py \
  output/pool_tracking_2025-11-12_history.json
```

**Shows:**
- Hypothesis testing (large rewards + large votes = stable?)
- Statistical stability metrics (coefficient of variation)
- Vote velocity statistics
- Vote density vs stability correlations
- Most stable pools (by RPV stability)
- Best/worst performers with detailed metrics

**Use when:**
- You want statistical analysis and stability metrics
- You're testing hypotheses about pool behavior
- You need cross-epoch trend analysis
- You want to understand long-term patterns
- You're researching which pools maintain stability

### Single Epoch Analysis

**Quick view:**
```bash
python3 track_pool_changes.py --history \
  -o output/pool_tracking_2025-11-12
```

**Deep analysis:**
```bash
python3 analyze_pool_stability.py \
  output/pool_tracking_2025-11-12_history.json
```

### Cross-Epoch Analysis

For cross-epoch analysis, use the statistical analysis tool:

```bash
# First merge the files
python3 merge_pool_tracking_files.py \
  output/*_history.json \
  -o output/pool_tracking_combined_history.json

# Then analyze (statistical analysis works best for cross-epoch)
python3 analyze_pool_stability.py \
  output/pool_tracking_combined_history.json
```

**Benefits of cross-epoch analysis:**
- See which pools maintain stability across epochs
- Identify recurring patterns
- Better long-term trend identification
- More data points = more reliable statistics
- Validate stability hypotheses over longer periods

### JSON Output

Get detailed JSON analysis for programmatic use:

```bash
python3 analyze_pool_stability.py \
  output/pool_tracking_combined_history.json \
  --json \
  -o analysis_output.json
```

### When to Use Which Tool

| Task | Tool | Why |
|------|------|-----|
| Quick check of what changed | `track_pool_changes.py --history` | User-friendly, fast, easy to read |
| See which pools improved | `track_pool_changes.py --history` | Shows attractiveness symbols and goodness scores |
| Understand stability patterns | `analyze_pool_stability.py` | Statistical analysis with CV metrics |
| Test hypotheses | `analyze_pool_stability.py` | Hypothesis testing built-in |
| Cross-epoch trends | `analyze_pool_stability.py` | Better for long-term analysis |
| Vote velocity analysis | `analyze_pool_stability.py` | Calculates votes per hour |
| Quick snapshot comparison | `track_pool_changes.py --history` | First vs last comparison |
| Research & validation | `analyze_pool_stability.py` | Deep statistical insights |

---

## Workflows

### Workflow 1: Per-Epoch Tracking + Cross-Epoch Analysis

**During each epoch:**
1. Crontab automatically tracks hourly to epoch-specific file
2. Files accumulate: `pool_tracking_2025-11-12_history.json`

**After each epoch:**
1. Merge new epoch into combined file:
   ```bash
   python3 merge_pool_tracking_files.py \
     output/pool_tracking_2025-11-12_history.json \
     output/pool_tracking_combined_history.json \
     -o output/pool_tracking_combined_history.json
   ```

2. Analyze cross-epoch trends:
   ```bash
   python3 analyze_pool_stability.py \
     output/pool_tracking_combined_history.json
   ```

**Benefits:**
- Keep epoch-specific files for detailed analysis
- Maintain combined file for long-term trends
- Best of both worlds

### Workflow 2: Single File Tracking

**Setup:**
- Use same output file name in crontab: `-o output/pool_tracking`

**Result:**
- All data in one file automatically
- No merging needed
- Simpler, but harder to isolate specific epochs

### Workflow 3: On-Demand Analysis

**When you need analysis:**
1. Merge files on-the-fly:
   ```bash
   python3 merge_pool_tracking_files.py \
     output/*_history.json \
     -o /tmp/combined.json
   ```

2. Analyze:
   ```bash
   python3 analyze_pool_stability.py /tmp/combined.json
   ```

3. Clean up:
   ```bash
   rm /tmp/combined.json
   ```

---

## Understanding the Data

### Stability Metrics

**Stability Score (0-100):**
- Based on vote density (votes per dollar of rewards)
- Higher = more stable (less likely to change)
- Calculated from current pool state

**Stability-Adjusted Score:**
- Combines estimated reward (70%) + stability (30%)
- Optimized for your personal rewards
- Best for near epoch-close decisions

**Vote Density:**
- Votes per dollar of rewards
- Key predictor of stability
- Higher density = more stable

### Analysis Output

#### `track_pool_changes.py --history` Output

**Pool Attractiveness Summary:**
- Symbols: ↑↑ (much more attractive), ↑ (more attractive), → (neutral), ↓ (less attractive), ↓↓ (much less attractive)
- Based on "goodness score" (composite metric)
- Quick visual overview of which pools improved/declined

**Top Pools by Overall Performance:**
- Sorted by profitability score, then least dilution
- Shows first → last snapshot changes
- Includes estimated reward, profitability score, RPV, total rewards, VAPR, votes

**Top Pools by Votes Added:**
- Shows which pools received the most votes
- Useful for understanding vote momentum

#### `analyze_pool_stability.py` Output

**Hypothesis Test:**
- Tests if "large rewards + large votes = more stable"
- Results show which pools are actually more stable
- Statistical validation of assumptions

**Most Stable Pools:**
- Ranked by rewards-per-vote stability (coefficient of variation)
- Lower CV = more stable
- Statistical measure of consistency

**Best Performers:**
- Pools with highest estimated reward gains
- Shows which pools improved most over time
- Includes percentage changes

**Vote Velocity:**
- Votes per hour
- Shows how fast pools are gaining/losing votes
- High velocity = more volatile
- Statistical analysis of vote momentum

**Vote Density vs Stability:**
- Correlation analysis
- Shows if vote density predicts stability
- Validates stability scoring algorithm

### Key Insights

1. **Vote Density is Key**: Pools with high vote density (many votes per dollar) are more stable
2. **Small Pools Can Be Stable**: Small rewards + small votes pools are often MORE stable than large ones
3. **Massive Gains Possible**: Some pools see 200%+ reward gains, but with volatility
4. **Stability Matters Near Epoch Close**: Use `--sort-by stability` to find pools that will hold up

---

## Tips and Best Practices

### 1. Consistent Parameters

Use the same parameters across epochs for comparable data:
- Same `--voting-power`
- Same `--min-rewards`
- Same `--max-pool-percentage`
- Same `--top` (or at least consistent)

### 2. Regular Merging

Merge epoch files regularly to maintain combined file:
- After each epoch completes
- Or weekly/monthly for long-term analysis

### 3. Archive Old Data

After merging, you can archive epoch-specific files:
```bash
mkdir -p output/archive/2025-11
mv output/pool_tracking_2025-11-* output/archive/2025-11/
```

### 4. Monitor File Sizes

The merge script limits to 2000 entries (~83 days at hourly snapshots). If you need longer history:
- Keep epoch-specific files
- Merge only recent epochs for analysis
- Or adjust the limit in `merge_pool_tracking_files.py`

### 5. Use Stability Sorting

Near epoch close, use stability-adjusted sorting:
```bash
python3 blackhole_pool_recommender.py \
  --voting-power 18169.28 \
  --sort-by stability \
  --top 10
```

This finds pools that:
- Give you high estimated rewards
- Are likely to remain stable as votes pour in

---

## Troubleshooting

### "No history file found"

**Problem:** Analysis script can't find the file

**Solution:** Check file path and ensure file exists:
```bash
ls -la output/pool_tracking_*_history.json
```

### "No pools found in history"

**Problem:** History file exists but has no data

**Solution:** Check if snapshots were actually saved:
```bash
python3 -c "import json; f=open('output/pool_tracking_2025-11-12_history.json'); data=json.load(f); print(f'Snapshots: {len(data)}')"
```

### Merge shows "0 snapshots"

**Problem:** Input files are empty or invalid

**Solution:** Verify files are valid JSON and contain data:
```bash
python3 -c "import json; f=open('output/pool_tracking_2025-11-12_history.json'); data=json.load(f); print(f'Valid: {isinstance(data, list)}, Count: {len(data) if isinstance(data, list) else 0}')"
```

### Missing stability metrics in old data

**Problem:** Older snapshots don't have `stability_score`

**Solution:** This is expected - older data was collected before stability metrics were added. New snapshots will include all metrics.

---

## Quick Reference

### Common Commands

**Tracking:**
```bash
# Take snapshot
python3 track_pool_changes.py --snapshot --top 30 --voting-power 18169.28 -o output/pool_tracking_2025-11-12

# Quick trend view (user-friendly)
python3 track_pool_changes.py --history -o output/pool_tracking_2025-11-12
```

**Merging:**
```bash
# Merge files
python3 merge_pool_tracking_files.py output/*_history.json -o output/combined.json
```

**Analysis:**
```bash
# Quick analysis (single epoch)
python3 track_pool_changes.py --history -o output/pool_tracking_2025-11-12

# Deep statistical analysis (single epoch)
python3 analyze_pool_stability.py output/pool_tracking_2025-11-12_history.json

# Deep statistical analysis (cross-epoch)
python3 analyze_pool_stability.py output/pool_tracking_combined_history.json

# Get JSON output
python3 analyze_pool_stability.py output/combined.json --json -o analysis.json
```

### File Structure

```
output/
├── pool_tracking_2025-11-05_baseline.json    # Epoch 1 baseline (optional)
├── pool_tracking_2025-11-05_history.json     # Epoch 1 snapshots
├── pool_tracking_2025-11-12_baseline.json    # Epoch 2 baseline (optional)
├── pool_tracking_2025-11-12_history.json     # Epoch 2 snapshots
├── pool_tracking_combined_history.json        # Merged cross-epoch data
└── pool_tracking.log                          # Crontab logs
```

---

## Next Steps

1. **Set up automated tracking** - Add to crontab for hourly snapshots
2. **Run initial analysis** - Analyze your existing data
3. **Merge epoch files** - Create combined file for cross-epoch analysis
4. **Use stability sorting** - Try `--sort-by stability` in pool recommender
5. **Refine parameters** - Adjust based on what you learn from the data

For more details on the pool recommender, see [README_pool_recommender.md](README_pool_recommender.md).
