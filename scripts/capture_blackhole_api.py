#!/usr/bin/env python3
"""
Capture Blackhole API calls to find contract addresses

This script uses Chrome DevTools Protocol to intercept network requests
from the Blackhole voting page and extract contract addresses and pool data.
"""

import json
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.desired_capabilities import DesiredCapabilities

def capture_api_calls():
    """Capture API calls from Blackhole voting page"""
    print("="*70)
    print("Capturing Blackhole API Calls")
    print("="*70)
    
    # Enable Chrome DevTools Protocol logging
    caps = DesiredCapabilities.CHROME
    caps['goog:loggingPrefs'] = {'performance': 'ALL'}
    
    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.set_capability('goog:loggingPrefs', {'performance': 'ALL'})
    
    driver = None
    try:
        print("Loading blackhole.xyz/vote...")
        driver = webdriver.Chrome(options=options, desired_capabilities=caps)
        driver.get("https://blackhole.xyz/vote")
        
        print("Waiting for page to load and API calls...")
        time.sleep(15)
        
        # Get performance logs (network requests)
        logs = driver.get_log('performance')
        
        api_calls = []
        contract_addresses = set()
        pool_data_found = []
        
        print(f"\nAnalyzing {len(logs)} log entries...")
        
        for log in logs:
            try:
                log_data = json.loads(log['message'])
                message = log_data.get('message', {})
                method = message.get('method', '')
                
                # Look for network requests
                if method in ['Network.responseReceived', 'Network.requestWillBeSent']:
                    params = message.get('params', {})
                    request = params.get('request', {})
                    response = params.get('response', {})
                    
                    url = request.get('url') or response.get('url', '')
                    
                    # Filter for interesting URLs
                    if any(keyword in url.lower() for keyword in ['api', 'contract', 'pool', 'vote', 'gauge', 'blackhole']):
                        api_calls.append({
                            'url': url,
                            'method': request.get('method', 'GET'),
                            'status': response.get('status')
                        })
                        
                        # Try to get response body for successful API calls
                        if response.get('status') == 200 and 'api' in url.lower():
                            try:
                                response_id = response.get('requestId')
                                # Note: Getting response body requires additional DevTools Protocol calls
                                # For now, we'll note the URL
                                print(f"  Found API call: {url}")
                            except:
                                pass
                
                # Extract contract addresses from log messages
                log_text = str(log)
                import re
                addresses = re.findall(r'0x[a-fA-F0-9]{40}', log_text)
                contract_addresses.update(addresses)
                
            except Exception as e:
                continue
        
        print(f"\n? Found {len(api_calls)} API calls")
        print(f"? Found {len(contract_addresses)} unique contract addresses in logs")
        
        if api_calls:
            print("\nAPI Calls found:")
            for call in api_calls[:10]:
                print(f"  - {call['method']} {call['url']}")
        
        if contract_addresses:
            print("\nContract addresses found:")
            for addr in sorted(contract_addresses):
                print(f"  {addr}")
        
        # Save results
        results = {
            'api_calls': api_calls,
            'contract_addresses': sorted(list(contract_addresses)),
            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
        }
        
        with open('blackhole_api_capture.json', 'w') as f:
            json.dump(results, f, indent=2)
        
        print(f"\n? Results saved to blackhole_api_capture.json")
        
        return results
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        if driver:
            driver.quit()


if __name__ == "__main__":
    capture_api_calls()
