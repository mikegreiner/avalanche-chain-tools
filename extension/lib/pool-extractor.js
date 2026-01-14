/**
 * Pool data extraction from DOM
 * Ported from blackhole_pool_recommender.py _extract_pools_from_elements
 */

import Pool from './pool.js';

/**
 * Extract pool data from DOM elements on the voting page
 */
export function extractPoolsFromDOM() {
  const pools = [];
  let poolElements = document.querySelectorAll('div.liquidity-pool-cell.even, div.liquidity-pool-cell.odd');
  
  if (poolElements.length === 0) {
    const allPoolElements = document.querySelectorAll('div.liquidity-pool-cell');
    poolElements = Array.from(allPoolElements).filter(elem => {
      const classes = elem.className || '';
      return classes.includes('even') || classes.includes('odd');
    });
  }

  console.log(`Found ${poolElements.length} pool elements`);

  for (const element of poolElements) {
    try {
      const pool = extractPoolFromElement(element);
      if (pool) {
        pools.push(pool);
      }
    } catch (error) {
      console.warn('Error extracting pool from element:', error);
    }
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