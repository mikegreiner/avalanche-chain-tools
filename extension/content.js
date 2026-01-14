/**
 * Content script for Blackhole DEX Tools extension
 * 
 * Injects pool recommendations and analysis directly into the voting page.
 */

// Load modules (using dynamic import for ES modules)
let Pool, extractPoolsFromDOM, extractPoolsFromAPI, recommendPools;

(async () => {
  try {
    // Import modules
    const poolModule = await import(chrome.runtime.getURL('lib/pool.js'));
    Pool = poolModule.default;
    
    const extractorModule = await import(chrome.runtime.getURL('lib/pool-extractor.js'));
    extractPoolsFromDOM = extractorModule.extractPoolsFromDOM;
    extractPoolsFromAPI = extractorModule.extractPoolsFromAPI;
    
    const recommenderModule = await import(chrome.runtime.getURL('lib/pool-recommender.js'));
    recommendPools = recommenderModule.recommendPools;
    
    console.log('Blackhole DEX Tools: Modules loaded');
    init();
  } catch (error) {
    console.error('Error loading modules:', error);
    // Fallback: try loading as regular scripts
    loadModulesAsScripts();
  }
})();

function loadModulesAsScripts() {
  // Fallback: inject scripts and use global variables
  const scripts = [
    'lib/pool.js',
    'lib/pool-extractor.js',
    'lib/pool-recommender.js'
  ];
  
  let loaded = 0;
  scripts.forEach(src => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(src);
    script.type = 'module';
    script.onload = () => {
      loaded++;
      if (loaded === scripts.length) {
        init();
      }
    };
    document.head.appendChild(script);
  });
}

console.log('Blackhole DEX Tools: Content script loaded');

// Settings
let settings = {
  votingPower: null,
  hideVamm: false,
  enableOverlay: true
};

// Load settings
chrome.storage.local.get(['blackholeSettings'], (result) => {
  if (result.blackholeSettings) {
    settings = { ...settings, ...result.blackholeSettings };
  }
  // init() will be called after modules load
});

// Listen for settings updates
chrome.storage.onChanged.addListener((changes) => {
  if (changes.blackholeSettings) {
    settings = { ...settings, ...changes.blackholeSettings.newValue };
    updateOverlay();
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SETTINGS_UPDATED') {
    chrome.storage.local.get(['blackholeSettings'], (result) => {
      if (result.blackholeSettings) {
        settings = { ...settings, ...result.blackholeSettings };
        updateOverlay();
      }
    });
  } else if (message.type === 'REFRESH_POOL_DATA') {
    fetchPoolData(true);
  }
  return true;
});

// Initialize extension features
function init() {
  console.log('Blackhole DEX Tools: Initializing...');
  
  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupExtension();
    });
  } else {
    setupExtension();
  }
}

function setupExtension() {
  // Wait a bit for React to render pools
  setTimeout(() => {
    // Fetch pool data from DOM (more reliable than API for voting metrics)
    fetchPoolData();
    
    // Set up observer to watch for pool list changes
    observePoolList();
    
    // Inject overlay if enabled
    if (settings.enableOverlay) {
      injectOverlay();
    }
  }, 3000); // Give React time to render
}

/**
 * Fetch pool data from DOM or API
 */
async function fetchPoolData(forceRefresh = false) {
  try {
    console.log('Fetching pool data...');
    
    let pools = [];
    
    // First, try extracting from DOM (has all voting metrics)
    try {
      pools = extractPoolsFromDOM();
      console.log(`Extracted ${pools.length} pools from DOM`);
    } catch (error) {
      console.warn('Error extracting from DOM:', error);
    }
    
    // Fallback: try API (has pool metadata but not voting metrics)
    if (pools.length === 0) {
      try {
        pools = await extractPoolsFromAPI();
        console.log(`Extracted ${pools.length} pools from API`);
      } catch (error) {
        console.warn('Error extracting from API:', error);
      }
    }
    
    if (pools.length === 0) {
      console.warn('No pools extracted. Page may not be fully loaded.');
      return;
    }
    
    // Store in extension storage
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
    
    // Update overlay with recommendations
    if (settings.enableOverlay) {
      updateOverlay();
    }
    
  } catch (error) {
    console.error('Error fetching pool data:', error);
  }
}

