/**
 * Pool data extraction from DOM
 * Ported from blackhole_pool_recommender.py _extract_pools_from_elements
 */

import Pool from './pool.js';

/**
 * Extract pool data from DOM elements on the voting page
 * Now handles pagination to extract pools from all pages
 */
export async function extractPoolsFromDOM() {
  const pools = [];
  const foundPoolIds = new Set(); // Track to avoid duplicates
  
  // Helper function to extract pools from current page
  function extractPoolsFromCurrentPage() {
    let poolElements = document.querySelectorAll('div.liquidity-pool-cell.even, div.liquidity-pool-cell.odd');
    
    if (poolElements.length === 0) {
      const allPoolElements = document.querySelectorAll('div.liquidity-pool-cell');
      poolElements = Array.from(allPoolElements).filter(elem => {
        const classes = elem.className || '';
        return classes.includes('even') || classes.includes('odd');
      });
    }

    for (const element of poolElements) {
      try {
        const pool = extractPoolFromElement(element);
        if (pool) {
          // Use pool_id to avoid duplicates (in case same pool appears on multiple pages)
          const poolKey = pool.pool_id ? pool.pool_id.toLowerCase() : pool.name.toLowerCase();
          if (!foundPoolIds.has(poolKey)) {
            pools.push(pool);
            foundPoolIds.add(poolKey);
          }
        }
      } catch (error) {
        console.warn('Error extracting pool from element:', error);
      }
    }
    
    return poolElements.length;
  }
  
  // Extract pools from current page
  const poolsOnCurrentPage = extractPoolsFromCurrentPage();
  console.log(`Found ${poolsOnCurrentPage} pool elements on current page, ${pools.length} unique pools so far`);
  
  // Check if pagination exists - if so, try to temporarily increase page size
  const paginationContainer = document.querySelector('.pagination');
  let originalPageSize = null;
  let pageSizeSelector = null;
  let pageSizeChanged = false;
  
  // Try to find and change page size selector to 100
  // Based on the HTML structure: <div class="size-per-page"> with clickable dropdown
  console.log('Searching for page size selector...');
  
  // First, try to find the size-per-page element (custom dropdown)
  const sizePerPageElement = document.querySelector('.size-per-page');
  if (sizePerPageElement) {
    // Extract current page size from the text (e.g., "Pools/Page: 10")
    const textContent = sizePerPageElement.textContent || '';
    const pageSizeMatch = textContent.match(/Pools\/Page:\s*(\d+)/i) || textContent.match(/(\d+)/);
    if (pageSizeMatch) {
      originalPageSize = pageSizeMatch[1];
      console.log(`Found size-per-page element, current value: ${originalPageSize}`);
      
      // Store reference to the clickable element (the whole size-per-page div is likely clickable)
      pageSizeSelector = sizePerPageElement;
    }
  }
  
  // Also try standard select elements as fallback
  if (!pageSizeSelector) {
    const possibleSelectors = [
      'select[class*="page"]',
      'select[class*="size"]',
      'select[class*="per"]',
      '.pagination select',
      '[class*="page-size"] select'
    ];
    
    for (const selector of possibleSelectors) {
      const element = document.querySelector(selector);
      if (element && element.tagName === 'SELECT') {
        const option100 = Array.from(element.options).find(opt => {
          const val = opt.value || opt.textContent.trim();
          return val === '100';
        });
        if (option100) {
          pageSizeSelector = element;
          originalPageSize = element.value;
          console.log(`Found page size select element, current value: ${originalPageSize}`);
          break;
        }
      }
    }
  }
  
  if (!pageSizeSelector) {
    console.log('Could not find page size selector. Will navigate through pages normally.');
  }
  
  // If we found a page size selector, temporarily change it to 100
  if (pageSizeSelector && originalPageSize !== '100') {
    try {
      console.log(`Temporarily changing page size from ${originalPageSize} to 100...`);
      
      // Check if it's a standard select element
      if (pageSizeSelector.tagName === 'SELECT') {
        pageSizeSelector.value = '100';
        
        // Trigger change event
        const changeEvent = new Event('change', { bubbles: true });
        pageSizeSelector.dispatchEvent(changeEvent);
        
        // Also try input event
        const inputEvent = new Event('input', { bubbles: true });
        pageSizeSelector.dispatchEvent(inputEvent);
      } else {
        // It's a custom dropdown (like .size-per-page)
        // Click to open the dropdown
        console.log('Clicking page size dropdown to open it...');
        pageSizeSelector.click();
        
        // Wait a bit for dropdown to open
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Look for the "100" option in the dropdown menu
        // The dropdown might be a sibling, child, or appear elsewhere in the DOM
        let option100 = null;
        
        // Try multiple strategies to find the dropdown menu
        const strategies = [
          // Strategy 1: Look for a dropdown menu near the size-per-page element
          () => {
            const parent = pageSizeSelector.parentElement;
            if (parent) {
              return parent.querySelector('[class*="menu"], [class*="dropdown"], [class*="option"]');
            }
            return null;
          },
          // Strategy 2: Look for elements with "100" text that appeared after click
          () => {
            const allElements = document.querySelectorAll('div, span, button, a');
            for (const elem of allElements) {
              const text = elem.textContent.trim();
              if (text === '100') {
                const rect = elem.getBoundingClientRect();
                const selectorRect = pageSizeSelector.getBoundingClientRect();
                // Check if it's near the selector (likely the dropdown option)
                if (Math.abs(rect.top - selectorRect.bottom) < 200 && 
                    Math.abs(rect.left - selectorRect.left) < 100) {
                  return elem;
                }
              }
            }
            return null;
          },
          // Strategy 3: Look for any visible element with "100" that's clickable
          () => {
            const allElements = document.querySelectorAll('div, span, button, a, [role="menuitem"], [role="option"]');
            for (const elem of allElements) {
              const text = elem.textContent.trim();
              const style = getComputedStyle(elem);
              if (text === '100' && 
                  style.display !== 'none' && 
                  style.visibility !== 'hidden' &&
                  style.opacity !== '0') {
                return elem;
              }
            }
            return null;
          }
        ];
        
        for (const strategy of strategies) {
          option100 = strategy();
          if (option100) {
            console.log('Found "100" option in dropdown');
            break;
          }
        }
        
        if (option100) {
          // Click the 100 option
          console.log('Clicking "100" option...');
          option100.click();
          pageSizeChanged = true;
        } else {
          console.warn('Could not find "100" option in dropdown. Trying to search more broadly...');
          // Last resort: search the entire document for clickable "100"
          const allClickable = document.querySelectorAll('div, span, button, a');
          for (const elem of allClickable) {
            if (elem.textContent.trim() === '100') {
              const rect = elem.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) { // Element is visible
                console.log('Found visible "100" element, clicking it...');
                elem.click();
                pageSizeChanged = true;
                break;
              }
            }
          }
        }
      }
      
      if (pageSizeChanged) {
        // Wait for page to reload with new page size
        console.log('Waiting for page to reload with new page size...');
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for page to update
        
        // Verify the change took effect by checking if more pools are visible
        const poolCountAfter = document.querySelectorAll('div.liquidity-pool-cell').length;
        console.log(`Page size changed. Pools visible: ${poolCountAfter}`);
        
        // Also check if the text updated
        if (sizePerPageElement) {
          const updatedText = sizePerPageElement.textContent || '';
          console.log(`Page size element now shows: ${updatedText}`);
        }
        
        // CRITICAL: Extract pools from this expanded first page immediately
        const poolsFromPage1 = extractPoolsFromCurrentPage();
        console.log(`Extracted ${poolsFromPage1} pools from expanded Page 1`);
      }
      
    } catch (error) {
      console.warn('Error changing page size:', error);
      pageSizeChanged = false;
    }
  }
  
  let pageItems = [];
  let nextButton = null;
  
  if (paginationContainer) {
    // Find all page number items
    pageItems = Array.from(paginationContainer.querySelectorAll('.item')).filter(item => {
      const text = item.textContent ? item.textContent.trim() : '';
      return /^\d+$/.test(text) && !item.classList.contains('extreme') && !item.classList.contains('selected');
    });
    
    // Find next button (right arrow)
    const rightExtreme = paginationContainer.querySelector('.item.extreme.right');
    if (rightExtreme) {
      nextButton = rightExtreme;
    }
  }
  
  // Store the current page to return to it later (after we potentially changed page size)
  const currentPageItem = paginationContainer ? paginationContainer.querySelector('.item.selected') : null;
  const currentPageNum = currentPageItem ? parseInt(currentPageItem.textContent.trim()) : 1;
  
  // If we changed page size, we might only need to check 1-2 pages now instead of many
  if (paginationContainer && (pageItems.length > 0 || nextButton)) {
    console.log(`Pagination detected. Extracting pools from all pages...`);
    
    // Helper function to wait for page to load by checking if page number has updated
    async function waitForPageLoad(previousPageNum, maxWaitTime = 10000) {
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Check for loading indicators (optional, but good practice)
        const isLoading = document.querySelector('.loading') || 
                         document.querySelector('.spinner');
        
        if (!isLoading) {
            const pagination = document.querySelector('.pagination');
            if (pagination) {
                const selectedItem = pagination.querySelector('.item.selected');
                if (selectedItem) {
                    const newPageNum = parseInt(selectedItem.textContent.trim());
                    // If page number has changed, we are good
                    if (!isNaN(newPageNum) && newPageNum !== previousPageNum) {
                        await new Promise(resolve => setTimeout(resolve, 500)); // Extra wait for table render
                        return true;
                    }
                }
            }
        }
      }
      console.warn(`Page load timeout: Page number did not change from ${previousPageNum} within ${maxWaitTime}ms`);
      return false;
    }
    
    // Helper function to get current page number
    function getCurrentPageNum() {
      const pagination = document.querySelector('.pagination');
      if (!pagination) return null;
      const selectedItem = pagination.querySelector('.item.selected');
      if (!selectedItem) return null;
      const text = selectedItem.textContent.trim();
      const pageNum = parseInt(text);
      return isNaN(pageNum) ? null : pageNum;
    }
    
    // Navigate through all pages to extract pools
    // If we successfully changed page size to 100, we'll need fewer pages
    const maxPagesToCheck = pageSizeChanged ? 5 : 100; // Safety limit (fewer if page size is 100)
    let pagesChecked = 1;
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3;
    
    // First, make sure we're on page 1 to start from the beginning
    const initialPageNum = getCurrentPageNum();
    if (initialPageNum && initialPageNum > 1) {
      console.log(`Starting from page ${initialPageNum}, navigating to page 1 first...`);
      const pagination = document.querySelector('.pagination');
      if (pagination) {
        const page1Item = Array.from(pagination.querySelectorAll('.item')).find(item => {
          const text = item.textContent.trim();
          return /^1$/.test(text) && !item.classList.contains('extreme');
        });
        if (page1Item) {
          const clickable = page1Item.closest('.item') || page1Item.parentElement || page1Item;
          clickable.click();
          // Wait for page 1 to load (previous was initialPageNum)
          await waitForPageLoad(initialPageNum, 5000);
          // Re-extract from page 1 (we already got it, but this ensures we're synced)
          extractPoolsFromCurrentPage();
        }
      }
    } else {
       // If we are already on page 1 and haven't extracted yet (e.g. didn't change page size)
       // ensure we extract the current page before navigating
       if (!pageSizeChanged) {
         extractPoolsFromCurrentPage();
       }
    }
    
    // Now navigate through all pages using next button
    // If page size was changed to 100, we should only need 1-2 pages
    while (pagesChecked < maxPagesToCheck && consecutiveFailures < maxConsecutiveFailures) {
      const pagination = document.querySelector('.pagination');
      if (!pagination) {
        console.log('Pagination container disappeared');
        break;
      }
      
      const currentPageBefore = getCurrentPageNum();
      const previousPoolCount = pools.length;
      
      // Find next button
      const rightExtreme = pagination.querySelector('.item.extreme.right');
      if (!rightExtreme) {
        console.log('No next button found');
        break;
      }
      
      const clickable = rightExtreme.closest('.item') || rightExtreme.parentElement || rightExtreme;
      const isDisabled = clickable.classList.contains('disabled') || 
                        clickable.hasAttribute('disabled') ||
                        clickable.style.pointerEvents === 'none' ||
                        getComputedStyle(clickable).pointerEvents === 'none';
      
      if (isDisabled) {
        console.log('Next button is disabled - reached last page');
        break;
      }
      
      // Click next button
      console.log(`Clicking next button (currently on page ${currentPageBefore || 'unknown'})...`);
      clickable.click();
      
      // Wait for page to load (pass current page number to check for change)
      const pageLoaded = await waitForPageLoad(currentPageBefore, 6000); // Reduced timeout
      
      // Verify we actually moved to a new page
      const currentPageAfter = getCurrentPageNum();
      if (currentPageAfter === currentPageBefore) {
        // If page didn't change, we likely hit the end of the list even if button wasn't disabled
        console.log(`Page did not advance from ${currentPageBefore}. Assuming reached last page.`);
        break;
      }
      
      consecutiveFailures = 0; // Reset on success
      
      // Extract pools from this page
      const poolsOnPage = extractPoolsFromCurrentPage();
      pagesChecked++;
      console.log(`Extracted ${poolsOnPage} pools from page ${currentPageAfter} (${pools.length} total unique pools so far)`);
      
      // Small delay between pages
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log(`Finished navigating through ${pagesChecked} pages`);
    
    // Restore original page size if we changed it
    if (pageSizeChanged && pageSizeSelector && originalPageSize !== null) {
      try {
        console.log(`Restoring page size from 100 back to ${originalPageSize}...`);
        
        // Check if it's a standard select element
        if (pageSizeSelector.tagName === 'SELECT') {
          pageSizeSelector.value = originalPageSize;
          
          // Trigger change event
          const changeEvent = new Event('change', { bubbles: true });
          pageSizeSelector.dispatchEvent(changeEvent);
          
          // Also try input event
          const inputEvent = new Event('input', { bubbles: true });
          pageSizeSelector.dispatchEvent(inputEvent);
        } else {
          // It's a custom dropdown (like .size-per-page)
          // Click to open the dropdown
          pageSizeSelector.click();
          
          // Wait for dropdown to open
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Look for the original page size option (e.g., "10")
          let originalOption = null;
          
          // Try to find the option with the original page size value
          const allElements = document.querySelectorAll('div, span, button, a, [role="menuitem"], [role="option"]');
          for (const elem of allElements) {
            const text = elem.textContent.trim();
            if (text === originalPageSize) {
              const rect = elem.getBoundingClientRect();
              const selectorRect = pageSizeSelector.getBoundingClientRect();
              // Check if it's near the selector (likely the dropdown option)
              if (rect.width > 0 && rect.height > 0 && // Element is visible
                  Math.abs(rect.top - selectorRect.bottom) < 200 && 
                  Math.abs(rect.left - selectorRect.left) < 100) {
                originalOption = elem;
                break;
              }
            }
          }
          
          if (originalOption) {
            console.log(`Found "${originalPageSize}" option, clicking it...`);
            originalOption.click();
          } else {
            console.warn(`Could not find "${originalPageSize}" option in dropdown`);
          }
        }
        
        // Wait for page to reload with original page size
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('Page size restored');
        
        // After restoring page size, we need to navigate back to the original page
        // because changing page size likely reset us to page 1
        if (currentPageNum > 1) {
          console.log(`Navigating back to original page ${currentPageNum}...`);
          const restoredPagination = document.querySelector('.pagination');
          if (restoredPagination) {
            const allPageItems = Array.from(restoredPagination.querySelectorAll('.item')).filter(item => {
              const text = item.textContent.trim();
              return /^\d+$/.test(text) && !item.classList.contains('extreme');
            });
            
            const targetPageItem = allPageItems.find(item => {
              const pageNum = parseInt(item.textContent.trim());
              return pageNum === currentPageNum;
            });
            
            if (targetPageItem) {
              const clickable = targetPageItem.closest('.item') || targetPageItem.parentElement || targetPageItem;
              clickable.click();
              await new Promise(resolve => setTimeout(resolve, 2000));
              console.log(`Returned to page ${currentPageNum}`);
            } else {
              console.warn(`Could not find page ${currentPageNum} button after restoring page size`);
            }
          }
        }
      } catch (error) {
        console.warn('Error restoring page size:', error);
      }
    } else if (currentPageNum > 1) {
      // If we didn't change page size, just return to original page normally
      console.log(`Returning to page ${currentPageNum}...`);
      const finalPagination = document.querySelector('.pagination');
      if (finalPagination) {
        const allPageItems = Array.from(finalPagination.querySelectorAll('.item')).filter(item => {
          const text = item.textContent ? item.textContent.trim() : '';
          return /^\d+$/.test(text) && !item.classList.contains('extreme');
        });
        
        const targetPageItem = allPageItems.find(item => {
          const pageNum = parseInt(item.textContent.trim());
          return pageNum === currentPageNum;
        });
        
        if (targetPageItem) {
          const clickable = targetPageItem.closest('.item') || targetPageItem.parentElement || targetPageItem;
          clickable.click();
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          // Try to go to page 1 and navigate from there
          const page1Item = allPageItems.find(item => {
            const pageNum = parseInt(item.textContent.trim());
            return pageNum === 1;
          });
          if (page1Item) {
            const clickable = page1Item.closest('.item') || page1Item.parentElement || page1Item;
            clickable.click();
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Navigate to target page if needed
            if (currentPageNum > 1) {
              const updatedPagination = document.querySelector('.pagination');
              if (updatedPagination) {
                const updatedPageItems = Array.from(updatedPagination.querySelectorAll('.item')).filter(item => {
                  const text = item.textContent ? item.textContent.trim() : '';
                  return /^\d+$/.test(text) && !item.classList.contains('extreme');
                });
                const targetItem = updatedPageItems.find(item => {
                  const pageNum = parseInt(item.textContent.trim());
                  return pageNum === currentPageNum;
                });
                if (targetItem) {
                  const clickable = targetItem.closest('.item') || targetItem.parentElement || targetItem;
                  clickable.click();
                  await new Promise(resolve => setTimeout(resolve, 1500));
                }
              }
            }
          }
        }
      }
    }
  }
  
  console.log(`Extraction complete: Found ${pools.length} unique pools across all pages`);
  return pools;
}

