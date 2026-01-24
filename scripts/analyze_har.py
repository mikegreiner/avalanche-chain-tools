#!/usr/bin/env python3
"""
Analyze HAR file to understand pool selection mechanism
"""

import json
import sys

def analyze_har(har_file):
    """Analyze HAR file for pool selection activity"""
    with open(har_file, 'r') as f:
        har_data = json.load(f)
    
    entries = har_data.get('log', {}).get('entries', [])
    
    print("="*80)
    print("HAR FILE ANALYSIS - Pool Selection")
    print("="*80)
    print(f"\nTotal entries: {len(entries)}\n")
    
    # Group entries by type
    api_calls = []
    xhr_calls = []
    fetch_calls = []
    websocket_calls = []
    other_interesting = []
    
    for entry in entries:
        request = entry.get('request', {})
        response = entry.get('response', {})
        url = request.get('url', '')
        method = request.get('method', '')
        mime_type = response.get('content', {}).get('mimeType', '')
        
        # Look for API calls
        if any(keyword in url.lower() for keyword in ['api', 'pool', 'vote', 'select', 'blackhole']):
            api_calls.append({
                'url': url,
                'method': method,
                'status': response.get('status'),
                'mimeType': mime_type,
                'timestamp': entry.get('startedDateTime')
            })
        
        # Look for XHR/Fetch calls
        if entry.get('_resourceType') in ['xhr', 'fetch']:
            if 'xhr' in entry.get('_resourceType', ''):
                xhr_calls.append({
                    'url': url,
                    'method': method,
                    'status': response.get('status'),
                    'timestamp': entry.get('startedDateTime')
                })
            else:
                fetch_calls.append({
                    'url': url,
                    'method': method,
                    'status': response.get('status'),
                    'timestamp': entry.get('startedDateTime')
                })
        
        # Look for WebSocket
        if entry.get('_resourceType') == 'websocket':
            websocket_calls.append({
                'url': url,
                'timestamp': entry.get('startedDateTime')
            })
        
        # Look for POST/PUT/PATCH requests (state changes)
        if method in ['POST', 'PUT', 'PATCH']:
            other_interesting.append({
                'url': url,
                'method': method,
                'status': response.get('status'),
                'timestamp': entry.get('startedDateTime')
            })
    
    print("1. API CALLS (containing 'api', 'pool', 'vote', 'select', 'blackhole'):")
    print("-" * 80)
    for i, call in enumerate(api_calls, 1):
        print(f"\n{i}. {call['method']} {call['url']}")
        print(f"   Status: {call['status']}, Type: {call['mimeType']}")
        print(f"   Time: {call['timestamp']}")
    
    print("\n\n2. XHR CALLS:")
    print("-" * 80)
    for i, call in enumerate(xhr_calls, 1):
        print(f"\n{i}. {call['method']} {call['url']}")
        print(f"   Status: {call['status']}")
        print(f"   Time: {call['timestamp']}")
    
    print("\n\n3. FETCH CALLS:")
    print("-" * 80)
    for i, call in enumerate(fetch_calls, 1):
        print(f"\n{i}. {call['method']} {call['url']}")
        print(f"   Status: {call['status']}")
        print(f"   Time: {call['timestamp']}")
    
    print("\n\n4. WEBSOCKET CONNECTIONS:")
    print("-" * 80)
    for i, call in enumerate(websocket_calls, 1):
        print(f"\n{i}. {call['url']}")
        print(f"   Time: {call['timestamp']}")
    
    print("\n\n5. POST/PUT/PATCH REQUESTS (potential state changes):")
    print("-" * 80)
    for i, call in enumerate(other_interesting, 1):
        print(f"\n{i}. {call['method']} {call['url']}")
        print(f"   Status: {call['status']}")
        print(f"   Time: {call['timestamp']}")
    
    # Now let's look at request/response bodies for interesting calls
    print("\n\n" + "="*80)
    print("DETAILED REQUEST/RESPONSE ANALYSIS")
    print("="*80)
    
    # Look for entries with request bodies (POST/PUT) or interesting responses
    for entry in entries:
        request = entry.get('request', {})
        response = entry.get('response', {})
        url = request.get('url', '')
        method = request.get('method', '')
        
        # Check if this looks like a pool selection API call
        if method in ['POST', 'PUT', 'PATCH'] or 'pool' in url.lower() or 'select' in url.lower():
            post_data = request.get('postData', {})
            response_content = response.get('content', {})
            
            if post_data.get('text') or response_content.get('text'):
                print(f"\n{'='*80}")
                print(f"Entry: {method} {url}")
                print(f"{'='*80}")
                
                if post_data.get('text'):
                    print("\nREQUEST BODY:")
                    try:
                        request_text = post_data.get('text', '')
                        if len(request_text) > 1000:
                            print(request_text[:1000] + "...")
                        else:
                            print(request_text)
                    except:
                        print("(Could not decode request body)")
                
                if response_content.get('text'):
                    print("\nRESPONSE BODY:")
                    try:
                        response_text = response_content.get('text', '')
                        # Try to parse as JSON
                        try:
                            response_json = json.loads(response_text)
                            print(json.dumps(response_json, indent=2)[:2000])
                        except:
                            if len(response_text) > 1000:
                                print(response_text[:1000] + "...")
                            else:
                                print(response_text)
                    except:
                        print("(Could not decode response body)")
                
                # Check headers
                request_headers = request.get('headers', [])
                response_headers = response.get('headers', [])
                
                if request_headers:
                    print("\nREQUEST HEADERS:")
                    for header in request_headers[:10]:
                        print(f"  {header.get('name')}: {header.get('value')}")
                
                if response_headers:
                    print("\nRESPONSE HEADERS:")
                    for header in response_headers[:10]:
                        print(f"  {header.get('name')}: {header.get('value')}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 analyze_har.py <har_file>")
        sys.exit(1)
    
    analyze_har(sys.argv[1])
