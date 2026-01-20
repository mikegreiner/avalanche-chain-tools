import Pool from './lib/pool.js';
import { recommendPools } from './lib/pool-recommender.js';

/**
 * Side Panel script for Blackhole DEX Tools extension
 */

// Auto-save debounce timer
let saveTimer = null;
let capturedRequests = [];

// Load settings on popup open
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await loadSettings();
  
  // Initialize Tabs
  setupTabs();
  
  // Populate form fields
  populateForm(settings);
  
  // Setup listeners
  setupListeners();
  
  // Initial render of recommendations
  await loadAndRenderRecommendations();
  
  // Update status info
  updateStatus();
});

function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and views
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      
      // Add active class to clicked tab
      tab.classList.add('active');
      
      // Show corresponding view
      const viewId = `${tab.dataset.tab}-view`;
      document.getElementById(viewId).classList.add('active');
      
      // Toggle settings summary visibility (only on recommendations tab)
      const summaryEl = document.getElementById('active-settings-summary');
      if (summaryEl) {
        if (tab.dataset.tab === 'recommendations') {
          summaryEl.classList.add('visible');
        } else {
          summaryEl.classList.remove('visible');
        }
      }
      
      // specific actions when switching
      if (tab.dataset.tab === 'recommendations') {
        loadAndRenderRecommendations();
      }
    });
  });
  
  // Initialize visibility state
  const activeTab = document.querySelector('.tab.active');
  if (activeTab && activeTab.dataset.tab === 'recommendations') {
    const summaryEl = document.getElementById('active-settings-summary');
    if (summaryEl) summaryEl.classList.add('visible');
  }
}