/**
 * Extract pool data from a single DOM element
 */
export function extractPoolFromElement(element) {
  const text = element.textContent.trim();
  if (!text || text.length < 10) {
    return null;
  }

  let name = 'Unknown';
  let poolType = null;
  let feePercentage = null;
  let poolId = null;

  try {
    // Try multiple selectors for pool name
    let nameText = '';
    const nameSelectors = [
      'div.name',
      '[class*="name"]',
      '[class*="pool-name"]',
      '[class*="title"]',
      'div:first-child',
      'span:first-child'
    ];
    
    for (const selector of nameSelectors) {
      const nameElements = element.querySelectorAll(selector);
      if (nameElements.length > 0) {
        nameText = nameElements[0].textContent.trim();
        if (nameText && nameText.length > 2 && nameText.length < 100) {
          break;
        }
      }
    }
    
    // Fallback: extract from first line of text
    if (!nameText || nameText.length < 2) {
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      if (lines.length > 0) {
        nameText = lines[0].trim();
      }
    }
    
    // Extract pool name pattern (e.g., "CL200-WAVAX/BLACK" or "WAVAX/USDC")
    if (nameText) {
      const nameMatch = nameText.match(/((?:vAMM|CL\d+|CL200|CL1|CL50|sAMM)[\s-]*)?([A-Z0-9\.]+(?:\.[a-z]+)?\/[A-Z0-9\.]+(?:\.[a-z]+)?)/i);
      if (nameMatch) {
        name = nameMatch[0].trim();
        if (nameMatch[1]) {
          if (nameMatch[1].includes('vAMM')) {
            poolType = 'vAMM';
          } else if (nameMatch[1].includes('CL200') || nameMatch[1].includes('CL50')) {
            poolType = 'CL200';
          } else if (nameMatch[1].includes('CL1')) {
            poolType = 'CL1';
          }
        }
      } else {
        name = nameText.substring(0, 50); // Use first 50 chars as fallback
      }
    }

    poolId = element.getAttribute('data-pool-id') ||
             element.getAttribute('data-pool-address') ||
             element.getAttribute('data-address') ||
             element.getAttribute('data-id');

    if (!poolId) {
      const idElements = element.querySelectorAll('[data-pool-id], [data-pool-address], [data-address]');
      if (idElements.length > 0) {
        poolId = idElements[0].getAttribute('data-pool-id') ||
                 idElements[0].getAttribute('data-pool-address') ||
                 idElements[0].getAttribute('data-address');
      }
    }

    if (!poolId) {
      const innerHTML = element.innerHTML || '';
      const ethAddressMatch = innerHTML.match(/0x[a-fA-F0-9]{40}/);
      if (ethAddressMatch) {
        poolId = ethAddressMatch[0];
      }
    }

    const gasInfoElements = element.querySelectorAll('div.gas-info div.text');
    if (gasInfoElements.length > 0) {
      feePercentage = gasInfoElements[0].textContent.trim();
    }
  } catch (error) {
    console.warn('Error extracting pool metadata:', error);
  }

  let totalRewards = 0.0;
  let vapr = 0.0;
  let currentVotes = null;

  try {
    // Find the right section - it has class "liquidity-pool-cell-right"
    let rightSection = element.querySelector('div.liquidity-pool-cell-right');
    
    if (!rightSection) {
      // Fallback: try other selectors
      const fallbackSelectors = [
        '[class*="cell-right"]',
        '[class*="pool-cell-right"]'
      ];
      for (const selector of fallbackSelectors) {
        const section = element.querySelector(selector);
        if (section) {
          rightSection = section;
          break;
        }
      }
    }
    
    if (rightSection) {
      // Get all liquidity-pool-cell-data sections (each column)
      const dataSections = rightSection.querySelectorAll('div.liquidity-pool-cell-data');
      
      // Find specific sections by their classes
      let totalRewardsSection = null;
      let vaprSection = null;
      let votesSection = null;
      
      for (const section of dataSections) {
        const classes = section.className || '';
        if (classes.includes('total-rewards')) {
          totalRewardsSection = section;
        } else if (classes.includes('last')) {
          vaprSection = section;
        } else if (classes.includes('end')) {
          votesSection = section;
        }
      }
      
      // Extract VAPR
      if (vaprSection) {
        const firstDiv = vaprSection.querySelector('div.voting-pool-cell-vapr-info div.first');
        if (firstDiv) {
          const vaprMatch = firstDiv.textContent.match(/([\d,]+\.?\d*)\s*%/);
          if (vaprMatch) {
            vapr = parseFloat(vaprMatch[1].replace(/,/g, ''));
          }
        }
      }
      
      // Extract total rewards
      if (totalRewardsSection) {
        const totalData = totalRewardsSection.querySelector('div.voting-pool-data.total');
        if (totalData) {
          const rewardsMatch = totalData.textContent.match(/~?\$([\d,]+\.?\d*)\s*([kKmMbB])?/);
          if (rewardsMatch) {
            let val = parseFloat(rewardsMatch[1].replace(/,/g, ''));
            const suffix = rewardsMatch[2];
            if (suffix) {
              const suffixLower = suffix.toLowerCase();
              if (suffixLower === 'k') val *= 1000;
              else if (suffixLower === 'm' || suffixLower === 'b') val *= 1000000;
            }
            totalRewards = val;
          }
        }
      }
      
      // Extract votes
      if (votesSection) {
        const votesData = votesSection.querySelector('div.voting-pool-data.total');
        if (votesData) {
          const votesMatch = votesData.textContent.match(/([\d,]+\.?\d*)\s*([MmKk])\b/);
          if (votesMatch) {
            let votes = parseFloat(votesMatch[1].replace(/,/g, ''));
            const suffix = votesMatch[2].toLowerCase();
            if (suffix === 'm') votes *= 1000000;
            else if (suffix === 'k') votes *= 1000;
            currentVotes = votes;
          }
        }
      }
    }
    
    // Fallback: Text-based extraction if section-based failed
    const allText = element.textContent || '';
    if (totalRewards === 0.0) {
      const dollarAmounts = allText.matchAll(/~?\$([\d,]+\.?\d*)\s*([kKmMbB])?/g);
      let maxVal = 0;
      for (const match of dollarAmounts) {
        let val = parseFloat(match[1].replace(/,/g, ''));
        const suffix = match[2];
        if (suffix) {
          const suffixLower = suffix.toLowerCase();
          if (suffixLower === 'k') val *= 1000;
          else if (suffixLower === 'm' || suffixLower === 'b') val *= 1000000;
        }
        maxVal = Math.max(maxVal, val);
      }
      totalRewards = maxVal;
    }
    
    if (vapr === 0.0) {
      const percentages = allText.match(/([\d,]+\.?\d*)\s*%/g);
      if (percentages) {
        const vaprValues = percentages.map(p => parseFloat(p.replace(/,/g, '').replace('%', '')))
          .filter(v => v >= 1 && v < 10000);
        if (vaprValues.length > 0) vapr = Math.max(...vaprValues);
      }
    }
    
    if (!currentVotes) {
      const votesMatch = allText.match(/([\d,]+\.?\d*)\s*([MmKk])\b/);
      if (votesMatch) {
        let votes = parseFloat(votesMatch[1].replace(/,/g, ''));
        const suffix = votesMatch[2].toLowerCase();
        if (suffix === 'm') votes *= 1000000;
        else if (suffix === 'k') votes *= 1000;
        currentVotes = votes;
      }
    }
  } catch (error) {
    console.warn('Error extracting pool metrics:', error);
  }

  return new Pool({
    name,
    total_rewards: totalRewards,
    vapr,
    current_votes: currentVotes,
    pool_id: poolId,
    pool_type: poolType,
    fee_percentage: feePercentage
  });
}

