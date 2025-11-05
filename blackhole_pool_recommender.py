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
from datetime import datetime, timezone
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
__version__ = "1.1.3"

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
        self.epoch_close_utc: Optional[datetime] = None
        self.epoch_close_local: Optional[datetime] = None
        
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
        # Add timeout settings to prevent hangs
        options.add_argument('--page-load-strategy=eager')  # Don't wait for all resources
        
        driver = None
        try:
            # Set service with timeout to prevent connection hangs
            service = Service()
            driver = webdriver.Chrome(service=service, options=options)
            driver.implicitly_wait(self.implicit_wait)
            # Set page load timeout to prevent indefinite hangs
            driver.set_page_load_timeout(60)  # 60 seconds max for page loads
            if not quiet:
                print(f"Loading {self.url}...")
            driver.get(self.url)
            
            if not quiet:
                print("Waiting for pool data to load (this may take 15-20 seconds)...")
            try:
                time.sleep(12)  # Give React time to render and fetch data
            except KeyboardInterrupt:
                if not quiet:
                    print("\nInterrupted - attempting to extract available data...")
                # Continue to extraction even if interrupted
            
            # Set pagination to show 100 pools per page
            if not quiet:
                print("Setting pagination to 100 pools per page...")
            try:
                # Find the pagination container (custom dropdown) - use find_elements with WebDriverWait
                pagination_containers = WebDriverWait(driver, 5).until(
                    EC.presence_of_all_elements_located((By.XPATH, "//div[contains(@class, 'size-per-page')]"))
                )
                if pagination_containers:
                    pagination_container = pagination_containers[0]
                    # Click on the container to open dropdown
                    driver.execute_script("arguments[0].click();", pagination_container)
                    time.sleep(1.5)  # Wait for dropdown to open
                    
                    # Look for option with text "100" - it's in a span with class "size-text"
                    try:
                        option_100s = WebDriverWait(driver, 3).until(
                            EC.presence_of_all_elements_located((By.XPATH, "//span[contains(@class, 'size-text') and contains(text(), '100')]"))
                        )
                        if option_100s:
                            option_100 = option_100s[0]
                            # Click on the parent container (size-container) that contains this span
                            parent_containers = option_100.find_elements(By.XPATH, "./ancestor::*[contains(@class, 'size-container')][1]")
                            if parent_containers:
                                driver.execute_script("arguments[0].click();", parent_containers[0])
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
                # Find and click the TOTAL REWARDS column header - use find_elements with wait
                total_rewards_headers = WebDriverWait(driver, 5).until(
                    EC.presence_of_all_elements_located((By.XPATH, "//div[contains(@class, 'total-rewards')] | //div[contains(@class, 'liquidity-pool-column-tab') and contains(text(), 'TOTAL REWARDS')]"))
                )
                if total_rewards_headers:
                    driver.execute_script("arguments[0].click();", total_rewards_headers[0])
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
                print(f"Total pools loaded on current page: {max_pools}")
            
            # Scroll back to top
            if pool_container:
                driver.execute_script("arguments[0].scrollTop = 0", pool_container)
            else:
                driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(2)
            
            # Extract epoch information from page (only if we didn't get it from API)
            if not self.epoch_close_utc:
                self._extract_epoch_info(driver, quiet=quiet)
            
            pools = []
            
            # Navigate through all pages to collect pools
            page_num = 1
            all_pools = []
            
            while True:
                if not quiet:
                    print(f"Extracting pools from page {page_num}...")
                
                # Extract pools from current page
                # Method 1: Try to extract from DOM elements using Selenium
                page_pools = []
                try:
                    # The actual pool containers are divs with class 'liquidity-pool-cell'
                    pool_elements = driver.find_elements(By.XPATH, "//div[contains(@class, 'liquidity-pool-cell') and (contains(@class, 'even') or contains(@class, 'odd'))]")
                
                    if pool_elements:
                        if not quiet:
                            print(f"Found {len(pool_elements)} pool elements on page {page_num}")
                        page_pools = self._extract_pools_from_elements(pool_elements, driver)
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
                                print(f"Found {len(main_pools)} pool elements on page {page_num}")
                            page_pools = self._extract_pools_from_elements(main_pools, driver)
                
                except Exception as e:
                    logger.error(f"Error extracting from DOM elements on page {page_num}: {e}")
                
                # Add pools from this page to the collection
                if page_pools:
                    all_pools.extend(page_pools)
                    if not quiet:
                        print(f"Extracted {len(page_pools)} pools from page {page_num} (total so far: {len(all_pools)})")
                
                # Check if there's a next page button
                next_page_button = None
                try:
                    # Look for pagination controls - try multiple selectors
                    # Common patterns: button with "Next", arrow button, page number buttons
                    next_buttons = driver.find_elements(By.XPATH, 
                        "//button[contains(text(), 'Next') or contains(@aria-label, 'next') or contains(@aria-label, 'Next')] | "
                        "//button[contains(@class, 'next')] | "
                        "//*[contains(@class, 'pagination')]//button[contains(@class, 'next')] | "
                        "//*[contains(@class, 'pagination')]//button[contains(text(), '?') or contains(text(), '>') or normalize-space(text())='>' or normalize-space(text())='?'] | "
                        "//*[contains(@class, 'pagination')]//button[normalize-space()='>'] | "
                        "//*[contains(@class, 'pagination')]//button[normalize-space()='?'] | "
                        "//button[contains(@class, 'arrow')] | "
                        "//*[@role='button' and (contains(@class, 'next') or contains(@aria-label, 'next'))]")
                    
                    # Also check for disabled state - if next button is disabled, we're on last page
                    for btn in next_buttons:
                        try:
                            classes = btn.get_attribute('class') or ''
                            disabled = btn.get_attribute('disabled') or btn.get_attribute('aria-disabled') == 'true'
                            is_displayed = btn.is_displayed()
                            btn_text = btn.text or ''
                            
                            if not disabled and 'disabled' not in classes.lower() and is_displayed:
                                # Check if it's actually a next button (not previous)
                                # Exclude buttons with < or ? (previous page arrows)
                                btn_text_clean = btn_text.strip()
                                if ('prev' not in classes.lower() and 'previous' not in classes.lower() and 
                                    'prev' not in btn_text.lower() and
                                    btn_text_clean not in ['<', '?', '?'] and
                                    '<' not in btn_text_clean and '?' not in btn_text_clean):
                                    # Prefer buttons with > or ? (next page arrows)
                                    if btn_text_clean in ['>', '?', '?'] or '>' in btn_text_clean or '?' in btn_text_clean:
                                        next_page_button = btn
                                        break
                                    # Also accept if it's clearly a next button by class/aria-label
                                    elif 'next' in classes.lower() or 'next' in (btn.get_attribute('aria-label') or '').lower():
                                        next_page_button = btn
                                        break
                        except Exception as e:
                            # Silently continue if button check fails
                            continue
                            
                    # If no button found, try looking for page number buttons
                    if not next_page_button:
                        try:
                            # Look for page number buttons - pages are typically numbered
                            next_page_num = page_num + 1
                            # Build XPath queries with the page number
                            page_buttons = driver.find_elements(By.XPATH,
                                f"//button[text()='{next_page_num}'] | "
                                f"//*[contains(@class, 'pagination')]//button[text()='{next_page_num}'] | "
                                f"//*[contains(@class, 'page')]//button[text()='{next_page_num}'] | "
                                f"//*[@role='button' and text()='{next_page_num}']")
                            
                            if page_buttons:
                                for btn in page_buttons:
                                    try:
                                        classes = btn.get_attribute('class') or ''
                                        disabled = btn.get_attribute('disabled') or btn.get_attribute('aria-disabled') == 'true'
                                        is_displayed = btn.is_displayed()
                                        
                                        if not disabled and 'disabled' not in classes.lower() and is_displayed:
                                            next_page_button = btn
                                            break
                                    except:
                                        continue
                            
                            # If still no button, try to find all clickable page number elements (divs, buttons, etc.)
                            if not next_page_button:
                                # Look for clickable elements that might be page numbers
                                # They could be buttons, divs, or other clickable elements
                                all_page_elements = driver.find_elements(By.XPATH,
                                    "//*[contains(@class, 'pagination')]//* | "
                                    "//*[contains(@class, 'page-result-section')]//* | "
                                    "//*[contains(@class, 'footer')]//*")
                                
                                for elem in all_page_elements:
                                    try:
                                        elem_text = elem.text.strip()
                                        # Check if it's a number matching the next page
                                        if elem_text.isdigit():
                                            elem_num = int(elem_text)
                                            if elem_num == next_page_num:
                                                # Check if element is clickable (has onclick, is button, or has cursor pointer)
                                                classes = elem.get_attribute('class') or ''
                                                tag_name = elem.tag_name.lower()
                                                onclick = elem.get_attribute('onclick')
                                                style = elem.get_attribute('style') or ''
                                                disabled = elem.get_attribute('disabled') or elem.get_attribute('aria-disabled') == 'true'
                                                is_displayed = elem.is_displayed()
                                                
                                                # Check if it looks clickable
                                                # Since we're in pagination area, elements with numbers are likely clickable
                                                is_clickable = (
                                                    tag_name == 'button' or
                                                    'clickable' in classes.lower() or
                                                    'cursor:pointer' in style.lower() or
                                                    onclick is not None or
                                                    'page' in classes.lower() or
                                                    tag_name == 'div'  # Divs in pagination are likely clickable
                                                )
                                                
                                                # If it's in pagination area and has the right number, assume it's clickable
                                                if (not disabled and 'disabled' not in classes.lower() and 
                                                    is_displayed and (is_clickable or 'pagination' in str(elem.get_attribute('class') or '').lower())):
                                                    next_page_button = elem
                                                    break
                                    except:
                                        continue
                        except Exception as e:
                            # Silently continue if page number search fails
                            pass
                                
                except Exception as e:
                    # Silently continue if pagination search fails
                    pass
                
                # If no next button found or we got no pools, break
                if not next_page_button:
                    # Silently stop pagination - no need to print failure message
                    break
                    
                if not page_pools:
                    # Silently stop pagination if no pools found
                    break
                
                # Click next page button/element
                try:
                    # Try multiple click methods to ensure it works
                    try:
                        next_page_button.click()
                    except:
                        # Fallback to JavaScript click
                        driver.execute_script("arguments[0].click();", next_page_button)
                    time.sleep(3)  # Wait for page to load
                    
                    # Scroll to load pools on new page
                    if pool_container:
                        driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", pool_container)
                    else:
                        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                    time.sleep(2)
                    
                    page_num += 1
                except Exception as e:
                    if not quiet:
                        logger.warning(f"Error navigating to next page: {e}")
                    break
            
            # Use all collected pools
            pools = all_pools
            if not quiet:
                print(f"\nTotal pools extracted from all pages: {len(pools)}")
            
            # Fallback methods if no pools found from pagination
            if not pools:
                # Method 2: Try to extract from page text using regex patterns
                print("Trying text-based extraction...")
                try:
                    # Use find_elements to avoid hanging
                    body_elements = driver.find_elements(By.TAG_NAME, "body")
                    if body_elements:
                        page_text = body_elements[0].text
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
            
        except KeyboardInterrupt:
            if not quiet:
                print("\nOperation interrupted by user")
            # Try to extract any available data before quitting
            if driver:
                try:
                    if not quiet:
                        print("Attempting to extract available data before exit...")
                    pool_elements = driver.find_elements(By.XPATH, "//div[contains(@class, 'liquidity-pool-cell')]")
                    if pool_elements:
                        pools = self._extract_pools_from_elements(pool_elements[:min(50, len(pool_elements))], driver)
                        if pools:
                            if not quiet:
                                print(f"Extracted {len(pools)} pools before exit")
                            return pools
                except:
                    pass
            raise
        except Exception as e:
            print(f"Error fetching pools with Selenium: {e}")
            import traceback
            traceback.print_exc()
            raise
        finally:
            if driver:
                try:
                    driver.quit()
                except:
                    pass  # Ignore errors during cleanup
    
    def _extract_pools_from_elements(self, elements, driver) -> List[Pool]:
        """
        Extract pool data from Selenium WebElements.
        
        Uses find_elements (not find_element) to avoid hanging on implicit wait.
        Temporarily reduces implicit wait to 0 during extraction for speed.
        
        NOTE: Votability filtering approach (for future implementation):
        Non-votable pools have a 'data-tooltip-id="no-locks-available"' attribute in the button container.
        To filter them out:
        1. Find button container: element.find_elements(...)
        2. Check for tooltip: button_container.find_elements(...)
        3. If tooltip exists, skip the pool (not votable)
        
        This filtering should be done AFTER extraction is complete to avoid breaking the extraction logic.
        """
        pools = []
        extraction_errors = []
        
        # Temporarily set implicit wait to 0 during extraction to avoid hangs
        # Save current implicit wait (from driver config) before changing it
        # Note: implicitly_wait() doesn't return the old value, so we use self.implicit_wait
        original_implicit_wait = self.implicit_wait
        driver.implicitly_wait(0)
        
        try:
            for idx, element in enumerate(elements):
                try:
                    # Add connection health check every 10 elements
                    if idx > 0 and idx % 10 == 0:
                        try:
                            # Quick health check - try to get page title (with short timeout)
                            from selenium.common.exceptions import TimeoutException
                            from selenium.webdriver.support.ui import WebDriverWait
                            WebDriverWait(driver, 1).until(lambda d: d.title is not None)
                        except (TimeoutException, Exception):
                            # Connection lost or timeout - skip remaining elements
                            logger.warning(f"Connection timeout after {idx} elements. Extracted {len(pools)} pools so far.")
                            break
                    
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
                        # Use explicit wait with short timeout to avoid hanging
                        # Use find_elements to avoid hanging on implicit wait
                        name_elements = element.find_elements(By.XPATH, ".//div[contains(@class, 'name')]")
                        if name_elements:
                            name_text = name_elements[0].text.strip()
                        else:
                            name_text = ""
                        
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
                        
                        # Try to extract pool ID/address from data attributes and HTML content
                        try:
                            # Check for data attributes that might contain pool address
                            pool_id = (
                                element.get_attribute('data-pool-id') or
                                element.get_attribute('data-pool-address') or
                                element.get_attribute('data-address') or
                                element.get_attribute('data-id')
                            )
                            # Also check child elements (use find_elements to avoid hanging)
                            if not pool_id:
                                try:
                                    id_elements = element.find_elements(By.XPATH, ".//*[@data-pool-id or @data-pool-address or @data-address]")
                                    if id_elements:
                                        id_element = id_elements[0]
                                        pool_id = (
                                            id_element.get_attribute('data-pool-id') or
                                            id_element.get_attribute('data-pool-address') or
                                            id_element.get_attribute('data-address')
                                        )
                                except:
                                    pass
                            
                            # Fallback: Extract Ethereum address from HTML content (pool contract address)
                            if not pool_id:
                                try:
                                    inner_html = element.get_attribute('innerHTML')
                                    if inner_html:
                                        # Look for Ethereum addresses (0x followed by 40 hex characters)
                                        import re
                                        eth_addresses = re.findall(r'0x[a-fA-F0-9]{40}', inner_html)
                                        if eth_addresses:
                                            # Use the first unique address found
                                            # Filter out common contract addresses that might appear on every pool
                                            unique_addresses = list(set(eth_addresses))
                                            # Take the first one (most likely the pool address)
                                            pool_id = unique_addresses[0]
                                except:
                                    pass
                            
                            # Also check tooltip IDs which sometimes contain addresses
                            if not pool_id:
                                try:
                                    tooltip_elements = element.find_elements(By.XPATH, ".//*[contains(@data-tooltip-id, 'pool-address') or contains(@data-tooltip-id, 'address')]")
                                    if tooltip_elements:
                                        tooltip_id = tooltip_elements[0].get_attribute('data-tooltip-id')
                                        # Extract address from tooltip ID like "pool-address-tooltip-0x..."
                                        if tooltip_id:
                                            match = re.search(r'0x[a-fA-F0-9]{40}', tooltip_id)
                                            if match:
                                                pool_id = match.group(0)
                                except:
                                    pass
                        except:
                            pass
                        
                        # Extract fee percentage (use find_elements to avoid implicit wait)
                        try:
                            gas_info_elements = element.find_elements(By.XPATH, ".//div[contains(@class, 'gas-info')]//div[contains(@class, 'text')]")
                            if gas_info_elements:
                                fee_percentage = gas_info_elements[0].text.strip()
                        except:
                            pass
                    except:
                        # Fallback: try to find name in left section (use find_elements to avoid hanging)
                        try:
                            left_sections = element.find_elements(By.XPATH, ".//div[contains(@class, 'liquidity-pool-cell-left')] | .//div[contains(@class, 'liquidity-pool-cell-description')]")
                            if left_sections:
                                left_section = left_sections[0]
                                name_text = left_section.text.strip()
                            else:
                                name_text = ""
                            
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
                        # Use find_elements to avoid hanging on implicit wait
                        right_sections = element.find_elements(By.XPATH, ".//div[contains(@class, 'liquidity-pool-cell-right')]")
                        if not right_sections:
                            raise Exception("Right section not found")
                        right_section = right_sections[0]
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
                        # Use find_elements to avoid hanging on implicit wait
                        right_sections = element.find_elements(By.XPATH, ".//div[contains(@class, 'liquidity-pool-cell-right')]")
                        if not right_sections:
                            raise Exception("Right section not found")
                        right_section = right_sections[0]
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
                        # Use find_elements to avoid hanging on implicit wait
                        right_sections = element.find_elements(By.XPATH, ".//div[contains(@class, 'liquidity-pool-cell-right')]")
                        if not right_sections:
                            raise Exception("Right section not found")
                        right_section = right_sections[0]
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
        finally:
            # Restore original implicit wait
            driver.implicitly_wait(original_implicit_wait)
        
        # Note: extraction success/failure messages handled by caller (quiet flag)
        
        return pools
    
    def _extract_epoch_info(self, driver, quiet: bool = False):
        """
        Extract epoch close date/time from the page.
        
        Looks for the specific pattern: "Voting deadline for epoch #<epochNumber>" 
        followed by time remaining (days/hours until epoch close).
        """
        try:
            from datetime import timedelta
            
            # Get page text to search for the voting deadline pattern
            # Try multiple sources: body text, page source, and specific elements
            page_text = ""
            try:
                body_elements = driver.find_elements(By.TAG_NAME, "body")
                if body_elements:
                    page_text = body_elements[0].text
                
                # Also get page source for more complete text (some React apps don't expose all text in .text)
                if not page_text or 'Voting deadline' not in page_text and 'deadline' not in page_text.lower():
                    page_source = driver.page_source
                    # Extract text from HTML
                    if BS4_AVAILABLE:
                        from bs4 import BeautifulSoup
                        soup = BeautifulSoup(page_source, 'html.parser')
                        page_text = soup.get_text(separator='\n')
                    else:
                        # Basic extraction without BeautifulSoup
                        import re as re_module
                        # Remove script and style tags
                        page_source = re_module.sub(r'<script[^>]*>.*?</script>', '', page_source, flags=re_module.DOTALL | re_module.IGNORECASE)
                        page_source = re_module.sub(r'<style[^>]*>.*?</style>', '', page_source, flags=re_module.DOTALL | re_module.IGNORECASE)
                        # Extract text between tags (simple version)
                        page_text = re_module.sub(r'<[^>]+>', '\n', page_source)
            except Exception as e:
                logger.debug(f"Error getting page text: {e}")
                pass
            
            # Strategy 0: Look for specific elements with class="pending-time clickable" and data-tooltip-id="voting-epoch-tooltip"
            try:
                pending_time_elements = driver.find_elements(By.XPATH, 
                    "//*[@class='pending-time clickable' and @data-tooltip-id='voting-epoch-tooltip'] | "
                    "//*[contains(@class, 'pending-time') and contains(@class, 'clickable') and @data-tooltip-id='voting-epoch-tooltip']")
                
                for elem in pending_time_elements:
                    # Get the text content which should have the countdown
                    time_text = elem.text.strip()
                    if time_text:
                        # Also try to get tooltip content which might have more info
                        try:
                            tooltip_text = elem.get_attribute('data-tooltip-content') or elem.get_attribute('title') or ""
                        except:
                            tooltip_text = ""
                        
                        # Search in both the element text and tooltip
                        search_text = f"{time_text} {tooltip_text}"
                        
                        # Extract countdown from the text
                        now_utc = datetime.now(timezone.utc)
                        delta = timedelta(0)
                        
                        # Try format like "02d:08h:38m:35s" first (Xd:Xh:Xm:Xs)
                        compact_format = re.search(r'(\d+)d\s*:\s*(\d+)h\s*:\s*(\d+)m\s*:\s*(\d+)s', search_text, re.IGNORECASE)
                        if compact_format:
                            days = int(compact_format.group(1))
                            hours = int(compact_format.group(2))
                            minutes = int(compact_format.group(3))
                            seconds = int(compact_format.group(4))
                            delta = timedelta(days=days, hours=hours, minutes=minutes, seconds=seconds)
                        else:
                            # Try HH:MM:SS format
                            time_match = re.search(r'(\d{1,2}):(\d{2}):(\d{2})', search_text)
                            if time_match:
                                # HH:MM:SS format
                                hours = int(time_match.group(1))
                                minutes = int(time_match.group(2))
                                seconds = int(time_match.group(3))
                                delta = timedelta(hours=hours, minutes=minutes, seconds=seconds)
                            else:
                                # Try to extract days, hours, minutes, seconds separately
                                days_match = re.search(r'(\d+)\s*d(?:ays?)?\b', search_text, re.IGNORECASE)
                                hours_match = re.search(r'(\d+)\s*h(?:ours?)?\b', search_text, re.IGNORECASE)
                                minutes_match = re.search(r'(\d+)\s*m(?:inutes?)?\b', search_text, re.IGNORECASE)
                                seconds_match = re.search(r'(\d+)\s*s(?:econds?)?\b', search_text, re.IGNORECASE)
                                
                                # Days/hours/minutes format
                                if days_match:
                                    delta += timedelta(days=int(days_match.group(1)))
                                if hours_match:
                                    delta += timedelta(hours=int(hours_match.group(1)))
                                if minutes_match:
                                    delta += timedelta(minutes=int(minutes_match.group(1)))
                                if seconds_match:
                                    delta += timedelta(seconds=int(seconds_match.group(1)))
                        
                        if delta.total_seconds() > 0:
                            self.epoch_close_utc = now_utc + delta
                            self.epoch_close_local = self.epoch_close_utc.astimezone()
                            return
            except Exception as e:
                logger.debug(f"Error finding pending-time element: {e}")
            
            # Strategy 1: Look for the specific pattern "Voting deadline for epoch #<number>"
            # This is typically followed by time remaining like "X days Y hours"
            # Try multiple patterns to catch variations in formatting
            deadline_patterns = [
                r'Voting\s+deadline\s+for\s+epoch\s*#\s*(\d+)[\s\n:]*([^\n]{0,200})',  # Flexible spacing and colon
                r'Voting\s+deadline\s+for\s+epoch\s*#\s*(\d+)[\s\n]*([^\n]{0,200})',  # Without colon
                r'Voting\s+deadline.*?epoch\s*#\s*(\d+)[\s\n:]*([^\n]{0,200})',  # More flexible
                r'deadline.*?epoch\s*#\s*(\d+)[\s\n:]*([^\n]{0,200})',  # Without "Voting"
            ]
            
            deadline_match = None
            remaining_text = ""
            
            for pattern in deadline_patterns:
                deadline_match = re.search(pattern, page_text, re.IGNORECASE | re.MULTILINE | re.DOTALL)
                if deadline_match:
                    # Extract the text after the deadline announcement (up to 200 chars)
                    remaining_text = deadline_match.group(2).strip() if len(deadline_match.groups()) > 1 else ""
                    if remaining_text:
                        break
            
            # If we found the deadline text but no remaining_text, look in nearby lines and elements
            if deadline_match and not remaining_text:
                # Try to get text from nearby lines in page_text
                deadline_line_idx = None
                for i, line in enumerate(page_text.split('\n')):
                    if deadline_match.group(0).lower() in line.lower():
                        deadline_line_idx = i
                        break
                
                if deadline_line_idx is not None:
                    lines = page_text.split('\n')
                    # Check next few lines for countdown
                    for i in range(deadline_line_idx + 1, min(deadline_line_idx + 5, len(lines))):
                        if re.search(r'\d+\s*(day|hour)', lines[i], re.IGNORECASE):
                            remaining_text = lines[i]
                            break
                    # Also check previous line (sometimes it's before)
                    if not remaining_text and deadline_line_idx > 0:
                        if re.search(r'\d+\s*(day|hour)', lines[deadline_line_idx - 1], re.IGNORECASE):
                            remaining_text = lines[deadline_line_idx - 1]
                
                # Also try to get text from the element itself or nearby DOM elements
                if not remaining_text:
                    try:
                        deadline_elements = driver.find_elements(By.XPATH, "//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'voting deadline') or contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'deadline for epoch')]")
                        for elem in deadline_elements:
                            # Get parent element text which might contain the countdown
                            try:
                                parent = elem.find_element(By.XPATH, "./..")
                                parent_text = parent.text
                                if 'day' in parent_text.lower() or 'hour' in parent_text.lower():
                                    remaining_text = parent_text
                                    break
                            except:
                                try:
                                    # Try getting next sibling
                                    next_elem = driver.execute_script("return arguments[0].nextElementSibling;", elem)
                                    if next_elem:
                                        remaining_text = next_elem.text
                                        if remaining_text:
                                            break
                                except:
                                    pass
                    except:
                        pass
            
            if deadline_match and remaining_text:
                
                # Look for time patterns in the remaining text
                # Common formats: "X days Y hours", "X days", "X hours Y minutes", "HH:MM:SS"
                now_utc = datetime.now(timezone.utc)
                delta = timedelta(0)
                
                # Try to extract days, hours, minutes, seconds
                days_match = re.search(r'(\d+)\s*days?', remaining_text, re.IGNORECASE)
                hours_match = re.search(r'(\d+)\s*hours?', remaining_text, re.IGNORECASE)
                minutes_match = re.search(r'(\d+)\s*minutes?', remaining_text, re.IGNORECASE)
                seconds_match = re.search(r'(\d+)\s*seconds?', remaining_text, re.IGNORECASE)
                
                # Also try HH:MM:SS format
                time_match = re.search(r'(\d{1,2}):(\d{2}):(\d{2})', remaining_text)
                
                if time_match:
                    # HH:MM:SS format
                    hours = int(time_match.group(1))
                    minutes = int(time_match.group(2))
                    seconds = int(time_match.group(3))
                    delta = timedelta(hours=hours, minutes=minutes, seconds=seconds)
                else:
                    # Days/hours/minutes format
                    if days_match:
                        delta += timedelta(days=int(days_match.group(1)))
                    if hours_match:
                        delta += timedelta(hours=int(hours_match.group(1)))
                    if minutes_match:
                        delta += timedelta(minutes=int(minutes_match.group(1)))
                    if seconds_match:
                        delta += timedelta(seconds=int(seconds_match.group(1)))
                
                if delta.total_seconds() > 0:
                    self.epoch_close_utc = now_utc + delta
                    self.epoch_close_local = self.epoch_close_utc.astimezone()
                    if not quiet:
                        print(f"Found epoch close time: {self.epoch_close_utc.strftime('%Y-%m-%d %H:%M:%S UTC')}")
                    return
            
            # Strategy 2: Fallback - look for date/time strings in UTC format
            # The page lists epoch close in UTC, so look for UTC timestamps
            date_patterns = [
                r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+UTC',  # ISO format with UTC
                r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+UTC',  # ISO format with UTC (no seconds)
            ]
            
            for pattern in date_patterns:
                matches = re.findall(pattern, page_text)
                if matches:
                    # Try to parse the matches
                    for match in reversed(matches[-5:]):  # Check last 5 matches
                        try:
                            parsed_date = None
                            if match.count(':') == 2:
                                parsed_date = datetime.strptime(match, '%Y-%m-%d %H:%M:%S')
                            else:
                                parsed_date = datetime.strptime(match, '%Y-%m-%d %H:%M')
                            
                            if parsed_date:
                                # Set as UTC
                                parsed_date = parsed_date.replace(tzinfo=timezone.utc)
                                # Only accept future dates (reasonable epoch close times)
                                now_utc = datetime.now(timezone.utc)
                                if parsed_date > now_utc:
                                    self.epoch_close_utc = parsed_date
                                    self.epoch_close_local = parsed_date.astimezone()
                                    if not quiet:
                                        print(f"Found epoch close time (UTC): {self.epoch_close_utc.strftime('%Y-%m-%d %H:%M:%S UTC')}")
                                    return
                        except ValueError:
                            continue
            
            # Strategy 3: Look for general countdown text if pattern not found
            # Look for elements containing "left", "ends", "remaining" near epoch info
            try:
                # Search for any element with countdown-like text
                countdown_xpath = (
                    "//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'day') and "
                    "contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'hour')] | "
                    "//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'left')] | "
                    "//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'remaining')] | "
                    "//*[regexp:test(text(), '\\d+:\\d{2}:\\d{2}')]"
                )
                
                # Try simpler XPath without regex
                countdown_elements = driver.find_elements(By.XPATH, 
                    "//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'day') or "
                    "contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'hour') or "
                    "contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'left')]")
                
                # Also search in page_text for countdown patterns
                if page_text:
                    # Look for patterns like "X days, Y hours" or "Xd Yh" in the full text
                    countdown_in_text = re.search(r'(\d+)\s*d(?:ays?|\.)?[\s,]*(\d+)\s*h(?:ours?|\.)?', page_text, re.IGNORECASE)
                    if countdown_in_text:
                        days = int(countdown_in_text.group(1))
                        hours = int(countdown_in_text.group(2))
                        now_utc = datetime.now(timezone.utc)
                        delta = timedelta(days=days, hours=hours)
                        if delta.total_seconds() > 0:
                            self.epoch_close_utc = now_utc + delta
                            self.epoch_close_local = self.epoch_close_utc.astimezone()
                            return
                
                for elem in countdown_elements:
                    text = elem.text.strip()
                    # Look for time patterns like "HH:MM:SS" or "X days Y hours"
                    if re.search(r'\d+:\d{2}:\d{2}', text) or re.search(r'\d+\s*(day|hour|minute)', text, re.IGNORECASE):
                        now_utc = datetime.now(timezone.utc)
                        
                        days_match = re.search(r'(\d+)\s*days?', text, re.IGNORECASE)
                        hours_match = re.search(r'(\d+)\s*hours?', text, re.IGNORECASE)
                        minutes_match = re.search(r'(\d+)\s*minutes?', text, re.IGNORECASE)
                        
                        time_match = re.search(r'(\d{1,2}):(\d{2}):(\d{2})', text)
                        
                        delta = timedelta(0)
                        if time_match:
                            hours = int(time_match.group(1))
                            minutes = int(time_match.group(2))
                            seconds = int(time_match.group(3))
                            delta = timedelta(hours=hours, minutes=minutes, seconds=seconds)
                        else:
                            if days_match:
                                delta += timedelta(days=int(days_match.group(1)))
                            if hours_match:
                                delta += timedelta(hours=int(hours_match.group(1)))
                            if minutes_match:
                                delta += timedelta(minutes=int(minutes_match.group(1)))
                        
                        if delta.total_seconds() > 0:
                            self.epoch_close_utc = now_utc + delta
                            self.epoch_close_local = self.epoch_close_utc.astimezone()
                            return
            except Exception as e:
                logger.debug(f"Could not parse countdown: {e}")
                
        except Exception as e:
            logger.debug(f"Could not extract epoch close time: {e}")
            self.epoch_close_utc = None
            self.epoch_close_local = None
    
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
        """
        Try to fetch pools from a direct API endpoint.
        
        Discovered endpoints:
        - https://resources.blackhole.xyz/cl-pools-list/cl-pools.json - CL pool list with fees/TVL
        - https://resources.blackhole.xyz/genesis-info/genesis.json - Token launch info (not voting data)
        - https://resources.blackhole.xyz/token-details.json - Token metadata (not voting data)
        
        Note: The pool list endpoint has pool metadata but NOT VAPR/votes/rewards (voting-specific data).
        Voting metrics appear to come from blockchain RPC calls (dynamic contract queries), not static APIs.
        This is why Selenium is needed - it executes JavaScript that makes these RPC calls.
        
        Future improvement: Query voting contracts directly via web3.py for each pool address
        (instead of using Selenium), but this requires implementing contract query logic.
        """
        # Discovered API endpoints (tried first as they're more reliable)
        # Note: Only try the known working endpoint to avoid hanging on generic endpoints
        api_endpoints = [
            "https://resources.blackhole.xyz/cl-pools-list/cl-pools.json",
            # Generic endpoints removed - they were causing hangs/timeouts
            # Keep only the known working endpoint
        ]
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
            'Accept': 'application/json'
        }
        
        for endpoint in api_endpoints:
            try:
                # Use shorter timeout to fail fast if endpoint is slow
                response = requests.get(endpoint, headers=headers, timeout=5)
                if response.status_code == 200:
                    data = response.json()
                    pools = self._parse_api_response(data)
                    if pools:
                        return pools
            except requests.exceptions.Timeout:
                # Timeout - skip this endpoint quickly
                continue
            except Exception as e:
                # Other errors - skip
                continue
        
        return []
    
    def _parse_api_response(self, data: dict) -> List[Pool]:
        """
        Parse pool data from API response.
        
        Supports multiple API formats:
        1. CL pools format (resources.blackhole.xyz/cl-pools-list/cl-pools.json):
           - Has: id, token0, token1, feesUSD, totalValueLockedUSD, fee
           - Missing: VAPR, votes, totalRewards (voting-specific metrics)
        2. Generic format with voting data:
           - Has: name, totalRewards, vapr, votes
        """
        pools = []
        
        # Handle CL pools format (discovered endpoint)
        pools_data = data.get('pools', data.get('data', {}).get('pools', []))
        
        # If pools_data is still empty, data might be a list
        if not pools_data and isinstance(data, list):
            pools_data = data
        
        for pool_data in pools_data:
            try:
                # Try CL pools format first (resources.blackhole.xyz format)
                if 'token0' in pool_data and 'token1' in pool_data:
                    # CL pools format - construct name from tokens
                    token0_symbol = pool_data['token0'].get('symbol', 'Unknown')
                    token1_symbol = pool_data['token1'].get('symbol', 'Unknown')
                    pool_name = f"{token0_symbol}/{token1_symbol}"
                    
                    # Determine pool type from fee tier
                    fee = int(pool_data.get('fee', '0'))
                    if fee == 100:  # 0.01%
                        pool_type = 'CL1'
                        fee_pct = '0.01%'
                    elif fee == 500:  # 0.05%
                        pool_type = 'CL200'
                        fee_pct = '0.05%'
                    elif fee == 2500:  # 0.25%
                        pool_type = 'CL200'
                        fee_pct = '0.25%'
                    elif fee == 5000:  # 0.5%
                        pool_type = 'CL200'
                        fee_pct = '0.5%'
                    elif fee == 7000:  # 0.7%
                        pool_type = 'CL200'
                        fee_pct = '0.7%'
                    elif fee == 10000:  # 1%
                        pool_type = 'CL200'
                        fee_pct = '1%'
                    else:
                        pool_type = 'CL200'  # Default
                        fee_pct = f"{fee/10000}%"
                    
                    # Use feesUSD as proxy for total_rewards (not perfect, but available)
                    # Note: This is trading fees, not voting rewards
                    total_rewards = float(pool_data.get('feesUSD', pool_data.get('untrackedFeesUSD', 0)))
                    
                    pool = Pool(
                        name=pool_name,
                        total_rewards=total_rewards,
                        vapr=0.0,  # Not available in this API format
                        current_votes=None,  # Not available in this API format
                        pool_id=pool_data.get('id'),
                        pool_type=pool_type,
                        fee_percentage=fee_pct
                    )
                    pools.append(pool)
                else:
                    # Generic format with voting data (if we find such an endpoint)
                    pool = Pool(
                        name=pool_data.get('name', pool_data.get('pair', 'Unknown')),
                        total_rewards=float(pool_data.get('totalRewards', pool_data.get('total_rewards', 0))),
                        vapr=float(pool_data.get('vapr', pool_data.get('VAPR', 0))),
                        current_votes=float(pool_data.get('votes', pool_data.get('currentVotes', 0))) if pool_data.get('votes') or pool_data.get('currentVotes') else None,
                        pool_id=pool_data.get('id', pool_data.get('poolId')),
                        pool_type=pool_data.get('poolType'),
                        fee_percentage=pool_data.get('feePercentage')
                    )
                    pools.append(pool)
            except Exception as e:
                logger.debug(f"Error parsing pool: {e}")
                continue
        
        return pools
    
    def fetch_pools(self, quiet: bool = False) -> List[Pool]:
        """
        Main method to fetch pools - tries API first, then Selenium.
        
        Note: The discovered API endpoint (resources.blackhole.xyz/cl-pools-list/cl-pools.json)
        provides pool metadata but NOT voting metrics (VAPR, votes, rewards).
        For complete voting recommendations, we need Selenium scraping which has all metrics.
        """
        # Try API first (faster, but may lack voting metrics)
        if not quiet:
            print("Attempting to fetch pool data from API...")
        pools = self.fetch_pools_api()
        
        # Check if API pools have voting metrics (VAPR or votes)
        has_voting_data = pools and any(p.vapr > 0 or p.current_votes is not None for p in pools)
        
        if pools and has_voting_data:
            if not quiet:
                print(f"Found {len(pools)} pools via API with voting metrics")
            return pools
        
        # If API returned pools but without voting data, fall back to Selenium
        if pools and not has_voting_data:
            if not quiet:
                print(f"API found {len(pools)} pools but missing voting metrics (VAPR/votes)")
                print("Falling back to Selenium for complete voting data...")
        
        # Fall back to Selenium scraping (has all voting metrics)
        if SELENIUM_AVAILABLE:
            if not quiet and not pools:
                print("API not available, using Selenium to scrape page...")
            return self.fetch_pools_selenium(quiet=quiet)
        else:
            raise InvalidInputError("Selenium not available and API endpoint not found. Please install selenium: pip install selenium")
    
    def recommend_pools(self, top_n: int = 5, user_voting_power: Optional[float] = None, hide_vamm: bool = False, min_rewards: Optional[float] = None, max_pool_percentage: Optional[float] = None, quiet: bool = False) -> List[Pool]:
        """
        Fetch pools and recommend top N most profitable.
        
        When user_voting_power is provided, sorts by estimated reward (most relevant).
        Otherwise, sorts by profitability score (general recommendation).
        
        Args:
            top_n: Number of top pools to return
            user_voting_power: User's voting power in veBLACK for reward estimation
            hide_vamm: If True, filter out vAMM pools
            min_rewards: Minimum total rewards in USD to include (filters out smaller pools)
            max_pool_percentage: Maximum percentage of pool voting power (e.g., 0.5 for 0.5%). Filters out pools where adding your full voting power would exceed this threshold.
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
        
        # Filter out pools where user would exceed max pool percentage threshold
        if max_pool_percentage is not None and user_voting_power is not None:
            original_count = len(pools)
            filtered_pools = []
            for pool in pools:
                # Skip pools without vote data (can't calculate percentage)
                if pool.current_votes is None or pool.current_votes == 0:
                    # If pool has no votes, user would have 100% - include only if threshold allows
                    if max_pool_percentage >= 100.0:
                        filtered_pools.append(pool)
                    # Otherwise filter it out
                    continue
                
                # Calculate new total votes after user votes
                new_total_votes = pool.current_votes + user_voting_power
                # Calculate user's percentage of the pool
                user_percentage = (user_voting_power / new_total_votes) * 100
                
                # Include pool only if user percentage is <= threshold
                if user_percentage <= max_pool_percentage:
                    filtered_pools.append(pool)
            
            pools = filtered_pools
            filtered_count = original_count - len(pools)
            if filtered_count > 0 and not quiet:
                print(f"Filtered out {filtered_count} pool(s) where your voting power would exceed {max_pool_percentage}% of total pool votes")
        
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
    
    def generate_voting_script(self, pools: List[Pool], quiet: bool = False) -> Optional[str]:
        """
        Generate a JavaScript console script to programmatically select pools on the voting page.
        
        Since pool selection is handled client-side (no API calls), this generates a script
        that can be run in the browser console to automatically select pools by their addresses.
        
        Args:
            pools: List of Pool objects to select
            quiet: If True, suppress progress messages
            
        Returns:
            JavaScript code as a string, or None if no pool IDs available
        """
        if not pools:
            return None
        
        # Extract pool IDs (contract addresses) and names
        pool_ids = []
        pool_info = []  # Store (id, name) tuples
        
        for pool in pools:
            if pool.pool_id:
                pool_ids.append(pool.pool_id)
                pool_info.append((pool.pool_id, pool.name))
            else:
                pool_info.append((None, pool.name))
        
        if not pool_ids:
            if not quiet:
                print("\nWarning: Pool IDs (addresses) not available. Cannot generate selection script.")
                print("Pool names found:")
                for name in [p.name for p in pools]:
                    print(f"  - {name}")
                print("\nThe script needs pool contract addresses to find and select pools.")
            return None
        
        # Generate JavaScript code
        # Use format() instead of f-string to avoid template literal conflicts
        pool_ids_json = json.dumps(pool_ids)
        pool_info_dict = {pid: name for pid, name in pool_info if pid}
        pool_info_json = json.dumps(pool_info_dict)
        
        js_code = """// Auto-select pools on Blackhole voting page
