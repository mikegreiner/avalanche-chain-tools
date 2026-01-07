/**
 * Content script bundle - includes all pool analysis logic
 * This bundles the modules together to avoid ES module import issues
 */

// Include Pool class
class Pool {
  constructor(data) {
    this.name = data.name || 'Unknown';
    this.total_rewards = data.total_rewards || 0;
    this.vapr = data.vapr || 0;
    this.current_votes = data.current_votes ?? null;
    this.pool_id = data.pool_id || null;
    this.pool_type = data.pool_type || null;
    this.fee_percentage = data.fee_percentage || null;
  }

  profitabilityScore() {
    let rewardsPerVote = null;
    if (this.current_votes !== null && this.current_votes > 0) {
      rewardsPerVote = this.total_rewards / this.current_votes;
    }

    let rewardsPerVoteNormalized;
    if (rewardsPerVote !== null) {
      if (rewardsPerVote > 0) {
        rewardsPerVoteNormalized = Math.min(100, Math.max(0, Math.pow(rewardsPerVote / 0.5, 0.5) * 100));
      } else {
        rewardsPerVoteNormalized = 0;
      }
    } else {
      rewardsPerVoteNormalized = Math.min(this.total_rewards / 10000.0, 1.0) * 100;
    }

    const rewardsTotalNormalized = Math.min(this.total_rewards / 10000.0, 1.0) * 100;
    const vaprNormalized = Math.min(this.vapr / 100.0, 10.0) * 10;
    const score = (rewardsPerVoteNormalized * 0.6) + (rewardsTotalNormalized * 0.25) + (vaprNormalized * 0.15);
    return score;
  }

  estimateUserRewards(userVotingPower) {
    if (this.current_votes === null || this.current_votes === 0) {
      return this.total_rewards;
    }
    const newTotalVotes = this.current_votes + userVotingPower;
    const userShare = userVotingPower / newTotalVotes;
    return userShare * this.total_rewards;
  }

  stabilityScore() {
    if (this.total_rewards === null || this.total_rewards <= 0) {
      return 0.0;
    }
    if (this.current_votes === null || this.current_votes <= 0) {
      return 0.0;
    }
    const voteDensity = this.current_votes / this.total_rewards;
    let normalizedDensity;
    if (voteDensity > 0) {
      normalizedDensity = Math.min(100, Math.max(0, Math.pow(voteDensity / 500.0, 0.5) * 100));
    } else {
      normalizedDensity = 0;
    }
    let rewardSizeFactor;
    if (this.total_rewards >= 50000) {
      rewardSizeFactor = 20;
    } else if (this.total_rewards >= 20000) {
      rewardSizeFactor = 10;
    } else {
      rewardSizeFactor = 0;
    }
    const stability = (normalizedDensity * 0.8) + (rewardSizeFactor * 0.2);
    return Math.min(100, Math.max(0, stability));
  }

  stabilityAdjustedScore(userVotingPower = null) {
    const stability = this.stabilityScore();
    if (userVotingPower !== null && userVotingPower > 0) {
      const estimatedReward = this.estimateUserRewards(userVotingPower);
      let normalizedReward;
      if (estimatedReward > 0) {
        normalizedReward = Math.min(100, Math.max(0, Math.pow(estimatedReward / 500.0, 0.5) * 100));
      } else {
        normalizedReward = 0;
      }
      return (normalizedReward * 0.7) + (stability * 0.3);
    } else {
      const profitability = this.profitabilityScore();
      return (profitability * 0.7) + (stability * 0.3);
    }
  }

  rewardsPerVote() {
    if (this.current_votes !== null && this.current_votes > 0) {
      return this.total_rewards / this.current_votes;
    }
    return null;
  }
}