/**
 * Try to extract pools from API response (if available)
 */
export async function extractPoolsFromAPI() {
  try {
    const response = await fetch('https://resources.blackhole.xyz/cl-pools-list/cl-pools.json', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) return [];

    const data = await response.json();
    const pools = [];
    const poolsData = data.pools || data.data?.pools || (Array.isArray(data) ? data : []);

    for (const poolData of poolsData) {
      try {
        if (poolData.token0 && poolData.token1) {
          const poolName = `${poolData.token0.symbol}/${poolData.token1.symbol}`;
          const fee = parseInt(poolData.fee || '0');
          let poolType = 'CL200';
          let feePct = `${fee / 10000}%`;
          if (fee === 100) { poolType = 'CL1'; feePct = '0.01%'; } 
          else if (fee === 500) { poolType = 'CL200'; feePct = '0.05%'; } 

          pools.push(new Pool({
            name: poolName,
            total_rewards: parseFloat(poolData.feesUSD || poolData.untrackedFeesUSD || 0),
            vapr: 0.0,
            current_votes: null,
            pool_id: poolData.id,
            pool_type: poolType,
            fee_percentage: feePct
          }));
        }
      } catch (e) {}
    }
    return pools;
  } catch (error) {
    console.warn('Error fetching pools from API:', error);
    return [];
  }
}