// Generated for {pool_count} pool(s)
// Run this script in the browser console (F12) while on https://blackhole.xyz/vote

(function() {{
    const poolAddresses = {pool_ids_json};
    const poolInfo = {pool_info_json};
    
    console.log('Looking for pools to select...');
    let selectedCount = 0;
    let notFoundCount = 0;
    
    // Find all pool cells
    const poolCells = document.querySelectorAll('div.liquidity-pool-cell');
    console.log('Found ' + poolCells.length + ' pool cells on the page');
    
    poolAddresses.forEach((address, index) => {{
        let found = false;
        
        // Try multiple strategies to find the pool by address
        // Strategy 1: Look for the address in the cell's innerHTML
        for (let cell of poolCells) {{
            const innerHTML = cell.innerHTML || '';
            const innerText = cell.innerText || '';
            
            // Check if this cell contains the pool address
            if (innerHTML.includes(address) || innerText.includes(address)) {{
                // Find the SELECT button - it's a button with classes "btn yellow-btn clickable"
                const selectButton = cell.querySelector('button.btn.yellow-btn.clickable') ||
                                    cell.querySelector('.liquidity-pool-cell-btn button') ||
                                    cell.querySelector('.liquidity-pool-cell-right button') ||
                                    cell.querySelector('button[class*="yellow-btn"]');
                
                if (selectButton) {{
                    try {{
                        selectButton.click();
                        const poolName = poolInfo[address] || 'Unknown';
                        console.log('? Clicked SELECT button for: ' + poolName + ' (' + address + ')');
                        selectedCount++;
                        found = true;
                        setTimeout(function() {{}}, 100);
                        break;
                    }} catch (e) {{
                        console.warn('Error clicking SELECT button:', e);
                    }}
                }} else {{
                    console.warn('SELECT button not found for pool ' + address);
                }}
            }}
        }}
        
        // Strategy 2: Look for elements with data attributes containing the address
        if (!found) {{
            const elementsWithAddress = Array.from(document.querySelectorAll('*')).filter(el => {{
                const attrs = Array.from(el.attributes || []);
                return attrs.some(attr => attr.value && attr.value.includes(address));
            }});
            
            for (let elem of elementsWithAddress) {{
                // Find the parent pool cell
                let parent = elem;
                while (parent && !parent.classList.contains('liquidity-pool-cell')) {{
                    parent = parent.parentElement;
                }}
                
                if (parent) {{
                    // Find SELECT button in parent cell
                    const selectButton = parent.querySelector('button.btn.yellow-btn.clickable') ||
                                        parent.querySelector('.liquidity-pool-cell-btn button') ||
                                        parent.querySelector('.liquidity-pool-cell-right button') ||
                                        parent.querySelector('button[class*="yellow-btn"]');
                    
                    if (selectButton) {{
                        try {{
                            selectButton.click();
                            const poolName = poolInfo[address] || 'Unknown';
                            console.log('? Clicked SELECT button for: ' + poolName + ' (' + address + ')');
                            selectedCount++;
                            found = true;
                            setTimeout(function() {{}}, 100);
                            break;
                        }} catch (e) {{
                            console.warn('Error clicking SELECT button:', e);
                        }}
                    }} // else: button not found, will try next strategy
                }}
            }}
        }}
        
        // Strategy 3: Try to find by pool name if address matching fails
        if (!found) {{
            const poolName = poolInfo[address];
            if (poolName) {{
                // Extract a recognizable part of the pool name (e.g., "USDC/ARTERY" from "vAMM-USDC/ARTERY")
                const nameParts = poolName.split('/');
                const searchText = nameParts.length > 1 ? nameParts.join('/') : poolName;
                
                for (let cell of poolCells) {{
                    const cellText = cell.innerText || '';
                    if (cellText.includes(searchText)) {{
                        try {{
                            cell.click();
                            console.log(`? Selected by name: ${{poolName}} (${{address}})`);
                            selectedCount++;
                            found = true;
                            setTimeout(() => {{}}, 100);
                            break;
                        }} catch (e) {{
                            console.warn(`Error clicking pool ${{poolName}}:`, e);
                        }}
                    }}
                }}
            }}
        }}
        
        if (!found) {{
            const poolName = poolInfo[address] || address;
            console.warn('? Could not find pool: ' + poolName + ' (' + address + ')');
            notFoundCount++;
        }}
    }});
    
    console.log('\\nSelection complete: ' + selectedCount + ' selected, ' + notFoundCount + ' not found');
    console.log('You can now allocate your votes to the selected pools.');
}})();
""".format(
            pool_count=len(pool_ids),
            pool_ids_json=pool_ids_json,
            pool_info_json=pool_info_json
        )
        
        # Script is saved to file and copied to clipboard - don't print to stdout
        # to keep output focused on pool recommendations
        return js_code
    
    def generate_bookmarklet(self, js_code: str, data_file: str = None) -> str:
        """
        Generate a dynamic bookmarklet that loads pool data from a file.
        This way, you only need to create the bookmark once, and update the data file
        when pools change.
        
        Args:
            js_code: JavaScript code string
            data_file: Path to the data file (relative or absolute)
            
        Returns:
            Bookmarklet instructions with URL
        """
        from urllib.parse import quote
        import os
        
        # Extract pool data from the JS code
        import re
        pool_ids_match = re.search(r'const poolAddresses = (\[.*?\]);', js_code, re.DOTALL)
        pool_info_match = re.search(r'const poolInfo = (\{.*?\});', js_code, re.DOTALL)
        
        if pool_ids_match and pool_info_match:
            # Create a loader bookmarklet that reads from the data file
            pool_ids_json = pool_ids_match.group(1)
            pool_info_json = pool_info_match.group(1)
            
            # Determine data file path (relative to script location)
            if not data_file:
                data_file = 'blackhole_pools_data.js'
            
            # Create the data file with pool information
            from datetime import datetime
            data_file_content = f"""// Blackhole Pool Selection Data
