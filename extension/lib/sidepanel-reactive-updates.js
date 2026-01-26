/**
 * Sidepanel Reactive Updates
 *
 * Makes the sidepanel respond instantly to selection changes
 * without re-rendering the entire list.
 */

/**
 * Update a single pool's styling in the sidepanel
 * @param {string} poolId - Pool ID that changed
 * @param {boolean} isSelected - New selection state
 */
function updatePoolStyling(poolId, isSelected) {
  const normalizedId = poolId.toLowerCase().trim();
  const poolItem = document.querySelector(`[data-pool-id="${normalizedId}"]`);

  if (!poolItem) {
    console.log(`Pool ${poolId} not in current recommendations, skipping style update`);
    return;
  }

  console.log(`Updating pool ${poolId} styling: isSelected=${isSelected}`);

  // Update the pool-selected class
  poolItem.classList.toggle('pool-selected', isSelected);

  // Update the button
  const button = poolItem.querySelector('.select-pool-btn');
  if (button) {
    button.textContent = isSelected ? 'Deselect' : 'Select';
    button.classList.toggle('btn-primary', isSelected);
    button.classList.toggle('btn-secondary', !isSelected);
    button.disabled = false;  // Re-enable in case it was disabled
  }
}

/**
 * Listen for selection changes from content script
 */
function setupReactiveUpdates() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'POOL_SELECTION_CHANGED') {
      console.log('[SidePanel] Pool selection changed:', message.poolId, message.isSelected);
      updatePoolStyling(message.poolId, message.isSelected);
      sendResponse({ success: true });
    }
  });

  console.log('[SidePanel] Reactive updates initialized');
}

/**
 * Discover and update selection state for currently visible recommendations
 * Call this on sidepanel load to fix pre-selected pools
 */
async function refreshSelectionState() {
  console.log('[SidePanel] Refreshing selection state for visible recommendations...');

  // Get all pool items currently displayed
  const poolItems = document.querySelectorAll('.recommendation-item[data-pool-id]');
  const poolIds = Array.from(poolItems).map(item => item.dataset.poolId);

  if (poolIds.length === 0) {
    console.log('[SidePanel] No pools to refresh');
    return;
  }

  console.log(`[SidePanel] Checking selection state for ${poolIds.length} visible pools`);

  // Query content script for selection state
  try {
    const response = await sendMessageToContentScript({
      type: 'CHECK_POOLS_SELECTION',
      poolIds: poolIds
    });

    if (response && response.selectedPools) {
      const selectedSet = new Set(response.selectedPools.map(p => p.toLowerCase()));

      // Update styling for each pool
      poolIds.forEach(poolId => {
        const isSelected = selectedSet.has(poolId.toLowerCase());
        updatePoolStyling(poolId, isSelected);
      });

      console.log(`[SidePanel] Updated styling for ${poolIds.length} pools, ${selectedSet.size} selected`);
    }
  } catch (error) {
    console.error('[SidePanel] Failed to refresh selection state:', error);
  }
}

/**
 * Helper to send message to content script
 */
async function sendMessageToContentScript(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && tab.url.includes('blackhole.xyz/vote')) {
    return await chrome.tabs.sendMessage(tab.id, message);
  } else {
    throw new Error('Not on voting page');
  }
}

/**
 * Show loading indicator while discovering selection state
 */
function showDiscoveryProgress() {
  const container = document.getElementById('recommendations-list');
  if (!container) return;

  const progressDiv = document.createElement('div');
  progressDiv.id = 'selection-discovery-progress';
  progressDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    padding: 20px;
    border-radius: 8px;
    border: 1px solid #ffd700;
    z-index: 10000;
    text-align: center;
  `;
  progressDiv.innerHTML = `
    <div style="color: #ffd700; font-size: 14px; margin-bottom: 10px;">
      Checking selection state...
    </div>
    <div id="discovery-progress-text" style="color: #888; font-size: 12px;">
      Please wait...
    </div>
  `;
  document.body.appendChild(progressDiv);
}

/**
 * Update discovery progress text
 */
function updateDiscoveryProgress(text) {
  const progressText = document.getElementById('discovery-progress-text');
  if (progressText) {
    progressText.textContent = text;
  }
}

/**
 * Hide discovery progress indicator
 */
function hideDiscoveryProgress() {
  const progressDiv = document.getElementById('selection-discovery-progress');
  if (progressDiv) {
    progressDiv.remove();
  }
}

/**
 * Initialize reactive updates when sidepanel loads
 * Call this in DOMContentLoaded
 */
function initializeReactiveUpdates() {
  setupReactiveUpdates();

  // Refresh selection state after recommendations are rendered
  // This fixes pre-selected pools not showing as selected
  const observer = new MutationObserver(() => {
    const recommendationsList = document.querySelector('.recommendations-list');
    if (recommendationsList && recommendationsList.children.length > 0) {
      observer.disconnect();
      // Small delay to ensure rendering is complete
      setTimeout(() => {
        refreshSelectionState();
      }, 100);
    }
  });

  const container = document.getElementById('recommendations-list');
  if (container) {
    observer.observe(container, { childList: true, subtree: true });
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    updatePoolStyling,
    setupReactiveUpdates,
    refreshSelectionState,
    initializeReactiveUpdates
  };
}