function setupListeners() {
  // Auto-save on input changes (with debounce)
  const inputs = [
    'votingPower', 'topN', 'minRewards', 'maxPoolPercentage', 'sortBy', 'settingsPoolNameFilter'
  ].map(id => document.getElementById(id));
  
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        await autoSaveSettings();
        // Refresh recommendations if on that tab
        if (document.querySelector('.tab[data-tab="recommendations"]').classList.contains('active')) {
          loadAndRenderRecommendations();
        }
      }, 500);
    });
  });
  
  document.getElementById('hideVamm').addEventListener('change', async () => {
    await autoSaveSettings();
    if (document.querySelector('.tab[data-tab="recommendations"]').classList.contains('active')) {
      loadAndRenderRecommendations();
    }
  });

  document.getElementById('deepScan').addEventListener('change', async () => {
    await autoSaveSettings();
  });
  
  // Enable overlay checkbox
  document.getElementById('enableOverlay').addEventListener('change', async () => {
    await autoSaveSettings();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('blackhole.xyz/vote')) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' }).catch(() => {});
    }
  });
  
  // Refresh data button
  document.getElementById('refreshDataBtn').addEventListener('click', async () => {
    const btn = document.getElementById('refreshDataBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Refreshing...';
    btn.disabled = true;
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && tab.url.includes('blackhole.xyz/vote')) {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_POOL_DATA' });
        } catch (msgErr) {
          console.warn('Error sending refresh message:', msgErr);
        }
        
        // Wait a bit more for data to be saved to storage and UI to be ready
        await loadAndRenderRecommendations();
        btn.textContent = originalText;
        btn.disabled = false;
      } else {
        showStatus('Navigate to voting page first', 'error');
        btn.textContent = originalText;
        btn.disabled = false;
      }
    } catch (e) {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });

  // Filter input
  const filterInput = document.getElementById('poolNameFilter');
  if (filterInput) {
    filterInput.addEventListener('input', () => {
      // Small debounce for filter
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        loadAndRenderRecommendations();
      }, 300);
    });
  }

  // Action Buttons
  document.getElementById('selectAllBtn').addEventListener('click', async () => {
    // Get current recommendations to select them all
    const pools = getCurrentRecommendationIds();
    if (pools.length > 0) {
      sendMessageToContentScript({ type: 'SELECT_POOLS', poolIds: pools });
      showStatus(`Selecting ${pools.length} pools...`, 'success');
    }
  });

  document.getElementById('clearAllBtn').addEventListener('click', async () => {
    showStatus('Clearing all votes...', 'success');
    try {
      await sendMessageToContentScript({ type: 'CLEAR_ALL_VOTES' });
      // Wait slightly for page state to settle
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadAndRenderRecommendations();
    } catch (e) {
      console.error('Error clearing votes:', e);
    }
  });

  document.getElementById('splitVotesBtn').addEventListener('click', async () => {
    const settings = await loadSettings();
    const poolIds = getCurrentRecommendationIds();
    sendMessageToContentScript({ 
      type: 'SPLIT_VOTES', 
      poolIds: poolIds,
      votingPower: settings.votingPower 
    });
    showStatus('Splitting votes...', 'success');
  });

  document.getElementById('voteBtn').addEventListener('click', async () => {
    const btn = document.getElementById('voteBtn');
    const isShowing = btn.textContent.includes('Hide');
    
    showStatus(isShowing ? 'Hiding vote window...' : 'Opening vote window...', 'success');
    
    try {
      const response = await sendMessageToContentScript({ type: 'TOGGLE_VOTE_PANEL' });
      if (response && response.success) {
        btn.textContent = response.isOpen ? 'Hide Votes' : 'Show Votes';
        btn.classList.toggle('btn-primary', !response.isOpen);
        btn.classList.toggle('btn-secondary', response.isOpen);
      }
    } catch (e) {
      console.error('Error toggling vote window:', e);
    }
  });

  // Open Voting Page Button (Delegated)
  const openBtn = document.getElementById('openVotePageBtn');
  if (openBtn) {
    openBtn.addEventListener('click', openVotingPage);
  }

  // Clear API Logs Button
  const clearLogsBtn = document.getElementById('clearApiLogsBtn');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      capturedRequests = [];
      const list = document.getElementById('api-logs-list');
      if (list) {
        list.innerHTML = '<div class="empty-state"><p>No network requests intercepted yet.</p></div>';
      }
    });
  }

  // Download API Logs Button
  const downloadLogsBtn = document.getElementById('downloadApiLogsBtn');
  if (downloadLogsBtn) {
    downloadLogsBtn.addEventListener('click', () => {
      if (capturedRequests.length === 0) {
        showStatus('No logs to download', 'error');
        return;
      }

      const blob = new Blob([JSON.stringify(capturedRequests, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `blackhole-api-logs-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showStatus('Logs downloaded', 'success');
    });
  }

  // Listen for intercepted network requests
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'NETWORK_REQUEST') {
      addApiLogItem(message.data);
    }
  });

  // Clear Input Buttons
  document.querySelectorAll('.clear-input-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input) {
        input.value = '';
        input.focus();
        // Trigger input event to update state/auto-save
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });
}

function addApiLogItem(data) {
  capturedRequests.push(data);
  const container = document.getElementById('api-logs-list');
  if (!container) return;

  // Remove empty state if present
  const emptyState = container.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  // Create log item
  const item = document.createElement('div');
  item.className = `api-log-item ${data.method}`;
  item.style.borderBottom = '1px solid #eee';
  item.style.padding = '8px 0';
  item.style.fontSize = '11px';
  
  const time = new Date(data.timestamp).toLocaleTimeString();
  
  let responseStr = '';
  try {
    responseStr = typeof data.responseBody === 'object' 
      ? JSON.stringify(data.responseBody, null, 2) 
      : data.responseBody;
  } catch (e) {
    responseStr = '(Could not parse response)';
  }

  item.innerHTML = `
    <div style="display: flex; justify-content: space-between; font-weight: bold; color: #555;">
      <span>${time} [${data.source.toUpperCase()}] Status: ${data.status}</span>
      <span>${data.method}</span>
    </div>
    <div style="word-break: break-all; color: #0366d6; margin: 4px 0;">${data.url}</div>
    <div style="max-height: 100px; overflow-y: auto; background: #f8f8f8; padding: 4px; font-family: monospace; white-space: pre-wrap;">${responseStr.substring(0, 1000)}${responseStr.length > 1000 ? '...' : ''}</div>
  `;

  // Prepend to show newest first
  container.insertBefore(item, container.firstChild);

  // Limit to 50 items to prevent performance issues
  if (container.children.length > 50) {
    container.removeChild(container.lastChild);
  }
}

// Helper to get currently displayed pool IDs
function getCurrentRecommendationIds() {
  const items = document.querySelectorAll('.recommendation-item');
  return Array.from(items).map(item => item.dataset.poolId).filter(id => id);
}

async function sendMessageToContentScript(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('blackhole.xyz/vote')) {
      return await chrome.tabs.sendMessage(tab.id, message);
    } else {
      showStatus('Open Blackhole voting page first', 'error');
      return null;
    }
  } catch (error) {
    console.warn('Error sending message to content script:', error);
    showStatus('Error: Cannot communicate with page. Refresh page.', 'error');
    return null;
  }
}

function openVotingPage() {
  chrome.tabs.query({ url: 'https://blackhole.xyz/vote*' }).then(([tab]) => {
    if (tab) {
      chrome.tabs.update(tab.id, { active: true });
    } else {
      chrome.tabs.create({ url: 'https://blackhole.xyz/vote' });
    }
  });
}

function populateForm(settings) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  };
  
  setVal('votingPower', settings.votingPower);
  setVal('topN', settings.topN);
  setVal('minRewards', settings.minRewards);
  setVal('maxPoolPercentage', settings.maxPoolPercentage);
  setVal('sortBy', settings.sortBy);
  setVal('settingsPoolNameFilter', settings.poolNameFilter);
  
  if (settings.hideVamm !== undefined) document.getElementById('hideVamm').checked = settings.hideVamm;
  if (settings.deepScan !== undefined) document.getElementById('deepScan').checked = settings.deepScan;
  if (settings.enableOverlay !== undefined) document.getElementById('enableOverlay').checked = settings.enableOverlay;
}

async function loadAndRenderRecommendations() {
  const container = document.getElementById('recommendations-list');
  const lastUpdatedEl = document.getElementById('lastUpdated');
  
  try {
    // Get data and settings
    const result = await chrome.storage.local.get(['poolData', 'poolDataTimestamp', 'blackholeSettings']);
    const poolData = result.poolData || [];
    const timestamp = result.poolDataTimestamp;
    const settings = result.blackholeSettings || {};
    
    // Update timestamp
    if (timestamp) {
      const date = new Date(timestamp);
      lastUpdatedEl.textContent = `Updated: ${date.toLocaleTimeString()}`;
    } else {
      lastUpdatedEl.textContent = 'No data';
    }
    
    if (poolData.length === 0) {
      renderEmptyState(container);
      return;
    }
    
    // Convert to Pool objects
    const pools = poolData.map(data => new Pool(data));
    
    // Get filter values (View Filter + Settings Filter)
    const viewFilterInput = document.getElementById('poolNameFilter');
    const viewFilter = viewFilterInput ? viewFilterInput.value.trim() : null;
    
    const filters = [];
    if (settings.poolNameFilter) filters.push(settings.poolNameFilter);
    if (viewFilter) filters.push(viewFilter);
    
    // Generate recommendations
    const recommendations = recommendPools(pools, {
      topN: settings.topN || 10,
      userVotingPower: settings.votingPower,
      hideVamm: settings.hideVamm,
      minRewards: settings.minRewards,
      maxPoolPercentage: settings.maxPoolPercentage,
      poolName: filters.length > 0 ? filters : null,
      sortBy: settings.sortBy || 'auto'
    });
    
    if (recommendations.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No pools match your filters.</p>
          <p style="font-size: 12px; margin-top: 8px;">Found ${pools.length} pools on page.</p>
        </div>`;
      return;
    }

    // Get current selection status from content script
    let selectedIds = [];
    let isVoteOpen = false;
    try {
      const response = await sendMessageToContentScript({ type: 'GET_SELECTED_POOLS' });
      if (response && response.selectedPools) {
        selectedIds = response.selectedPools.map(p => p.poolId);
      }
      
      const statusResponse = await sendMessageToContentScript({ type: 'CHECK_VOTE_PANEL' });
      if (statusResponse) {
        isVoteOpen = statusResponse.isOpen;
      }
    } catch (e) {
      console.warn('Could not get page status:', e);
    }

    // Update Vote Button
    const voteBtn = document.getElementById('voteBtn');
    if (voteBtn) {
      voteBtn.textContent = isVoteOpen ? 'Hide Votes' : 'Show Votes';
      voteBtn.classList.toggle('btn-primary', !isVoteOpen);
      voteBtn.classList.toggle('btn-secondary', isVoteOpen);
    }
    
    // Render list
    let html = `
      <div style="padding: 0 4px 8px; font-size: 11px; color: #666; display: flex; justify-content: space-between;">
        <span>Showing top ${recommendations.length} of ${pools.length} pools</span>
        <span>Sorted by: ${settings.sortBy || 'auto'}</span>
      </div>
      <div class="recommendations-list">
    `;
    
    recommendations.forEach((pool, index) => {
      const estimatedReward = settings.votingPower ? pool.estimateUserRewards(settings.votingPower) : null;
      const poolShare = settings.votingPower ? pool.calculateShare(settings.votingPower) : null;
      const profitabilityScore = pool.profitabilityScore();
      const stabilityScore = pool.stabilityScore();
      
      const isSelected = selectedIds.includes(pool.pool_id);
      const selectedClass = isSelected ? 'pool-selected' : '';
      const buttonText = isSelected ? 'Deselect' : 'Select';
      const buttonClass = isSelected ? 'btn-primary' : 'btn-secondary';
      
      html += `
        <div class="recommendation-item ${selectedClass}" data-pool-id="${pool.pool_id}">
          <div class="pool-rank">#${index + 1}</div>
          <div class="pool-info">
            <div style="display: flex; justify-content: space-between; align-items: start;">
              <div class="pool-name" title="${pool.name}">${pool.name}</div>
              <button class="btn ${buttonClass} btn-sm select-pool-btn" data-id="${pool.pool_id}" style="padding: 2px 6px; font-size: 10px; min-height: 20px; flex: 0 0 auto;">${buttonText}</button>
            </div>
            <div class="pool-metrics">
              <span>Rewards: $${pool.total_rewards.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span>${pool.vapr.toFixed(0)}% VAPR</span>
              ${pool.current_votes ? `<span>${formatNumber(pool.current_votes)} votes</span>` : ''}
              ${poolShare ? `<span>${poolShare.toFixed(1)}% share</span>` : ''}
            </div>
            ${estimatedReward ? `<div class="estimated-reward">Est. Reward: $${estimatedReward.toFixed(2)}</div>` : ''}
            <div class="pool-scores">
              <span>Profit: ${profitabilityScore.toFixed(0)}</span>
              <span>Stability: ${stabilityScore.toFixed(0)}</span>
            </div>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    
    // Add "Go to Page" button at bottom if needed, or rely on header
    html += `
       <div style="margin-top: 12px; text-align: center;">
         <button id="goToVotePageBtn" class="btn btn-secondary btn-sm">Go to Voting Page</button>
       </div>
    `;
    
    container.innerHTML = html;
    
    // Re-attach listener for the new button
    document.getElementById('goToVotePageBtn').addEventListener('click', openVotingPage);

    // Attach listeners to "Select" buttons
    document.querySelectorAll('.select-pool-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const poolId = e.target.dataset.id;
        const isSelected = e.target.textContent === 'Deselect';
        
        e.target.textContent = isSelected ? 'Clearing...' : 'Selecting...';
        e.target.disabled = true;
        
        try {
          await sendMessageToContentScript({ type: 'SELECT_POOL', poolId: poolId });
          // Wait slightly for the page to update
          await new Promise(resolve => setTimeout(resolve, 500));
          await loadAndRenderRecommendations();
        } catch (err) {
          console.error('Error selecting pool:', err);
          e.target.disabled = false;
          e.target.textContent = isSelected ? 'Deselect' : 'Select';
        }
      });
    });
    
  } catch (error) {
    console.error('Error rendering:', error);
    container.innerHTML = `<div class="empty-state"><p>Error: ${error.message}</p></div>`;
  }
}

function renderEmptyState(container) {
  container.innerHTML = `
    <div class="empty-state">
      <p>Navigate to the voting page to load pool data.</p>
      <button id="openVotePageBtnInner" class="btn btn-primary" style="margin-top: 16px;">Open Voting Page</button>
    </div>
  `;
  document.getElementById('openVotePageBtnInner').addEventListener('click', openVotingPage);
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// Reuse existing logic for saving settings
async function loadSettings() {
  const result = await chrome.storage.local.get(['blackholeSettings']);
  const defaults = {
    votingPower: null,
    topN: 10,
    minRewards: null,
    maxPoolPercentage: null,
    sortBy: 'auto',
    hideVamm: false,
    deepScan: false,
    enableOverlay: true,
    poolNameFilter: null
  };
  return { ...defaults, ...(result.blackholeSettings || {}) };
}

async function autoSaveSettings() {
  const settings = {
    votingPower: parseFloatInput('votingPower'),
    topN: parseIntInput('topN', 10),
    minRewards: parseFloatInput('minRewards'),
    maxPoolPercentage: parseFloatInput('maxPoolPercentage'),
    sortBy: document.getElementById('sortBy').value,
    hideVamm: document.getElementById('hideVamm').checked,
    deepScan: document.getElementById('deepScan').checked,
    enableOverlay: document.getElementById('enableOverlay').checked,
    poolNameFilter: document.getElementById('settingsPoolNameFilter').value.trim() || null
  };
  
  await chrome.storage.local.set({ blackholeSettings: settings });
  
  // Notify content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && tab.url.includes('blackhole.xyz/vote')) {
    chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED' }).catch(() => {});
  }
  
  updateStatus();
  showStatus('Settings saved', 'success');
}

function validateSettings() {
  return true;
}

function parseFloatInput(id) {
  const val = document.getElementById(id).value.trim();
  return val === '' ? null : parseFloat(val);
}

function parseIntInput(id, def) {
  const val = document.getElementById(id).value.trim();
  return val === '' ? def : parseInt(val);
}

async function updateStatus() {
  const summaryEl = document.getElementById('active-settings-summary');
  if (!summaryEl) return;
  const settings = await loadSettings();
  
  let html = '<p>';
  
  // Voting Power
  if (settings.votingPower) {
    html += `<span>Power: ${settings.votingPower.toLocaleString()}</span>`;
  } else {
    html += `<span>Power: Not set</span>`;
  }
  
  // Top N
  html += `<span>Top: ${settings.topN || 10}</span>`;
  
  // Min Rewards
  if (settings.minRewards) {
    html += `<span>Min Rewards: $${settings.minRewards.toLocaleString()}</span>`;
  }
  
  // Max Pool %
  if (settings.maxPoolPercentage) {
    html += `<span>Max Share: ${settings.maxPoolPercentage}%</span>`;
  }
  
  // Sort By
  html += `<span>Sort: ${settings.sortBy || 'auto'}</span>`;
  
  // vAMM
  if (settings.hideVamm) {
    html += `<span>No vAMM</span>`;
  }

  // Deep Scan
  if (settings.deepScan) {
    html += `<span>Deep Scan</span>`;
  }
  
  // Pool Name Filter
  if (settings.poolNameFilter) {
    html += `<span>Filter: "${settings.poolNameFilter}"</span>`;
  }
  
  // Overlay
  html += `<span>Overlay: ${settings.enableOverlay ? 'On' : 'Off'}</span>`;
  
  html += '</p>';
  summaryEl.innerHTML = html;
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = `status ${type}`;
  setTimeout(() => el.classList.add('hidden'), 3000);
}