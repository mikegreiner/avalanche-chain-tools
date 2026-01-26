/**
 * Search-Based Pool Selection
 *
 * Eliminates page-by-page navigation by using the search bar to find pools.
 * Much faster and more reliable.
 */

/**
 * Get the search input element
 */
function getSearchInput() {
  return document.querySelector('.search-container input.input, .search-bar-outer input.input');
}

/**
 * Trigger search with all necessary events
 */
function triggerSearch(input, value) {
  input.value = value;
  input.focus();
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
}

/**
 * Wait helper
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Find pool cell by ID (case-insensitive)
 */
function findPoolCellById(poolId) {
  const normalizedId = poolId.toLowerCase().trim();
  const cells = document.querySelectorAll('div.liquidity-pool-cell');

  for (const cell of cells) {
    const cellId = extractPoolIdFromCell(cell);
    if (cellId && cellId.toLowerCase() === normalizedId) {
      return cell;
    }
  }
  return null;
}

/**
 * Extract pool ID from cell
 */
function extractPoolIdFromCell(cell) {
  // Try data attributes
  const dataId = cell.dataset?.poolId ||
                 cell.getAttribute('data-pool-id') ||
                 cell.getAttribute('data-pool-address');
  if (dataId) return dataId.toLowerCase().trim();

  // Try finding link with pool ID
  const link = cell.querySelector('a[href*="/pool/"]');
  if (link) {
    const match = link.href.match(/\/pool\/([^/?]+)/);
    if (match) return match[1].toLowerCase().trim();
  }

  // Fallback to regex in HTML
  const html = cell.innerHTML || '';
  const match = html.match(/0x[a-fA-F0-9]{40}/i);
  if (match) return match[0].toLowerCase().trim();

  return null;
}

/**
 * Check if pool is selected via search (fast, no page navigation)
 */
async function checkPoolSelectionViaSearch(poolId) {
  const searchInput = getSearchInput();
  if (!searchInput) {
    console.warn('Search input not found');
    return false;
  }

  // Search for the pool
  triggerSearch(searchInput, poolId);
  await wait(400);

  // Check if pool is selected
  const cell = findPoolCellById(poolId);
  if (!cell) {
    console.warn(`Pool ${poolId} not found after search`);
    return false;
  }

  const isSelected = isPoolSelectedOnCell(cell);
  return isSelected;
}

/**
 * Check if a cell shows a selected pool
 */
function isPoolSelectedOnCell(cell) {
  // Method 1: Look for "Selected to vote" text
  const selectToVoteContainer = cell.querySelector('.select-to-vote-container');
  if (selectToVoteContainer) {
    const completedText = selectToVoteContainer.querySelector('.select-to-vote.completed');
    if (completedText && completedText.textContent.toLowerCase().includes('selected')) {
      return true;
    }
  }

  // Method 2: Look for CLEAR link (indicates selected)
  const clearLink = cell.querySelector('span.link.underline');
  if (clearLink && clearLink.textContent.toLowerCase().includes('clear')) {
    return true;
  }

  // Method 3: Check button state
  const selectButton = cell.querySelector('button.btn.yellow-btn');
  if (selectButton && !selectButton.classList.contains('clickable')) {
    return true;
  }

  return false;
}

/**
 * Discover which pools from a list are currently selected
 * Uses search to avoid page navigation
 *
 * @param {string[]} poolIds - Array of pool IDs to check
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<Set<string>>} - Set of selected pool IDs
 */
async function discoverSelectedPools(poolIds, progressCallback = null) {
  const searchInput = getSearchInput();
  if (!searchInput) {
    console.warn('Search input not found - cannot discover selected pools');
    return new Set();
  }

  const selectedSet = new Set();
  const total = poolIds.length;

  console.log(`Discovering selection state for ${total} pools...`);

  for (let i = 0; i < total; i++) {
    const poolId = poolIds[i];

    if (progressCallback) {
      progressCallback(i + 1, total, `Checking ${poolId.slice(0, 10)}...`);
    }

    try {
      const isSelected = await checkPoolSelectionViaSearch(poolId);
      if (isSelected) {
        selectedSet.add(poolId.toLowerCase());
      }
    } catch (error) {
      console.warn(`Failed to check pool ${poolId}:`, error);
    }
  }

  // Clear search
  triggerSearch(searchInput, '');
  await wait(300);

  console.log(`Found ${selectedSet.size} selected pools out of ${total} checked`);
  return selectedSet;
}