// Pool extraction functions
function extractPoolsFromDOM() {
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

function extractPoolFromElement(element) {
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
      console.warn('Could not find right section for pool extraction');
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
    
    if (!rightSection) {
      // Can't extract without right section
      return new Pool({
        name,
        total_rewards: 0.0,
        vapr: 0.0,
        current_votes: null,
        pool_id: poolId,
        pool_type: poolType,
        fee_percentage: feePercentage
      });
    }
    
    // Get all liquidity-pool-cell-data sections (each column)
    const dataSections = rightSection.querySelectorAll('div.liquidity-pool-cell-data');
    
    // Find specific sections by their classes (matching actual HTML structure)
    let totalRewardsSection = null;
    let vaprSection = null;
    let votesSection = null;
    let feesSection = null;
    let incentivesSection = null;
    
    for (const section of dataSections) {
      const classes = section.className || '';
      if (classes.includes('total-rewards')) {
        totalRewardsSection = section;
      } else if (classes.includes('last')) {
        vaprSection = section; // VAPR is in "last" section
      } else if (classes.includes('end')) {
        votesSection = section; // Votes are in "end" section
      } else if (classes.includes('incentives')) {
        incentivesSection = section;
      } else if (!classes.includes('incentives') && !classes.includes('total-rewards') && !classes.includes('last') && !classes.includes('end')) {
        // Likely the fees section (first data section that's not special)
        if (!feesSection) {
          feesSection = section;
        }
      }
    }
    
    // Extract VAPR from vapr section (has class "voting-pool-cell-vapr-info")
    // Structure: <div class="liquidity-pool-cell-data last"><div class="voting-pool-cell-vapr-info"><div class="first">216.5%</div>
    if (vaprSection) {
      const vaprInfo = vaprSection.querySelector('div.voting-pool-cell-vapr-info');
      if (vaprInfo) {
        const firstDiv = vaprInfo.querySelector('div.first');
        if (firstDiv) {
          const vaprText = firstDiv.textContent.trim();
          // Pattern: "216.5%" - extract just the number and %
          const vaprMatch = vaprText.match(/([\d,]+\.?\d*)\s*%/);
          if (vaprMatch) {
            try {
              const vaprVal = parseFloat(vaprMatch[1].replace(/,/g, '').replace('~', ''));
              // VAPR can be any positive value >= 1% (to exclude fee percentages which are < 1%)
              // Some pools have VAPR in the 30-50% range, others are 100-300%+
              if (vaprVal >= 1 && vaprVal < 10000) {
                vapr = vaprVal;
              }
            } catch (e) {
              console.warn('Error parsing VAPR:', vaprText, e);
            }
          }
        }
      }
    }
    
    // Note: Removed debug warning to reduce console spam - VAPR extraction will fall back to text-based search if section-based fails
    
    // Extract total rewards from total-rewards section
    // Structure: <div class="liquidity-pool-cell-data total-rewards"><div class="voting-pool-cell-slot"><div class="voting-pool-cell-slot-container"><div class="voting-pool-data total">~$23.77K</div>
    if (totalRewardsSection) {
      const slot = totalRewardsSection.querySelector('div.voting-pool-cell-slot');
      if (slot) {
        const slotContainer = slot.querySelector('div.voting-pool-cell-slot-container');
        if (slotContainer) {
          // Try exact selector first: div.voting-pool-data.total (element with both classes)
          let totalData = slotContainer.querySelector('div.voting-pool-data.total');
          // Fallback: try any div.voting-pool-data and check if it has class "total"
          if (!totalData) {
            const allData = slotContainer.querySelectorAll('div.voting-pool-data');
            for (const data of allData) {
              if (data.classList.contains('total')) {
                totalData = data;
                break;
              }
            }
          }
          // Final fallback: get any div.voting-pool-data that contains a $ sign
          if (!totalData) {
            const allData = slotContainer.querySelectorAll('div.voting-pool-data');
            for (const data of allData) {
              if (data.textContent.includes('$')) {
                totalData = data;
                break;
              }
            }
          }
          
          if (totalData) {
            const rewardsText = totalData.textContent.trim();
            // Pattern: "~$23.77K" or "~$39.34K" or "$23.77K" (with or without ~)
            const rewardsMatch = rewardsText.match(/~?\$([\d,]+\.?\d*)\s*([kKmMbB])?/);
            if (rewardsMatch) {
              try {
                let numStr = rewardsMatch[1].replace(/,/g, '').replace('~', '');
                let val = parseFloat(numStr);
                const suffix = rewardsMatch[2];
                if (suffix) {
                  const suffixLower = suffix.toLowerCase();
                  if (suffixLower === 'k') {
                    val *= 1000;
                  } else if (suffixLower === 'm' || suffixLower === 'b') {
                    val *= 1000000;
                  }
                }
                if (val > 0) {
                  totalRewards = val;
                }
              } catch (e) {
                console.warn('Error parsing total rewards:', rewardsText, e);
              }
            }
          } else {
            // Fallback: try searching all div.voting-pool-data for one with "Fees + Incentives" label
            const allData = slotContainer.querySelectorAll('div.voting-pool-data');
            for (const data of allData) {
              const text = data.textContent.trim();
              if (text.includes('$') && (text.includes('Fees + Incentives') || text.includes('total'))) {
                const rewardsMatch = text.match(/~?\$([\d,]+\.?\d*)\s*([kKmMbB])?/);
                if (rewardsMatch) {
                  try {
                    let numStr = rewardsMatch[1].replace(/,/g, '').replace('~', '');
                    let val = parseFloat(numStr);
                    const suffix = rewardsMatch[2];
                    if (suffix) {
                      const suffixLower = suffix.toLowerCase();
                      if (suffixLower === 'k') {
                        val *= 1000;
                      } else if (suffixLower === 'm' || suffixLower === 'b') {
                        val *= 1000000;
                      }
                    }
                    if (val > 0) {
                      totalRewards = val;
                      break;
                    }
                  } catch (e) {}
                }
              }
            }
          }
        }
      }
    }
    
    // Debug: log if total rewards weren't found
    if (totalRewards === 0.0 && totalRewardsSection) {
      console.warn('Total rewards extraction failed. Section found but no value extracted. Section HTML:', totalRewardsSection.innerHTML.substring(0, 200));
    }
    
    // Extract votes from end section
    // Structure: <div class="liquidity-pool-cell-data end"><div class="voting-pool-cell-slot"><div class="voting-pool-cell-slot-container"><div class="voting-pool-data total">11.09M</div>
    if (votesSection) {
      const slot = votesSection.querySelector('div.voting-pool-cell-slot');
      if (slot) {
        const slotContainer = slot.querySelector('div.voting-pool-cell-slot-container');
        if (slotContainer) {
          // Try exact selector first: div.voting-pool-data.total (element with both classes)
          let votesData = slotContainer.querySelector('div.voting-pool-data.total');
          // Fallback: try any div.voting-pool-data and check if it has class "total"
          if (!votesData) {
            const allData = slotContainer.querySelectorAll('div.voting-pool-data');
            for (const data of allData) {
              if (data.classList.contains('total')) {
                votesData = data;
                break;
              }
            }
          }
          // Final fallback: just get the first div.voting-pool-data (votes are usually first)
          if (!votesData) {
            votesData = slotContainer.querySelector('div.voting-pool-data');
          }
          
          if (votesData) {
            const votesText = votesData.textContent.trim();
            // Pattern: "11.09M" or "583.21K" or "16.19M" (no $ sign, just number with M/K)
            // The text should be just the number and suffix, not mixed with other text
            // First try to match the full text as a number with suffix
            const votesMatch = votesText.match(/^([\d,]+\.?\d*)\s*([MmKk])\b/);
            if (votesMatch) {
              try {
                let numStr = votesMatch[1].replace(/,/g, '').replace('~', '');
                let votes = parseFloat(numStr);
                const suffix = votesMatch[2].toLowerCase();
                if (suffix === 'm') {
                  votes *= 1000000;
                } else if (suffix === 'k') {
                  votes *= 1000;
                }
                if (votes > 0 && votes < 1000000000) {
                  currentVotes = votes;
                }
              } catch (e) {
                console.warn('Error parsing votes:', votesText, e);
              }
            } else {
              // Try matching anywhere in the text (fallback for cases where there's extra whitespace)
              const votesMatchAnywhere = votesText.match(/([\d,]+\.?\d*)\s*([MmKk])\b/);
              if (votesMatchAnywhere) {
                try {
                  let numStr = votesMatchAnywhere[1].replace(/,/g, '').replace('~', '');
                  let votes = parseFloat(numStr);
                  const suffix = votesMatchAnywhere[2].toLowerCase();
                  if (suffix === 'm') {
                    votes *= 1000000;
                  } else if (suffix === 'k') {
                    votes *= 1000;
                  }
                  // Only accept if it's a reasonable vote count (>= 1000)
                  // And prefer M suffix over K (votes are usually in millions, not thousands)
                  if (votes >= 1000 && votes < 1000000000) {
                    currentVotes = votes;
                  }
                } catch (e) {}
              } else {
                // Try parsing as plain number (no suffix) - could be in thousands format like "634.51" (meaning 634,510)
                // Or could be a plain number like "634510"
                const plainMatch = votesText.match(/^([\d,]+\.?\d*)$/);
                if (plainMatch) {
                  try {
                    let votes = parseFloat(plainMatch[1].replace(/,/g, ''));
                    // If the number has a decimal point and is relatively small (< 10000), it might be in thousands
                    // e.g., "634.51" might mean 634,510 votes
                    if (plainMatch[1].includes('.') && votes < 10000 && votes >= 1) {
                      votes *= 1000; // Convert thousands to actual number
                    }
                    // Only accept if it's a reasonable vote count (>= 1000)
                    if (votes >= 1000 && votes < 1000000000) {
                      currentVotes = votes;
                    }
                  } catch (e) {}
                }
              }
            }
          }
        }
      }
    }
    
    // Note: Removed debug warning to reduce console spam - votes extraction will fall back to text-based search if section-based fails
    
    // Fallback: Extract all text and try to find numbers if section-based extraction failed
    const allText = element.textContent || '';
    
    // If we still don't have values, try text-based extraction
    if (totalRewards === 0.0) {
      // Try to find total rewards - look for $ amounts with k/K/m/M suffixes
      // Pattern: "~$57.56k" or "$1.2M" or "$57,560" (note: page uses ~$ prefix)
      const dollarAmounts = allText.matchAll(/~?\$([\d,]+\.?\d*)\s*([kKmMbB])?/g);
      const rewardValues = [];
      for (const match of dollarAmounts) {
      try {
        let numStr = match[1].replace(/,/g, '').replace('~', '');
        let val = parseFloat(numStr);
        const suffix = match[2];
        if (suffix) {
          const suffixLower = suffix.toLowerCase();
          if (suffixLower === 'k') {
            val *= 1000;
          } else if (suffixLower === 'm' || suffixLower === 'b') {
            val *= 1000000;
          }
        }
        if (val > 0 && val < 1000000000) { // Reasonable range (up to $1B)
          rewardValues.push(val);
        }
      } catch (e) {}
    }
    
    // Use the largest dollar amount as total rewards (likely the total)
    // But also check for "Total" or "=" patterns
    if (rewardValues.length > 0) {
      // Look for "Total: ~$X" or "= ~$X" pattern (page uses ~$ prefix)
      const totalMatch = allText.match(/(?:total|=\s*)\s*~?\$?([\d,]+\.?\d*)\s*([kKmMbB])?/i);
      if (totalMatch) {
        try {
          let numStr = totalMatch[1].replace(/,/g, '').replace('~', '');
          let totalVal = parseFloat(numStr);
          const suffix = totalMatch[2];
          if (suffix) {
            const suffixLower = suffix.toLowerCase();
            if (suffixLower === 'k') {
              totalVal *= 1000;
            } else if (suffixLower === 'm' || suffixLower === 'b') {
              totalVal *= 1000000;
            }
          }
          if (totalVal > 0) {
            totalRewards = totalVal;
          } else {
            // Fallback: use max or sum
            if (rewardValues.length > 1) {
              totalRewards = rewardValues.reduce((a, b) => a + b, 0);
            } else {
              totalRewards = Math.max(...rewardValues);
            }
          }
        } catch (e) {
          // Fallback to max
          totalRewards = Math.max(...rewardValues);
        }
      } else {
        // No "Total" pattern found, use max or sum
        if (rewardValues.length > 1) {
          // If multiple values, might be fees + incentives, so sum them
          totalRewards = rewardValues.reduce((a, b) => a + b, 0);
        } else {
          totalRewards = Math.max(...rewardValues);
        }
      }
    }
    } // Close if (totalRewards === 0.0)
    
    // Try to find VAPR - look for percentage (fallback only if section-based extraction failed)
    // Only use this if we didn't find VAPR from the section-based approach
    if (vapr === 0.0) {
      const percentages = allText.match(/([\d,]+\.?\d*)\s*%/g);
      if (percentages) {
        // Filter out small percentages (fee percentages) and find the largest
        // VAPR is typically the largest percentage (> 1%)
        const vaprValues = percentages.map(p => {
          try {
            return parseFloat(p.replace(/,/g, '').replace('%', '').replace('~', ''));
          } catch (e) {
            return 0;
          }
        }).filter(v => v >= 1 && v < 10000); // Filter out fee percentages (< 1%)
        
        if (vaprValues.length > 0) {
          // Use the largest percentage as VAPR
          vapr = Math.max(...vaprValues);
        }
      }
    }
    
    // Try to find votes - look for numbers with optional k/K/m/M suffixes
    // Python: First try pattern with K/M suffix (thousands/millions)
    // Python pattern: r'([\d,]+\.?\d*)\s*([MmKk])\b'
    // IMPORTANT: Only use fallback if section-based extraction failed
    // And prefer M suffix over K (votes are usually in millions, not token amounts in thousands)
    if (!currentVotes) {
      // Find all matches with M/K suffix
      const allVoteMatches = [...allText.matchAll(/([\d,]+\.?\d*)\s*([MmKk])\b/g)];
      if (allVoteMatches.length > 0) {
        // Prefer matches with 'M' suffix (millions) over 'K' (thousands)
        // Token amounts are usually in K, votes are usually in M
        const mMatches = allVoteMatches.filter(m => m[2].toLowerCase() === 'm');
        const matchesToUse = mMatches.length > 0 ? mMatches : allVoteMatches;
        
        // Use the largest value (most likely to be votes)
        let maxVotes = 0;
        for (const match of matchesToUse) {
          try {
            let numStr = match[1].replace(/,/g, '').replace('~', '');
            let votes = parseFloat(numStr);
            const suffix = match[2].toLowerCase();
            if (suffix === 'm') {
              votes *= 1000000;
            } else if (suffix === 'k') {
              votes *= 1000;
            }
            // Only consider reasonable vote counts
            // And prefer M suffix values (votes) over K suffix (might be token amounts)
            if (votes >= 1000 && votes < 1000000000) {
              if (suffix === 'm' || maxVotes === 0) {
                maxVotes = Math.max(maxVotes, votes);
              }
            }
          } catch (e) {}
        }
        if (maxVotes > 0) {
          currentVotes = maxVotes;
        }
      }
    }
    
    // Fallback: look for numbers followed by "vote" or veBLACK
    if (!currentVotes) {
      const votesPatterns = [
        /([\d,]+\.?\d*)\s*([kKmM])?\s*(?:votes?|veBLACK)/i,
        /(?:votes?|veBLACK)[\s:]*([\d,]+\.?\d*)\s*([kKmM])?/i
      ];
      
      for (const pattern of votesPatterns) {
        const votesMatch = allText.match(pattern);
        if (votesMatch) {
          try {
            let numStr = votesMatch[1].replace(/,/g, '').replace('~', '');
            let votes = parseFloat(numStr);
            const suffix = votesMatch[2];
            if (suffix) {
              const suffixLower = suffix.toLowerCase();
              if (suffixLower === 'k') {
                votes *= 1000;
              } else if (suffixLower === 'm') {
                votes *= 1000000;
              }
            }
            if (votes > 0 && votes < 1000000000) {
              currentVotes = votes;
              break;
            }
          } catch (e) {}
        }
      }
    }
    
    // Final fallback: look for large numbers that might be votes
    // Python: Look for standalone numbers that could be votes
    // Python: votes are typically between 1,000 and 999,999 (without M)
    if (!currentVotes) {
      const numbers = allText.match(/\b([\d,]+)\b/g);
      if (numbers) {
        const voteCandidates = [];
        for (const numStr of numbers) {
          try {
            const numVal = parseFloat(numStr.replace(/,/g, ''));
            // Python: if 1000 <= num_val < 1000000:
            if (numVal >= 1000 && numVal < 1000000) {
              // Python: Check context to avoid percentages and dollar amounts
              const numPos = allText.indexOf(numStr);
              if (numPos >= 0) {
                const context = allText.substring(Math.max(0, numPos - 10), Math.min(allText.length, numPos + numStr.length + 10));
                // Python: if '$' not in context and '%' not in context:
                if (!context.includes('$') && !context.includes('%')) {
                  voteCandidates.push(numVal);
                }
              }
            }
          } catch (e) {}
        }
        // Python: If multiple candidates, take the largest (most likely to be votes)
        if (voteCandidates.length > 0) {
          currentVotes = Math.max(...voteCandidates);
        }
      }
    }
    
    // Note: Old slot-based extraction removed - using section-based approach above
    // The section-based approach is more reliable as it uses semantic class names
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

// Recommender function
function fnmatch(pattern, string) {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(string);
}

function recommendPools(pools, options = {}) {
  const {
    topN = 5,
    userVotingPower = null,
    hideVamm = false,
    minRewards = null,
    maxPoolPercentage = null,
    poolName = null,
    sortBy = 'auto'
  } = options;

  if (!pools || pools.length === 0) {
    return [];
  }

  let filteredPools = [...pools];

  if (hideVamm) {
    filteredPools = filteredPools.filter(p => p.pool_type !== 'vAMM');
  }

  if (minRewards !== null) {
    filteredPools = filteredPools.filter(p => p.total_rewards >= minRewards);
  }

  if (poolName !== null) {
    let pattern = poolName;
    if (!pattern.includes('*') && !pattern.includes('?')) {
      pattern = `*${pattern}*`;
    }
    filteredPools = filteredPools.filter(pool => fnmatch(pattern, pool.name));
  }

  if (maxPoolPercentage !== null && userVotingPower !== null) {
    filteredPools = filteredPools.filter(pool => {
      if (pool.current_votes === null || pool.current_votes === 0) {
        return maxPoolPercentage >= 100.0;
      }
      const newTotalVotes = pool.current_votes + userVotingPower;
      const userPercentage = (userVotingPower / newTotalVotes) * 100;
      return userPercentage <= maxPoolPercentage;
    });
  }

  let sortMethod;
  if (sortBy === 'auto') {
    sortMethod = userVotingPower !== null ? 'reward' : 'profitability';
  } else {
    sortMethod = sortBy;
  }

  let sortedPools;
  if (sortMethod === 'reward') {
    if (userVotingPower === null) {
      throw new Error("Cannot sort by 'reward' without userVotingPower");
    }
    sortedPools = filteredPools.sort((a, b) => {
      return b.estimateUserRewards(userVotingPower) - a.estimateUserRewards(userVotingPower);
    });
  } else if (sortMethod === 'profitability') {
    sortedPools = filteredPools.sort((a, b) => {
      return b.profitabilityScore() - a.profitabilityScore();
    });
  } else if (sortMethod === 'stability') {
    sortedPools = filteredPools.sort((a, b) => {
      return b.stabilityAdjustedScore(userVotingPower) - a.stabilityAdjustedScore(userVotingPower);
    });
  } else {
    throw new Error(`Invalid sortBy value: ${sortBy}`);
  }

  return sortedPools.slice(0, topN);
}

// Now include the main content script logic
console.log('Blackhole DEX Tools: Content script loaded');

let settings = {
  votingPower: null,
  topN: 10,
  minRewards: null,
  maxPoolPercentage: null,
  sortBy: 'auto',
  hideVamm: false,
  enableOverlay: true
};

chrome.storage.local.get(['blackholeSettings'], (result) => {
  if (result.blackholeSettings) {
    settings = { ...settings, ...result.blackholeSettings };
  }
  init();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.blackholeSettings) {
    settings = { ...settings, ...changes.blackholeSettings.newValue };
    updateOverlay();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SETTINGS_UPDATED') {
    chrome.storage.local.get(['blackholeSettings'], (result) => {
      if (result.blackholeSettings) {
        settings = { ...settings, ...result.blackholeSettings };
        // Update overlay visibility based on enableOverlay setting
        let overlay = document.getElementById('blackhole-tools-overlay');
        if (!overlay) {
          overlay = injectOverlay();
        }
        overlay.style.display = settings.enableOverlay ? 'block' : 'none';
        // Always update overlay content (even if hidden) so it's ready when shown
        updateOverlay();
      }
    });
  } else if (message.type === 'REFRESH_POOL_DATA') {
    // Reset retry counter
    window._poolExtractionRetries = 0;
    fetchPoolData(true);
  } else if (message.type === 'SHOW_OVERLAY') {
    // Show overlay if hidden
    let overlay = document.getElementById('blackhole-tools-overlay');
    if (!overlay) {
      overlay = injectOverlay();
    }
    overlay.style.display = 'block';
    // Update enableOverlay setting to true
    settings.enableOverlay = true;
    chrome.storage.local.set({ 
      overlayVisible: true,
      blackholeSettings: settings
    });
    updateOverlay();
  } else if (message.type === 'TOGGLE_OVERLAY') {
    // Toggle overlay visibility
    let overlay = document.getElementById('blackhole-tools-overlay');
    if (!overlay) {
      overlay = injectOverlay();
    }
    const isVisible = overlay.style.display !== 'none' && overlay.offsetParent !== null;
    overlay.style.display = isVisible ? 'none' : 'block';
    settings.enableOverlay = !isVisible;
    chrome.storage.local.set({ 
      overlayVisible: !isVisible,
      blackholeSettings: settings
    });
    if (!isVisible) {
      updateOverlay();
    }
  }
  return true;
});

function init() {
  console.log('Blackhole DEX Tools: Initializing...');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupExtension();
    });
  } else {
    setupExtension();
  }
}

