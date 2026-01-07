/**
 * Popup script for Blackhole DEX Tools extension
 */

// Auto-save debounce timer
let saveTimer = null;

// Load settings on popup open
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await loadSettings();
  
  // Populate form fields
  const votingPowerInput = document.getElementById('votingPower');
  const topNInput = document.getElementById('topN');
  const minRewardsInput = document.getElementById('minRewards');
  const maxPoolPercentageInput = document.getElementById('maxPoolPercentage');
  const sortBySelect = document.getElementById('sortBy');
  const hideVammCheckbox = document.getElementById('hideVamm');
  const enableOverlayCheckbox = document.getElementById('enableOverlay');
  
  if (settings.votingPower !== null && settings.votingPower !== undefined) {
    votingPowerInput.value = settings.votingPower;
  }
  
  if (settings.topN !== undefined) {
    topNInput.value = settings.topN;
  }
  
  if (settings.minRewards !== null && settings.minRewards !== undefined) {
    minRewardsInput.value = settings.minRewards;
  }
  
  if (settings.maxPoolPercentage !== null && settings.maxPoolPercentage !== undefined) {
    maxPoolPercentageInput.value = settings.maxPoolPercentage;
  }
  
  if (settings.sortBy !== undefined) {
    sortBySelect.value = settings.sortBy;
  }
  
  if (settings.hideVamm !== undefined) {
    hideVammCheckbox.checked = settings.hideVamm;
  }
  
  if (settings.enableOverlay !== undefined) {
    enableOverlayCheckbox.checked = settings.enableOverlay;
  }
  
  // Auto-save on input changes (with debounce)
  [votingPowerInput, topNInput, minRewardsInput, maxPoolPercentageInput, sortBySelect].forEach(input => {
    input.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        autoSaveSettings();
      }, 500);
    });
  });
  
  hideVammCheckbox.addEventListener('change', () => {
    autoSaveSettings();
  });
  
  // Enable overlay checkbox should immediately toggle visibility
  enableOverlayCheckbox.addEventListener('change', async () => {
    await autoSaveSettings();
    // Immediately notify content script to toggle overlay
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url && tab.url.includes('blackhole.xyz/vote')) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' }).catch(() => {
        // Tab might not have content script loaded yet, ignore
      });
    }
  });
  
  updateStatus();
});

// Auto-save settings (without showing status message)
async function autoSaveSettings() {
  const votingPowerInput = document.getElementById('votingPower');
  const topNInput = document.getElementById('topN');
  const minRewardsInput = document.getElementById('minRewards');
  const maxPoolPercentageInput = document.getElementById('maxPoolPercentage');
  const sortBySelect = document.getElementById('sortBy');
  const hideVammCheckbox = document.getElementById('hideVamm');
  const enableOverlayCheckbox = document.getElementById('enableOverlay');
  
  const votingPowerValue = votingPowerInput.value.trim();
  let votingPower = null;
  
  // Allow empty value (null), but validate if provided
  if (votingPowerValue !== '') {
    const parsed = parseFloat(votingPowerValue);
    if (isNaN(parsed) || parsed < 0) {
      // Invalid value - don't save, but don't show error (user might still be typing)
      return;
    }
    votingPower = parsed;
  }
  
  const topNValue = topNInput.value.trim();
  let topN = 10;
  if (topNValue !== '') {
    const parsed = parseInt(topNValue);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
      topN = parsed;
    }
  }
  
  const minRewardsValue = minRewardsInput.value.trim();
  let minRewards = null;
  if (minRewardsValue !== '') {
    const parsed = parseFloat(minRewardsValue);
    if (!isNaN(parsed) && parsed >= 0) {
      minRewards = parsed;
    }
  }
  
  const maxPoolPercentageValue = maxPoolPercentageInput.value.trim();
  let maxPoolPercentage = null;
  if (maxPoolPercentageValue !== '') {
    const parsed = parseFloat(maxPoolPercentageValue);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      maxPoolPercentage = parsed;
    }
  }
  
  const settings = {
    votingPower,
    topN,
    minRewards,
    maxPoolPercentage,
    sortBy: sortBySelect.value,
    hideVamm: hideVammCheckbox.checked,
    enableOverlay: enableOverlayCheckbox.checked
  };
  
  await saveSettings(settings);
  
  // Notify content script to update
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.url && tab.url.includes('blackhole.xyz/vote')) {
    chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED' }).catch(() => {
      // Tab might not have content script loaded yet, ignore
    });
  }
}

