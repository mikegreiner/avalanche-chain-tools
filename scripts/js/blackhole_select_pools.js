// Auto-select pools on Blackhole voting page
// Generated for 10 pool(s)
// Run this script in the browser console (F12) while on https://blackhole.xyz/vote

(async function() {
    const poolAddresses = ["0x9A6142eF0766915dB02066f791D969C22eba1dcA", "0x5E128EbC09C918DDAE3Ca1668d4EE9527dc00D78", "0xedCFA2d80cf06FB7642E956a1e95DBC37c75995b", "0xA02Ec3Ba8d17887567672b2CDCAF525534636Ea0", "0xeE2Ceda742bfb2ef566aB57642D47aBA1909B653", "0x668Aa7AEfa8512416Fc6244afBE5129200277A69", "0x1c9BC0a5705288A798a5dcE908398FCB68Ee09EA", "0x78F5A53731564894A7e4FfF827a88E5FbF9cfCb6", "0xC13Fd9599F0bEDd2dA2C307f35bC03ba54a64332", "0x1ABe428146795BC754170AF24CFd78663f257D29"];
    const poolInfo = {"0x9A6142eF0766915dB02066f791D969C22eba1dcA": "CL200-WAVAX/BLACK", "0x5E128EbC09C918DDAE3Ca1668d4EE9527dc00D78": "CL200-WETH.e/WAVAX", "0xedCFA2d80cf06FB7642E956a1e95DBC37c75995b": "sAMM-CROC/WAVAX", "0xA02Ec3Ba8d17887567672b2CDCAF525534636Ea0": "CL1-WAVAX/USDC", "0xeE2Ceda742bfb2ef566aB57642D47aBA1909B653": "CL1-sAVAX/WAVAX", "0x668Aa7AEfa8512416Fc6244afBE5129200277A69": "CL50-WAVAX/USDC", "0x1c9BC0a5705288A798a5dcE908398FCB68Ee09EA": "CL1-USDC/GSCORE", "0x78F5A53731564894A7e4FfF827a88E5FbF9cfCb6": "vAMM-GCROC/WAVAX", "0xC13Fd9599F0bEDd2dA2C307f35bC03ba54a64332": "CL200-USDt/WAVAX", "0x1ABe428146795BC754170AF24CFd78663f257D29": "CL200-WETH.e/USDt"};
    
    console.log('Looking for pools to select...');
    let selectedCount = 0;
    let notFoundCount = 0;
    
    // Wait for page to be fully loaded and React to finish rendering
    function waitForPools(maxWait = 5000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkPools = () => {
                const cells = document.querySelectorAll('div.liquidity-pool-cell');
                if (cells.length > 0 || Date.now() - startTime > maxWait) {
                    resolve();
                } else {
                    setTimeout(checkPools, 100);
                }
            };
            checkPools();
        });
    }
    
    // Wait a bit for React to finish rendering (synchronous wait using setTimeout)
    // We'll do the actual waiting in the loop below
    
    // Find all pool cells (including hidden ones)
    // Use querySelectorAll to get all pools, even if they're hidden
    const poolCells = document.querySelectorAll('div.liquidity-pool-cell');
    console.log('Found ' + poolCells.length + ' pool cells on the page (including hidden)');
    
    // Diagnostic: Check for hidden pools and different sections
    let visibleCount = 0;
    let hiddenCount = 0;
    const poolSections = {};
    
    poolCells.forEach((cell, idx) => {
        const style = window.getComputedStyle(cell);
        const isVisible = style.display !== 'none' && 
                         style.visibility !== 'hidden' && 
                         style.opacity !== '0' &&
                         cell.offsetParent !== null;
        
        if (isVisible) {
            visibleCount++;
        } else {
            hiddenCount++;
        }
        
        // Check which container/section this pool is in
        let container = cell.closest('[class*="section"], [class*="container"], [class*="list"], [class*="grid"]');
        const containerClass = container ? container.className : 'unknown';
        if (!poolSections[containerClass]) {
            poolSections[containerClass] = {visible: 0, hidden: 0};
        }
        if (isVisible) {
            poolSections[containerClass].visible++;
        } else {
            poolSections[containerClass].hidden++;
        }
    });
    
    console.log('Pool visibility: ' + visibleCount + ' visible, ' + hiddenCount + ' hidden');
    if (Object.keys(poolSections).length > 1) {
        console.log('Pools found in multiple sections:', poolSections);
    }
    
    // Check for search/filter inputs that might be hiding pools
    const searchInputs = document.querySelectorAll('input[type="text"], input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]');
    if (searchInputs.length > 0) {
        console.log('Found ' + searchInputs.length + ' potential search/filter input(s)');
        searchInputs.forEach((input, idx) => {
            if (input.value) {
                console.warn('  Input ' + idx + ' has value: "' + input.value + '" - this might be filtering pools!');
            }
        });
    }
    
    // Helper function to check if an element is visible (including checking parents)
    function isElementVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
        }
        if (element.offsetParent === null && style.position !== 'fixed') {
            return false;
        }
        // Check parent visibility
        const parent = element.parentElement;
        if (parent && parent !== document.body) {
            return isElementVisible(parent);
        }
        return true;
    }
    
    // Helper function to make an element visible if it's hidden
    function ensureElementVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none') {
            element.style.display = '';
        }
        if (style.visibility === 'hidden') {
            element.style.visibility = '';
        }
        // Scroll element into view
        try {
            element.scrollIntoView({behavior: 'smooth', block: 'center'});
        } catch (e) {
            // Fallback for older browsers
            element.scrollIntoView();
        }
        return true;
    }
    
    // Wait for pools to be available
    await waitForPools();
    
    // Re-query pool cells after waiting (in case they were added dynamically)
    let allPoolCells = document.querySelectorAll('div.liquidity-pool-cell');
    console.log('After waiting, found ' + allPoolCells.length + ' pool cells');
    
    // Diagnostic: Log all pool names and addresses we can find
    console.log('\n=== POOL DIAGNOSTICS ===');
    const foundPools = [];
    allPoolCells.forEach((cell, idx) => {
            const cellText = cell.innerText || '';
            const cellHTML = cell.innerHTML || '';
            // Try to extract pool name (usually in a div with class containing "name")
            const nameElem = cell.querySelector('[class*="name" i], [class*="title" i]');
            const poolName = nameElem ? (nameElem.innerText || nameElem.textContent || '').trim() : 'Unknown';
            
            // Try to find address in the cell
            let foundAddress = null;
            for (let addr of poolAddresses) {
                if (cellHTML.toLowerCase().includes(addr.toLowerCase()) || cellText.toLowerCase().includes(addr.toLowerCase())) {
                    foundAddress = addr;
                    break;
                }
            }
            
            const isVisible = isElementVisible(cell);
            foundPools.push({
                index: idx,
                name: poolName.substring(0, 50),
                address: foundAddress || 'Not found',
                visible: isVisible,
                display: window.getComputedStyle(cell).display,
                visibility: window.getComputedStyle(cell).visibility
            });
    });
    
    console.log('All pools on page:');
    foundPools.forEach(p => {
        console.log('  [' + (p.visible ? 'VISIBLE' : 'HIDDEN') + '] ' + p.name + ' - ' + (p.address !== 'Not found' ? p.address : 'No address match'));
    });
    
    // Check which target pools are present
    console.log('\nTarget pools to select:');
    poolAddresses.forEach(addr => {
        const poolName = poolInfo[addr] || 'Unknown';
        const found = foundPools.some(p => p.address === addr);
        console.log('  ' + (found ? '✓' : '✗') + ' ' + poolName + ' (' + addr + ')');
    });
    console.log('========================\n');
    
    // Use for...of loop instead of forEach to support async/await
    for (let index = 0; index < poolAddresses.length; index++) {
        const address = poolAddresses[index];
        let found = false;
        
        // Try multiple strategies to find the pool by address
        // Strategy 1: Look for the address in the cell's innerHTML (case-insensitive)
        // IMPORTANT: Search ALL pool cells, including hidden ones
        const addressLower = address.toLowerCase();
        for (let cell of allPoolCells) {
            const innerHTML = (cell.innerHTML || '').toLowerCase();
            const innerText = (cell.innerText || '').toLowerCase();
            
            // Check if this cell contains the pool address (case-insensitive)
            if (innerHTML.includes(addressLower) || innerText.includes(addressLower) ||
                innerHTML.includes(address) || innerText.includes(address)) {
                
                // Make sure the pool is visible before trying to click
                const wasHidden = !isElementVisible(cell);
                if (wasHidden) {
                    console.log('Found hidden pool, making it visible: ' + (poolInfo[address] || address));
                    ensureElementVisible(cell);
                    // Wait a moment for visibility change to take effect
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                // Find the SELECT button - it's a button with classes "btn yellow-btn clickable"
                const selectButton = cell.querySelector('button.btn.yellow-btn.clickable') ||
                                    cell.querySelector('.liquidity-pool-cell-btn button') ||
                                    cell.querySelector('.liquidity-pool-cell-right button') ||
                                    cell.querySelector('button[class*="yellow-btn"]');
                
                if (selectButton) {
                    try {
                        // Ensure button is visible too
                        ensureElementVisible(selectButton);
                        selectButton.click();
                        const poolName = poolInfo[address] || 'Unknown';
                        console.log('? Clicked SELECT button for: ' + poolName + ' (' + address + ')' + (wasHidden ? ' [was hidden]' : ''));
                        selectedCount++;
                        found = true;
                        await new Promise(resolve => setTimeout(resolve, 100));
                        break;
                    } catch (e) {
                        console.warn('Error clicking SELECT button:', e);
                    }
                } else {
                    console.warn('SELECT button not found for pool ' + address);
                }
            }
        }
        
        // Strategy 2: Look for elements with data attributes containing the address (case-insensitive)
        if (!found) {
            const elementsWithAddress = Array.from(document.querySelectorAll('*')).filter(el => {
                const attrs = Array.from(el.attributes || []);
                return attrs.some(attr => {
                    const attrValue = (attr.value || '').toLowerCase();
                    return attrValue && (attrValue.includes(addressLower) || attrValue.includes(address));
                });
            });
            
            for (let elem of elementsWithAddress) {
                // Find the parent pool cell
                let parent = elem;
                while (parent && !parent.classList.contains('liquidity-pool-cell')) {
                    parent = parent.parentElement;
                }
                
                if (parent) {
                    const wasHidden = !isElementVisible(parent);
                    if (wasHidden) {
                        ensureElementVisible(parent);
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    
                    // Find SELECT button in parent cell
                    const selectButton = parent.querySelector('button.btn.yellow-btn.clickable') ||
                                        parent.querySelector('.liquidity-pool-cell-btn button') ||
                                        parent.querySelector('.liquidity-pool-cell-right button') ||
                                        parent.querySelector('button[class*="yellow-btn"]');
                    
                    if (selectButton) {
                        try {
                            ensureElementVisible(selectButton);
                            selectButton.click();
                            const poolName = poolInfo[address] || 'Unknown';
                            console.log('? Clicked SELECT button for: ' + poolName + ' (' + address + ')' + (wasHidden ? ' [was hidden]' : ''));
                            selectedCount++;
                            found = true;
                            await new Promise(resolve => setTimeout(resolve, 100));
                            break;
                        } catch (e) {
                            console.warn('Error clicking SELECT button:', e);
                        }
                    } // else: button not found, will try next strategy
                }
            }
        }
        
        // Strategy 3: Try to find by pool name if address matching fails
        if (!found) {
            const poolName = poolInfo[address];
            if (poolName) {
                // Generate multiple search variations of the pool name
                // e.g., "vAMM-fBOMB/USDC" -> ["vAMM-fBOMB/USDC", "fBOMB/USDC", "fBOMB / USDC", etc.]
                const searchVariations = [];
                
                // Add full name
                searchVariations.push(poolName);
                
                // Remove prefix (e.g., "vAMM-", "sAMM-", "CL1-", "CL200-")
                const withoutPrefix = poolName.replace(/^(vAMM-|sAMM-|CL\d+-)/i, '');
                if (withoutPrefix !== poolName) {
                    searchVariations.push(withoutPrefix);
                }
                
                // Extract token pair (e.g., "fBOMB/USDC" from "vAMM-fBOMB/USDC")
                const nameParts = poolName.split('/');
                if (nameParts.length > 1) {
                    // Try with and without prefix
                    const tokenPair = nameParts.join('/');
                    searchVariations.push(tokenPair);
                    
                    // Try without prefix
                    const tokenPairNoPrefix = withoutPrefix.split('/');
                    if (tokenPairNoPrefix.length > 1) {
                        searchVariations.push(tokenPairNoPrefix.join('/'));
                    }
                    
                    // Try with spaces around slash
                    searchVariations.push(nameParts.join(' / '));
                    searchVariations.push(withoutPrefix.split('/').join(' / '));
                }
                
                // Remove duplicates and try each variation
                const uniqueVariations = [...new Set(searchVariations)];
                
                for (let searchText of uniqueVariations) {
                    if (found) break;
                    
                    for (let cell of allPoolCells) {
                        const cellText = (cell.innerText || '').toLowerCase();
                        const cellHTML = (cell.innerHTML || '').toLowerCase();
                        const searchLower = searchText.toLowerCase();
                        
                        // Try case-insensitive matching (search ALL pools, including hidden)
                        if (cellText.includes(searchLower) || cellHTML.includes(searchLower)) {
                            // Make sure the pool is visible
                            const wasHidden = !isElementVisible(cell);
                            if (wasHidden) {
                                console.log('Found hidden pool by name, making it visible: ' + poolName);
                                ensureElementVisible(cell);
                                await new Promise(resolve => setTimeout(resolve, 100));
                            }
                            
                            // Find the SELECT button - same as Strategy 1
                            const selectButton = cell.querySelector('button.btn.yellow-btn.clickable') ||
                                                cell.querySelector('.liquidity-pool-cell-btn button') ||
                                                cell.querySelector('.liquidity-pool-cell-right button') ||
                                                cell.querySelector('button[class*="yellow-btn"]');
                            
                            if (selectButton) {
                                try {
                                    ensureElementVisible(selectButton);
                                    selectButton.click();
                                    console.log('? Clicked SELECT button for: ' + poolName + ' (' + address + ') [found by name: "' + searchText + '"]' + (wasHidden ? ' [was hidden]' : ''));
                                    selectedCount++;
                                    found = true;
                                    await new Promise(resolve => setTimeout(resolve, 100));
                                    break;
                                } catch (e) {
                                    console.warn('Error clicking SELECT button for ' + poolName + ':', e);
                                }
                            } else {
                                // Fallback: try clicking the cell directly
                                try {
                                    cell.click();
                                    console.log('? Selected by name (cell click): ' + poolName + ' (' + address + ') [found by: "' + searchText + '"]' + (wasHidden ? ' [was hidden]' : ''));
                                    selectedCount++;
                                    found = true;
                                    await new Promise(resolve => setTimeout(resolve, 100));
                                    break;
                                } catch (e) {
                                    console.warn('Error clicking pool cell ' + poolName + ':', e);
                                }
                            }
                        }
                    }
                }
                
                // If still not found, log debug info for the first matching attempt
                if (!found) {
                    console.warn('? Pool name search failed for: ' + poolName + ' (' + address + ')');
                    console.warn('  Tried variations:', uniqueVariations);
                    // Log a sample of pool names on the page for debugging
                    const sampleNames = Array.from(poolCells).slice(0, 5).map(c => (c.innerText || '').substring(0, 50));
                    console.warn('  Sample pool names on page:', sampleNames);
                }
            }
            }
            
            // Strategy 4: Deep search - check React props, all data attributes, and text nodes
            if (!found) {
            for (let cell of allPoolCells) {
                // Check React Fiber for address in props
                const reactKey = Object.keys(cell).find(key => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance'));
                if (reactKey) {
                    try {
                        const fiber = cell[reactKey];
                        let currentFiber = fiber;
                        let depth = 0;
                        while (currentFiber && depth < 10) {
                            if (currentFiber.memoizedProps) {
                                const propsStr = JSON.stringify(currentFiber.memoizedProps).toLowerCase();
                                if (propsStr.includes(addressLower)) {
                                    // Found address in React props, make visible and try to click SELECT button
                                    const wasHidden = !isElementVisible(cell);
                                    if (wasHidden) {
                                        ensureElementVisible(cell);
                                        await new Promise(resolve => setTimeout(resolve, 100));
                                    }
                                    
                                    const selectButton = cell.querySelector('button.btn.yellow-btn.clickable') ||
                                                        cell.querySelector('.liquidity-pool-cell-btn button') ||
                                                        cell.querySelector('.liquidity-pool-cell-right button') ||
                                                        cell.querySelector('button[class*="yellow-btn"]');
                                    if (selectButton) {
                                        try {
                                            ensureElementVisible(selectButton);
                                            selectButton.click();
                                            const poolName = poolInfo[address] || 'Unknown';
                                            console.log('? Clicked SELECT button for: ' + poolName + ' (' + address + ') [found in React props]' + (wasHidden ? ' [was hidden]' : ''));
                                            selectedCount++;
                                            found = true;
                                            await new Promise(resolve => setTimeout(resolve, 100));
                                            break;
                                        } catch (e) {
                                            console.warn('Error clicking SELECT button:', e);
                                        }
                                    }
                                }
                            }
                            currentFiber = currentFiber.child || currentFiber.sibling;
                            depth++;
                        }
                    } catch (e) {
                        // Ignore React access errors
                    }
                }
                
                if (found) break;
                
                // Check all data attributes more thoroughly
                const allDataAttrs = Array.from(cell.querySelectorAll('*')).concat([cell]);
                for (let elem of allDataAttrs) {
                    if (found) break;
                    for (let attr of Array.from(elem.attributes || [])) {
                        if (attr.name.startsWith('data-') || attr.name.toLowerCase().includes('pool') || 
                            attr.name.toLowerCase().includes('address') || attr.name.toLowerCase().includes('id')) {
                            const attrValue = (attr.value || '').toLowerCase();
                            if (attrValue.includes(addressLower)) {
                                const wasHidden = !isElementVisible(cell);
                                if (wasHidden) {
                                    ensureElementVisible(cell);
                                    await new Promise(resolve => setTimeout(resolve, 100));
                                }
                                
                                const selectButton = cell.querySelector('button.btn.yellow-btn.clickable') ||
                                                    cell.querySelector('.liquidity-pool-cell-btn button') ||
                                                    cell.querySelector('.liquidity-pool-cell-right button') ||
                                                    cell.querySelector('button[class*="yellow-btn"]');
                                if (selectButton) {
                                    try {
                                        ensureElementVisible(selectButton);
                                        selectButton.click();
                                        const poolName = poolInfo[address] || 'Unknown';
                                        console.log('? Clicked SELECT button for: ' + poolName + ' (' + address + ') [found in ' + attr.name + ']' + (wasHidden ? ' [was hidden]' : ''));
                                        selectedCount++;
                                        found = true;
                                        await new Promise(resolve => setTimeout(resolve, 100));
                                        break;
                                    } catch (e) {
                                        console.warn('Error clicking SELECT button:', e);
                                    }
                                }
                            }
                        }
                    }
                }
                
                if (found) break;
            }
        }
        
        if (!found) {
            const poolName = poolInfo[address] || address;
            console.warn('? Could not find pool: ' + poolName + ' (' + address + ')');
            console.warn('  Searched using: address (case-insensitive), data attributes, React props, and name variations');
            notFoundCount++;
        }
        }
        
    console.log('\nSelection complete: ' + selectedCount + ' selected, ' + notFoundCount + ' not found');
    console.log('You can now allocate your votes to the selected pools.');
})();