function setupExtension() {
  setTimeout(() => {
    fetchPoolData();
    observePoolList();
    
    // Always inject overlay (visibility controlled by enableOverlay setting)
    injectOverlay();
  }, 3000);
}

let isFetchingPoolData = false;
let lastFetchTime = 0;
const FETCH_COOLDOWN = 5000; // Don't fetch more than once every 5 seconds

async function fetchPoolData(forceRefresh = false) {
  // Prevent concurrent fetches
  if (isFetchingPoolData) {
    console.log('Pool data fetch already in progress, skipping...');
    return;
  }
  
  // Rate limiting - don't fetch too frequently
  const now = Date.now();
  if (!forceRefresh && (now - lastFetchTime) < FETCH_COOLDOWN) {
    console.log('Pool data fetch cooldown active, skipping...');
    return;
  }
  
  isFetchingPoolData = true;
  lastFetchTime = now;
  
  try {
    console.log('Fetching pool data...');
    let pools = [];
    
    // Wait a bit more for React to fully render
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      pools = extractPoolsFromDOM();
      console.log(`Extracted ${pools.length} pools from DOM`);
      
      // Debug: log first pool to see what we're getting (only once)
      if (pools.length > 0 && !window._loggedSamplePool) {
        // Also log the raw text and slot structure to see what we're parsing
        const firstElement = document.querySelector('div.liquidity-pool-cell.even, div.liquidity-pool-cell.odd');
        const rawText = firstElement ? firstElement.textContent : 'N/A';
        
        // Log slot structure
        if (firstElement) {
          const rightSection = firstElement.querySelector('div.liquidity-pool-cell-right');
          if (rightSection) {
            const slots = rightSection.querySelectorAll('div.voting-pool-cell-slot');
            console.log(`Slot structure: ${slots.length} slots found`);
            for (let i = 0; i < Math.min(slots.length, 9); i++) {
              const slotText = slots[i].textContent.trim();
              console.log(`  Slot ${i}: "${slotText.substring(0, 100)}"`);
            }
          }
        }
        
        console.log('Sample pool data:', {
          name: pools[0].name,
          total_rewards: pools[0].total_rewards,
          vapr: pools[0].vapr,
          current_votes: pools[0].current_votes,
          pool_id: pools[0].pool_id
        });
        
        // Show raw text snippet for debugging
        const textSnippet = rawText.substring(0, 500);
        console.log('Raw text snippet (first 500 chars):', textSnippet);
        
        // Check for specific known pools and compare
        if (pools[0].name.includes('WETH.e/WAVAX')) {
          console.warn('⚠️ CL200-WETH.e/WAVAX extraction check:');
          console.warn(`  Expected: rewards ~$39.34K (39340), VAPR 216.5%, votes 11.09M (11090000)`);
          console.warn(`  Got: rewards $${pools[0].total_rewards}, VAPR ${pools[0].vapr}%, votes ${pools[0].current_votes}`);
        }
        
        // Check if votes look suspiciously low (might be missing k/M suffix)
        if (pools[0].current_votes && pools[0].current_votes < 100000) {
          console.warn(`⚠️ Warning: Pool "${pools[0].name}" has suspiciously low votes (${pools[0].current_votes}). Expected values in thousands/millions.`);
          console.warn('Looking for vote patterns in raw text...');
          const votePatterns = rawText.match(/([\d,]+\.?\d*)\s*([MmKk])\b/g);
          if (votePatterns) {
            console.warn('Found potential vote patterns:', votePatterns);
          }
        }
        
        // Check if VAPR looks wrong (picking up fee percentage)
        if (pools[0].vapr && pools[0].vapr < 1 && pools[0].vapr > 0) {
          console.warn(`⚠️ Warning: Pool "${pools[0].name}" has very low VAPR (${pools[0].vapr}%). Might be picking up fee percentage instead.`);
          console.warn('Looking for VAPR patterns in raw text...');
          const vaprPatterns = rawText.match(/([\d,]+\.?\d*)\s*%/g);
          if (vaprPatterns) {
            console.warn('Found percentage patterns:', vaprPatterns);
            const pctValues = vaprPatterns.map(p => parseFloat(p.replace('%', '').replace(/,/g, '')));
            const largePcts = pctValues.filter(v => v > 50);
            if (largePcts.length > 0) {
              console.warn(`  Large percentages found (likely VAPR): ${largePcts.join(', ')}`);
            }
          }
        }
        
        window._loggedSamplePool = true;
      }
    } catch (error) {
      console.warn('Error extracting from DOM:', error);
      // Don't log stack trace repeatedly
      if (!window._loggedExtractionError) {
        console.error('Extraction error details:', error.stack);
        window._loggedExtractionError = true;
      }
    }
    
    if (pools.length === 0) {
      console.warn('No pools extracted. Page may not be fully loaded. Retrying...');
      // Retry after a delay (max 3 retries)
      if (!window._poolExtractionRetries) {
        window._poolExtractionRetries = 0;
      }
      window._poolExtractionRetries++;
      if (window._poolExtractionRetries < 3) {
        isFetchingPoolData = false; // Allow retry
        setTimeout(() => fetchPoolData(forceRefresh), 3000);
        return;
      } else {
        console.error('Failed to extract pools after 3 retries. Check page structure.');
        // Show error in overlay if it exists
        const contentEl = document.getElementById('blackhole-tools-content');
        if (contentEl) {
          contentEl.innerHTML = '<p style="color: #ff8c00;">Failed to extract pool data. Try refreshing the page.</p>';
        }
        isFetchingPoolData = false;
        return;
      }
    }
    
    // Reset retry counter on success
    window._poolExtractionRetries = 0;
    
    chrome.storage.local.set({ 
      poolData: pools.map(p => ({
        name: p.name,
        total_rewards: p.total_rewards,
        vapr: p.vapr,
        current_votes: p.current_votes,
        pool_id: p.pool_id,
        pool_type: p.pool_type,
        fee_percentage: p.fee_percentage
      })),
      poolDataTimestamp: Date.now()
    });
    
    // Always update overlay (even if hidden) so it's ready when shown
    // The overlay visibility is controlled by enableOverlay setting
    updateOverlay();
  } catch (error) {
    console.error('Error fetching pool data:', error);
  } finally {
    isFetchingPoolData = false;
  }
}

