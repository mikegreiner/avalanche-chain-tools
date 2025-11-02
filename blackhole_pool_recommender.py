#!/usr/bin/env python3
"""
Blackhole DEX Pool Recommender

This script scrapes liquidity pool data from https://blackhole.xyz/vote and recommends
the most profitable pools based on total rewards (primary) and VAPR (secondary).

Usage:
    python3 blackhole_pool_recommender.py [--top N]
"""

import requests
import time
import re
import json
import logging
from typing import List, Dict, Optional
from decimal import Decimal, getcontext
from dataclasses import dataclass
from datetime import datetime
import argparse
import sys

# Import logger and config loading from utils if available, otherwise create one
try:
    from avalanche_utils import logger, InvalidInputError, load_config
    _config = load_config()
except ImportError:
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    class InvalidInputError(Exception):
        pass
    _config = {}
    def load_config():
        return {}

# Try to import selenium, fall back to requests + BeautifulSoup if not available
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False
    print("Warning: Selenium not available. Install with: pip install selenium")
    print("This script requires Selenium to render the React app.")

try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False

# Version number (semantic versioning: MAJOR.MINOR.PATCH)
__version__ = "1.1.2"

# Set precision for decimal calculations (from config)
_precision = _config.get('decimal_precision', 50)
getcontext().prec = _precision


@dataclass
class Pool:
    """Represents a liquidity pool with its metrics"""
    name: str
    total_rewards: float  # USD value
    vapr: float  # VAPR percentage
    current_votes: Optional[float] = None
    pool_id: Optional[str] = None
    pool_type: Optional[str] = None  # vAMM, CL200, CL1, etc.
    fee_percentage: Optional[str] = None  # e.g., "0.7%", "0.05%"
    
    def profitability_score(self) -> float:
        """
        Calculate profitability score factoring in dilution.
        Considers:
        - Rewards per vote (accounts for dilution) - PRIMARY
        - Total rewards (absolute size) - SECONDARY  
        - VAPR (return percentage) - TERTIARY
        """
        # Calculate rewards per vote if we have vote data
        rewards_per_vote = None
        if self.current_votes is not None and self.current_votes > 0:
            rewards_per_vote = self.total_rewards / self.current_votes
        
        # Normalize rewards per vote (primary metric, accounts for dilution)
        # Scale: assume max around $0.50 per vote is excellent, using square root for better distribution
        if rewards_per_vote is not None:
            if rewards_per_vote > 0:
                # Normalize: $0.50 per vote = 100 points, using square root for gentler curve
                # This handles wide range: $0.001 to $0.50 per vote
                normalized = min(100, max(0, (rewards_per_vote / 0.5) ** 0.5 * 100))
                rewards_per_vote_normalized = normalized
            else:
                rewards_per_vote_normalized = 0
        else:
            # Fallback: if no vote data, use total rewards (less accurate)
            rewards_per_vote_normalized = min(self.total_rewards / 10000.0, 1.0) * 100
        
        # Normalize total rewards (secondary - absolute size matters too)
        rewards_total_normalized = min(self.total_rewards / 10000.0, 1.0) * 100
        
        # Normalize VAPR (tertiary)
        vapr_normalized = min(self.vapr / 100.0, 10.0) * 10  # Cap at 1000% for normalization
        
        # Weighted combination:
        # - Rewards per vote: 60% (most important - accounts for dilution)
        # - Total rewards: 25% (absolute size still matters)
        # - VAPR: 15% (return percentage)
        score = (rewards_per_vote_normalized * 0.6) + (rewards_total_normalized * 0.25) + (vapr_normalized * 0.15)
        return score
    
    def estimate_user_rewards(self, user_voting_power: float) -> float:
        """
        Estimate USD rewards for the user if they vote with their voting power.
        
        Formula:
        - New total votes = current_votes + user_voting_power
        - User's share = user_voting_power / new_total_votes
        - Estimated reward = user_share * total_rewards
        """
        if self.current_votes is None or self.current_votes == 0:
            # If no current votes, user would get 100% (unrealistic but for estimation)
            return self.total_rewards
        
        new_total_votes = self.current_votes + user_voting_power
        user_share = user_voting_power / new_total_votes
        estimated_reward = user_share * self.total_rewards
        
        return estimated_reward


