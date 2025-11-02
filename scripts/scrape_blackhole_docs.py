#!/usr/bin/env python3
"""
Scrape Blackhole Documentation for Contract Addresses

This script loads the Blackhole docs pages and extracts contract addresses
and other useful information.
"""

import re
import time
import json
from typing import List, Set, Dict
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE_URL = "https://docs.blackhole.xyz"


def extract_addresses(text: str) -> Set[str]:
    """Extract Ethereum addresses from text"""
    pattern = r'0x[a-fA-F0-9]{40}'
    return set(re.findall(pattern, text, re.IGNORECASE))


def scrape_docs_page(driver, url: str, wait_time: int = 10) -> Dict:
    """Scrape a documentation page"""
    print(f"\nLoading: {url}")
    
    try:
        driver.get(url)
        time.sleep(wait_time)  # Wait for content to load
        
        # Try to get the main content area
        try:
            # Wait for content to appear
            WebDriverWait(driver, 20).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
        except:
            pass
        
        # Get page text
        page_text = driver.find_element(By.TAG_NAME, "body").text
        
        # Get page source for addresses in HTML
        page_source = driver.page_source
        
        # Extract addresses
        addresses_text = extract_addresses(page_text)
        addresses_source = extract_addresses(page_source)
        all_addresses = addresses_text.union(addresses_source)
        
        return {
            'url': url,
            'text': page_text[:5000],  # First 5000 chars
            'addresses': sorted(list(all_addresses)),
            'title': driver.title
        }
        
    except Exception as e:
        print(f"  Error loading {url}: {e}")
        return {
            'url': url,
            'error': str(e),
            'addresses': []
        }


def main():
    print("="*70)
    print("Scraping Blackhole Documentation")
    print("="*70)
    
    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--window-size=1920,1080')
    
    driver = None
    all_addresses = set()
    results = {}
    
    # Pages to check (based on common documentation structure)
    pages_to_check = [
        BASE_URL,
        f"{BASE_URL}/",
        f"{BASE_URL}/contracts",
        f"{BASE_URL}/contract-addresses",
        f"{BASE_URL}/addresses",
        f"{BASE_URL}/voting",
        f"{BASE_URL}/vote",
        f"{BASE_URL}/gauges",
        f"{BASE_URL}/pools",
        f"{BASE_URL}/veblack",
        f"{BASE_URL}/staking",
    ]
    
    try:
        driver = webdriver.Chrome(options=options)
        
        # Start with main page to find navigation
        print("\nLoading main documentation page...")
        main_result = scrape_docs_page(driver, BASE_URL, wait_time=15)
        results['main'] = main_result
        all_addresses.update(main_result.get('addresses', []))
        
        # Try to find all navigation links
        print("\nLooking for navigation links...")
        try:
            driver.get(BASE_URL)
            time.sleep(10)
            
            # Find all links
            links = driver.find_elements(By.TAG_NAME, "a")
            found_urls = set()
            for link in links:
                href = link.get_attribute('href')
                if href and 'docs.blackhole.xyz' in href:
                    # Remove fragments and normalize
                    clean_url = href.split('#')[0].rstrip('/')
                    if clean_url not in found_urls and clean_url != BASE_URL:
                        found_urls.add(clean_url)
            
            pages_to_check.extend(list(found_urls)[:20])  # Add up to 20 found links
            print(f"  Found {len(found_urls)} additional pages to check")
            
        except Exception as e:
            print(f"  Could not extract navigation: {e}")
        
        # Check specific pages
        print(f"\nChecking {len(pages_to_check)} pages...")
        for page_url in pages_to_check:
            if page_url == BASE_URL or page_url == f"{BASE_URL}/":
                continue  # Already checked
            
            result = scrape_docs_page(driver, page_url, wait_time=8)
            results[page_url] = result
            all_addresses.update(result.get('addresses', []))
            
            if result.get('addresses'):
                print(f"  ? Found {len(result['addresses'])} addresses")
            else:
                print(f"  ? No addresses found")
            
            time.sleep(2)  # Be nice to the server
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if driver:
            driver.quit()
    
    # Summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    print(f"\nTotal unique addresses found: {len(all_addresses)}")
    
    if all_addresses:
        print("\nContract addresses:")
        for addr in sorted(all_addresses):
            print(f"  {addr}")
        
        # Try to identify what each address might be
        print("\nAnalyzing addresses...")
        # We'll check known patterns
        black_token = "0xcd94a87696fac69edae3a70fe5725307ae1c43f6"
        if black_token in all_addresses:
            print(f"  ? Found BLACK token: {black_token}")
        
        # Look for other known tokens
        known_tokens = {
            "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7": "WAVAX",
            "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e": "USDC",
            "0x152b9d0fdc40c096757f570a51e494bd4b943e50": "BTC.b",
        }
        
        for addr, name in known_tokens.items():
            if addr.lower() in [a.lower() for a in all_addresses]:
                print(f"  ? Found {name}: {addr}")
    
    # Save results
    output = {
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
        'all_addresses': sorted(list(all_addresses)),
        'page_results': results
    }
    
    with open('blackhole_docs_research.json', 'w') as f:
        json.dump(output, f, indent=2, default=str)
    
    print(f"\n? Results saved to blackhole_docs_research.json")
    
    # Look for voting-related content in page text
    print("\nSearching for voting-related content...")
    voting_keywords = ['vote', 'voting', 'gauge', 'veblack', 'stake', 'bribe']
    for page_url, result in results.items():
        if 'error' in result:
            continue
        text_lower = result.get('text', '').lower()
        if any(keyword in text_lower for keyword in voting_keywords):
            print(f"\n  {page_url}:")
            # Extract sentences with keywords
            sentences = result['text'].split('.')
            for sentence in sentences:
                sentence_lower = sentence.lower()
                if any(keyword in sentence_lower for keyword in voting_keywords):
                    # Extract address if in same sentence
                    sent_addresses = extract_addresses(sentence)
                    if sent_addresses:
                        print(f"    {sentence.strip()[:200]}")
                        print(f"    Addresses: {', '.join(sent_addresses)}")


if __name__ == "__main__":
    main()
