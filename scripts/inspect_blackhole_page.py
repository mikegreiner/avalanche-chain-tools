#!/usr/bin/env python3
"""
Helper script to inspect Blackhole DEX vote page structure
Run this to understand the page layout and adjust the main scraper accordingly
"""

import sys

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from bs4 import BeautifulSoup
    import time
except ImportError as e:
    print(f"Error: {e}")
    print("Please install required packages: pip install selenium beautifulsoup4")
    sys.exit(1)


def inspect_page():
    """Inspect the page structure to understand how pools are displayed"""
    url = "https://blackhole.xyz/vote"
    
    options = Options()
    # Don't use headless so we can see what's happening
    options.add_argument('--window-size=1920,1080')
    options.add_argument('user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')
    
    driver = None
    try:
        print("Opening browser...")
        driver = webdriver.Chrome(options=options)
        driver.get(url)
        
        print("Waiting for page to load...")
        time.sleep(8)  # Give React time to render
        
        # Get page source
        page_source = driver.page_source
        soup = BeautifulSoup(page_source, 'html.parser')
        
        print("\n" + "="*80)
        print("PAGE STRUCTURE ANALYSIS")
        print("="*80)
        
        # Look for common patterns
        print("\n1. Looking for tables...")
        tables = soup.find_all('table')
        print(f"   Found {len(tables)} table(s)")
        for i, table in enumerate(tables[:3], 1):
            print(f"   Table {i}: {len(table.find_all('tr'))} rows")
        
        print("\n2. Looking for elements with 'pool' in class/id...")
        pool_elements = soup.find_all(class_=lambda x: x and 'pool' in x.lower())
        pool_elements += soup.find_all(id=lambda x: x and 'pool' in x.lower())
        print(f"   Found {len(pool_elements)} elements")
        
        print("\n3. Looking for elements with 'reward' in class/id...")
        reward_elements = soup.find_all(class_=lambda x: x and 'reward' in x.lower())
        reward_elements += soup.find_all(id=lambda x: x and 'reward' in x.lower())
        print(f"   Found {len(reward_elements)} elements")
        
        print("\n4. Looking for elements with 'vapr' in class/id...")
        vapr_elements = soup.find_all(class_=lambda x: x and 'vapr' in x.lower())
        vapr_elements += soup.find_all(id=lambda x: x and 'vapr' in x.lower())
        print(f"   Found {len(vapr_elements)} elements")
        
        print("\n5. Looking for divs with data attributes...")
        data_divs = soup.find_all('div', attrs=lambda x: x and any(k.startswith('data-') for k in x.keys()))
        print(f"   Found {len(data_divs)} divs with data attributes")
        
        print("\n6. Checking for JSON data in script tags...")
        scripts = soup.find_all('script')
        json_scripts = []
        for script in scripts:
            if script.string and ('pool' in script.string.lower() or 'reward' in script.string.lower()):
                json_scripts.append(script)
        print(f"   Found {len(json_scripts)} script tags with potential pool data")
        
        # Save page source for manual inspection
        output_file = "blackhole_page_source.html"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(page_source)
        print(f"\n7. Saved full page source to: {output_file}")
        
        # Try to find actual pool data visible on page
        print("\n8. Searching for USD amounts ($X.XX pattern)...")
        import re
        usd_amounts = re.findall(r'\$[\d,]+\.?\d*', page_source)
        print(f"   Found {len(usd_amounts)} USD amounts: {usd_amounts[:10]}")
        
        print("\n9. Searching for percentages (X.XX% pattern)...")
        percentages = re.findall(r'\d+\.?\d*\s*%', page_source)
        print(f"   Found {len(percentages)} percentages: {percentages[:10]}")
        
        print("\n" + "="*80)
        print("NEXT STEPS:")
        print("1. Check the saved HTML file to understand the structure")
        print("2. Use browser DevTools (F12) to inspect network requests")
        print("3. Look for API calls that fetch pool data")
        print("4. Update blackhole_pool_recommender.py with correct selectors")
        print("="*80)
        
        # Keep browser open for manual inspection
        input("\nPress Enter to close the browser...")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if driver:
            driver.quit()


if __name__ == "__main__":
    inspect_page()
