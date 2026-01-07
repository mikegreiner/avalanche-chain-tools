/**
 * Background service worker for Blackhole DEX Tools extension
 */

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Blackhole DEX Tools extension installed/updated:', details.reason);
  
  // Only set default settings if they don't already exist (preserve user settings on update)
  chrome.storage.local.get(['blackholeSettings'], (result) => {
    if (!result.blackholeSettings) {
      // Set default settings only on first install
      chrome.storage.local.set({
        blackholeSettings: {
          votingPower: null,
          topN: 10,
          minRewards: null,
          maxPoolPercentage: null,
          sortBy: 'auto',
          hideVamm: false,
          enableOverlay: true
        }
      });
      console.log('Default settings initialized');
    } else {
      console.log('Existing settings preserved:', result.blackholeSettings);
    }
  });
});

// Periodic pool data refresh (every 5 minutes when on voting page)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('blackhole.xyz/vote')) {
    // Notify content script to refresh
    chrome.tabs.sendMessage(tabId, { type: 'REFRESH_POOL_DATA' }).catch(() => {
      // Content script might not be ready yet, ignore
    });
  }
});
