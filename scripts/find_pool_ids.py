#!/usr/bin/env python3
"""
Debug script to find where pool IDs are stored on the Blackhole voting page.
Captures network requests and inspects DOM structure for pool identifiers.
"""

import sys
import json
import time
import re

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.desired_capabilities import DesiredCapabilities
    from bs4 import BeautifulSoup
except ImportError as e:
    print(f"Error: {e}")
    print("Please install required packages: pip install selenium beautifulsoup4")
    sys.exit(1)


def find_pool_ids():
    """Find pool IDs by inspecting network requests and DOM"""
    url = "https://blackhole.xyz/vote"
    
    options = Options()
    options.add_argument('--window-size=1920,1080')
    options.add_argument('user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')
    
    # Enable performance logging to capture network requests
    options.set_capability('goog:loggingPrefs', {'performance': 'ALL'})
    
    driver = None
    try:
        print("Opening browser...")
        driver = webdriver.Chrome(options=options)
        driver.get(url)
        
        print("Waiting for page to load...")
        time.sleep(15)  # Give React time to render and make API calls
        
        print("\n" + "="*80)
        print("1. CAPTURING NETWORK REQUESTS")
        print("="*80)
        
        # Get performance logs (network requests)
        logs = driver.get_log('performance')
        api_calls = []
        pool_data_responses = []
        
        for log in logs:
            try:
                log_data = json.loads(log['message'])
                message = log_data.get('message', {})
                method = message.get('method', '')
                
                # Look for network responses
                if method == 'Network.responseReceived':
                    response = message.get('params', {}).get('response', {})
                    response_url = response.get('url', '')
                    
                    # Check if it's an API call that might contain pool data
                    if any(keyword in response_url.lower() for keyword in ['api', 'pool', 'vote', 'liquidity', 'blackhole', 'json']):
                        if 'blackhole' in response_url.lower() or 'pool' in response_url.lower():
                            api_calls.append({
                                'url': response_url,
                                'status': response.get('status'),
                                'mimeType': response.get('mimeType')
                            })
                
                # Look for response body data
                if method == 'Network.loadingFinished':
                    request_id = message.get('params', {}).get('requestId', '')
                    # Try to get response body (may not always work)
                    try:
                        response_body = driver.execute_cdp_cmd('Network.getResponseBody', {'requestId': request_id})
                        body = response_body.get('body', '')
                        if body and ('pool' in body.lower() or 'liquidity' in body.lower()):
                            try:
                                json_data = json.loads(body)
                                if isinstance(json_data, (dict, list)):
                                    pool_data_responses.append({
                                        'requestId': request_id,
                                        'data': json_data
                                    })
                            except:
                                # Check if it contains pool names/IDs as text
                                if re.search(r'(0x[a-fA-F0-9]{40}|pool|CL200|vAMM)', body):
                                    pool_data_responses.append({
                                        'requestId': request_id,
                                        'preview': body[:500]
                                    })
                    except:
                        pass
            except Exception as e:
                continue
        
        print(f"\nFound {len(api_calls)} potential API calls:")
        for i, call in enumerate(api_calls[:10], 1):
            print(f"  {i}. {call['url']}")
            print(f"     Status: {call['status']}, Type: {call['mimeType']}")
        
        if pool_data_responses:
            print(f"\nFound {len(pool_data_responses)} responses with pool data:")
            for i, resp in enumerate(pool_data_responses[:3], 1):
                print(f"\n  Response {i}:")
                if 'data' in resp:
                    print(f"    Type: JSON data")
                    print(f"    Preview: {str(resp['data'])[:200]}...")
                else:
                    print(f"    Preview: {resp.get('preview', '')[:200]}...")
        
        print("\n" + "="*80)
        print("2. INSPECTING DOM FOR POOL IDENTIFIERS")
        print("="*80)
        
        # Get page source
        page_source = driver.page_source
        soup = BeautifulSoup(page_source, 'html.parser')
        
        # Find all elements with data attributes that might contain pool IDs
        print("\nSearching for data attributes with 'pool' or 'id'...")
        pool_elements = []
        for elem in soup.find_all(True):  # Find all elements
            if hasattr(elem, 'attrs') and elem.attrs:
                if isinstance(elem.attrs, dict):
                    if any(key.startswith('data-') and ('pool' in key.lower() or 'id' in key.lower() or 'address' in key.lower())
                           for key in elem.attrs.keys()):
                        pool_elements.append(elem)
        
        print(f"Found {len(pool_elements)} elements with pool-related data attributes:")
        for i, elem in enumerate(pool_elements[:10], 1):
            attrs = {k: v for k, v in elem.attrs.items() if k.startswith('data-')}
            print(f"  {i}. Tag: {elem.name}, Attributes: {attrs}")
            if elem.text.strip():
                print(f"     Text preview: {elem.text.strip()[:50]}...")
        
        # Look for pool cells specifically
        print("\n\nInspecting pool cell elements...")
        pool_cells = driver.find_elements(By.XPATH, "//div[contains(@class, 'liquidity-pool-cell')]")
        print(f"Found {len(pool_cells)} pool cell elements")
        
        pool_data_samples = []
        for i, cell in enumerate(pool_cells[:5], 1):  # Check first 5 pools
            print(f"\n  Pool {i}:")
            try:
                # Get all attributes
                all_attrs = driver.execute_script("""
                    var elem = arguments[0];
                    var attrs = {};
                    for (var i = 0; i < elem.attributes.length; i++) {
                        attrs[elem.attributes[i].name] = elem.attributes[i].value;
                    }
                    return attrs;
                """, cell)
                
                print(f"    Attributes: {all_attrs}")
                
                # Get pool name
                try:
                    name_elem = cell.find_element(By.XPATH, ".//div[contains(@class, 'name')]")
                    pool_name = name_elem.text.strip()
                    print(f"    Name: {pool_name}")
                except:
                    pool_name = "Unknown"
                
                # Check for pool ID in data attributes
                pool_id = None
                for attr_name, attr_value in all_attrs.items():
                    if 'pool' in attr_name.lower() and ('id' in attr_name.lower() or 'address' in attr_name.lower()):
                        pool_id = attr_value
                        print(f"    Found ID in {attr_name}: {pool_id}")
                
                # Check child elements for IDs
                if not pool_id:
                    try:
                        id_elements = cell.find_elements(By.XPATH, ".//*[@data-pool-id or @data-pool-address or @data-address or @data-id]")
                        for id_elem in id_elements:
                            attrs = driver.execute_script("""
                                var elem = arguments[0];
                                var attrs = {};
                                for (var i = 0; i < elem.attributes.length; i++) {
                                    if (elem.attributes[i].name.startsWith('data-')) {
                                        attrs[elem.attributes[i].name] = elem.attributes[i].value;
                                    }
                                }
                                return attrs;
                            """, id_elem)
                            print(f"    Child element data attrs: {attrs}")
                            for key, val in attrs.items():
                                if 'pool' in key.lower() and ('id' in key.lower() or 'address' in key.lower()):
                                    pool_id = val
                                    print(f"    Found ID in child {key}: {pool_id}")
                    except:
                        pass
                
                # Check innerHTML for IDs (might be in onClick handlers or data structures)
                try:
                    inner_html = cell.get_attribute('innerHTML')
                    # Look for Ethereum addresses (0x followed by 40 hex chars)
                    eth_addresses = re.findall(r'0x[a-fA-F0-9]{40}', inner_html)
                    if eth_addresses:
                        print(f"    Found Ethereum addresses in HTML: {eth_addresses[:3]}")
                    
                    # Look for onClick handlers that might contain pool IDs
                    onclick_patterns = re.findall(r'onClick[^>]*>', inner_html)
                    if onclick_patterns:
                        print(f"    Found onClick handlers: {len(onclick_patterns)}")
                except:
                    pass
                
                pool_data_samples.append({
                    'name': pool_name,
                    'pool_id': pool_id,
                    'attributes': all_attrs
                })
                
            except Exception as e:
                print(f"    Error inspecting pool: {e}")
        
        print("\n" + "="*80)
        print("3. CHECKING JAVASCRIPT WINDOW OBJECT")
        print("="*80)
        
        # Try to access window/React state
        try:
            # Check for common React state variables
            react_states = [
                'window.__APOLLO_STATE__',
                'window.__INITIAL_STATE__',
                'window.__NEXT_DATA__',
                'window.reactAppState',
                'window.appState'
            ]
            
            for state_var in react_states:
                try:
                    state_data = driver.execute_script(f"return typeof {state_var} !== 'undefined' ? {state_var} : null;")
                    if state_data:
                        print(f"\nFound {state_var}:")
                        print(f"  Type: {type(state_data)}")
                        if isinstance(state_data, dict):
                            print(f"  Keys: {list(state_data.keys())[:10]}")
                            # Look for pool-related keys
                            pool_keys = [k for k in state_data.keys() if 'pool' in k.lower()]
                            if pool_keys:
                                print(f"  Pool-related keys: {pool_keys}")
                        print(f"  Preview: {str(state_data)[:300]}...")
                except:
                    pass
        except Exception as e:
            print(f"Error checking window state: {e}")
        
        print("\n" + "="*80)
        print("4. SUMMARY")
        print("="*80)
        
        if pool_data_samples:
            print("\nPool data samples found:")
            for sample in pool_data_samples:
                print(f"  Name: {sample['name']}")
                print(f"  Pool ID: {sample['pool_id'] or 'NOT FOUND'}")
                print()
        
        # Save page source for manual inspection
        output_file = "debug_pool_ids_page_source.html"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(page_source)
        print(f"\nSaved page source to: {output_file}")
        
        print("\n" + "="*80)
        print("NEXT STEPS:")
        print("1. Check the saved HTML file for pool identifiers")
        print("2. Review the API calls listed above")
        print("3. Check browser DevTools Network tab manually for pool data")
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
    find_pool_ids()