let poolObserver = null;
let updateOverlayTimer = null;

function observePoolList() {
  // Don't create multiple observers
  if (poolObserver) {
    return;
  }
  
  // Watch for changes to the pool list container with debouncing
  poolObserver = new MutationObserver(() => {
    // Debounce updates to prevent infinite loops
    if (updateOverlayTimer) {
      clearTimeout(updateOverlayTimer);
    }
    updateOverlayTimer = setTimeout(() => {
      // Always update overlay (even if hidden) so it's ready when shown
      updateOverlay();
    }, 2000); // Wait 2 seconds after last change
  });
  
  const checkForPoolContainer = setInterval(() => {
    const poolContainer = document.querySelector('[data-pool-list]') || 
                         document.querySelector('.pool-list') ||
                         document.body;
    if (poolContainer) {
      poolObserver.observe(poolContainer, {
        childList: true,
        subtree: true
      });
      clearInterval(checkForPoolContainer);
      console.log('Blackhole DEX Tools: Pool observer started');
    }
  }, 1000);
  
  setTimeout(() => clearInterval(checkForPoolContainer), 10000);
}

function injectOverlay() {
  // Check if overlay already exists
  let overlay = document.getElementById('blackhole-tools-overlay');
  if (overlay) {
    // Overlay exists, just update it
    updateOverlay();
    return overlay;
  }
  
  overlay = document.createElement('div');
  overlay.id = 'blackhole-tools-overlay';
  overlay.innerHTML = `
    <div class="blackhole-tools-panel">
      <div class="blackhole-tools-header">
        <h3>Pool Recommendations</h3>
        <div class="blackhole-tools-header-actions">
          <button class="blackhole-tools-select-all" id="blackhole-tools-select-all" title="Select all recommended pools">Select All</button>
          <button class="blackhole-tools-clear-all" id="blackhole-tools-clear-all" title="Clear all selected pools">Clear All</button>
          <button class="blackhole-tools-split-votes" id="blackhole-tools-split-votes" title="Split votes evenly across selected pools">Split Votes</button>
          <button class="blackhole-tools-close" id="blackhole-tools-close" title="Hide panel">×</button>
        </div>
      </div>
      <div class="blackhole-tools-content" id="blackhole-tools-content">
        <p>Loading recommendations...</p>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  console.log('Blackhole DEX Tools: Overlay injected');
  
  // Load saved position or use default
  chrome.storage.local.get(['blackholeOverlayPosition'], (result) => {
    if (result.blackholeOverlayPosition && result.blackholeOverlayPosition.top && result.blackholeOverlayPosition.left) {
      overlay.style.setProperty('top', result.blackholeOverlayPosition.top, 'important');
      overlay.style.setProperty('left', result.blackholeOverlayPosition.left, 'important');
      overlay.style.setProperty('right', 'auto', 'important');
    }
  });
  
  // Make header draggable
  const header = overlay.querySelector('.blackhole-tools-header');
  const headerActions = header.querySelector('.blackhole-tools-header-actions');
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  
  header.addEventListener('mousedown', (e) => {
    // Don't start drag if clicking on buttons or the actions container
    if (e.target.closest('button') || e.target === headerActions || headerActions.contains(e.target)) {
      return;
    }
    
    isDragging = true;
    const rect = overlay.getBoundingClientRect();
    
    // Calculate offset from mouse to overlay top-left corner
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    
    // Switch to left/top positioning for dragging
    // Always set both left and top as inline styles for reliable dragging
    // Use setProperty to override !important rules
    overlay.style.setProperty('left', rect.left + 'px', 'important');
    overlay.style.setProperty('top', rect.top + 'px', 'important');
    overlay.style.setProperty('right', 'auto', 'important');
    overlay.style.setProperty('bottom', 'auto', 'important');
    
    overlay.style.transition = 'none'; // Disable transitions during drag
    e.preventDefault();
    
    console.log('Drag start:', { 
      mouseX: e.clientX, 
      mouseY: e.clientY, 
      rectLeft: rect.left, 
      rectTop: rect.top,
      dragOffsetX: dragOffset.x,
      dragOffsetY: dragOffset.y
    });
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    let newLeft = e.clientX - dragOffset.x;
    let newTop = e.clientY - dragOffset.y;
    
    // Constrain to viewport
    const rect = overlay.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width;
    const maxTop = window.innerHeight - rect.height;
    
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));
    
    // Force update both positions using setProperty to override !important
    overlay.style.setProperty('left', newLeft + 'px', 'important');
    overlay.style.setProperty('top', newTop + 'px', 'important');
    overlay.style.setProperty('right', 'auto', 'important');
    overlay.style.setProperty('bottom', 'auto', 'important');
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      overlay.style.transition = ''; // Re-enable transitions
      // Save position
      const position = {
        top: overlay.style.top,
        left: overlay.style.left
      };
      chrome.storage.local.set({ blackholeOverlayPosition: position });
    }
  });
  
  // Close button - hide overlay and update setting
  document.getElementById('blackhole-tools-close').addEventListener('click', (e) => {
    e.stopPropagation();
    overlay.style.display = 'none';
    settings.enableOverlay = false;
    chrome.storage.local.set({ 
      overlayVisible: false,
      blackholeSettings: settings
    });
  });
  
  // Select all button
  document.getElementById('blackhole-tools-select-all').addEventListener('click', async (e) => {
    e.stopPropagation();
    await selectRecommendedPools();
    // Refresh overlay to show updated selection state
    setTimeout(() => updateOverlay(), 500);
  });
  
  // Clear all votes button
  document.getElementById('blackhole-tools-clear-all').addEventListener('click', async (e) => {
    e.stopPropagation();
    const clearedCount = await clearAllSelectedPools();
    
    // Show brief feedback
    const contentEl = document.getElementById('blackhole-tools-content');
    if (contentEl && clearedCount > 0) {
      const originalHTML = contentEl.innerHTML;
      contentEl.innerHTML = `<p style="color: #32cd32; text-align: center; padding: 20px;">✓ Cleared ${clearedCount} selected pool(s)</p>`;
      setTimeout(() => {
        updateOverlay();
      }, 1000);
    } else if (clearedCount === 0) {
      const originalHTML = contentEl.innerHTML;
      contentEl.innerHTML = `<p style="color: #999; text-align: center; padding: 20px;">No pools were selected</p>`;
      setTimeout(() => {
        updateOverlay();
      }, 1000);
    }
  });
  
  // Split votes evenly button
  document.getElementById('blackhole-tools-split-votes').addEventListener('click', async (e) => {
    e.stopPropagation();
    await splitVotesEvenly();
  });
  
  // Load visibility state from enableOverlay setting
  chrome.storage.local.get(['blackholeSettings'], (result) => {
    const enableOverlay = result.blackholeSettings?.enableOverlay !== false; // Default to true
    overlay.style.display = enableOverlay ? 'block' : 'none';
    if (enableOverlay) {
      updateOverlay();
    }
  });
  
  return overlay;
}

// Note: Toggle button removed - overlay visibility is now controlled via extension popup

// Select recommended pools for voting
async function selectRecommendedPools() {
  return new Promise(async (resolve) => {
    chrome.storage.local.get(['poolData', 'blackholeSettings'], async (result) => {
    const poolData = result.poolData || [];
    const settings = result.blackholeSettings || {};
    
    if (poolData.length === 0) {
      alert('No pool data available. Please refresh the page and wait for pools to load.');
      return;
    }
    
    const pools = poolData.map(data => new Pool(data));
    const userVotingPower = (settings.votingPower !== null && settings.votingPower !== undefined) 
      ? settings.votingPower 
      : null;
    
    const recommendations = recommendPools(pools, {
      topN: settings.topN || 10,
      userVotingPower: userVotingPower,
      hideVamm: settings.hideVamm,
      minRewards: settings.minRewards,
      maxPoolPercentage: settings.maxPoolPercentage,
      sortBy: settings.sortBy || 'auto'
    });
    
    if (recommendations.length === 0) {
      alert('No pools to select. Check your filters.');
      return;
    }
    
    const poolAddresses = recommendations
      .map(p => p.pool_id)
      .filter(id => id && id.startsWith('0x'));
    
    if (poolAddresses.length === 0) {
      alert('No pool addresses found. Cannot select pools automatically.');
      return;
    }
    
    console.log('Selecting pools:', poolAddresses);
    
    // First, clear all previously selected pools (if any)
    const clearedCount = await clearAllSelectedPools();
    if (clearedCount > 0) {
      // Wait a bit for the page to update after clearing
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Use the same logic as blackhole_select_pools.js
    let selectedCount = 0;
    const poolCells = document.querySelectorAll('div.liquidity-pool-cell');
    
    // Use for...of loop to support await
    for (const address of poolAddresses) {
      let found = false;
      
      for (let cell of poolCells) {
        const innerHTML = cell.innerHTML || '';
        const innerText = cell.innerText || '';
        
        if (innerHTML.includes(address) || innerText.includes(address)) {
          // Find the select button
          const selectButton = cell.querySelector('button.btn.yellow-btn.clickable') ||
                              cell.querySelector('button.btn.yellow-btn') ||
                              cell.querySelector('.liquidity-pool-cell-btn button') ||
                              cell.querySelector('.liquidity-pool-cell-right button') ||
                              cell.querySelector('button[class*="yellow-btn"]') ||
                              cell.querySelector('button:not([disabled])');
          
          if (selectButton && !selectButton.disabled) {
            try {
              selectButton.click();
              console.log(`✓ Selected pool: ${address}`);
              selectedCount++;
              found = true;
              // Small delay between clicks
              await new Promise(resolve => setTimeout(resolve, 100));
              break;
            } catch (e) {
              console.warn(`Error clicking button for ${address}:`, e);
            }
          }
        }
      }
      
      if (!found) {
        console.warn(`Could not find pool: ${address}`);
      }
    }
    
    console.log(`Selection complete: ${selectedCount} pools selected`);
    // Show feedback in overlay instead of alert
    const contentEl = document.getElementById('blackhole-tools-content');
    if (contentEl) {
      const originalHTML = contentEl.innerHTML;
      contentEl.innerHTML = `<p style="color: #32cd32; text-align: center; padding: 20px;">✓ Selected ${selectedCount} of ${poolAddresses.length} recommended pools!</p>`;
      setTimeout(() => {
        contentEl.innerHTML = originalHTML;
        updateOverlay();
      }, 2000);
    }
    resolve();
    });
  });
}

async function updateOverlay() {
  const contentEl = document.getElementById('blackhole-tools-content');
  if (!contentEl) return;
  
  const result = await chrome.storage.local.get(['poolData']);
  const poolData = result.poolData || [];
  
  if (poolData.length === 0) {
    contentEl.innerHTML = '<p>No pool data available. Click "Refresh Pool Data" in the extension popup.</p>';
    return;
  }
  
  const pools = poolData.map(data => new Pool(data));
  
  // Debug: log pool data (only once per session to avoid spam)
  const poolsWithData = pools.filter(p => p.total_rewards > 0 || p.vapr > 0);
  
  if (!window._loggedPoolProcessing) {
    console.log(`Processing ${pools.length} pools with filters:`, {
      topN: settings.topN || 10,
      votingPower: settings.votingPower,
      hideVamm: settings.hideVamm,
      minRewards: settings.minRewards,
      maxPoolPercentage: settings.maxPoolPercentage,
      sortBy: settings.sortBy || 'auto'
    });
    
    console.log(`Pools with data: ${poolsWithData.length} of ${pools.length}`);
    if (poolsWithData.length > 0) {
      console.log('Sample pool:', {
        name: poolsWithData[0].name,
        total_rewards: poolsWithData[0].total_rewards,
        vapr: poolsWithData[0].vapr,
        current_votes: poolsWithData[0].current_votes
      });
    }
    window._loggedPoolProcessing = true;
  }
  
  try {
    // Handle null/undefined voting power (convert to null for consistency)
    const userVotingPower = (settings.votingPower !== null && settings.votingPower !== undefined) 
      ? settings.votingPower 
      : null;
    
    // Debug: check what's being filtered (only once)
    if (!window._loggedFilterDebug) {
      console.log('=== FILTER DEBUG ===');
      console.log('Filter settings:', {
        hideVamm: settings.hideVamm,
        minRewards: settings.minRewards,
        maxPoolPercentage: settings.maxPoolPercentage,
        userVotingPower: userVotingPower,
        topN: settings.topN || 10,
        sortBy: settings.sortBy || 'auto'
      });
      
      // Test filtering manually to see what's happening
      let testPools = [...pools];
      console.log(`Starting with ${testPools.length} pools`);
      
      if (settings.hideVamm) {
        const before = testPools.length;
        testPools = testPools.filter(p => p.pool_type !== 'vAMM');
        console.log(`After hideVamm: ${testPools.length} (removed ${before - testPools.length})`);
      }
      
      if (settings.minRewards !== null && settings.minRewards !== undefined) {
        const before = testPools.length;
        testPools = testPools.filter(p => p.total_rewards >= settings.minRewards);
        console.log(`After minRewards (>=${settings.minRewards}): ${testPools.length} (removed ${before - testPools.length})`);
      }
      
      if (settings.maxPoolPercentage !== null && settings.maxPoolPercentage !== undefined && userVotingPower) {
        const before = testPools.length;
        let removedCount = 0;
        let keptCount = 0;
        const removedPools = [];
        const keptPools = [];
        
        // Calculate minimum votes needed to pass the filter
        // userPercentage = (userVotingPower / (poolVotes + userVotingPower)) * 100 <= maxPoolPercentage
        // Solving for poolVotes: poolVotes >= userVotingPower * (100/maxPoolPercentage - 1)
        const minVotesNeeded = userVotingPower * (100 / settings.maxPoolPercentage - 1);
        console.log(`To pass ${settings.maxPoolPercentage}% filter, pools need at least ${minVotesNeeded.toLocaleString(undefined, {maximumFractionDigits: 0})} votes`);
        
        testPools = testPools.filter(p => {
          if (p.current_votes === null || p.current_votes === 0) {
            const keep = settings.maxPoolPercentage >= 100.0;
            if (!keep && removedCount < 3) {
              removedPools.push({ name: p.name, reason: 'no votes (would be 100%)' });
            }
            return keep;
          }
          const newTotalVotes = p.current_votes + userVotingPower;
          const userPercentage = (userVotingPower / newTotalVotes) * 100;
          const keep = userPercentage <= settings.maxPoolPercentage;
          
          if (!keep && removedCount < 3) {
            removedPools.push({ 
              name: p.name, 
              votes: p.current_votes.toLocaleString(undefined, {maximumFractionDigits: 0}), 
              userPct: userPercentage.toFixed(2) + '%',
              reason: `user would have ${userPercentage.toFixed(2)}% (threshold: ${settings.maxPoolPercentage}%)`
            });
            removedCount++;
          } else if (keep && keptCount < 3) {
            keptPools.push({
              name: p.name,
              votes: p.current_votes.toLocaleString(undefined, {maximumFractionDigits: 0}),
              userPct: userPercentage.toFixed(2) + '%'
            });
            keptCount++;
          }
          return keep;
        });
        
        console.log(`After maxPoolPercentage (<=${settings.maxPoolPercentage}%): ${testPools.length} (removed ${before - testPools.length})`);
        if (removedPools.length > 0) {
          console.log('Example removed pools:', removedPools);
        }
        if (keptPools.length > 0) {
          console.log('Example kept pools:', keptPools);
        } else {
          console.warn(`⚠️ All pools removed by maxPoolPercentage filter! Pools need at least ${minVotesNeeded.toLocaleString(undefined, {maximumFractionDigits: 0})} votes to pass.`);
        }
      }
      
      console.log(`Final filtered pools: ${testPools.length}`);
      console.log('=== END FILTER DEBUG ===');
      window._loggedFilterDebug = true;
    }
    
    // Reset the max pool filter log flag so we can see what's happening
    window._loggedMaxPoolFilter = false;
    
    const recommendations = recommendPools(pools, {
      topN: settings.topN || 10,
      userVotingPower: userVotingPower,
      hideVamm: settings.hideVamm,
      minRewards: settings.minRewards,
      maxPoolPercentage: settings.maxPoolPercentage,
      sortBy: settings.sortBy || 'auto'
    });
    
    // Log recommendations
    if (!window._loggedRecommendations) {
      console.log(`Generated ${recommendations.length} recommendations`);
      if (recommendations.length > 0) {
        console.log('Top recommendations:', recommendations.slice(0, 3).map(p => ({
          name: p.name,
          estimatedReward: userVotingPower ? p.estimateUserRewards(userVotingPower) : null,
          total_rewards: p.total_rewards,
          current_votes: p.current_votes
        })));
      }
      window._loggedRecommendations = true;
    }
    
    if (recommendations.length === 0) {
      // Calculate what filters are removing pools
      let testPools = [...pools];
      let filterSteps = [];
      
      if (settings.hideVamm) {
        const before = testPools.length;
        testPools = testPools.filter(p => p.pool_type !== 'vAMM');
        filterSteps.push(`hideVamm: ${before} → ${testPools.length} (removed ${before - testPools.length})`);
      }
      
      if (settings.minRewards !== null && settings.minRewards !== undefined) {
        const before = testPools.length;
        testPools = testPools.filter(p => p.total_rewards >= settings.minRewards);
        filterSteps.push(`minRewards (>=$${settings.minRewards}): ${before} → ${testPools.length} (removed ${before - testPools.length})`);
      }
      
      if (settings.maxPoolPercentage !== null && settings.maxPoolPercentage !== undefined && userVotingPower) {
        const before = testPools.length;
        testPools = testPools.filter(p => {
          if (p.current_votes === null || p.current_votes === 0) {
            return settings.maxPoolPercentage >= 100.0;
          }
          const newTotalVotes = p.current_votes + userVotingPower;
          const userPercentage = (userVotingPower / newTotalVotes) * 100;
          return userPercentage <= settings.maxPoolPercentage;
        });
        filterSteps.push(`maxPoolPercentage (<=${settings.maxPoolPercentage}%): ${before} → ${testPools.length} (removed ${before - testPools.length})`);
      }
      
      let message = '<p style="color: #ff8c00;">No pools match your criteria. Try adjusting filters.</p>';
      message += `<p style="font-size: 11px; color: #999; margin-top: 8px;">`;
      message += `Total pools: ${pools.length}<br>`;
      message += `Pools with data: ${poolsWithData.length}<br>`;
      if (filterSteps.length > 0) {
        message += `<br><strong>Filter steps:</strong><br>`;
        filterSteps.forEach(step => {
          message += `${step}<br>`;
        });
      }
      message += `</p>`;
      message += `<p style="font-size: 11px; color: #ffd700; margin-top: 8px;">`;
      if (settings.maxPoolPercentage !== null && settings.maxPoolPercentage !== undefined) {
        message += `💡 <strong>Tip:</strong> Your maxPoolPercentage filter (${settings.maxPoolPercentage}%) is removing all pools. `;
        message += `With ${userVotingPower ? userVotingPower.toLocaleString() : 'your'} veBLACK, pools need at least ~${userVotingPower ? userVotingPower.toLocaleString() : 'equal'} votes to pass this filter. `;
        message += `Try removing this filter or setting it much higher (90-100%).`;
      } else {
        message += `💡 Check your other filters or try refreshing pool data.`;
      }
      message += `</p>`;
      contentEl.innerHTML = message;
      isUpdatingOverlay = false;
      return;
    }
    
    let html = '<div class="recommendations-list">';
    
    recommendations.forEach((pool, index) => {
      const estimatedReward = userVotingPower ? pool.estimateUserRewards(userVotingPower) : null;
      const profitabilityScore = pool.profitabilityScore();
      const stabilityScore = pool.stabilityScore();
      const rewardsPerVote = pool.rewardsPerVote();
      
      // Calculate share percentage if we have voting power and votes
      let sharePercentage = null;
      if (userVotingPower && pool.current_votes) {
        const newTotalVotes = pool.current_votes + userVotingPower;
        sharePercentage = (userVotingPower / newTotalVotes) * 100;
      }
      
      // Add click handler to select this pool
      const poolIdAttr = pool.pool_id ? `data-pool-id="${pool.pool_id}"` : '';
      
      // Check if this pool is currently selected
      const isSelected = pool.pool_id ? isPoolSelected(pool.pool_id) : false;
      const selectedClass = isSelected ? 'pool-selected' : '';
      const buttonText = isSelected ? 'Deselect' : 'Select';
      
      html += `
        <div class="recommendation-item ${selectedClass}" ${poolIdAttr} data-pool-name="${pool.name}">
          <div class="pool-rank">#${index + 1}</div>
          <div class="pool-info">
            <div class="pool-name">${pool.name || 'Unknown Pool'}</div>
            <div class="pool-metrics">
              <span>Rewards: $${pool.total_rewards > 0 ? pool.total_rewards.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}</span>
              <span>VAPR: ${pool.vapr > 0 ? pool.vapr.toFixed(2) : '0.00'}%</span>
              ${pool.current_votes ? `<span>Votes: ${pool.current_votes.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>` : ''}
              ${rewardsPerVote ? `<span>$/vote: $${rewardsPerVote.toFixed(6)}</span>` : ''}
            </div>
            ${estimatedReward ? `<div class="estimated-reward">Est. Reward: $${estimatedReward.toFixed(2)}${sharePercentage ? ` (${sharePercentage.toFixed(2)}% share)` : ''}</div>` : ''}
            <div class="pool-scores">
              <span>Profitability: ${profitabilityScore.toFixed(1)}</span>
              <span>Stability: ${stabilityScore.toFixed(1)}</span>
            </div>
            ${pool.pool_id ? `<button class="select-pool-btn ${isSelected ? 'selected' : ''}" data-pool-id="${pool.pool_id}">${buttonText}</button>` : ''}
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    contentEl.innerHTML = html;
    
    // Add click handlers for individual pool selection
    contentEl.querySelectorAll('.select-pool-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const poolId = btn.getAttribute('data-pool-id');
        await selectSinglePool(poolId);
      });
    });
    
  } catch (error) {
    console.error('Error generating recommendations:', error);
    contentEl.innerHTML = `<p style="color: #ff8c00;">Error generating recommendations: ${error.message}</p>`;
    console.error('Full error:', error);
  } finally {
    isUpdatingOverlay = false;
  }
}