class BlackholePoolRecommender:
    def __init__(self, headless: Optional[bool] = None):
        self.url = "https://blackhole.xyz/vote"
        # Use config value if headless not explicitly provided
        _pool_config = _config.get('pool_recommender', {})
        _selenium_config = _pool_config.get('selenium', {})
        if headless is None:
            self.headless = _selenium_config.get('headless', True)
        else:
            self.headless = headless
        self.implicit_wait = _selenium_config.get('implicit_wait', 10)
        self.pools: List[Pool] = []
        
    def fetch_pools_selenium(self, quiet: bool = False) -> List[Pool]:
        """Fetch pool data using Selenium (most reliable for React apps)"""
        if not SELENIUM_AVAILABLE:
            raise ImportError("Selenium is required. Install with: pip install selenium")
        
        options = Options()
        if self.headless:
            options.add_argument('--headless=new')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--window-size=1920,1080')
        options.add_argument('user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        
        driver = None
        try:
            driver = webdriver.Chrome(options=options)
            driver.implicitly_wait(self.implicit_wait)
            if not quiet:
                print(f"Loading {self.url}...")
            driver.get(self.url)
            
            if not quiet:
                print("Waiting for pool data to load (this may take 15-20 seconds)...")
            time.sleep(12)  # Give React time to render and fetch data
            
            # Set pagination to show 100 pools per page
            if not quiet:
                print("Setting pagination to 100 pools per page...")
            try:
                # Find the pagination container (custom dropdown)
                pagination_container = driver.find_element(By.XPATH, "//div[contains(@class, 'size-per-page')]")
                
                # Click on the container to open dropdown
                driver.execute_script("arguments[0].click();", pagination_container)
                time.sleep(1.5)  # Wait for dropdown to open
                
                # Look for option with text "100" - it's in a span with class "size-text"
                try:
                    option_100 = driver.find_element(By.XPATH, "//span[contains(@class, 'size-text') and contains(text(), '100')]")
                    # Click on the parent container (size-container) that contains this span
                    parent_container = option_100.find_element(By.XPATH, "./ancestor::*[contains(@class, 'size-container')][1]")
                    driver.execute_script("arguments[0].click();", parent_container)
                    if not quiet:
                        print("Set pagination to 100 pools per page")
                    time.sleep(4)  # Wait for pools to reload
                except Exception as e:
                    if not quiet:
                        print(f"Could not find/click option 100: {e}, will try to load all pools via scrolling")
                    
            except Exception as e:
                if not quiet:
                    logger.warning(f"Error setting pagination: {e}, will try scrolling instead")
            
            # Click TOTAL REWARDS column header to sort by it (descending)
            if not quiet:
                print("Sorting by TOTAL REWARDS...")
            try:
                # Find and click the TOTAL REWARDS column header
                total_rewards_header = driver.find_element(By.XPATH, "//div[contains(@class, 'total-rewards')] | //div[contains(@class, 'liquidity-pool-column-tab') and contains(text(), 'TOTAL REWARDS')]")
                driver.execute_script("arguments[0].click();", total_rewards_header)
                time.sleep(3)  # Wait for sort to complete
                if not quiet:
                    print("Sorted by TOTAL REWARDS")
            except Exception as e:
                if not quiet:
                    print(f"Could not click TOTAL REWARDS header (may already be sorted): {e}")
            
            # Scroll to load all pools (lazy loading)
            if not quiet:
                print("Scrolling to load all pools...")
            pool_container = None
            try:
                # Find the pools container - try multiple selectors
                pool_container = driver.find_element(By.XPATH, "//div[contains(@class, 'pools-container')] | //div[contains(@class, 'pool-section')]")
            except:
                pass
            
            # Count initial pools
            initial_pools = len(driver.find_elements(By.XPATH, "//div[contains(@class, 'liquidity-pool-cell') and (contains(@class, 'even') or contains(@class, 'odd'))]"))
            if not quiet:
                print(f"Initial pools found: {initial_pools}")
            
            # Scroll multiple times to trigger lazy loading
            scroll_attempts = 0
            max_pools = initial_pools
            stable_count = 0
            
            while scroll_attempts < 20:  # More attempts
                if pool_container:
                    # Scroll within container
                    driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", pool_container)
                else:
                    # Scroll entire page
                    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                
                time.sleep(2)
                
                # Check how many pools we have now
                current_pools = driver.find_elements(By.XPATH, "//div[contains(@class, 'liquidity-pool-cell') and (contains(@class, 'even') or contains(@class, 'odd'))]")
                current_count = len(current_pools)
                
                if current_count > max_pools:
                    max_pools = current_count
                    stable_count = 0
                    if not quiet:
                        print(f"Found {current_count} pools...")
                else:
                    stable_count += 1
                    if stable_count >= 3:  # No new pools for 3 attempts
                        break
                
                scroll_attempts += 1
            
            if not quiet:
                print(f"Total pools loaded: {max_pools}")
            
            # Scroll back to top
            if pool_container:
                driver.execute_script("arguments[0].scrollTop = 0", pool_container)
            else:
                driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(2)
            
            pools = []
            
            # Method 1: Try to extract from DOM elements using Selenium
            try:
                # The actual pool containers are divs with class 'liquidity-pool-cell'
                pool_elements = driver.find_elements(By.XPATH, "//div[contains(@class, 'liquidity-pool-cell') and (contains(@class, 'even') or contains(@class, 'odd'))]")
                
                if pool_elements:
                    if not quiet:
                        print(f"Found {len(pool_elements)} pool elements")
                    pools = self._extract_pools_from_elements(pool_elements, driver)
                else:
                    # Fallback: try without even/odd filter
                    pool_elements = driver.find_elements(By.XPATH, "//div[contains(@class, 'liquidity-pool-cell')]")
                    # Filter to main containers (not nested cells)
                    main_pools = []
                    for elem in pool_elements:
                        classes = elem.get_attribute('class') or ''
                        if 'even' in classes or 'odd' in classes:
                            main_pools.append(elem)
                    if main_pools:
                        if not quiet:
                            print(f"Found {len(main_pools)} pool elements")
                        pools = self._extract_pools_from_elements(main_pools, driver)
                
            except Exception as e:
                logger.error(f"Error extracting from DOM elements: {e}")
            
            # Method 2: Try to extract from page text using regex patterns
            if not pools:
                print("Trying text-based extraction...")
                try:
                    page_text = driver.find_element(By.TAG_NAME, "body").text
                    pools = self._extract_pools_from_text(page_text)
                except Exception as e:
                    print(f"Error extracting from text: {e}")
            
            # Method 3: Try to extract from page source HTML
            if not pools:
                print("Trying HTML parsing...")
                try:
                    page_source = driver.page_source
                    if BS4_AVAILABLE:
                        soup = BeautifulSoup(page_source, 'html.parser')
                        pools = self._parse_pools_from_html(soup)
                    else:
                        pools = self._extract_pools_from_text(page_source)
                except Exception as e:
                    print(f"Error parsing HTML: {e}")
            
            # Method 4: Try to intercept network requests for API data
            if not pools:
                print("Attempting to extract from network responses...")
                try:
                    pools = self._extract_from_network_logs(driver)
                except Exception as e:
                    logger.error(f"Error extracting from network: {e}")
            
            return pools
            
        except Exception as e:
            print(f"Error fetching pools with Selenium: {e}")
            import traceback
            traceback.print_exc()
            raise
        finally:
            if driver:
                driver.quit()
    
    def _extract_pools_from_elements(self, elements, driver) -> List[Pool]:
        """
        Extract pool data from Selenium WebElements
        
        NOTE: Votability filtering approach (for future implementation):
        Non-votable pools have a 'data-tooltip-id="no-locks-available"' attribute in the button container.
        To filter them out:
        1. Find button container: element.find_element(By.XPATH, ".//div[contains(@class, 'liquidity-pool-cell-btn')]")
        2. Check for tooltip: button_container.find_element(By.XPATH, ".//*[@data-tooltip-id='no-locks-available']")
        3. If tooltip exists, skip the pool (not votable)
        
        This filtering should be done AFTER extraction is complete to avoid breaking the extraction logic.
        """
        pools = []
        extraction_errors = []
        
        for element in elements:
            try:
                text = element.text.strip()
                
                # Skip if element doesn't have meaningful content
                if not text or len(text) < 10:
                    continue
                
                # Extract pool name and metadata from left section
                name = "Unknown"
                pool_type = None
                fee_percentage = None
                pool_id = None  # Pool contract address or identifier
                
                try:
                    # Pool name is in a div with class "name" inside the left section
                    name_element = element.find_element(By.XPATH, ".//div[contains(@class, 'name')]")
                    name_text = name_element.text.strip()
                    
                    # Use the full name text, don't truncate it
                    if name_text:
                        name = name_text
                        # Determine pool type from name
                        if name.startswith('vAMM'):
                            pool_type = 'vAMM'
                        elif name.startswith('CL200'):
                            pool_type = 'CL200'
                        elif name.startswith('CL1'):
                            pool_type = 'CL1'
                    
                    # Try to extract pool ID/address from data attributes
                    try:
                        # Check for data attributes that might contain pool address
                        pool_id = (
                            element.get_attribute('data-pool-id') or
                            element.get_attribute('data-pool-address') or
                            element.get_attribute('data-address') or
                            element.get_attribute('data-id')
                        )
                        # Also check child elements
                        if not pool_id:
                            try:
                                id_element = element.find_element(By.XPATH, ".//*[@data-pool-id or @data-pool-address or @data-address]")
                                pool_id = (
                                    id_element.get_attribute('data-pool-id') or
                                    id_element.get_attribute('data-pool-address') or
                                    id_element.get_attribute('data-address')
                                )
                            except:
                                pass
                    except:
                        pass
                    
                    # Extract fee percentage
                    try:
                        gas_info = element.find_element(By.XPATH, ".//div[contains(@class, 'gas-info')]//div[contains(@class, 'text')]")
                        fee_percentage = gas_info.text.strip()
                    except:
                        pass
                except:
                    # Fallback: try to find name in left section
                    try:
                        left_section = element.find_element(By.XPATH, ".//div[contains(@class, 'liquidity-pool-cell-left')] | .//div[contains(@class, 'liquidity-pool-cell-description')]")
                        name_text = left_section.text.strip()
                        
                        # Look for the first line which usually contains the pool name
                        lines = [line.strip() for line in name_text.split('\n') if line.strip()]
                        if lines:
                            # First line is usually the pool name
                            first_line = lines[0]
                            # Extract name - look for pattern like "CL200-WAVAX/USDC" or "CL200-WETH.e/USDt"
                            name_patterns = [
                                r'([A-Z0-9\-]+-[A-Z0-9\.]+/[A-Z0-9\.]+)',  # CL200-WAVAX/USDC or CL200-WETH.e/USDt
                                r'([A-Z0-9\.]+/[A-Z0-9\.]+)',  # WAVAX/USDC
                                r'([A-Z0-9\-]+)',  # CL200
                            ]
                            
                            for pattern in name_patterns:
                                name_match = re.search(pattern, first_line)
                                if name_match:
                                    name = name_match.group(1)
                                    break
                            
                            # If pattern matching didn't work, use the first line as-is (up to reasonable length)
                            if name == "Unknown" and len(first_line) < 50:
                                name = first_line
                    except:
                        # Final fallback: extract from full text
                        name_match = re.search(r'([A-Z0-9\-]+-[A-Z0-9\.]+/[A-Z0-9\.]+)|([A-Z0-9\.]+/[A-Z0-9\.]+)', text)
                        if name_match:
                            name = name_match.group(1) or name_match.group(2)
                
                # Extract total rewards - it's in slots 6 or 7 (shows "Fees + Incentives")
                # Columns order: 0-1=TVL, 2-3=FEES, 4=INCENTIVES, 5-6=TOTAL REWARDS, 7-8=VOTES/vAPR
                total_rewards = 0.0
                try:
                    right_section = element.find_element(By.XPATH, ".//div[contains(@class, 'liquidity-pool-cell-right')]")
                    slots = right_section.find_elements(By.XPATH, ".//div[contains(@class, 'voting-pool-cell-slot')]")
                    
                    # Look for TOTAL REWARDS - it's in slot 6 or 7, contains "Fees + Incentives"
                    if len(slots) >= 7:
                        # Try slot 6 first (most common)
                        rewards_text = slots[6].text
                        if 'Fees + Incentives' in rewards_text or 'fee' in rewards_text.lower():
                            rewards_match = re.search(r'\$[\d,]+\.?\d*', rewards_text)
                            if rewards_match:
                                total_rewards = float(rewards_match.group(0).replace('$', '').replace(',', '').replace('~', ''))
                        
                        # If not found, try slot 7
                        if total_rewards == 0.0 and len(slots) >= 8:
                            rewards_text = slots[7].text
                            if 'Fees + Incentives' in rewards_text or 'fee' in rewards_text.lower():
                                rewards_match = re.search(r'\$[\d,]+\.?\d*', rewards_text)
                                if rewards_match:
                                    total_rewards = float(rewards_match.group(0).replace('$', '').replace(',', '').replace('~', ''))
                    
                    # Fallback: search all slots for "Fees + Incentives"
                    if total_rewards == 0.0:
                        for slot in slots:
                            slot_text = slot.text
                            if 'Fees + Incentives' in slot_text or ('fee' in slot_text.lower() and 'incentive' in slot_text.lower()):
                                rewards_match = re.search(r'\$[\d,]+\.?\d*', slot_text)
                                if rewards_match:
                                    total_rewards = float(rewards_match.group(0).replace('$', '').replace(',', '').replace('~', ''))
                                    break
                except Exception as e:
                    pass
                
                # Fallback: if not found in column, search full text
                if total_rewards == 0.0:
                    # Find all $ amounts
                    rewards_matches = re.findall(r'\$[\d,]+\.?\d*', text)
                    if rewards_matches:
                        reward_values = []
                        for match in rewards_matches:
                            try:
                                val = float(match.replace('$', '').replace(',', '').replace('~', ''))
                                reward_values.append(val)
                            except:
                                pass
                        if reward_values:
                            # Total rewards is typically the 2nd or 3rd largest (after TVL)
                            reward_values.sort(reverse=True)
                            # Skip TVL (usually largest), take next largest
                            if len(reward_values) > 1:
                                total_rewards = reward_values[1]  # Second largest
                            else:
                                total_rewards = reward_values[0]
                
                # Extract VAPR - it's the 5th column (index 4)
                vapr = 0.0
                try:
                    right_section = element.find_element(By.XPATH, ".//div[contains(@class, 'liquidity-pool-cell-right')]")
                    slots = right_section.find_elements(By.XPATH, ".//div[contains(@class, 'voting-pool-cell-slot')]")
                    
                    # VAPR is usually 5th column (index 4) or look for "vapr" class
                    if len(slots) >= 5:
                        vapr_text = slots[4].text
                        vapr_match = re.search(r'(\d+\.?\d*)\s*%', vapr_text)
                        if vapr_match:
                            vapr = float(vapr_match.group(1))
                except:
                    pass
                
                # Fallback: search text for percentages
                if vapr == 0.0:
                    percentages = re.findall(r'(\d+\.?\d*)\s*%', text)
                    if percentages:
                        vapr_values = [float(p) for p in percentages]
                        # VAPR is usually > 50%
                        large_percentages = [v for v in vapr_values if v > 50]
                        if large_percentages:
                            vapr = max(large_percentages)
                        elif vapr_values:
                            vapr = max(vapr_values)
                
                # Extract votes - it's in the last column (VOTES)
                # Columns order: 0-1=TVL, 2-3=FEES, 4=INCENTIVES, 5-6=TOTAL REWARDS, 7-8=VOTES/vAPR
                # Votes can be: "6,967" (no M) or "31.29M" (with M for millions)
                # Votes are typically in slot 7 or 8, often with VAPR percentage on the same line
                votes = None
                try:
                    right_section = element.find_element(By.XPATH, ".//div[contains(@class, 'liquidity-pool-cell-right')]")
                    slots = right_section.find_elements(By.XPATH, ".//div[contains(@class, 'voting-pool-cell-slot')]")
                    
                    # Check slots 7 and 8 (last two slots) for votes
                    # Votes are usually the first number in these slots
                    for slot_idx in [7, 8]:
                        if slot_idx < len(slots):
                            votes_text = slots[slot_idx].text.strip()
                            
                            # Split by newlines - votes are usually on the first line
                            lines = votes_text.split('\n')
                            if lines:
                                first_line = lines[0].strip()
                                
                                # First check for M suffix (millions)
                                votes_match = re.search(r'([\d,]+\.?\d*)\s*[Mm]', first_line)
                                if votes_match:
                                    votes_str = votes_match.group(1).replace(',', '')
                                    votes = float(votes_str) * 1_000_000
                                    break
                                
                                # Then check for numbers without M (like "544,767" or "6,967")
                                # Extract the first number from the line
                                numbers = re.findall(r'\b([\d,]+)\b', first_line)
                                if numbers:
                                    # Take the first number that looks like votes
                                    for num_str in numbers:
                                        num_val = float(num_str.replace(',', ''))
                                        # Votes without M are typically >= 1000
                                        if num_val >= 1000:
                                            votes = num_val
                                            break
                                    if votes is not None:
                                        break
                    
                    # If still not found, check all slots in reverse
                    if votes is None:
                        for slot_idx in range(len(slots) - 1, max(6, len(slots) - 4), -1):
                            votes_text = slots[slot_idx].text.strip()
                            lines = votes_text.split('\n')
                            if lines:
                                first_line = lines[0].strip()
                                votes_match = re.search(r'([\d,]+\.?\d*)\s*[Mm]', first_line)
                                if votes_match:
                                    votes_str = votes_match.group(1).replace(',', '')
                                    votes = float(votes_str) * 1_000_000
                                    break
                                numbers = re.findall(r'\b([\d,]+)\b', first_line)
                                if numbers:
                                    for num_str in numbers:
                                        num_val = float(num_str.replace(',', ''))
                                        if num_val >= 1000:
                                            votes = num_val
                                            break
                                    if votes is not None:
                                        break
                
                except:
                    pass
                
                # Fallback: search full text for votes pattern (only if not found in slots)
                if votes is None:
                    # First try pattern with M suffix (millions)
                    votes_match = re.search(r'([\d,]+\.?\d*)\s*[Mm]\b', text)
                    if votes_match:
                        votes_str = votes_match.group(1).replace(',', '')
                        votes = float(votes_str) * 1_000_000
                    else:
                        # Look for standalone numbers that could be votes
                        # Extract numbers and find the largest one that's likely votes
                        numbers = re.findall(r'\b([\d,]+)\b', text)
                        vote_candidates = []
                        for num_str in numbers:
                            num_val = float(num_str.replace(',', ''))
                            # Votes are typically between 1,000 and 999,999 (without M)
                            if 1000 <= num_val < 1000000:
                                # Check context to avoid percentages and dollar amounts
                                num_pos = text.find(num_str)
                                if num_pos >= 0:
                                    context = text[max(0, num_pos - 10):min(len(text), num_pos + len(num_str) + 10)]
                                    if '$' not in context and '%' not in context:
                                        vote_candidates.append(num_val)
                        
                        # If multiple candidates, take the largest (most likely to be votes)
                        if vote_candidates:
                            votes = max(vote_candidates)
                
                # Only add pool if it has meaningful data
                if total_rewards > 0 or vapr > 0:
                    pools.append(Pool(
                        name=name if name != "Unknown" else f"Pool_{len(pools)+1}",
                        total_rewards=total_rewards,
                        vapr=vapr,
                        current_votes=votes,
                        pool_id=pool_id,  # May be None if not found
                        pool_type=pool_type,
                        fee_percentage=fee_percentage
                    ))
            except Exception as e:
                extraction_errors.append(str(e))
                continue
        
        # Note: extraction success/failure messages handled by caller (quiet flag)
        
        return pools
    
    def _extract_from_network_logs(self, driver) -> List[Pool]:
        """Try to extract pool data from network request logs"""
        pools = []
        
        # This would require Chrome DevTools Protocol
        # For now, return empty list
        return pools
    
    def _parse_pools_from_html(self, soup) -> List[Pool]:
        """Parse pool data from BeautifulSoup HTML"""
        pools = []
        
        # Try multiple extraction strategies
        
        # Strategy 1: Look for table rows
        table_rows = soup.find_all('tr')
        for row in table_rows:
            text = row.get_text()
            # Check if this row looks like it contains pool data
            if '$' in text and ('%' in text or 'vapr' in text.lower() or 'reward' in text.lower()):
                try:
                    # Extract pool name
                    name = "Unknown"
                    name_cells = row.find_all(['td', 'th', 'div', 'span'])
                    if name_cells:
                        # Usually name is in first cell
                        name_text = name_cells[0].get_text(strip=True)
                        name_match = re.search(r'([A-Z0-9\.]+/[A-Z0-9\.]+|[A-Z]{2,})', name_text)
                        if name_match:
                            name = name_match.group(1)
                    
                    # Extract rewards
                    rewards_match = re.search(r'\$[\d,]+\.?\d*', text)
                    total_rewards = float(rewards_match.group(0).replace('$', '').replace(',', '')) if rewards_match else 0.0
                    
                    # Extract VAPR
                    vapr_match = re.search(r'(\d+\.?\d*)\s*%', text)
                    vapr = float(vapr_match.group(1)) if vapr_match else 0.0
                    
                    if name != "Unknown" or total_rewards > 0:
                        pools.append(Pool(
                            name=name,
                            total_rewards=total_rewards,
                            vapr=vapr
                        ))
                except:
                    continue
        
        # Strategy 2: Look for divs with pool-like classes
        if not pools:
            pool_divs = soup.find_all(['div', 'section'], class_=re.compile(r'pool|row|card|item', re.I))
            for div in pool_divs:
                text = div.get_text()
                if '$' in text:
                    try:
                        name = "Unknown"
                        name_elem = div.find(class_=re.compile(r'name|token|pair', re.I))
                        if name_elem:
                            name_text = name_elem.get_text(strip=True)
                            name_match = re.search(r'([A-Z0-9\.]+/[A-Z0-9\.]+)', name_text)
                            if name_match:
                                name = name_match.group(1)
                        
                        rewards_match = re.search(r'\$[\d,]+\.?\d*', text)
                        total_rewards = float(rewards_match.group(0).replace('$', '').replace(',', '')) if rewards_match else 0.0
                        
                        vapr_match = re.search(r'(\d+\.?\d*)\s*%', text)
                        vapr = float(vapr_match.group(1)) if vapr_match else 0.0
                        
                        if total_rewards > 0:
                            pools.append(Pool(
                                name=name,
                                total_rewards=total_rewards,
                                vapr=vapr
                            ))
                    except:
                        continue
        
        return pools
    
    def _extract_pools_from_text(self, text: str) -> List[Pool]:
        """Fallback: extract pool data from page text using regex"""
        pools = []
        
        # Look for JSON data embedded in the page
        json_patterns = [
            r'\{.*?"pools".*?\}',
            r'\"pools\"\s*:\s*\[.*?\]',
            r'window\.__INITIAL_STATE__\s*=\s*(\{.*?\});',
            r'window\.__APOLLO_STATE__\s*=\s*(\{.*?\});',
        ]
        
        for pattern in json_patterns:
            matches = re.findall(pattern, text, re.DOTALL)
            for match in matches:
                try:
                    import json
                    if isinstance(match, tuple):
                        match = match[0]
                    data = json.loads(match)
                    # Try to find pools in the JSON structure
                    if isinstance(data, dict):
                        pools_data = data.get('pools', data.get('data', {}).get('pools', []))
                        if pools_data:
                            for pool_data in pools_data:
                                if isinstance(pool_data, dict):
                                    pool = Pool(
                                        name=pool_data.get('name', pool_data.get('pair', 'Unknown')),
                                        total_rewards=float(pool_data.get('totalRewards', pool_data.get('total_rewards', 0))),
                                        vapr=float(pool_data.get('vapr', pool_data.get('VAPR', 0))),
                                        current_votes=float(pool_data.get('votes', 0)) if pool_data.get('votes') else None
                                    )
                                    pools.append(pool)
                    return pools
                except:
                    continue
        
        # If no JSON found, try to extract from structured text patterns
        # Look for lines that contain both $ and % (likely pool data)
        lines = text.split('\n')
        current_pool = None
        
        for line in lines:
            # Look for pool name patterns
            name_match = re.search(r'([A-Z0-9\.]+/[A-Z0-9\.]+)', line)
            if name_match:
                if current_pool:
                    pools.append(current_pool)
                current_pool = Pool(
                    name=name_match.group(1),
                    total_rewards=0.0,
                    vapr=0.0
                )
            
            if current_pool:
                # Extract rewards
                rewards_match = re.search(r'\$[\d,]+\.?\d*', line)
                if rewards_match:
                    current_pool.total_rewards = float(rewards_match.group(0).replace('$', '').replace(',', ''))
                
                # Extract VAPR
                vapr_match = re.search(r'(\d+\.?\d*)\s*%', line)
                if vapr_match:
                    current_pool.vapr = float(vapr_match.group(1))
        
        if current_pool:
            pools.append(current_pool)
        
        return pools
    
    def fetch_pools_api(self) -> List[Pool]:
        """Try to fetch pools from a direct API endpoint"""
        # Common API endpoints to try
        api_endpoints = [
            "https://api.blackhole.xyz/vote",
            "https://blackhole.xyz/api/vote",
            "https://api.blackhole.xyz/pools",
            "https://blackhole.xyz/api/pools",
        ]
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
            'Accept': 'application/json'
        }
        
        for endpoint in api_endpoints:
            try:
                response = requests.get(endpoint, headers=headers, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    return self._parse_api_response(data)
            except Exception as e:
                continue
        
        return []
    
    def _parse_api_response(self, data: dict) -> List[Pool]:
        """Parse pool data from API response"""
        pools = []
        
        # This depends on the actual API structure
        # Common patterns:
        # - data['pools'] or data['data']['pools']
        # - Each pool has: name, totalRewards, vapr, etc.
        
        pools_data = data.get('pools', data.get('data', {}).get('pools', []))
        
        for pool_data in pools_data:
            try:
                pool = Pool(
                    name=pool_data.get('name', pool_data.get('pair', 'Unknown')),
                    total_rewards=float(pool_data.get('totalRewards', pool_data.get('total_rewards', 0))),
                    vapr=float(pool_data.get('vapr', pool_data.get('VAPR', 0))),
                    current_votes=float(pool_data.get('votes', pool_data.get('currentVotes', 0))) if pool_data.get('votes') else None,
                    pool_id=pool_data.get('id', pool_data.get('poolId'))
                )
                pools.append(pool)
            except Exception as e:
                print(f"Error parsing pool: {e}")
                continue
        
        return pools
    
    def fetch_pools(self, quiet: bool = False) -> List[Pool]:
        """Main method to fetch pools - tries API first, then Selenium"""
        # Try API first (faster)
        if not quiet:
            print("Attempting to fetch pool data from API...")
        pools = self.fetch_pools_api()
        
        if pools:
            if not quiet:
                print(f"Found {len(pools)} pools via API")
            return pools
        
        # Fall back to Selenium scraping
        if SELENIUM_AVAILABLE:
            if not quiet:
                print("API not available, using Selenium to scrape page...")
            return self.fetch_pools_selenium(quiet=quiet)
        else:
            raise InvalidInputError("Selenium not available and API endpoint not found. Please install selenium: pip install selenium")
    
    def recommend_pools(self, top_n: int = 5, user_voting_power: Optional[float] = None, hide_vamm: bool = False, min_rewards: Optional[float] = None, quiet: bool = False) -> List[Pool]:
        """
        Fetch pools and recommend top N most profitable.
        
        When user_voting_power is provided, sorts by estimated reward (most relevant).
        Otherwise, sorts by profitability score (general recommendation).
        
        Args:
            top_n: Number of top pools to return
            user_voting_power: User's voting power in veBLACK for reward estimation
            hide_vamm: If True, filter out vAMM pools
            min_rewards: Minimum total rewards in USD to include (filters out smaller pools)
            quiet: If True, suppress progress messages (useful for JSON output)
        """
        if not quiet:
            print("Fetching pool data...")
        pools = self.fetch_pools(quiet=quiet)
        
        if not pools:
            if not quiet:
                print("No pools found!")
            return []
        
        if not quiet:
            print(f"Found {len(pools)} pools")
        
        # Filter out vAMM pools if requested
        if hide_vamm:
            original_count = len(pools)
            pools = [p for p in pools if p.pool_type != 'vAMM']
            filtered_count = original_count - len(pools)
            if filtered_count > 0 and not quiet:
                print(f"Filtered out {filtered_count} vAMM pool(s)")
        
        # Filter out pools below minimum rewards threshold
        if min_rewards is not None:
            original_count = len(pools)
            pools = [p for p in pools if p.total_rewards >= min_rewards]
            filtered_count = original_count - len(pools)
            if filtered_count > 0 and not quiet:
                print(f"Filtered out {filtered_count} pool(s) with total rewards < ${min_rewards:,.2f}")
        
        # Calculate profitability scores (for display purposes)
        for pool in pools:
            pool_score = pool.profitability_score()
        
        # Sort by estimated reward if voting power provided, otherwise by profitability score
        if user_voting_power is not None:
            sorted_pools = sorted(
                pools, 
                key=lambda p: p.estimate_user_rewards(user_voting_power), 
                reverse=True
            )
        else:
            sorted_pools = sorted(
                pools, 
                key=lambda p: p.profitability_score(), 
                reverse=True
            )
        
        return sorted_pools[:top_n]
    
    def print_recommendations(self, pools: List[Pool], user_voting_power: Optional[float] = None, hide_vamm: bool = False, min_rewards: Optional[float] = None, output_json: bool = False, return_output: bool = False):
        """Print formatted recommendations"""
        if not pools:
            if return_output:
                return "No pools to recommend."
            print("No pools to recommend.")
            return None
        
        if output_json:
            output = self._get_json_output(pools, user_voting_power, hide_vamm, min_rewards)
            if return_output:
                return output
            print(output)
            return None
        
        output_lines = []
        output_lines.append("\n" + "="*80)
        output_lines.append("BLACKHOLE DEX POOL RECOMMENDATIONS")
        output_lines.append("="*80)
        output_lines.append(f"Version: {__version__}")
        output_lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        if user_voting_power:
            output_lines.append(f"Estimated rewards based on voting power: {user_voting_power:,.0f} veBLACK")
            output_lines.append("Note: Estimates assume you vote ALL your voting power in each pool individually")
            output_lines.append("      In reality, votes dilute rewards as more people vote")
            output_lines.append(f"\nTop {len(pools)} Pools (sorted by estimated reward):\n")
        else:
            output_lines.append(f"\nTop {len(pools)} Most Profitable Pools:\n")
        
        for i, pool in enumerate(pools, 1):
            score = pool.profitability_score()
            output_lines.append(f"{i}. {pool.name}")
            if pool.pool_type:
                # Convert pool type to human-readable format
                type_name_map = {
                    'CL200': 'Concentrated Liquidity, 200x',
                    'CL1': 'Concentrated Liquidity, 1x',
                    'vAMM': 'Virtual AMM'
                }
                human_readable_type = type_name_map.get(pool.pool_type, pool.pool_type)
                type_info = f" {human_readable_type} ({pool.pool_type})"
                if pool.fee_percentage:
                    type_info += f" {pool.fee_percentage}"
                output_lines.append(f"   Type:{type_info}")
            output_lines.append(f"   Total Rewards: ${pool.total_rewards:,.2f}")
            output_lines.append(f"   VAPR: {pool.vapr:.2f}%")
            if pool.current_votes is not None:
                output_lines.append(f"   Current Votes: {pool.current_votes:,.0f}")
                # Calculate and display rewards per vote
                rewards_per_vote = pool.total_rewards / pool.current_votes
                output_lines.append(f"   Rewards per Vote: ${rewards_per_vote:.4f}")
            if user_voting_power:
                estimated_reward = pool.estimate_user_rewards(user_voting_power)
                new_total_votes = (pool.current_votes or 0) + user_voting_power
                user_share_pct = (user_voting_power / new_total_votes * 100) if new_total_votes > 0 else 0
                output_lines.append(f"   Your Estimated Reward: ${estimated_reward:,.2f} ({user_share_pct:.2f}% share)")
            output_lines.append(f"   Profitability Score: {score:.2f}")
            output_lines.append("")
        
        output_text = "\n".join(output_lines)
        
        if return_output:
            return output_text
        else:
            print(output_text)
            return None
    
    def _get_json_output(self, pools: List[Pool], user_voting_power: Optional[float] = None, hide_vamm: bool = False, min_rewards: Optional[float] = None) -> str:
        """Get recommendations as JSON string"""
        from datetime import datetime
        
        output = {
            "version": __version__,
            "generated": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            "user_voting_power": user_voting_power,
            "filters": {
                "hide_vamm": hide_vamm,
                "min_rewards": min_rewards
            },
            "pools": []
        }
        
        for pool in pools:
            pool_data = {
                "name": pool.name,
                "pool_id": pool.pool_id,  # Pool contract address (if found)
                "pool_type": pool.pool_type,
                "fee_percentage": pool.fee_percentage,
                "total_rewards": pool.total_rewards,
                "vapr": pool.vapr,
                "current_votes": pool.current_votes,
                "profitability_score": pool.profitability_score()
            }
            
            # Calculate rewards per vote
            if pool.current_votes is not None and pool.current_votes > 0:
                pool_data["rewards_per_vote"] = pool.total_rewards / pool.current_votes
            else:
                pool_data["rewards_per_vote"] = None
            
            # Calculate estimated user rewards if voting power provided
            if user_voting_power:
                estimated_reward = pool.estimate_user_rewards(user_voting_power)
                new_total_votes = (pool.current_votes or 0) + user_voting_power
                user_share_pct = (user_voting_power / new_total_votes * 100) if new_total_votes > 0 else 0
                
                pool_data["estimated_user_reward"] = estimated_reward
                pool_data["estimated_share_percent"] = user_share_pct
                pool_data["new_total_votes_if_you_vote"] = new_total_votes
            
            output["pools"].append(pool_data)
        
        return json.dumps(output, indent=2)
    
    def _print_json_output(self, pools: List[Pool], user_voting_power: Optional[float] = None):
        """Print recommendations as JSON (legacy method for backward compatibility)"""
        output = self._get_json_output(pools, user_voting_power)
        print(output)


def main():
    parser = argparse.ArgumentParser(
        description='Recommend most profitable Blackhole DEX liquidity pools'
    )
    parser.add_argument(
        '--version',
        action='version',
        version=f'%(prog)s {__version__}'
    )
    parser.add_argument(
        '--top',
        type=int,
        default=5,
        help='Number of top pools to recommend (default: 5)'
    )
    parser.add_argument(
        '--no-headless',
        action='store_true',
        help='Show browser window (for debugging)'
    )
    parser.add_argument(
        '--voting-power',
        type=float,
        default=None,
        help='Your voting power in veBLACK (e.g., 15000) - will estimate USD rewards'
    )
    parser.add_argument(
        '--hide-vamm',
        action='store_true',
        help='Hide vAMM pools from results (if you cannot vote for them)'
    )
    parser.add_argument(
        '--min-rewards',
        type=float,
        default=None,
        help='Minimum total rewards in USD to include (e.g., 1000). Filters out smaller pools to focus on more stable rewards.'
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help='Output results as JSON (useful for post-processing)'
    )
    parser.add_argument(
        '-o', '--output',
        help='Output file (optional)'
    )
    
    args = parser.parse_args()
    
    try:
        # Use config default for headless, but CLI flag can override
        # If --no-headless is set, force headless=False; otherwise use config default
        headless_param = False if args.no_headless else None
        recommender = BlackholePoolRecommender(headless=headless_param)
        recommendations = recommender.recommend_pools(top_n=args.top, user_voting_power=args.voting_power, hide_vamm=args.hide_vamm, min_rewards=args.min_rewards, quiet=args.json or args.output)
        
        if not recommendations:
            print("\nNo recommendations generated. This may be because:")
            print("1. The website structure has changed")
            print("2. Selenium/ChromeDriver is not properly installed")
            print("3. Network connectivity issues")
            print("\nTo debug, try running with --no-headless to see the browser.")
            sys.exit(1)
        
        # Get output (either JSON or text)
        output = recommender.print_recommendations(
            recommendations, 
            user_voting_power=args.voting_power,
            hide_vamm=args.hide_vamm,
            min_rewards=args.min_rewards,
            output_json=args.json,
            return_output=bool(args.output)
        )
        
        # Write to file if specified
        if args.output:
            with open(args.output, 'w') as f:
                f.write(output)
            print(f"Results written to {args.output}")
        
    except Exception as e:
        logger.error(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
