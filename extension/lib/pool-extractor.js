/**
 * Pool data extraction from DOM
 * Ported from blackhole_pool_recommender.py _extract_pools_from_elements
 */

import Pool from './pool.js';

/**
 * Extract pool data from DOM elements on the voting page
 * @param {boolean} deepScan - If true, navigate through all pages. If false, only scan current page.
 */
export async function extractPoolsFromDOM(deepScan = false) {
  const pools = [];
  const foundPoolIds = new Set(); // Track to avoid duplicates
  
  // Helper to extract from current page
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

  // Always extract current page
  const poolsOnCurrentPage = extractPoolsFromCurrentPage();
  console.log(`Found ${poolsOnCurrentPage} pool elements on current page`);

  // If not deep scan, return immediately
  if (!deepScan) {
    return pools;
  }

  console.log('Deep Scan enabled: checking for pagination...');
  
  // Pagination Logic
  const paginationContainer = document.querySelector('.pagination');
  if (!paginationContainer) {
    console.log('No pagination found, scan complete.');
    return pools;
  }

  // Helper to wait for page load
  async function waitForPageLoad(previousCount, maxWait = 5000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 200));
      const currentCount = document.querySelectorAll('div.liquidity-pool-cell').length;
      // Simple check: if we have pools, we assume page loaded (could be improved)
      if (currentCount > 0) return true;
    }
    return false;
  }

  // Iterate pages
  let pagesChecked = 1;
  const maxPages = 20; // Safety limit
  
  while (pagesChecked < maxPages) {
    const pagination = document.querySelector('.pagination');
    if (!pagination) break;

    const rightExtreme = pagination.querySelector('.item.extreme.right');
    if (!rightExtreme) break;

    const clickable = rightExtreme.closest('.item') || rightExtreme.parentElement || rightExtreme;
    if (clickable.classList.contains('disabled') || clickable.hasAttribute('disabled')) {
      console.log('Next button disabled, reached last page.');
      break;
    }

    console.log(`Navigating to page ${pagesChecked + 1}...`);
    clickable.click();
    
    // Wait for load
    await waitForPageLoad(0);
    
    // Extract
    const count = extractPoolsFromCurrentPage();
    console.log(`Extracted ${count} pools from page ${pagesChecked + 1}`);
    pagesChecked++;
    
    // Small delay
    await new Promise(r => setTimeout(r, 500));
  }

  // Restore page 1? Probably good UX but maybe not strictly required if we just want data.
  // Let's try to go back to page 1 to leave the user in a consistent state.
  console.log('Deep Scan complete. Returning to page 1...');
  const firstPage = document.querySelector('.pagination .item:not(.extreme)');
  if (firstPage && firstPage.textContent.trim() === '1') {
    firstPage.click();
  }

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
export async function extractPoolsHybrid(deepScan = false) {
  console.log(`Attempting hybrid extraction (RPC + API) with Deep Scan: ${deepScan}...`);
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
  const domPools = await extractPoolsFromDOM(deepScan);
  console.log(`DOM extraction: ${domPools.length} pools`);
  
  // Merge lists (prefer API data if available as it has precise weights)
  const poolMap = new Map();
  
  // Add DOM pools first
  for (const p of domPools) {
    const key = p.pool_id ? p.pool_id.toLowerCase() : p.name;
    poolMap.set(key, p);
  }
  
  // Add/Override with API pools
  for (const p of apiPools) {
    const key = p.pool_id ? p.pool_id.toLowerCase() : p.name;
    
    if (poolMap.has(key)) {
      // If pool exists in DOM, merge intelligently
      const domP = poolMap.get(key);
      
      // Use DOM data for rewards/VAPR (API has lifetime fees, DOM has epoch rewards)
      // STRICT OVERWRITE: API 'feesUSD' is lifetime fees, which is misleading for voting.
      // We must use the DOM value (current epoch rewards), even if it's 0.
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
    }
    poolMap.set(key, p);
  }
  
  const mergedPools = Array.from(poolMap.values());
  console.log(`Final merged pool count: ${mergedPools.length}`);
  
  return mergedPools;
}