// Check if a pool is currently selected
function isPoolSelected(poolId) {
  if (!poolId) return false;
  
  const poolCells = document.querySelectorAll('div.liquidity-pool-cell');
  for (let cell of poolCells) {
    const innerHTML = cell.innerHTML || '';
    const innerText = cell.innerText || '';
    
    if (innerHTML.includes(poolId) || innerText.includes(poolId)) {
      // Check for "Selected to vote" indicator
      const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
      if (selectToVoteContainer) {
        const completedText = selectToVoteContainer.querySelector('.select-to-vote.completed');
        if (completedText) {
          return true;
        }
      }
      // Alternative check: look for button that's not clickable (selected state)
      const selectButton = cell.querySelector('button.btn.yellow-btn');
      if (selectButton && !selectButton.classList.contains('clickable')) {
        return true;
      }
    }
  }
  return false;
}

// Clear all selected pools (including those not visible)
async function clearAllSelectedPools() {
  // Find ALL pool cells, including those not in viewport
  const allPoolCells = document.querySelectorAll('div.liquidity-pool-cell');
  let clearedCount = 0;
  const poolsToClear = [];
  
  // First pass: identify all selected pools
  for (let cell of allPoolCells) {
    const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
    if (selectToVoteContainer) {
      const completedText = selectToVoteContainer.querySelector('.select-to-vote.completed');
      if (completedText && completedText.textContent.includes('Selected to vote')) {
        poolsToClear.push(cell);
      }
    }
  }
  
  // Second pass: clear them (scroll into view if needed)
  for (let cell of poolsToClear) {
    // Check if cell is in viewport
    const rect = cell.getBoundingClientRect();
    const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight && 
                     rect.left >= 0 && rect.right <= window.innerWidth;
    
    if (!isVisible) {
      // Scroll the cell into view
      cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Wait for scroll to complete
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Find the "CLEAR" link/button to deselect it
    // When selected, the page shows "CLEAR" instead of "SELECT"
    // IMPORTANT: Must check text content to avoid clicking "Add Incentives" link
    const selectContainer = cell.querySelector('.select-to-vote-container');
    let clearLink = null;
    
    if (selectContainer) {
      // Look for CLEAR link specifically in the select-to-vote-container
      const allLinks = selectContainer.querySelectorAll('.voting-pool-add-incentives, div, button, a');
      for (const link of allLinks) {
        const text = link.textContent ? link.textContent.trim().toUpperCase() : '';
        if (text === 'CLEAR') {
          clearLink = link;
          break;
        }
      }
    }
    
    // Fallback: search entire cell for CLEAR (but not Add Incentives)
    if (!clearLink) {
      const allClickables = cell.querySelectorAll('.voting-pool-add-incentives, div.clickable, button, a');
      for (const link of allClickables) {
        const text = link.textContent ? link.textContent.trim().toUpperCase() : '';
        // Make sure it says CLEAR and NOT "Add Incentives"
        if (text === 'CLEAR' && !text.includes('ADD') && !text.includes('INCENTIVE')) {
          clearLink = link;
          break;
        }
      }
    }
    
    if (clearLink) {
      try {
        clearLink.click();
        clearedCount++;
        // Small delay between clicks to allow page to update
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (e) {
        console.warn('Error clicking CLEAR for pool:', e);
      }
    } else {
      console.warn('Could not find CLEAR button for selected pool');
    }
  }
  
  console.log(`Cleared ${clearedCount} selected pools`);
  return clearedCount;
}

// Get all currently selected pools
function getSelectedPools() {
  const selectedPools = [];
  const allPoolCells = document.querySelectorAll('div.liquidity-pool-cell');
  
  for (let cell of allPoolCells) {
    const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
    if (selectToVoteContainer) {
      const completedText = selectToVoteContainer.querySelector('.select-to-vote.completed');
      if (completedText && completedText.textContent.includes('Selected to vote')) {
        // Extract pool ID from the cell
        const innerHTML = cell.innerHTML || '';
        const innerText = cell.innerText || '';
        
        // Try to find pool address
        const addressMatch = innerHTML.match(/0x[a-fA-F0-9]{40}/i);
        if (addressMatch) {
          selectedPools.push({
            poolId: addressMatch[0],
            cell: cell
          });
        }
      }
    }
  }
  
  return selectedPools;
}

// Split votes evenly across selected pools
async function splitVotesEvenly() {
  // Get all selected pools
  const selectedPools = getSelectedPools();
  
  if (selectedPools.length === 0) {
    alert('No pools are currently selected. Please select pools first.');
    return;
  }
  
  // Calculate even percentage split (100% / number of pools)
  const percentagePerPool = 100 / selectedPools.length;
  const roundedPercentage = Math.round(percentagePerPool * 100) / 100; // Round to 2 decimal places
  
  console.log(`Splitting 100% voting power across ${selectedPools.length} pools: ~${roundedPercentage}% each`);
  
  // Try to find and open the vote dialog/modal
  // Look for VOTE button and click it if dialog isn't already open
  const voteButton = document.querySelector('button.btn.yellow-btn.vote-btn') ||
                    document.querySelector('button[class*="vote-btn"]') ||
                    Array.from(document.querySelectorAll('button')).find(btn => 
                      btn.textContent && btn.textContent.trim().toUpperCase().includes('VOTE')
                    );
  
  // Check if dialog is already open by looking for "VOTING" title or voting power inputs
  const votingDialog = document.querySelector('[class*="modal"], [class*="dialog"], [class*="overlay"]');
  const hasVotingTitle = votingDialog && (votingDialog.textContent || '').includes('VOTING');
  const hasVotingInputs = document.querySelector('input[placeholder*="%" i], input[type="text"]') && 
                          document.querySelector('input[type="text"]')?.closest('[class*="pool"], [class*="row"]');
  
  if (voteButton && !hasVotingTitle && !hasVotingInputs) {
    voteButton.click();
    // Wait for dialog to open
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  // First, find the voting dialog and all pool rows within it
  const votingDialogs = Array.from(document.querySelectorAll('[class*="modal"], [class*="dialog"], [class*="overlay"]'))
    .filter(dialog => dialog.textContent && dialog.textContent.includes('VOTING'));
  
  // If no voting dialog found, search entire document
  let allPoolRows = [];
  if (votingDialogs.length > 0) {
    for (const dialog of votingDialogs) {
      const rows = Array.from(dialog.querySelectorAll('*')).filter(el => {
        // Look for elements that contain pool addresses and have voting power inputs
        const hasPoolAddress = selectedPools.some(pool => 
          el.innerHTML.includes(pool.poolId) || el.textContent.includes(pool.poolId)
        );
        const hasInput = el.querySelector('input[type="text"], input[type="number"]');
        return hasPoolAddress && hasInput;
      });
      allPoolRows.push(...rows);
    }
  }
  
  // If still no rows found, search entire document
  if (allPoolRows.length === 0) {
    allPoolRows = Array.from(document.querySelectorAll('*')).filter(el => {
      const hasPoolAddress = selectedPools.some(pool => 
        el.innerHTML.includes(pool.poolId) || el.textContent.includes(pool.poolId)
      );
      const hasInput = el.querySelector('input[type="text"], input[type="number"]');
      return hasPoolAddress && hasInput;
    });
  }
  
  console.log(`Found ${allPoolRows.length} potential pool rows in voting dialog`);
  
  // Match each selected pool to its row and find its input
  const poolInputs = [];
  const usedInputs = new Set(); // Track inputs we've already matched
  
  // Calculate percentages with smart rounding to distribute evenly
  // Voting inputs only accept 1 decimal place, so we use 1 decimal precision
  const basePercentage = 100 / selectedPools.length;
  const percentages = [];
  
  // Round base percentage to 1 decimal place
  const baseRounded = Math.round(basePercentage * 10) / 10;
  
  // Calculate what the total would be if we used baseRounded for all
  const totalIfAllBase = baseRounded * selectedPools.length;
  const remainder = Math.round((100 - totalIfAllBase) * 10) / 10;
  
  // Distribute the remainder: add 0.1 to the first N pools where N = remainder * 10
  const poolsToAddExtra = Math.round(remainder * 10);
  
  for (let i = 0; i < selectedPools.length; i++) {
    let pct = baseRounded;
    // Add 0.1 to first pools to account for rounding remainder
    if (i < poolsToAddExtra) {
      pct += 0.1;
    }
    percentages.push(Math.round(pct * 10) / 10);
  }
  
  // Final check: ensure total is exactly 100% by adjusting the last pool
  const total = percentages.reduce((sum, p) => sum + p, 0);
  if (Math.abs(total - 100) > 0.01) {
    const diff = 100 - total;
    percentages[percentages.length - 1] = Math.round((percentages[percentages.length - 1] + diff) * 10) / 10;
  }
  
  for (let i = 0; i < selectedPools.length; i++) {
    const pool = selectedPools[i];
    const percentageToAllocate = percentages[i];
    
    // Find the row that contains this pool's address
    let matchedRow = null;
    for (const row of allPoolRows) {
      if ((row.innerHTML.includes(pool.poolId) || row.textContent.includes(pool.poolId)) &&
          !usedInputs.has(row)) {
        matchedRow = row;
        break;
      }
    }
    
    if (!matchedRow) {
      console.warn(`Could not find row for pool ${pool.poolId}`);
      continue;
    }
    
    // Find the voting power input in this row
    let allocationInput = null;
    const inputs = matchedRow.querySelectorAll('input[type="text"], input[type="number"]');
    
    for (const input of inputs) {
      // Skip if we've already used this input
      if (usedInputs.has(input)) continue;
      
      // Check if this input is for voting power (has "%" nearby or "Voting Power" label)
      const parent = input.parentElement;
      const parentText = parent.textContent || '';
      const siblings = Array.from(parent.children || []);
      const hasPercentSymbol = siblings.some(sib => sib.textContent && sib.textContent.includes('%')) ||
                              parentText.includes('%');
      const hasVotingPowerLabel = parentText.includes('Voting Power');
      
      // Check nearby elements
      const prevSibling = input.previousElementSibling;
      const nextSibling = input.nextElementSibling;
      const nearbyText = (prevSibling?.textContent || '') + (nextSibling?.textContent || '');
      
      if (hasPercentSymbol || hasVotingPowerLabel || nearbyText.includes('Voting Power') || nearbyText.includes('%')) {
        allocationInput = input;
        break;
      }
    }
    
    // Fallback: use the first unused input in the row
    if (!allocationInput && inputs.length > 0) {
      for (const input of inputs) {
        if (!usedInputs.has(input)) {
          allocationInput = input;
          break;
        }
      }
    }
    
    if (allocationInput) {
      poolInputs.push({
        pool: pool,
        input: allocationInput,
        percentage: percentageToAllocate
      });
      usedInputs.add(allocationInput);
      usedInputs.add(matchedRow);
      console.log(`Matched pool ${pool.poolId} to input, will allocate ${percentageToAllocate}%`);
    } else {
      console.warn(`Could not find voting power input for pool ${pool.poolId} in matched row`);
    }
  }
  
  // Now fill all the inputs
  let filledCount = 0;
  for (const poolInput of poolInputs) {
    try {
      // Scroll input into view
      poolInput.input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Focus and set value (percentage, not absolute votes)
      poolInput.input.focus();
      poolInput.input.value = poolInput.percentage.toString();
      
      // Trigger input events to ensure React/UI updates
      poolInput.input.dispatchEvent(new Event('input', { bubbles: true }));
      poolInput.input.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Also try setting value property directly (for React controlled components)
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      if (valueSetter) {
        valueSetter.call(poolInput.input, poolInput.percentage.toString());
        poolInput.input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      filledCount++;
      console.log(`✓ Allocated ${poolInput.percentage}% to pool ${poolInput.pool.poolId}`);
      
      // Small delay between inputs
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (e) {
      console.warn(`Error setting percentage for pool ${poolInput.pool.poolId}:`, e);
    }
  }
  
  // Show feedback
  const contentEl = document.getElementById('blackhole-tools-content');
  if (contentEl) {
    const originalHTML = contentEl.innerHTML;
    if (filledCount > 0) {
      contentEl.innerHTML = `<p style="color: #32cd32; text-align: center; padding: 20px;">✓ Split 100% voting power across ${filledCount} pool(s)<br><small style="color: #999;">~${roundedPercentage}% per pool</small></p>`;
    } else {
      contentEl.innerHTML = `<p style="color: #ff8c00; text-align: center; padding: 20px;">⚠️ Could not find vote allocation inputs.<br><small>Make sure the voting dialog is open and pools are selected.</small></p>`;
    }
    setTimeout(() => {
      contentEl.innerHTML = originalHTML;
      updateOverlay();
    }, 3000);
  }
}

// Select or deselect a single pool by ID
async function selectSinglePool(poolId) {
  if (!poolId) {
    console.warn('No pool ID provided');
    return;
  }
  
  // First check if the pool is already selected
  const isSelected = isPoolSelected(poolId);
  
  // Try to find the pool in currently visible cells
  let poolCell = null;
  const poolCells = document.querySelectorAll('div.liquidity-pool-cell');
  
  for (let cell of poolCells) {
    const innerHTML = cell.innerHTML || '';
    const innerText = cell.innerText || '';
    
    if (innerHTML.includes(poolId) || innerText.includes(poolId)) {
      poolCell = cell;
      break;
    }
  }
  
  // If pool not found in visible cells, try to scroll/find it
  if (!poolCell) {
    // Try to find it by searching all elements (including those not in viewport)
    // Some pools might be in collapsed sections or different pages
    const allCells = document.querySelectorAll('div.liquidity-pool-cell');
    for (let cell of allCells) {
      const innerHTML = cell.innerHTML || '';
      const innerText = cell.innerText || '';
      
      if (innerHTML.includes(poolId) || innerText.includes(poolId)) {
        poolCell = cell;
        // Scroll the pool into view
        poolCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Wait a bit for scroll to complete
        await new Promise(resolve => setTimeout(resolve, 300));
        break;
      }
    }
  }
  
  if (!poolCell) {
    console.warn(`Could not find pool: ${poolId} in DOM`);
    if (isSelected) {
      // Pool is selected but not in DOM - might be on a different pagination page
      // Try to find it by searching through all possible elements, including hidden ones
      // Some pools might be in collapsed sections or on different pages
      const allPossibleCells = document.querySelectorAll('div[class*="liquidity-pool-cell"], div[class*="pool-cell"]');
      for (let cell of allPossibleCells) {
        const innerHTML = cell.innerHTML || '';
        if (innerHTML.includes(poolId)) {
          poolCell = cell;
          // Try to make it visible and scroll to it
          if (cell.style.display === 'none') {
            cell.style.display = '';
          }
          cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 500));
          break;
        }
      }
    }
    
    if (!poolCell) {
      if (isSelected) {
        // Pool is selected but not found - show helpful message
        alert(`Pool ${poolId} is selected but not currently visible on this page.\n\nThis pool may be on a different page. Use "Clear All" to deselect all pools, or navigate to find this pool manually.`);
      } else {
        alert(`Could not find pool ${poolId} on the page. Make sure the pool is visible.`);
      }
      return;
    }
  }
  
  // If pool is selected, find and click the "CLEAR" link
  // If pool is not selected, find and click the "SELECT" button
  if (isSelected) {
    // Pool is selected - look for "CLEAR" link/button
    // IMPORTANT: Must check text content to avoid clicking "Add Incentives" link
    // "CLEAR" is in select-to-vote-container, "Add Incentives" is in incentives section
    const selectContainer = poolCell.querySelector('.select-to-vote-container');
    let clearLink = null;
    
    if (selectContainer) {
      // Look for CLEAR link specifically in the select-to-vote-container
      // It should be a div with class "voting-pool-add-incentives" that contains "CLEAR" text
      const allLinks = selectContainer.querySelectorAll('.voting-pool-add-incentives, div, button, a');
      for (const link of allLinks) {
        const text = link.textContent ? link.textContent.trim().toUpperCase() : '';
        if (text === 'CLEAR') {
          clearLink = link;
          break;
        }
      }
    }
    
    // Fallback: search entire cell for CLEAR (but not Add Incentives)
    if (!clearLink) {
      const allClickables = poolCell.querySelectorAll('.voting-pool-add-incentives, div.clickable, button, a');
      for (const link of allClickables) {
        const text = link.textContent ? link.textContent.trim().toUpperCase() : '';
        // Make sure it says CLEAR and NOT "Add Incentives"
        if (text === 'CLEAR' && !text.includes('ADD') && !text.includes('INCENTIVE')) {
          clearLink = link;
          break;
        }
      }
    }
    
    if (clearLink) {
      try {
        clearLink.click();
        console.log(`✓ Deselected pool: ${poolId}`);
        // Update overlay to show updated state
        setTimeout(() => updateOverlay(), 300);
      } catch (e) {
        console.warn(`Error clicking CLEAR for pool ${poolId}:`, e);
      }
    } else {
      console.warn(`Could not find CLEAR button for selected pool: ${poolId}`);
    }
  } else {
    // Pool is not selected - find and click the SELECT button
    const selectButton = poolCell.querySelector('button.btn.yellow-btn.clickable') ||
                        poolCell.querySelector('button.btn.yellow-btn') ||
                        poolCell.querySelector('.liquidity-pool-cell-btn button') ||
                        poolCell.querySelector('.liquidity-pool-cell-right button') ||
                        poolCell.querySelector('button[class*="yellow-btn"]') ||
                        poolCell.querySelector('button:not([disabled])');
    
    if (selectButton && !selectButton.disabled) {
      try {
        selectButton.click();
        console.log(`✓ Selected pool: ${poolId}`);
        // Update overlay to show selected state
        setTimeout(() => updateOverlay(), 300);
      } catch (e) {
        console.warn(`Error clicking SELECT button for pool ${poolId}:`, e);
      }
    } else {
      console.warn(`Could not find SELECT button for pool: ${poolId}`);
    }
  }
}
