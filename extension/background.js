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

  // Enable side panel on blackhole.xyz
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
});

// Removed automatic pool data refresh on page load
// Users must manually trigger refresh via the side panel/popup refresh button
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//   if (changeInfo.status === 'complete' && tab.url && tab.url.includes('blackhole.xyz/vote')) {
//     // Notify content script to refresh
//     chrome.tabs.sendMessage(tabId, { type: 'REFRESH_POOL_DATA' }).catch(() => {
//       // Content script might not be ready yet, ignore
//     });
//   }
// });

// Handle proxy requests to bypass CORS
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROXY_REQUEST') {
    (async () => {
      try {
        const response = await fetch(message.url, message.options);
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }
        
        sendResponse({
          success: true,
          status: response.status,
          statusText: response.statusText,
          data: data
        });
      } catch (error) {
        console.error('Proxy request failed:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    return true; // Keep channel open for async response
  }
});