/**
 * Clear all selected pools using search (no page navigation)
 *
 * @param {Set<string>} selectedPoolIds - Set of pool IDs to clear
 * @param {Function} progressCallback - Optional callback for progress updates
 */
async function clearAllViaSearch(selectedPoolIds, progressCallback = null) {
  const searchInput = getSearchInput();
  if (!searchInput) {
    throw new Error('Search input not found');
  }

  const poolIdsArray = Array.from(selectedPoolIds);
  const total = poolIdsArray.length;
  let cleared = 0;

  console.log(`Clearing ${total} selected pools via search...`);

  for (let i = 0; i < total; i++) {
    const poolId = poolIdsArray[i];

    if (progressCallback) {
      progressCallback(i + 1, total, `Clearing ${poolId.slice(0, 10)}...`);
    }

    try {
      // Search for pool
      triggerSearch(searchInput, poolId);
      await wait(400);

      // Find cell
      const cell = findPoolCellById(poolId);
      if (!cell) {
        console.warn(`Pool ${poolId} not found`);
        continue;
      }

      // Find and click CLEAR link
      const clearLink = cell.querySelector('span.link.underline');
      if (clearLink && clearLink.textContent.toLowerCase().includes('clear')) {
        clearLink.click();
        cleared++;
        await wait(150);
      } else {
        console.warn(`No CLEAR link found for ${poolId}`);
      }
    } catch (error) {
      console.error(`Failed to clear pool ${poolId}:`, error);
    }
  }

  // Clear search
  triggerSearch(searchInput, '');
  await wait(300);

  console.log(`Cleared ${cleared}/${total} pools`);
  return cleared;
}

/**
 * Get selected pools from recommendations (fast)
 * Only checks pools the user cares about, not all 100+ pools
 */
async function getSelectedPoolsInRecommendations() {
  try {
    // Use safeStorageGet if available (in content script context)
    const storageFunc = typeof safeStorageGet !== 'undefined' ? safeStorageGet : chrome.storage.local.get.bind(chrome.storage.local);

    // Get pool data and settings from storage
    const result = await storageFunc(['poolData', 'blackholeSettings']);
    const poolData = result.poolData || [];
    const settings = result.blackholeSettings || {};

    if (poolData.length === 0) {
      console.warn('No pool data available');
      return new Set();
    }

    // Create Pool instances (Pool class available in bundle)
    const pools = poolData.map(data => {
      // Check if data is already a Pool instance
      if (data instanceof Pool) {
        return data;
      }
      return new Pool(data);
    });

    // Get recommended pools (typically top 10-20)
    // recommendPools function should be available in the bundle
    const recommendations = recommendPools(pools, {
      topN: settings.topN || 20,  // Check a few more than displayed
      userVotingPower: settings.votingPower,
      hideVamm: settings.hideVamm,
      minRewards: settings.minRewards,
      maxPoolPercentage: settings.maxPoolPercentage,
      poolName: settings.poolNameFilter,
      sortBy: settings.sortBy || 'auto'
    });

    const recommendedIds = recommendations.map(p => p.pool_id);
    console.log(`Checking selection state for ${recommendedIds.length} recommended pools`);

    // Discover which are selected
    const selectedSet = await discoverSelectedPools(recommendedIds, (current, total, status) => {
      console.log(`Discovery progress: ${current}/${total} - ${status}`);
    });

    return selectedSet;
  } catch (error) {
    console.error('Error getting selected pools in recommendations:', error);
    return new Set();
  }
}

/**
 * Notify sidepanel of selection state change
 */
function notifySelectionChanged(poolId, isSelected) {
  try {
    chrome.runtime.sendMessage({
      type: 'POOL_SELECTION_CHANGED',
      poolId: poolId,
      isSelected: isSelected
    });
  } catch (error) {
    console.warn('Failed to notify sidepanel:', error);
  }
}

// Export functions (if using modules)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    checkPoolSelectionViaSearch,
    discoverSelectedPools,
    clearAllViaSearch,
    getSelectedPoolsInRecommendations,
    notifySelectionChanged
  };
}
