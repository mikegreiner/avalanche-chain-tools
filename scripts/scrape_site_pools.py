#!/usr/bin/env python3
"""
Scrape pool data from blackhole.xyz/vote for comparison.

This script:
1. Opens the voting page in a headless browser
2. Waits for pool data to load
3. Sorts by Total Rewards
4. Extracts the top N pools
5. Outputs data for comparison

Usage:
    python scripts/scrape_site_pools.py [--top N] [--output FILE]
"""

import argparse
import json
import re
import time
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright


def parse_number(text: str) -> float:
    """Parse number from text like '$64,685' or '79.91M' or '122.7%'"""
    if not text:
        return 0
    
    text = text.strip()
    
    # Remove $ and % symbols
    text = text.replace('$', '').replace('%', '').replace(',', '').strip()
    
    # Handle M/K suffixes
    multiplier = 1
    if text.endswith('M'):
        multiplier = 1_000_000
        text = text[:-1]
    elif text.endswith('K'):
        multiplier = 1_000
        text = text[:-1]
    elif text.endswith('B'):
        multiplier = 1_000_000_000
        text = text[:-1]
    
    try:
        return float(text) * multiplier
    except ValueError:
        return 0


def scrape_pools(top_n: int = 20, headless: bool = True) -> list:
    """Scrape pool data from the site."""
    
    pools = []
    
    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=headless)
        
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
        )
        
        page = context.new_page()
        
        print("Navigating to https://blackhole.xyz/vote ...")
        page.goto('https://blackhole.xyz/vote', wait_until='networkidle', timeout=60000)
        
        # Wait for pool data to load
        print("Waiting for pool data to load...")
        time.sleep(8)  # Give time for RPC calls to complete
        
        # Note: We'll collect all pools and sort them ourselves by total_rewards
        print("Will collect pools from multiple pages and sort by Total Rewards...")
        
        # Increase page size to get more pools at once
        print("Setting page size to 100...")
        try:
            # Click the "Pools/Page" dropdown
            size_selector = page.query_selector('.size-per-page')
            if size_selector:
                size_selector.click()
                time.sleep(1)
                
                # Look for the dropdown options and select 100
                # The dropdown shows options like 10, 25, 50, 100
                option_100 = page.query_selector('text="100"')
                if option_100:
                    option_100.click()
                    time.sleep(5)  # Give more time to load 100 pools
                    print("  Set to 100 pools per page")
                else:
                    # Try 50 as fallback
                    option_50 = page.query_selector('text="50"')
                    if option_50:
                        option_50.click()
                        time.sleep(4)
                        print("  Set to 50 pools per page")
        except Exception as e:
            print(f"  Could not change page size: {e}")
        
        # Wait for data to settle
        time.sleep(3)
        
        # Extract pool data using JavaScript (with pagination)
        print("Extracting pool data...")
        
        try:
            data = page.evaluate('''() => {
                const results = [];
                
                // Find all pool rows
                const poolRows = document.querySelectorAll('.liquidity-pool-cell');
                
                poolRows.forEach((row, idx) => {
                    try {
                        // Pool name
                        const nameEl = row.querySelector('.pool-description .name');
                        const name = nameEl ? nameEl.innerText.trim() : '';
                        
                        // Get all data cells
                        const dataCells = row.querySelectorAll('.liquidity-pool-cell-data');
                        
                        // TVL is first cell
                        const tvlEl = dataCells[0]?.querySelector('.voting-pool-data.total');
                        const tvl = tvlEl ? tvlEl.innerText.trim() : '';
                        
                        // Fees is second cell
                        const feesEl = dataCells[1]?.querySelector('.voting-pool-data.total');
                        const fees = feesEl ? feesEl.innerText.trim() : '';
                        
                        // Incentives - check for "No available" or actual value
                        const incentivesCell = row.querySelector('.liquidity-pool-cell-data.incentives');
                        let incentives = '$0';
                        if (incentivesCell) {
                            const incEl = incentivesCell.querySelector('.voting-pool-data.total');
                            if (incEl) {
                                incentives = incEl.innerText.trim();
                            }
                        }
                        
                        // Total Rewards
                        const totalCell = row.querySelector('.liquidity-pool-cell-data.total-rewards');
                        const totalEl = totalCell?.querySelector('.voting-pool-data.total');
                        const totalRewards = totalEl ? totalEl.innerText.trim() : '';
                        
                        // VAPR
                        const vaprEl = row.querySelector('.voting-pool-cell-vapr-info .first');
                        const vapr = vaprEl ? vaprEl.innerText.trim() : '';
                        
                        // Votes
                        const votesCell = row.querySelector('.liquidity-pool-cell-data.end');
                        const votesEl = votesCell?.querySelector('.voting-pool-data.total');
                        const votes = votesEl ? votesEl.innerText.trim() : '';
                        
                        if (name) {
                            results.push({
                                name,
                                tvl,
                                fees,
                                incentives,
                                total_rewards: totalRewards,
                                vapr,
                                votes
                            });
                        }
                    } catch (e) {
                        console.error('Error parsing row:', e);
                    }
                });
                
                return results;
            }''')
            
            print(f"  Extracted {len(data)} pools")
            
            # Parse the string values to numbers
            for pool in data:
                pool['fees_num'] = parse_number(pool.get('fees', ''))
                pool['incentives_num'] = parse_number(pool.get('incentives', ''))
                pool['total_rewards_num'] = parse_number(pool.get('total_rewards', ''))
                pool['vapr_num'] = parse_number(pool.get('vapr', ''))
                pool['votes_num'] = parse_number(pool.get('votes', ''))
            
            pools.extend(data)
            print(f"    Page 1: {len(data)} pools")
            
            # Try to get additional pages if needed (with 100/page, usually 1-2 is enough)
            pages_to_fetch = 2
            for page_num in range(2, pages_to_fetch + 1):
                try:
                    # Click next page
                    next_btn = page.query_selector(f'.pagination .item:has-text("{page_num}")')
                    if next_btn:
                        next_btn.click()
                        time.sleep(3)
                        
                        # Extract this page's pools
                        page_data = page.evaluate('''() => {
                            const results = [];
                            const poolRows = document.querySelectorAll('.liquidity-pool-cell');
                            
                            poolRows.forEach((row) => {
                                try {
                                    const nameEl = row.querySelector('.pool-description .name');
                                    const name = nameEl ? nameEl.innerText.trim() : '';
                                    const dataCells = row.querySelectorAll('.liquidity-pool-cell-data');
                                    const tvlEl = dataCells[0]?.querySelector('.voting-pool-data.total');
                                    const tvl = tvlEl ? tvlEl.innerText.trim() : '';
                                    const feesEl = dataCells[1]?.querySelector('.voting-pool-data.total');
                                    const fees = feesEl ? feesEl.innerText.trim() : '';
                                    const incentivesCell = row.querySelector('.liquidity-pool-cell-data.incentives');
                                    let incentives = '$0';
                                    if (incentivesCell) {
                                        const incEl = incentivesCell.querySelector('.voting-pool-data.total');
                                        if (incEl) incentives = incEl.innerText.trim();
                                    }
                                    const totalCell = row.querySelector('.liquidity-pool-cell-data.total-rewards');
                                    const totalEl = totalCell?.querySelector('.voting-pool-data.total');
                                    const totalRewards = totalEl ? totalEl.innerText.trim() : '';
                                    const vaprEl = row.querySelector('.voting-pool-cell-vapr-info .first');
                                    const vapr = vaprEl ? vaprEl.innerText.trim() : '';
                                    const votesCell = row.querySelector('.liquidity-pool-cell-data.end');
                                    const votesEl = votesCell?.querySelector('.voting-pool-data.total');
                                    const votes = votesEl ? votesEl.innerText.trim() : '';
                                    
                                    if (name) results.push({name, tvl, fees, incentives, total_rewards: totalRewards, vapr, votes});
                                } catch (e) {}
                            });
                            return results;
                        }''')
                        
                        for pool in page_data:
                            pool['fees_num'] = parse_number(pool.get('fees', ''))
                            pool['incentives_num'] = parse_number(pool.get('incentives', ''))
                            pool['total_rewards_num'] = parse_number(pool.get('total_rewards', ''))
                            pool['vapr_num'] = parse_number(pool.get('vapr', ''))
                            pool['votes_num'] = parse_number(pool.get('votes', ''))
                        
                        pools.extend(page_data)
                        print(f"    Page {page_num}: {len(page_data)} pools")
                except Exception as e:
                    print(f"    Could not fetch page {page_num}: {e}")
                    break
            
            # Sort by total rewards descending and dedupe
            seen = set()
            unique_pools = []
            for p in pools:
                if p['name'] not in seen:
                    seen.add(p['name'])
                    unique_pools.append(p)
            
            unique_pools.sort(key=lambda x: x.get('total_rewards_num', 0), reverse=True)
            pools = unique_pools[:top_n]
            
        except Exception as e:
            print(f"  JS extraction failed: {e}")
            import traceback
            traceback.print_exc()
        
        # Take screenshot for verification
        screenshot_path = '/tmp/blackhole_screenshot.png'
        page.screenshot(path=screenshot_path, full_page=False)
        print(f"  Saved screenshot to {screenshot_path}")
        
        browser.close()
        
    return pools