// Manual save button (shows confirmation)
document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  const votingPowerInput = document.getElementById('votingPower');
  const topNInput = document.getElementById('topN');
  const minRewardsInput = document.getElementById('minRewards');
  const maxPoolPercentageInput = document.getElementById('maxPoolPercentage');
  const sortBySelect = document.getElementById('sortBy');
  const hideVammCheckbox = document.getElementById('hideVamm');
  const enableOverlayCheckbox = document.getElementById('enableOverlay');
  
  const votingPowerValue = votingPowerInput.value.trim();
  let votingPower = null;
  
  // Allow empty value (null), but validate if provided
  if (votingPowerValue !== '') {
    const parsed = parseFloat(votingPowerValue);
    if (isNaN(parsed) || parsed < 0) {
      showStatus('Please enter a valid voting power (or leave empty)', 'error');
      return;
    }
    votingPower = parsed;
  }
  
  const topNValue = topNInput.value.trim();
  let topN = 10;
  if (topNValue !== '') {
    const parsed = parseInt(topNValue);
    if (isNaN(parsed) || parsed < 1 || parsed > 50) {
      showStatus('Please enter a valid number of recommendations (1-50)', 'error');
      return;
    }
    topN = parsed;
  }
  
  const minRewardsValue = minRewardsInput.value.trim();
  let minRewards = null;
  if (minRewardsValue !== '') {
    const parsed = parseFloat(minRewardsValue);
    if (isNaN(parsed) || parsed < 0) {
      showStatus('Please enter a valid minimum rewards value', 'error');
      return;
    }
    minRewards = parsed;
  }
  
  const maxPoolPercentageValue = maxPoolPercentageInput.value.trim();
  let maxPoolPercentage = null;
  if (maxPoolPercentageValue !== '') {
    const parsed = parseFloat(maxPoolPercentageValue);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      showStatus('Please enter a valid max pool percentage (0-100)', 'error');
      return;
    }
    maxPoolPercentage = parsed;
  }
  
  const settings = {
    votingPower,
    topN,
    minRewards,
    maxPoolPercentage,
    sortBy: sortBySelect.value,
    hideVamm: hideVammCheckbox.checked,
    enableOverlay: enableOverlayCheckbox.checked
  };
  
  await saveSettings(settings);
  
  showStatus('Settings saved!', 'success');
  
  // Notify content script to update
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.url && tab.url.includes('blackhole.xyz/vote')) {
    chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED' }).catch(() => {
      // Tab might not have content script loaded yet, ignore
    });
  }
});

// Refresh pool data
document.getElementById('refreshDataBtn').addEventListener('click', async () => {
  showStatus('Refreshing pool data...', 'success');
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.url && tab.url.includes('blackhole.xyz/vote')) {
    // Reset retry counter
    chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_POOL_DATA' });
    setTimeout(() => {
      showStatus('Pool data refreshed! Check the overlay on the voting page.', 'success');
    }, 2000);
  } else {
    showStatus('Please navigate to blackhole.xyz/vote first', 'error');
  }
});

// Open voting page
document.getElementById('openVotePageBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ url: 'https://blackhole.xyz/vote*' });
  
  if (tab) {
    // Tab already open, switch to it and show overlay
    chrome.tabs.update(tab.id, { active: true });
    chrome.tabs.sendMessage(tab.id, { type: 'SHOW_OVERLAY' }).catch(() => {
      // Content script might not be ready, that's ok
    });
  } else {
    // Open new tab
    chrome.tabs.create({ url: 'https://blackhole.xyz/vote' });
  }
});

// View history
document.getElementById('viewHistoryBtn').addEventListener('click', () => {
  // TODO: Open history dashboard
  showStatus('History feature coming soon!', 'success');
});

// Settings management
async function loadSettings() {
  const result = await chrome.storage.local.get(['blackholeSettings']);
  return result.blackholeSettings || {
    votingPower: null,
    topN: 10,
    minRewards: null,
    maxPoolPercentage: null,
    sortBy: 'auto',
    hideVamm: false,
    enableOverlay: true
  };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ blackholeSettings: settings });
}

function showStatus(message, type = 'success') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  
  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 3000);
}

async function updateStatus() {
  const statusInfo = document.getElementById('statusInfo');
  const settings = await loadSettings();
  
  let statusHtml = '<p>';
  
  if (settings.votingPower !== null && settings.votingPower !== undefined) {
    statusHtml += `✓ Voting power: ${settings.votingPower.toLocaleString()} veBLACK<br>`;
  } else {
    statusHtml += 'ℹ Set your voting power for personalized recommendations<br>';
  }
  
  statusHtml += `✓ Top ${settings.topN || 10} recommendations<br>`;
  
  if (settings.minRewards !== null && settings.minRewards !== undefined) {
    statusHtml += `✓ Min rewards: $${settings.minRewards.toLocaleString()}<br>`;
  }
  
  if (settings.maxPoolPercentage !== null && settings.maxPoolPercentage !== undefined) {
    statusHtml += `✓ Max pool %: ${settings.maxPoolPercentage}%<br>`;
  }
  
  statusHtml += `✓ Sort by: ${settings.sortBy || 'auto'}<br>`;
  statusHtml += `✓ Overlay: ${settings.enableOverlay ? 'Enabled' : 'Disabled'}<br>`;
  statusHtml += `✓ vAMM pools: ${settings.hideVamm ? 'Hidden' : 'Shown'}<br>`;
  statusHtml += '</p>';
  statusHtml += '<p style="margin-top: 8px; font-size: 11px; color: #999;">Settings are automatically saved as you type.</p>';
  
  statusInfo.innerHTML = statusHtml;
}