/**
 * Observe the pool list for changes
 */
function observePoolList() {
  // Watch for changes to the pool list container
  const observer = new MutationObserver(() => {
    // Pool list updated, refresh recommendations
    if (settings.enableOverlay) {
      updateOverlay();
    }
  });
  
  // Start observing when pool container is found
  const checkForPoolContainer = setInterval(() => {
    const poolContainer = document.querySelector('[data-pool-list]') || 
                         document.querySelector('.pool-list') ||
                         document.body;
    
    if (poolContainer) {
      observer.observe(poolContainer, {
        childList: true,
        subtree: true
      });
      clearInterval(checkForPoolContainer);
    }
  }, 1000);
  
  // Stop checking after 10 seconds
  setTimeout(() => clearInterval(checkForPoolContainer), 10000);
}

/**
 * Inject recommendation overlay into the page
 */
function injectOverlay() {
  // Check if overlay already exists
  if (document.getElementById('blackhole-tools-overlay')) {
    return;
  }
  
  const overlay = document.createElement('div');
  overlay.id = 'blackhole-tools-overlay';
  overlay.innerHTML = `
    <div class="blackhole-tools-panel">
      <div class="blackhole-tools-header">
        <h3>Pool Recommendations</h3>
        <button class="blackhole-tools-close" id="blackhole-tools-close">×</button>
      </div>
      <div class="blackhole-tools-content" id="blackhole-tools-content">
        <p>Loading recommendations...</p>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Close button
  document.getElementById('blackhole-tools-close').addEventListener('click', () => {
    overlay.style.display = 'none';
  });
  
  // Update with recommendations
  updateOverlay();
}

/**
 * Update the overlay with current recommendations
 */
async function updateOverlay() {
  const contentEl = document.getElementById('blackhole-tools-content');
  if (!contentEl) return;
  
  // Get pool data
  const result = await chrome.storage.local.get(['poolData']);
  const poolData = result.poolData || [];
  
  if (poolData.length === 0) {
    contentEl.innerHTML = '<p>No pool data available. Click "Refresh Pool Data" in the extension popup.</p>';
    return;
  }
  
  // Convert plain objects back to Pool instances
  const pools = poolData.map(data => new Pool(data));
  
  // Generate recommendations using the recommender
  try {
    const recommendations = recommendPools(pools, {
      topN: 10,
      userVotingPower: settings.votingPower,
      hideVamm: settings.hideVamm,
      sortBy: 'auto'
    });
    
    if (recommendations.length === 0) {
      contentEl.innerHTML = '<p>No pools match your criteria. Try adjusting filters.</p>';
      return;
    }
    
    // Generate recommendations HTML
    let html = '<div class="recommendations-list">';
    
    recommendations.forEach((pool, index) => {
      const estimatedReward = settings.votingPower ? pool.estimateUserRewards(settings.votingPower) : null;
      const poolShare = settings.votingPower ? pool.calculateShare(settings.votingPower) : null;
      const profitabilityScore = pool.profitabilityScore();
      const stabilityScore = pool.stabilityScore();
      const rewardsPerVote = pool.rewardsPerVote();
      
      html += `
        <div class="recommendation-item">
          <div class="pool-rank">#${index + 1}</div>
          <div class="pool-info">
            <div class="pool-name">${pool.name || 'Unknown Pool'}</div>
            <div class="pool-metrics">
              <span>Rewards: $${pool.total_rewards.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span>VAPR: ${pool.vapr.toFixed(0)}%</span>
              ${pool.current_votes ? `<span>Votes: ${formatNumber(pool.current_votes)}</span>` : ''}
              ${poolShare ? `<span>Share: ${poolShare.toFixed(1)}%</span>` : ''}
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
    contentEl.innerHTML = html;
  } catch (error) {
    console.error('Error generating recommendations:', error);
    contentEl.innerHTML = `<p>Error generating recommendations: ${error.message}</p>`;
  }
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}