def main():
    parser = argparse.ArgumentParser(description='Scrape pool data from blackhole.xyz')
    parser.add_argument('--top', type=int, default=20, help='Number of top pools')
    parser.add_argument('--output', type=str, help='Output JSON file')
    parser.add_argument('--visible', action='store_true', help='Show browser window')
    args = parser.parse_args()
    
    print("=" * 80)
    print("SCRAPING BLACKHOLE.XYZ POOL DATA")
    print("=" * 80)
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")
    print()
    
    pools = scrape_pools(top_n=args.top, headless=not args.visible)
    
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(pools, f, indent=2)
        print(f"\nSaved to {args.output}")
    
    if pools:
        print("\n" + "=" * 100)
        print(f"TOP {len(pools)} POOLS FROM SITE (sorted by Total Rewards)")
        print("=" * 100)
        print()
        print(f"{'#':<3} {'Pool Name':<25} {'Votes':<12} {'Fees':<14} {'Incentives':<12} {'Total':<14} {'VAPR':<8}")
        print("-" * 100)
        
        for i, pool in enumerate(pools, 1):
            print(f"{i:<3} {pool.get('name', 'Unknown'):<25} "
                  f"{pool.get('votes', ''):<12} "
                  f"{pool.get('fees', ''):<14} "
                  f"{pool.get('incentives', ''):<12} "
                  f"{pool.get('total_rewards', ''):<14} "
                  f"{pool.get('vapr', ''):<8}")


if __name__ == "__main__":
    main()
