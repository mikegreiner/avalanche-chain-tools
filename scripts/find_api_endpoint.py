#!/usr/bin/env python3
"""
Network inspector to find API endpoints used by Blackhole DEX vote page
"""

import json
import time
import sys

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
except ImportError:
    print("Error: Selenium not installed. Install with: pip install selenium")
    sys.exit(1)


def intercept_network_requests():
    """Use Chrome DevTools to intercept network requests"""
    print("Setting up Chrome with network logging...")
    
    options = Options()
    options.add_argument('--window-size=1920,1080')
    options.add_argument('user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')
    options.set_capability('goog:loggingPrefs', {'performance': 'ALL'})
    
    driver = None
    try:
        driver = webdriver.Chrome(options=options)
        print("Loading https://blackhole.xyz/vote...")
        driver.get("https://blackhole.xyz/vote")
        
        print("Waiting for page to load and network requests to complete...")
        time.sleep(10)  # Give time for all requests
        
        # Get performance logs
        logs = driver.get_log('performance')
        
        print("\n" + "="*80)
        print("NETWORK REQUESTS FOUND:")
        print("="*80)
        
        api_endpoints = []
        graphql_endpoints = []
        json_responses = []
        
        for log in logs:
            try:
                message = json.loads(log['message'])
                message_type = message.get('message', {}).get('method', '')
                
                if message_type == 'Network.responseReceived':
                    response = message.get('message', {}).get('params', {}).get('response', {})
                    url = response.get('url', '')
                    mime_type = response.get('mimeType', '')
                    
                    # Look for API endpoints
                    if any(keyword in url.lower() for keyword in ['api', 'graphql', 'rpc', 'subgraph']):
                        if 'graphql' in url.lower():
                            graphql_endpoints.append(url)
                        else:
                            api_endpoints.append(url)
                        print(f"\n[API Request] {url}")
                        print(f"  MIME Type: {mime_type}")
                        print(f"  Status: {response.get('status', 'N/A')}")
                    
                    # Look for JSON responses
                    if 'json' in mime_type.lower() and any(keyword in url.lower() for keyword in ['pool', 'vote', 'reward', 'liquidity']):
                        request_id = message.get('message', {}).get('params', {}).get('requestId', '')
                        json_responses.append((url, request_id))
                        print(f"\n[JSON Response] {url}")
                
                elif message_type == 'Network.responseReceivedExtraInfo':
                    headers = message.get('message', {}).get('params', {}).get('headers', {})
                    url = message.get('message', {}).get('params', {}).get('response', {}).get('url', '')
                    if any(keyword in url.lower() for keyword in ['api', 'graphql', 'pool', 'vote']):
                        print(f"\n[Headers] {url}")
                        for key, value in headers.items():
                            if key.lower() in ['content-type', 'authorization']:
                                print(f"  {key}: {value}")
            
            except Exception as e:
                continue
        
        # Try to get response bodies for interesting endpoints
        print("\n" + "="*80)
        print("ATTEMPTING TO FETCH RESPONSE BODIES:")
        print("="*80)
        
        # Collect unique endpoints
        all_endpoints = list(set(api_endpoints + graphql_endpoints))
        
        for url in all_endpoints[:10]:  # Limit to first 10
            try:
                print(f"\nTrying: {url}")
                # Use requests to fetch
                import requests
                headers = {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'Referer': 'https://blackhole.xyz/vote'
                }
                response = requests.get(url, headers=headers, timeout=10)
                if response.status_code == 200:
                    try:
                        data = response.json()
                        print(f"  Status: {response.status_code}")
                        print(f"  Response preview: {str(data)[:200]}...")
                        
                        # Check if this looks like pool data
                        response_str = json.dumps(data)
                        if any(keyword in response_str.lower() for keyword in ['pool', 'reward', 'vapr', 'vote']):
                            print(f"  ✓ This looks like pool data!")
                            # Save it
                            filename = url.split('/')[-1].split('?')[0] or 'api_response'
                            filename = filename.replace(':', '_').replace('/', '_')
                            with open(f'api_response_{filename}.json', 'w') as f:
                                json.dump(data, f, indent=2)
                            print(f"  Saved to: api_response_{filename}.json")
                    except:
                        print(f"  Status: {response.status_code}")
                        print(f"  Response (text): {response.text[:200]}...")
            except Exception as e:
                print(f"  Error: {e}")
        
        print("\n" + "="*80)
        print("SUMMARY:")
        print("="*80)
        print(f"Found {len(api_endpoints)} API endpoints")
        print(f"Found {len(graphql_endpoints)} GraphQL endpoints")
        print(f"Found {len(json_responses)} JSON responses")
        
        if all_endpoints:
            print("\nMost promising endpoints:")
            for endpoint in list(all_endpoints)[:5]:
                print(f"  - {endpoint}")
        else:
            print("\nNo obvious API endpoints found in network logs.")
            print("Trying alternative method: examining page source for embedded data...")
            
            # Check page source for embedded JSON
            page_source = driver.page_source
            import re
            # Look for JSON objects in script tags or data attributes
            json_patterns = [
                r'window\.__INITIAL_STATE__\s*=\s*({.+?});',
                r'window\.__APOLLO_STATE__\s*=\s*({.+?});',
                r'__NEXT_DATA__\s*=\s*({.+?})</script>',
                r'"pools"\s*:\s*(\[.+?\])',
                r'pools:\s*(\[.+?\])',
            ]
            
            for pattern in json_patterns:
                matches = re.findall(pattern, page_source, re.DOTALL)
                if matches:
                    print(f"\nFound potential embedded data with pattern: {pattern[:50]}...")
                    for i, match in enumerate(matches[:2]):
                        try:
                            data = json.loads(match)
                            print(f"  Match {i+1}: {str(data)[:200]}...")
                        except:
                            print(f"  Match {i+1}: (not valid JSON)")
        
        input("\nPress Enter to close browser...")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if driver:
            driver.quit()


if __name__ == "__main__":
    intercept_network_requests()