/**
 * Hybrid extraction using RPC and API
 */
export async function extractPoolsHybrid() {
  console.log('Attempting hybrid extraction (RPC + API)...');
  let apiPools = [];
  
  try {
    // PoolDataProvider is available in the bundle scope
    if (typeof PoolDataProvider !== 'undefined') {
      const provider = new PoolDataProvider();
      apiPools = await provider.getPools();
      if (apiPools && apiPools.length > 0) {
        console.log(`API extraction success: ${apiPools.length} pools`);
      }
    } else {
      console.warn('PoolDataProvider not found in scope');
    }
  } catch (error) {
    console.warn('Hybrid extraction failed:', error);
  }
  
  // Always fetch from DOM to ensure we don't miss pools not in the API (e.g. vAMM/sAMM)
  console.log('Fetching from DOM to supplement/fallback...');
  const domPools = await extractPoolsFromDOM();
  console.log(`DOM extraction: ${domPools.length} pools`);
  
  // Merge lists (prefer API data if available as it has precise weights)
  const poolMap = new Map();
  const domPoolsByName = new Map();
  
  // Add DOM pools first
  for (const p of domPools) {
    const key = p.pool_id ? p.pool_id.toLowerCase() : p.name;
    poolMap.set(key, p);
    if (p.name) {
      domPoolsByName.set(p.name.toLowerCase(), p);
    }
  }
  
  // Add/Override with API pools
  for (const p of apiPools) {
    const key = p.pool_id ? p.pool_id.toLowerCase() : p.name;
    
    let domP = poolMap.get(key);
    
    // Fallback: If not found by ID, try matching by name
    if (!domP && p.name) {
      const apiNameLower = p.name.toLowerCase();
      // Try exact name match
      domP = domPoolsByName.get(apiNameLower);
      
      // Try substring match (e.g. API "XAUt0/WAVAX" matches DOM "CL200-XAUt0/WAVAX")
      if (!domP) {
        for (const [domName, pool] of domPoolsByName.entries()) {
          if (domName.includes(apiNameLower)) {
            domP = pool;
            break;
          }
        }
      }
    }
    
    if (domP) {
      // If pool exists in DOM, merge intelligently
      
      // Use DOM data for rewards/VAPR (API has lifetime fees, DOM has epoch rewards)
      // We set API rewards to 0 in provider, so if DOM has data, use it.
      p.total_rewards = domP.total_rewards;
      p.vapr = domP.vapr > 0 ? domP.vapr : p.vapr;
      
      // Use DOM name if available (often better formatted)
      if (domP.name && domP.name !== 'Unknown') {
        p.name = domP.name;
      }
      
      // Keep other DOM metadata if missing in API
      if (!p.fee_percentage && domP.fee_percentage) p.fee_percentage = domP.fee_percentage;
      if (!p.pool_type && domP.pool_type) p.pool_type = domP.pool_type;
      
      // API provides accurate current_votes (RPC), so we keep p.current_votes
      
      // Remove the original DOM entry if it was stored under a different key (like name)
      const domKey = domP.pool_id ? domP.pool_id.toLowerCase() : domP.name;
      if (domKey !== key) {
        poolMap.delete(domKey);
      }
    }
    
    // Only add if it has rewards (DOM match) or if we want to show it anyway
    // If it's an API pool with 0 rewards and no DOM match, it might be a dead pool
    // But for coverage, we'll add it.
    poolMap.set(key, p);
  }
  
  const mergedPools = Array.from(poolMap.values());
  console.log(`Final merged pool count: ${mergedPools.length}`);
  
  return mergedPools;
}