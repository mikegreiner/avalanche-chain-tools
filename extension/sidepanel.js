import { Pool, recommendPools } from './popup-helper.js';

/**
 * Side Panel script for Blackhole DEX Tools extension
 */

// Auto-save debounce timer
let saveTimer = null;

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
      
      // specific actions when switching
      if (tab.dataset.tab === 'recommendations') {
        loadAndRenderRecommendations();
      }
    });
  });
}

function setupListeners() {
  // Auto-save on input changes (with debounce)
  const inputs = [
    'votingPower', 'topN', 'minRewards', 'maxPoolPercentage', 'sortBy'
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
  
  // Enable overlay checkbox
  document.getElementById('enableOverlay').addEventListener('change', async () => {
    await autoSaveSettings();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('blackhole.xyz/vote')) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' }).catch(() => {});
    }
  });
  
  // Save button
  document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    if (validateSettings()) {
      await autoSaveSettings();
      showStatus('Settings saved!', 'success');
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
        chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_POOL_DATA' });
        // Wait a bit for data to be saved to storage
        setTimeout(async () => {
          await loadAndRenderRecommendations();
          btn.textContent = originalText;
          btn.disabled = false;
        }, 1000);
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

  document.getElementById('clearAllBtn').addEventListener('click', () => {
    sendMessageToContentScript({ type: 'CLEAR_ALL_VOTES' });
    showStatus('Clearing all votes...', 'success');
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

  document.getElementById('voteBtn').addEventListener('click', () => {
    sendMessageToContentScript({ type: 'SUBMIT_VOTE' });
    showStatus('Clicking Vote button...', 'success');
  });

  // Open Voting Page Button (Delegated)
  const openBtn = document.getElementById('openVotePageBtn');
  if (openBtn) {
    openBtn.addEventListener('click', openVotingPage);
  }
}

// Helper to get currently displayed pool IDs
function getCurrentRecommendationIds() {
  const items = document.querySelectorAll('.recommendation-item');
  return Array.from(items).map(item => item.dataset.poolId).filter(id => id);
}

async function sendMessageToContentScript(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && tab.url.includes('blackhole.xyz/vote')) {
    chrome.tabs.sendMessage(tab.id, message).catch(() => {
      showStatus('Error: Cannot communicate with page. Refresh page.', 'error');
    });
  } else {
    showStatus('Open Blackhole voting page first', 'error');
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
  
  if (settings.hideVamm !== undefined) document.getElementById('hideVamm').checked = settings.hideVamm;
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
    
    // Get filter value
    const filterInput = document.getElementById('poolNameFilter');
    const poolNameFilter = filterInput ? filterInput.value.trim() : null;
    
    // Generate recommendations
    const recommendations = recommendPools(pools, {
      topN: settings.topN || 10,
      userVotingPower: settings.votingPower,
      hideVamm: settings.hideVamm,
      minRewards: settings.minRewards,
      maxPoolPercentage: settings.maxPoolPercentage,
      poolName: poolNameFilter || null,
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
      const profitabilityScore = pool.profitabilityScore();
      const stabilityScore = pool.stabilityScore();
      const rewardsPerVote = pool.rewardsPerVote();
      
      html += `
        <div class="recommendation-item" data-pool-id="${pool.pool_id}">
          <div class="pool-rank">#${index + 1}</div>
          <div class="pool-info">
            <div style="display: flex; justify-content: space-between; align-items: start;">
              <div class="pool-name" title="${pool.name}">${pool.name}</div>
              <button class="btn btn-secondary btn-sm select-pool-btn" data-id="${pool.pool_id}" style="padding: 2px 6px; font-size: 10px; min-height: 20px; flex: 0 0 auto;">Select</button>
            </div>
            <div class="pool-metrics">
              <span>$${pool.total_rewards.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span>${pool.vapr.toFixed(0)}% VAPR</span>
              ${pool.current_votes ? `<span>${formatNumber(pool.current_votes)} votes</span>` : ''}
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
      btn.addEventListener('click', (e) => {
        const poolId = e.target.dataset.id;
        sendMessageToContentScript({ type: 'SELECT_POOL', poolId: poolId });
        e.target.textContent = 'Selecting...';
        setTimeout(() => e.target.textContent = 'Select', 1000);
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

async function autoSaveSettings() {
  const settings = {
    votingPower: parseFloatInput('votingPower'),
    topN: parseIntInput('topN', 10),
    minRewards: parseFloatInput('minRewards'),
    maxPoolPercentage: parseFloatInput('maxPoolPercentage'),
    sortBy: document.getElementById('sortBy').value,
    hideVamm: document.getElementById('hideVamm').checked,
    enableOverlay: document.getElementById('enableOverlay').checked
  };
  
  await chrome.storage.local.set({ blackholeSettings: settings });
  
  // Notify content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && tab.url.includes('blackhole.xyz/vote')) {
    chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED' }).catch(() => {});
  }
  
  updateStatus();
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
  const statusInfo = document.getElementById('statusInfo');
  if (!statusInfo) return;
  const settings = await loadSettings();
  
  let statusHtml = '<p>';
  if (settings.votingPower) statusHtml += `✓ Voting power: ${settings.votingPower.toLocaleString()}<br>`;
  statusHtml += `✓ Top ${settings.topN}<br>`;
  statusHtml += '</p>';
  statusInfo.innerHTML = statusHtml;
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = `status ${type}`;
  setTimeout(() => el.classList.add('hidden'), 3000);
}