// This file is automatically updated when you run the recommender
// Last updated: {datetime.now().isoformat()}

window.BLACKHOLE_POOL_DATA = {{
    poolAddresses: {pool_ids_json},
    poolInfo: {pool_info_json}
}};
"""
            
            # Generate the loader bookmarklet (stays the same, reads from data file)
            loader_code = f"""
(function() {{
    // Try to load data from file
    const script = document.createElement('script');
    script.src = '{data_file}';
    script.onload = function() {{
        if (!window.BLACKHOLE_POOL_DATA) {{
            alert('Pool data not found. Make sure {data_file} is accessible.');
            return;
        }}
        const poolAddresses = window.BLACKHOLE_POOL_DATA.poolAddresses;
        const poolInfo = window.BLACKHOLE_POOL_DATA.poolInfo;
        
        console.log('Looking for pools to select...');
        let selectedCount = 0;
        let notFoundCount = 0;
        
        const poolCells = document.querySelectorAll('div.liquidity-pool-cell');
        console.log('Found ' + poolCells.length + ' pool cells on the page');
        
        poolAddresses.forEach((address, index) => {{
            let found = false;
            
            for (let cell of poolCells) {{
                const innerHTML = cell.innerHTML || '';
                const innerText = cell.innerText || '';
                
                if (innerHTML.includes(address) || innerText.includes(address)) {{
                    const selectButton = cell.querySelector('button.btn.yellow-btn.clickable') ||
                                        cell.querySelector('.liquidity-pool-cell-btn button') ||
                                        cell.querySelector('.liquidity-pool-cell-right button') ||
                                        cell.querySelector('button[class*="yellow-btn"]');
                    
                    if (selectButton) {{
                        try {{
                            selectButton.click();
                            const poolName = poolInfo[address] || 'Unknown';
                            console.log('? Clicked SELECT button for: ' + poolName + ' (' + address + ')');
                            selectedCount++;
                            found = true;
                            setTimeout(function() {{}}, 100);
                            break;
                        }} catch (e) {{
                            console.warn('Error clicking SELECT button:', e);
                        }}
                    }}
                }}
            }}
            
            if (!found) {{
                const poolName = poolInfo[address];
                if (poolName) {{
                    const nameParts = poolName.split('/');
                    const searchText = nameParts.length > 1 ? nameParts.join('/') : poolName;
                    
                    for (let cell of poolCells) {{
                        const cellText = cell.innerText || '';
                        if (cellText.includes(searchText)) {{
                            const selectButton = cell.querySelector('button.btn.yellow-btn.clickable') ||
                                                cell.querySelector('.liquidity-pool-cell-btn button') ||
                                                cell.querySelector('.liquidity-pool-cell-right button') ||
                                                cell.querySelector('button[class*="yellow-btn"]');
                            
                            if (selectButton) {{
                                try {{
                                    selectButton.click();
                                    console.log('? Clicked SELECT button by name: ' + poolName + ' (' + address + ')');
                                    selectedCount++;
                                    found = true;
                                    setTimeout(function() {{}}, 100);
                                    break;
                                }} catch (e) {{
                                    console.warn('Error clicking SELECT button:', e);
                                }}
                            }}
                        }}
                    }}
                }}
            }}
            
            if (!found) {{
                const poolName = poolInfo[address] || address;
                console.warn('? Could not find pool: ' + poolName + ' (' + address + ')');
                notFoundCount++;
            }}
        }});
        
        console.log('\\nSelection complete: ' + selectedCount + ' selected, ' + notFoundCount + ' not found');
        console.log('You can now allocate your votes to the selected pools.');
    }};
    script.onerror = function() {{
        alert('Could not load {data_file}. Make sure the file is in the same directory and accessible.');
    }};
    document.head.appendChild(script);
}})();
"""
            
            # Clean and encode the loader
            loader_code = re.sub(r'\s+', ' ', loader_code.strip())
            encoded_loader = quote(loader_code, safe='')
            bookmarklet_url = f"javascript:{encoded_loader}"
            
            return data_file_content, bookmarklet_url, f"""// Blackhole Pool Selection Bookmarklet (Dynamic Version)
