#!/usr/bin/env python3
"""
Debug script to understand how pool selection works on Blackhole voting page.
Inspects network requests, localStorage, sessionStorage, and JavaScript state.
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
    from bs4 import BeautifulSoup
except ImportError as e:
    print(f"Error: {e}")
    print("Please install required packages: pip install selenium beautifulsoup4")
    sys.exit(1)


def inspect_pool_selection():
    """Inspect how pool selection works"""
    url = "https://blackhole.xyz/vote"
    
    options = Options()
    options.add_argument('--window-size=1920,1080')
    options.add_argument('user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')
    options.set_capability('goog:loggingPrefs', {'performance': 'ALL'})
    
    driver = None
    try:
        print("Opening browser...")
        driver = webdriver.Chrome(options=options)
        driver.get(url)
        
        print("Waiting for page to load...")
        time.sleep(15)  # Give React time to render
        
        print("\n" + "="*80)
        print("1. CAPTURING NETWORK REQUESTS")
        print("="*80)
        
        # Get performance logs (network requests)
        logs = driver.get_log('performance')
        api_responses = []
        
        for log in logs:
            try:
                log_data = json.loads(log['message'])
                message = log_data.get('message', {})
                method = message.get('method', '')
                
                # Look for network responses
                if method == 'Network.responseReceived':
                    response = message.get('params', {}).get('response', {})
                    response_url = response.get('url', '')
                    
                    # Focus on the drpc.org API calls and token-details.json
                    if 'drpc.org' in response_url or 'token-details.json' in response_url:
                        request_id = message.get('params', {}).get('requestId', '')
                        try:
                            # Try to get response body
                            response_body = driver.execute_cdp_cmd('Network.getResponseBody', {'requestId': request_id})
                            body = response_body.get('body', '')
                            if body:
                                try:
                                    json_data = json.loads(body)
                                    api_responses.append({
                                        'url': response_url,
                                        'status': response.get('status'),
                                        'data': json_data
                                    })
                                except:
                                    api_responses.append({
                                        'url': response_url,
                                        'status': response.get('status'),
                                        'body_preview': body[:500]
                                    })
                        except Exception as e:
                            api_responses.append({
                                'url': response_url,
                                'status': response.get('status'),
                                'error': str(e)
                            })
            except:
                continue
        
        print(f"\nFound {len(api_responses)} relevant API responses:")
        for i, resp in enumerate(api_responses, 1):
            print(f"\n  {i}. URL: {resp['url']}")
            print(f"     Status: {resp.get('status', 'N/A')}")
            if 'data' in resp:
                print(f"     Type: JSON")
                if isinstance(resp['data'], dict):
                    print(f"     Keys: {list(resp['data'].keys())[:10]}")
                elif isinstance(resp['data'], list):
                    print(f"     List length: {len(resp['data'])}")
                    if resp['data']:
                        print(f"     First item keys: {list(resp['data'][0].keys())[:10] if isinstance(resp['data'][0], dict) else 'N/A'}")
                print(f"     Preview: {str(resp['data'])[:300]}...")
            elif 'body_preview' in resp:
                print(f"     Preview: {resp['body_preview']}...")
        
        print("\n" + "="*80)
        print("2. CHECKING LOCALSTORAGE AND SESSIONSTORAGE")
        print("="*80)
        
        # Check localStorage
        try:
            local_storage = driver.execute_script("return Object.keys(localStorage).reduce((obj, key) => { obj[key] = localStorage.getItem(key); return obj; }, {});")
            if local_storage:
                print("\nLocalStorage:")
                for key, value in local_storage.items():
                    if 'pool' in key.lower() or 'select' in key.lower() or 'vote' in key.lower():
                        print(f"  {key}: {value[:200]}...")
            else:
                print("\nLocalStorage: (empty)")
        except Exception as e:
            print(f"\nLocalStorage: Error - {e}")
        
        # Check sessionStorage
        try:
            session_storage = driver.execute_script("return Object.keys(sessionStorage).reduce((obj, key) => { obj[key] = sessionStorage.getItem(key); return obj; }, {});")
            if session_storage:
                print("\nSessionStorage:")
                for key, value in session_storage.items():
                    if 'pool' in key.lower() or 'select' in key.lower() or 'vote' in key.lower():
                        print(f"  {key}: {value[:200]}...")
            else:
                print("\nSessionStorage: (empty)")
        except Exception as e:
            print(f"\nSessionStorage: Error - {e}")
        
        print("\n" + "="*80)
        print("3. INSPECTING POOL CHECKBOXES")
        print("="*80)
        
        # Find pool checkboxes
        try:
            checkboxes = driver.find_elements(By.XPATH, "//input[@type='checkbox']")
            print(f"\nFound {len(checkboxes)} checkboxes on the page")
            
            pool_checkboxes = []
            for i, checkbox in enumerate(checkboxes[:10], 1):  # Check first 10
                try:
                    # Get parent element to find pool info
                    parent = checkbox.find_element(By.XPATH, "./ancestor::div[contains(@class, 'liquidity-pool-cell')]")
                    if parent:
                        # Try to get pool name
                        try:
                            name_elem = parent.find_element(By.XPATH, ".//div[contains(@class, 'name')]")
                            pool_name = name_elem.text.strip()
                        except:
                            pool_name = "Unknown"
                        
                        # Get checkbox attributes
                        checkbox_id = checkbox.get_attribute('id')
                        checkbox_name = checkbox.get_attribute('name')
                        checkbox_value = checkbox.get_attribute('value')
                        checkbox_class = checkbox.get_attribute('class')
                        
                        # Get onclick or other event handlers
                        onclick = checkbox.get_attribute('onclick')
                        data_attrs = {}
                        for attr in ['data-pool-id', 'data-pool-address', 'data-address', 'data-id', 'data-pool']:
                            val = checkbox.get_attribute(attr)
                            if val:
                                data_attrs[attr] = val
                        
                        pool_checkboxes.append({
                            'name': pool_name,
                            'id': checkbox_id,
                            'name_attr': checkbox_name,
                            'value': checkbox_value,
                            'class': checkbox_class,
                            'onclick': onclick,
                            'data_attrs': data_attrs
                        })
                        
                        print(f"\n  Checkbox {i}:")
                        print(f"    Pool: {pool_name}")
                        print(f"    ID: {checkbox_id}")
                        print(f"    Name: {checkbox_name}")
                        print(f"    Value: {checkbox_value}")
                        print(f"    Class: {checkbox_class}")
                        print(f"    Data attrs: {data_attrs}")
                        if onclick:
                            print(f"    OnClick: {onclick[:200]}...")
                except:
                    continue
        except Exception as e:
            print(f"Error finding checkboxes: {e}")
        
        print("\n" + "="*80)
        print("4. TESTING POOL SELECTION")
        print("="*80)
        
        # Try to click a checkbox and see what happens
        if pool_checkboxes:
            print("\nAttempting to click first checkbox and monitor state changes...")
            try:
                # Get the checkbox element again
                checkboxes = driver.find_elements(By.XPATH, "//input[@type='checkbox']")
                if checkboxes:
                    checkbox = checkboxes[0]
                    
                    # Check state before clicking
                    is_selected_before = checkbox.is_selected()
                    print(f"  Checkbox selected before: {is_selected_before}")
                    
                    # Click it
                    driver.execute_script("arguments[0].click();", checkbox)
                    time.sleep(2)
                    
                    # Check state after clicking
                    is_selected_after = checkbox.is_selected()
                    print(f"  Checkbox selected after: {is_selected_after}")
                    
                    # Check if URL changed
                    current_url = driver.current_url
                    print(f"  URL after click: {current_url}")
                    
                    # Check localStorage/sessionStorage again
                    try:
                        local_storage_after = driver.execute_script("return Object.keys(localStorage).reduce((obj, key) => { obj[key] = localStorage.getItem(key); return obj; }, {});")
                        for key, value in local_storage_after.items():
                            if key not in local_storage or local_storage[key] != value:
                                print(f"  LocalStorage changed: {key} = {value[:200]}...")
                    except:
                        pass
                    
                    try:
                        session_storage_after = driver.execute_script("return Object.keys(sessionStorage).reduce((obj, key) => { obj[key] = sessionStorage.getItem(key); return obj; }, {});")
                        for key, value in session_storage_after.items():
                            if key not in session_storage or session_storage[key] != value:
                                print(f"  SessionStorage changed: {key} = {value[:200]}...")
                    except:
                        pass
                    
                    # Try to find React state
                    try:
                        # Common React state locations
                        react_state_vars = [
                            'window.__REACT_DEVTOOLS_GLOBAL_HOOK__',
                            'window.__APOLLO_STATE__',
                            'window.__REDUX_DEVTOOLS_EXTENSION__',
                        ]
                        for var in react_state_vars:
                            exists = driver.execute_script(f"return typeof {var} !== 'undefined';")
                            if exists:
                                print(f"  Found React DevTools hook: {var}")
                    except:
                        pass
                    
            except Exception as e:
                print(f"  Error during test click: {e}")
        
        print("\n" + "="*80)
        print("5. LOOKING FOR POOL SELECTION HANDLERS")
        print("="*80)
        
        # Try to find event listeners or handlers
        try:
            checkboxes = driver.find_elements(By.XPATH, "//input[@type='checkbox']")
            if checkboxes:
                checkbox = checkboxes[0]
                # Try to get event listeners (might not work in all browsers)
                listeners = driver.execute_script("""
                    var elem = arguments[0];
                    var listeners = [];
                    if (elem.onclick) listeners.push('onclick');
                    if (elem.onchange) listeners.push('onchange');
                    // Try to get React Fiber node
                    var key = Object.keys(elem).find(k => k.startsWith('__reactFiber'));
                    if (key) {
                        var fiber = elem[key];
                        if (fiber && fiber.memoizedProps) {
                            listeners.push('React Fiber found');
                        }
                    }
                    return listeners;
                """, checkbox)
                print(f"  Event listeners on checkbox: {listeners}")
        except Exception as e:
            print(f"  Error checking event listeners: {e}")
        
        print("\n" + "="*80)
        print("SUMMARY")
        print("="*80)
        print("\nBased on the investigation:")
        print("1. Check if pool selection is stored in React state (component state)")
        print("2. Check if selection triggers API calls")
        print("3. Check if we can inject JavaScript to select pools programmatically")
        print("4. The selection might be client-side only until vote is submitted")
        print("\n" + "="*80)
        
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
    inspect_pool_selection()
