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
  
  // Show/hide API Discovery tab based on setting
  const apiDiscoveryTab = document.querySelector('.api-discovery-tab');
  if (apiDiscoveryTab) {
    apiDiscoveryTab.style.display = settings.apiDiscoveryEnabled ? 'block' : 'none';
  }
  
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


  document.getElementById('apiDiscoveryEnabled').addEventListener('change', async () => {
    await autoSaveSettings();
    // Show/hide API Discovery tab
    const apiDiscoveryTab = document.querySelector('.api-discovery-tab');
    const settings = await loadSettings();
    if (apiDiscoveryTab) {
      apiDiscoveryTab.style.display = settings.apiDiscoveryEnabled ? 'block' : 'none';
    }
    // Reload page to inject/remove API discovery script
    showStatus('API Discovery setting changed. Reload the voting page for changes to take effect.', 'info');
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
        list.innerHTML = '<div class="empty-state"><p>No network requests intercepted yet.</p><p style="font-size: 11px; color: #888; margin-top: 4px;">Navigate to blackhole.xyz/vote to start capturing requests.</p></div>';
      }
      updateApiStats();
      renderApiLogs();
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

      // Enhanced export with analysis
      const exportData = {
        metadata: {
          timestamp: new Date().toISOString(),
          totalRequests: capturedRequests.length,
          poolEndpoints: capturedRequests.filter(r => r.analysis?.isPoolRelated).length,
          rpcCalls: capturedRequests.filter(r => r.analysis?.isRpcCall).length
        },
        requests: capturedRequests.map(req => ({
          ...req,
          summary: {
            category: req.analysis?.category || 'other',
            poolType: req.analysis?.poolType || null,
            endpointType: req.analysis?.endpointType || null,
            hasPoolData: req.analysis?.hasPoolData || false
          }
        }))
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `blackhole-api-logs-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showStatus('Logs downloaded with analysis', 'success');
    });
  }

  // API Discovery filters
  const apiSearchFilter = document.getElementById('api-filter-search');
  const apiCategoryFilter = document.getElementById('api-filter-category');
  const apiPoolTypeFilter = document.getElementById('api-filter-pool-type');
  
  if (apiSearchFilter) {
    apiSearchFilter.addEventListener('input', () => {
      renderApiLogs();
    });
  }
  
  if (apiCategoryFilter) {
    apiCategoryFilter.addEventListener('change', () => {
      renderApiLogs();
    });
  }
  
  if (apiPoolTypeFilter) {
    apiPoolTypeFilter.addEventListener('change', () => {
      renderApiLogs();
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

function updateApiStats() {
  const stats = {
    total: capturedRequests.length,
    pools: capturedRequests.filter(r => r.analysis?.isPoolRelated || r.analysis?.isApiEndpoint).length,
    rpc: capturedRequests.filter(r => r.analysis?.isRpcCall).length,
    vamm: capturedRequests.filter(r => r.analysis?.poolType === 'vAMM' || r.analysis?.endpointType === 'vAMM').length,
    samm: capturedRequests.filter(r => r.analysis?.poolType === 'sAMM' || r.analysis?.endpointType === 'sAMM').length
  };

  const statTotal = document.getElementById('stat-total');
  const statPools = document.getElementById('stat-pools');
  const statRpc = document.getElementById('stat-rpc');
  const statVamm = document.getElementById('stat-vamm');
  const statSamm = document.getElementById('stat-samm');

  if (statTotal) statTotal.textContent = stats.total;
  if (statPools) statPools.textContent = stats.pools;
  if (statRpc) statRpc.textContent = stats.rpc;
  if (statVamm) statVamm.textContent = stats.vamm;
  if (statSamm) statSamm.textContent = stats.samm;
}

function renderApiLogs() {
  const container = document.getElementById('api-logs-list');
  if (!container) return;

  // Get filter values
  const searchTerm = (document.getElementById('api-filter-search')?.value || '').toLowerCase();
  const categoryFilter = document.getElementById('api-filter-category')?.value || 'all';
  const poolTypeFilter = document.getElementById('api-filter-pool-type')?.value || 'all';

  // Filter requests
  let filtered = capturedRequests;
  
  if (searchTerm) {
    filtered = filtered.filter(req => 
      req.url.toLowerCase().includes(searchTerm) ||
      req.method.toLowerCase().includes(searchTerm) ||
      (req.analysis?.rpcMethod && req.analysis.rpcMethod.toLowerCase().includes(searchTerm)) ||
      (req.analysis?.contractAddress && req.analysis.contractAddress.toLowerCase().includes(searchTerm))
    );
  }
  
  if (categoryFilter !== 'all') {
    filtered = filtered.filter(req => req.analysis?.category === categoryFilter);
  }
  
  if (poolTypeFilter !== 'all') {
    filtered = filtered.filter(req => 
      req.analysis?.poolType === poolTypeFilter || 
      req.analysis?.endpointType === poolTypeFilter
    );
  }

  // Clear container
  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No requests match the current filters.</p></div>';
    return;
  }

  // Render filtered requests (newest first)
  filtered.reverse().forEach(data => {
    const item = createApiLogItem(data);
    container.appendChild(item);
  });
}

function createApiLogItem(data) {
  const item = document.createElement('div');
  const analysis = data.analysis || {};
  
  // Determine styling based on analysis
  let borderColor = '#333';
  let bgColor = '#0a0a0a';
  let badge = '';
  
  if (analysis.isPoolRelated) {
    borderColor = '#4CAF50';
    bgColor = '#0a1a0a';
    badge = '🏊 POOL';
  } else if (analysis.isRpcCall) {
    borderColor = '#2196F3';
    bgColor = '#0a0f1a';
    badge = '🔗 RPC';
  } else if (analysis.isApiEndpoint) {
    borderColor = '#FF9800';
    bgColor = '#1a0f0a';
    badge = '🌐 API';
  }
  
  if (analysis.poolType === 'vAMM') {
    borderColor = '#FF9800';
    badge = '⚡ vAMM';
  } else if (analysis.poolType === 'sAMM') {
    borderColor = '#9C27B0';
    badge = '🔄 sAMM';
  } else if (analysis.poolType === 'CL') {
    borderColor = '#4CAF50';
    badge = '📊 CL';
  }

  item.style.border = `1px solid ${borderColor}`;
  item.style.borderRadius = '4px';
  item.style.padding = '8px';
  item.style.marginBottom = '8px';
  item.style.background = bgColor;
  item.style.fontSize = '11px';
  
  const time = new Date(data.timestamp).toLocaleTimeString();
  
  let responseStr = '';
  let responsePreview = '';
  try {
    if (typeof data.responseBody === 'object' && data.responseBody !== null) {
      responseStr = JSON.stringify(data.responseBody, null, 2);
      // Try to extract pool count if it's an array
      if (Array.isArray(data.responseBody)) {
        responsePreview = `Array with ${data.responseBody.length} items`;
      } else if (data.responseBody.pools && Array.isArray(data.responseBody.pools)) {
        responsePreview = `Object with pools array (${data.responseBody.pools.length} pools)`;
      } else {
        responsePreview = `Object with ${Object.keys(data.responseBody).length} keys`;
      }
    } else {
      responseStr = String(data.responseBody);
      responsePreview = responseStr.substring(0, 200);
    }
  } catch (e) {
    responseStr = '(Could not parse response)';
    responsePreview = responseStr;
  }

  // Build RPC info if available
  let rpcInfo = '';
  if (analysis.isRpcCall) {
    rpcInfo = '<div style="margin: 4px 0; padding: 4px; background: rgba(33, 150, 243, 0.1); border-radius: 2px; font-size: 10px;">';
    if (analysis.rpcMethod) {
      rpcInfo += `<strong>Method:</strong> ${analysis.rpcMethod}<br>`;
    }
    if (analysis.contractAddress) {
      rpcInfo += `<strong>Contract:</strong> ${analysis.contractAddress}<br>`;
    }
    if (analysis.functionSelector) {
      rpcInfo += `<strong>Selector:</strong> ${analysis.functionSelector}`;
    }
    rpcInfo += '</div>';
  }

  // Build endpoint info if available
  let endpointInfo = '';
  if (analysis.endpointType) {
    endpointInfo = `<div style="margin: 4px 0; padding: 4px; background: rgba(255, 152, 0, 0.1); border-radius: 2px; font-size: 10px;">
      <strong>Endpoint Type:</strong> ${analysis.endpointType}
      ${analysis.hasPoolData ? ' <span style="color: #4CAF50;">✓ Has Pool Data</span>' : ''}
    </div>`;
  }

  item.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
      <div>
        <span style="font-weight: bold; color: #ffd700;">${time}</span>
        <span style="color: #888; margin-left: 8px;">[${data.source.toUpperCase()}]</span>
        <span style="color: ${data.status >= 200 && data.status < 300 ? '#4CAF50' : data.status >= 400 ? '#f44336' : '#888'}; margin-left: 8px;">
          ${data.status}
        </span>
        ${badge ? `<span style="margin-left: 8px; padding: 2px 6px; background: ${borderColor}; border-radius: 3px; font-size: 9px; font-weight: bold;">${badge}</span>` : ''}
      </div>
      <span style="color: #888; font-size: 10px;">${data.method}</span>
    </div>
    <div style="word-break: break-all; color: #4CAF50; margin: 4px 0; font-size: 10px; font-family: monospace;">
      ${data.url}
    </div>
    ${rpcInfo}
    ${endpointInfo}
    <details style="margin-top: 4px;">
      <summary style="cursor: pointer; color: #888; font-size: 10px;">Response Preview</summary>
      <div style="max-height: 200px; overflow-y: auto; background: #000; padding: 8px; margin-top: 4px; border-radius: 2px; font-family: monospace; white-space: pre-wrap; font-size: 9px; color: #ccc;">
        ${responsePreview}${responseStr.length > 200 ? '\n... (truncated)' : ''}
      </div>
    </details>
  `;

  return item;
}

function addApiLogItem(data) {
  capturedRequests.push(data);
  updateApiStats();
  renderApiLogs();
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
    enableOverlay: true,
    poolNameFilter: null,
    apiDiscoveryEnabled: false  // Default: off
  };
  return { ...defaults, ...(result.blackholeSettings || {}) };
}

async function autoSaveSettings() {
  const settings = {
    votingPower: parseFloatInput('votingPower'),
    topN: parseIntInput('topN', 10),
    minRewards: parseFloatInput('minRewards'),
    apiDiscoveryEnabled: document.getElementById('apiDiscoveryEnabled')?.checked || false,
    maxPoolPercentage: parseFloatInput('maxPoolPercentage'),
    sortBy: document.getElementById('sortBy').value,
    hideVamm: document.getElementById('hideVamm').checked,
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