// This bookmarklet loads pool data from: {data_file}
// 
// SETUP (only needed once):
// 1. Copy the bookmarklet URL below
// 2. Create a bookmark in your browser
// 3. Paste the URL as the bookmark location
// 4. Name it "Select Recommended Pools"
//
// USAGE:
// - After running the recommender, the {data_file} file is automatically updated
// - Just click the bookmark on https://blackhole.xyz/vote - no need to update the bookmark!
//
// BOOKMARKLET URL:
{bookmarklet_url}
"""
        else:
            # Fallback to static bookmarklet if we can't extract data
            import re
            lines = js_code.split('\n')
            cleaned_lines = []
            for line in lines:
                stripped = line.strip()
                if stripped.startswith('//') and not stripped.startswith('// '):
                    continue
                if '//' in line:
                    code_part = line.split('//')[0].rstrip()
                    if code_part:
                        cleaned_lines.append(code_part)
                else:
                    cleaned_lines.append(line)
            
            js_code = '\n'.join(cleaned_lines)
            js_code = re.sub(r'/\*.*?\*/', '', js_code, flags=re.DOTALL)
            js_code = re.sub(r'\s+', ' ', js_code)
            js_code = js_code.strip()
            
            encoded_js = quote(js_code, safe='')
            bookmarklet_url = f"javascript:{encoded_js}"
            
            return None, bookmarklet_url, f"""// Blackhole Pool Selection Bookmarklet (Static Version)
