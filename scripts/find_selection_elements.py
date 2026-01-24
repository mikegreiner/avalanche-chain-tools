#!/usr/bin/env python3
"""
Find the actual pool selection elements (likely clickable divs, not checkboxes).
"""

import sys
import time

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
except ImportError as e:
    print(f"Error: {e}")
    sys.exit(1)


def find_selection_elements():
    """Find pool selection elements"""
    url = "https://blackhole.xyz/vote"
    
    options = Options()
    options.add_argument('--window-size=1920,1080')
    options.add_argument('user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')
    
    driver = None
    try:
        print("Opening browser...")
        driver = webdriver.Chrome(options=options)
        driver.get(url)
        
        print("Waiting for page to load...")
        time.sleep(15)
        
        print("\n" + "="*80)
        print("FINDING POOL SELECTION ELEMENTS")
        print("="*80)
        
        # Find pool cells
        pool_cells = driver.find_elements(By.XPATH, "//div[contains(@class, 'liquidity-pool-cell')]")
        print(f"\nFound {len(pool_cells)} pool cells")
        
        if pool_cells:
            # Inspect first pool cell
            first_cell = pool_cells[0]
            
            # Get pool name
            try:
                name_elem = first_cell.find_element(By.XPATH, ".//div[contains(@class, 'name')]")
                pool_name = name_elem.text.strip()
                print(f"\nFirst pool: {pool_name}")
            except:
                pool_name = "Unknown"
            
            # Find all clickable elements within the cell
            print("\nLooking for clickable elements...")
            
            # Check for elements with click handlers
            clickable_elements = driver.execute_script("""
                var cell = arguments[0];
                var clickables = [];
                
                // Find all elements with onclick, onClick, or cursor:pointer
                var allElements = cell.querySelectorAll('*');
                for (var i = 0; i < allElements.length; i++) {
                    var elem = allElements[i];
                    var style = window.getComputedStyle(elem);
                    var hasClick = elem.onclick || elem.onClick || 
                                   style.cursor === 'pointer' ||
                                   elem.getAttribute('role') === 'button' ||
                                   elem.tagName === 'BUTTON';
                    
                    if (hasClick || elem.onclick) {
                        clickables.push({
                            tag: elem.tagName,
                            class: elem.className,
                            id: elem.id,
                            text: elem.textContent.substring(0, 50),
                            cursor: style.cursor,
                            role: elem.getAttribute('role'),
                            hasOnClick: !!elem.onclick
                        });
                    }
                }
                
                return clickables;
            """, first_cell)
            
            print(f"Found {len(clickable_elements)} potentially clickable elements:")
            for i, elem in enumerate(clickable_elements[:10], 1):
                print(f"\n  {i}. Tag: {elem['tag']}")
                print(f"     Class: {elem['class']}")
                print(f"     ID: {elem['id']}")
                print(f"     Text: {elem['text'][:50]}...")
                print(f"     Cursor: {elem['cursor']}")
                print(f"     Role: {elem['role']}")
            
            # Try to find elements that might be selection indicators
            print("\n\nLooking for selection indicators (checked, selected classes)...")
            selected_indicators = driver.execute_script("""
                var cell = arguments[0];
                var indicators = [];
                var allElements = cell.querySelectorAll('*');
                
                for (var i = 0; i < allElements.length; i++) {
                    var elem = allElements[i];
                    var className = elem.className || '';
                    var classList = className.split(' ');
                    
                    if (classList.some(c => 
                        c.toLowerCase().includes('select') ||
                        c.toLowerCase().includes('check') ||
                        c.toLowerCase().includes('active') ||
                        c.toLowerCase().includes('chosen')
                    )) {
                        indicators.push({
                            tag: elem.tagName,
                            class: className,
                            id: elem.id,
                            text: elem.textContent.substring(0, 50)
                        });
                    }
                }
                
                return indicators;
            """, first_cell)
            
            print(f"Found {len(selected_indicators)} elements with selection-related classes:")
            for i, elem in enumerate(selected_indicators[:5], 1):
                print(f"  {i}. {elem['tag']} - {elem['class']}")
            
            # Try clicking the cell itself
            print("\n\nTesting clicking the pool cell itself...")
            try:
                # Get state before
                before_classes = first_cell.get_attribute('class')
                print(f"  Cell classes before: {before_classes}")
                
                # Click it
                driver.execute_script("arguments[0].click();", first_cell)
                time.sleep(2)
                
                # Get state after
                after_classes = first_cell.get_attribute('class')
                print(f"  Cell classes after: {after_classes}")
                
                if before_classes != after_classes:
                    print("  ? Cell classes changed - likely the selection element!")
                else:
                    print("  ? Cell classes unchanged")
                
                # Check if any child elements changed
                changed_elements = driver.execute_script("""
                    var cell = arguments[0];
                    var allElements = cell.querySelectorAll('*');
                    var changed = [];
                    
                    for (var i = 0; i < allElements.length; i++) {
                        var elem = allElements[i];
                        var className = elem.className || '';
                        if (className.includes('select') || className.includes('check') || 
                            className.includes('active') || className.includes('chosen')) {
                            changed.push({
                                tag: elem.tagName,
                                class: className,
                                text: elem.textContent.substring(0, 30)
                            });
                        }
                    }
                    
                    return changed;
                """, first_cell)
                
                if changed_elements:
                    print(f"  Found {len(changed_elements)} elements with selection classes:")
                    for elem in changed_elements[:3]:
                        print(f"    - {elem['tag']}: {elem['class']}")
                
            except Exception as e:
                print(f"  Error: {e}")
            
            # Look for React state
            print("\n\nChecking for React component state...")
            try:
                # Try to find React Fiber node
                react_info = driver.execute_script("""
                    var cell = arguments[0];
                    var key = Object.keys(cell).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
                    if (key) {
                        var fiber = cell[key];
                        var props = {};
                        var state = {};
                        
                        // Try to get props
                        if (fiber && fiber.memoizedProps) {
                            props = fiber.memoizedProps;
                        }
                        
                        // Try to get state
                        if (fiber && fiber.memoizedState) {
                            state = fiber.memoizedState;
                        }
                        
                        return {
                            found: true,
                            props_keys: Object.keys(props),
                            state_keys: Object.keys(state),
                            props_preview: JSON.stringify(props).substring(0, 200),
                            state_preview: JSON.stringify(state).substring(0, 200)
                        };
                    }
                    return {found: false};
                """, first_cell)
                
                if react_info.get('found'):
                    print("  ? Found React Fiber node!")
                    print(f"  Props keys: {react_info.get('props_keys', [])}")
                    print(f"  State keys: {react_info.get('state_keys', [])}")
                    print(f"  Props preview: {react_info.get('props_preview', '')}")
                else:
                    print("  ? No React Fiber node found")
            except Exception as e:
                print(f"  Error checking React state: {e}")
        
        print("\n" + "="*80)
        print("RECOMMENDATION")
        print("="*80)
        print("\nIf clicking the pool cell changes its classes or state:")
        print("1. We can programmatically click pool cells by finding them via pool address")
        print("2. We can create a bookmarklet or browser extension to auto-select pools")
        print("3. We can use Selenium to click elements, but you'd need MetaMask in that browser")
        print("\nSince MetaMask doesn't work in Selenium, the best approach might be:")
        print("- Generate a script that can be run in the browser console")
        print("- Or create a bookmarklet that selects pools when clicked")
        print("="*80)
        
        input("\nPress Enter to close the browser...")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if driver:
            driver.quit()


if __name__ == "__main__":
    find_selection_elements()