// NOTE: You'll need to update this bookmarklet when pools change
//
// Copy the URL below and create a bookmark with it
{bookmarklet_url}
"""
    
    def select_pools_on_page(self, pools: List[Pool], quiet: bool = False):
        """
        Open the voting page in a browser and pre-select the recommended pools.
        
        This opens a browser window (non-headless) and attempts to select the pools
        on the page so the user can easily vote for them.
        
        Args:
            pools: List of Pool objects to select on the page
            quiet: If True, suppress progress messages
        """
        if not SELENIUM_AVAILABLE:
            raise ImportError("Selenium is required. Install with: pip install selenium")
        
        if not pools:
            if not quiet:
                print("No pools to select.")
            return
        
        if not quiet:
            print(f"\nOpening browser to select {len(pools)} recommended pool(s)...")
            print("Pool names to select:")
            for i, pool in enumerate(pools, 1):
                print(f"  {i}. {pool.name}")
        
        options = Options()
        # Always show browser window for this feature
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--window-size=1920,1080')
        options.add_argument('user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        options.add_argument('--page-load-strategy=eager')
        
        driver = None
        try:
            driver = webdriver.Chrome(options=options)
            driver.implicitly_wait(10)
            driver.set_page_load_timeout(60)
            
            if not quiet:
                print(f"\nLoading {self.url}...")
            driver.get(self.url)
            
            if not quiet:
                print("Waiting for pool data to load (this may take 15-20 seconds)...")
            time.sleep(12)  # Give React time to render
            
            # Set pagination to show 100 pools per page (to make finding pools easier)
            try:
                pagination_containers = WebDriverWait(driver, 5).until(
                    EC.presence_of_all_elements_located((By.XPATH, "//div[contains(@class, 'size-per-page')]"))
                )
                if pagination_containers:
                    pagination_container = pagination_containers[0]
                    driver.execute_script("arguments[0].click();", pagination_container)
                    time.sleep(1.5)
                    
                    option_100s = WebDriverWait(driver, 3).until(
                        EC.presence_of_all_elements_located((By.XPATH, "//span[contains(@class, 'size-text') and contains(text(), '100')]"))
                    )
                    if option_100s:
                        option_100 = option_100s[0]
                        parent_containers = option_100.find_elements(By.XPATH, "./ancestor::*[contains(@class, 'size-container')][1]")
                        if parent_containers:
                            driver.execute_script("arguments[0].click();", parent_containers[0])
                            time.sleep(4)
            except Exception as e:
                if not quiet:
                    logger.debug(f"Could not set pagination: {e}")
            
            # Scroll to load all pools
            pool_container = None
            try:
                pool_container = driver.find_element(By.XPATH, "//div[contains(@class, 'pools-container')] | //div[contains(@class, 'pool-section')]")
            except:
                pass
            
            # Scroll multiple times to load all pools
            for _ in range(5):
                if pool_container:
                    driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", pool_container)
                else:
                    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(2)
            
            # Scroll back to top
            if pool_container:
                driver.execute_script("arguments[0].scrollTop = 0", pool_container)
            else:
                driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(2)
            
            # Find and select each recommended pool
            selected_count = 0
            pool_elements = driver.find_elements(By.XPATH, "//div[contains(@class, 'liquidity-pool-cell') and (contains(@class, 'even') or contains(@class, 'odd'))]")
            
            if not quiet:
                print(f"\nFound {len(pool_elements)} pools on page. Selecting recommended pools...")
            
            for pool in pools:
                pool_found = False
                
                # Try to find pool by name
                for element in pool_elements:
                    try:
                        # Get the pool name from the element
                        name_elements = element.find_elements(By.XPATH, ".//div[contains(@class, 'name')]")
                        if name_elements:
                            element_name = name_elements[0].text.strip()
                            
                            # Match pool name (exact or contains)
                            if element_name == pool.name or pool.name in element_name or element_name in pool.name:
                                pool_found = True
                                
                                # Look for checkbox or selection button
                                # Try multiple strategies to find the select/checkbox element
                                
                                # Strategy 1: Look for checkbox input
                                checkboxes = element.find_elements(By.XPATH, ".//input[@type='checkbox']")
                                if checkboxes:
                                    checkbox = checkboxes[0]
                                    if not checkbox.is_selected():
                                        driver.execute_script("arguments[0].click();", checkbox)
                                        selected_count += 1
                                        if not quiet:
                                            print(f"  [OK] Selected: {pool.name}")
                                    else:
                                        if not quiet:
                                            print(f"  [OK] Already selected: {pool.name}")
                                    break
                                
                                # Strategy 2: Look for clickable div/button with select-related classes
                                select_buttons = element.find_elements(By.XPATH, 
                                    ".//div[contains(@class, 'checkbox')] | "
                                    ".//div[contains(@class, 'select')] | "
                                    ".//button[contains(@class, 'select')] | "
                                    ".//div[@role='checkbox']"
                                )
                                if select_buttons:
                                    select_button = select_buttons[0]
                                    driver.execute_script("arguments[0].click();", select_button)
                                    selected_count += 1
                                    if not quiet:
                                        print(f"  [OK] Selected: {pool.name}")
                                    break
                                
                                # Strategy 3: Look for the left section and click it (often contains checkbox)
                                left_sections = element.find_elements(By.XPATH, ".//div[contains(@class, 'liquidity-pool-cell-left')]")
                                if left_sections:
                                    left_section = left_sections[0]
                                    # Try clicking on the left section (may contain checkbox)
                                    driver.execute_script("arguments[0].click();", left_section)
                                    time.sleep(0.5)  # Wait for selection to register
                                    selected_count += 1
                                    if not quiet:
                                        print(f"  [OK] Selected: {pool.name}")
                                    break
                                
                                # Strategy 4: Click anywhere on the pool row (if it's clickable)
                                try:
                                    driver.execute_script("arguments[0].click();", element)
                                    time.sleep(0.5)
                                    selected_count += 1
                                    if not quiet:
                                        print(f"  [OK] Selected: {pool.name}")
                                    break
                                except:
                                    pass
                                
                                break
                    except Exception as e:
                        if not quiet:
                            logger.debug(f"Error selecting pool {pool.name}: {e}")
                        continue
                
                if not pool_found and not quiet:
                    print(f"  [X] Could not find pool on page: {pool.name}")
            
            if not quiet:
                print(f"\n[OK] Successfully selected {selected_count} out of {len(pools)} recommended pool(s)")
                print("\nBrowser window is open. You can now:")
                print("  1. Review the selected pools")
                print("  2. Adjust your vote allocations")
                print("  3. Click the vote button when ready")
                print("\nPress Enter here when finished voting (browser will close automatically)...")
            
            # Keep browser open until user presses Enter
            # Store driver reference to prevent garbage collection
            self._selection_driver = driver
            try:
                input()  # Wait for user to press Enter
            except (KeyboardInterrupt, EOFError):
                if not quiet:
                    print("\nClosing browser...")
            finally:
                if driver:
                    driver.quit()
                self._selection_driver = None
            
        except KeyboardInterrupt:
            if not quiet:
                print("\nInterrupted by user")
            if driver:
                driver.quit()
            raise
        except Exception as e:
            if not quiet:
                print(f"\nError opening voting page: {e}")
                import traceback
                traceback.print_exc()
            if driver:
                driver.quit()
            raise
    
    def print_recommendations(self, pools: List[Pool], user_voting_power: Optional[float] = None, hide_vamm: bool = False, min_rewards: Optional[float] = None, max_pool_percentage: Optional[float] = None, output_json: bool = False, return_output: bool = False):
        """Print formatted recommendations"""
        if not pools:
            if return_output:
                return "No pools to recommend."
            print("No pools to recommend.")
            return None
        
        if output_json:
            output = self._get_json_output(pools, user_voting_power, hide_vamm, min_rewards, max_pool_percentage)
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
        
        # Add epoch close time information
        if self.epoch_close_utc:
            if self.epoch_close_local:
                output_lines.append(f"Epoch Close (UTC): {self.epoch_close_utc.strftime('%Y-%m-%d %H:%M:%S UTC')}")
                output_lines.append(f"Epoch Close (Local): {self.epoch_close_local.strftime('%Y-%m-%d %H:%M:%S %Z')}")
            else:
                output_lines.append(f"Epoch Close (UTC): {self.epoch_close_utc.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        
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
    
    def _get_json_output(self, pools: List[Pool], user_voting_power: Optional[float] = None, hide_vamm: bool = False, min_rewards: Optional[float] = None, max_pool_percentage: Optional[float] = None) -> str:
        """Get recommendations as JSON string"""
        from datetime import datetime
        
        output = {
            "version": __version__,
            "generated": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            "user_voting_power": user_voting_power,
            "filters": {
                "hide_vamm": hide_vamm,
                "min_rewards": min_rewards,
                "max_pool_percentage": max_pool_percentage
            },
            "epoch_close": {}
        }
        
        # Add epoch close time information
        if self.epoch_close_utc:
            output["epoch_close"]["utc"] = self.epoch_close_utc.strftime('%Y-%m-%d %H:%M:%S UTC')
            output["epoch_close"]["utc_iso"] = self.epoch_close_utc.isoformat()
        if self.epoch_close_local:
            output["epoch_close"]["local"] = self.epoch_close_local.strftime('%Y-%m-%d %H:%M:%S %Z')
            output["epoch_close"]["local_iso"] = self.epoch_close_local.isoformat()
        
        output["pools"] = []
        
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
    # Version first (standard practice)
    parser.add_argument(
        '--version',
        action='version',
        version=f'%(prog)s {__version__}'
    )
    # Then alphabetical order
    parser.add_argument(
        '--hide-vamm',
        action='store_true',
        help='Hide vAMM pools from results (if you cannot vote for them)'
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help='Output results as JSON (useful for post-processing)'
    )
    parser.add_argument(
        '--max-pool-percentage',
        type=float,
        default=None,
        help='Maximum percentage of pool voting power (e.g., 0.5 for 0.5%%). Filters out pools where adding your full voting power would exceed this threshold.'
    )
    parser.add_argument(
        '--min-rewards',
        type=float,
        default=None,
        help='Minimum total rewards in USD to include (e.g., 1000). Filters out smaller pools to focus on more stable rewards.'
    )
    parser.add_argument(
        '--no-headless',
        action='store_true',
        help='Show browser window (for debugging)'
    )
    parser.add_argument(
        '-o', '--output',
        help='Output file (optional)'
    )
    parser.add_argument(
        '--select-pools',
        action='store_true',
        help='Generate a JavaScript console script to automatically select recommended pools. Copy and paste the script into your browser console while on the voting page.'
    )
    parser.add_argument(
        '--top',
        type=int,
        default=5,
        help='Number of top pools to recommend (default: 5)'
    )
    parser.add_argument(
        '--voting-power',
        type=float,
        default=None,
        help='Your voting power in veBLACK (e.g., 15000) - will estimate USD rewards'
    )
    
    args = parser.parse_args()
    
    try:
        # Use config default for headless, but CLI flag can override
        # If --no-headless is set, force headless=False; otherwise use config default
        headless_param = False if args.no_headless else None
        recommender = BlackholePoolRecommender(headless=headless_param)
        recommendations = recommender.recommend_pools(top_n=args.top, user_voting_power=args.voting_power, hide_vamm=args.hide_vamm, min_rewards=args.min_rewards, max_pool_percentage=args.max_pool_percentage, quiet=args.json or args.output)
        
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
            max_pool_percentage=args.max_pool_percentage,
            output_json=args.json,
            return_output=bool(args.output)
        )
        
        # Write to file if specified
        if args.output:
            with open(args.output, 'w') as f:
                f.write(output)
            print(f"Results written to {args.output}")
        
        # Generate JavaScript script for pool selection if requested
        if args.select_pools:
            try:
                script = recommender.generate_voting_script(recommendations, quiet=args.json or args.output)
                if script:
                    # Always save script to a file
                    import os
                    script_file = 'blackhole_select_pools.js'
                    if args.output:
                        # Use output filename as base
                        script_file = args.output.replace('.txt', '.js').replace('.json', '.js')
                        if not script_file.endswith('.js'):
                            script_file += '.js'
                    
                    try:
                        with open(script_file, 'w') as f:
                            f.write(script)
                        print(f"\n[OK] Pool selection script saved to: {script_file}")
                        
                        # Copy script to clipboard (primary method)
                        clipboard_success = False
                        try:
                            import pyperclip
                            pyperclip.copy(script)
                            print(f"\n[OK] Pool selection script copied to clipboard!")
                            print(f"   Just paste (Ctrl+V or Cmd+V) into your browser console on https://blackhole.xyz/vote")
                            clipboard_success = True
                        except ImportError:
                            print(f"\n[INFO] Install 'pyperclip' to auto-copy script to clipboard:")
                            print(f"   pip install pyperclip")
                            print(f"\n   Or manually copy from: {script_file}")
                        except Exception as e:
                            # Clipboard failed (e.g., no display on headless system)
                            if not quiet:
                                logger.debug(f"Clipboard copy failed: {e}")
                            print(f"\n[WARN] Could not copy pool selection script to clipboard. Script saved to: {script_file}")
                            print(f"   Copy the script from the file above or from: {script_file}")
                            
                    except Exception as e:
                        logger.warning(f"Could not save script to file: {e}")
            except Exception as e:
                logger.error(f"Error generating voting script: {e}")
                # Don't exit - user may still want to see the recommendations
        
    except Exception as e:
        logger.error(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
