/**
 * rpc-integration.js
 * 
 * Integration layer between RPC pool provider and existing extension
 * Provides functions to fetch pool data via RPC and store in chrome.storage
 */

console.log('[RPC] rpc-integration.js loading...');

// Import RPC modules
// Note: These will be loaded in sidepanel.html before this script

/**
 * Fetch all pool data via RPC and store in chrome.storage
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - Result object with pools and metadata
 */
async function fetchPoolDataViaRpc(options = {}) {
  const {
    useCache = true,
    limit = 100,
  } = options;

  console.log('[RPC Integration] Starting RPC pool fetch...');
  const startTime = Date.now();

  try {
    // Initialize provider
    const provider = new RpcPoolProvider();

    // Fetch pools
    const pools = await provider.fetchAllPools({ includeGauges: true, limit });

    // Convert to format expected by existing extension code
    const poolData = pools.map(pool => ({
      pool_id: pool.address,
      name: pool.name,
      total_rewards: pool.weeklyRewards,
      weekly_fees_usd: pool.weeklyFeesUsd || 0,
      weekly_emissions_usd: pool.weeklyEmissionsUsd || 0,
      vapr: pool.vapr,
      current_votes: pool.votes,
      vote_share: pool.voteShare,
      tvl: pool.tvl,
      // Additional data for compatibility
      poolType: pool.poolType,
      token0: pool.token0,
      token1: pool.token1,
      fee: pool.fee,
      gauge: pool.gauge,
      epochFees: pool.epochFees,
    }));

    // Get stats
    const stats = provider.getStats();

    // Store in chrome.storage
    const timestamp = Date.now();
    await chrome.storage.local.set({
      poolData,
      poolDataTimestamp: timestamp,
      rpcPoolMetadata: {
        totalVotes: stats.totalVotes,
        totalTvl: stats.totalTvl,
        blackPrice: stats.blackPrice,
        poolCount: stats.totalPools,
        fetchMethod: 'rpc',
        fetchDuration: Date.now() - startTime,
      }
    });

    const elapsed = Date.now() - startTime;
    console.log(`[RPC Integration] ✓ Fetched ${poolData.length} pools via RPC in ${elapsed}ms`);

    return {
      success: true,
      pools: poolData,
      stats,
      timestamp,
      duration: elapsed,
    };

  } catch (error) {
    console.error('[RPC Integration] Failed to fetch via RPC:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Check if we should use RPC or DOM scraping
 * @returns {Promise<string>} - 'rpc' or 'dom'
 */
async function determineFetchMethod() {
  // Check if user is on voting page
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (!activeTab || !activeTab.url) {
    return 'rpc'; // Default to RPC if no active tab
  }

  // If on blackhole voting page, can use either method
  // For now, prefer RPC for speed
  if (activeTab.url.includes('blackhole.xyz/vote')) {
    // Check if RPC data exists and is fresh
    const result = await chrome.storage.local.get(['rpcPoolMetadata']);
    const metadata = result.rpcPoolMetadata;

    if (metadata && metadata.fetchMethod === 'rpc') {
      const age = Date.now() - (metadata.timestamp || 0);
      if (age < 300000) { // 5 minutes
        return 'rpc'; // Use cached RPC data
      }
    }

    // Default to RPC for first load
    return 'rpc';
  }

  // Not on voting page, use RPC only
  return 'rpc';
}

/**
 * Smart refresh: Use RPC to fetch pool data
 * This is the new preferred method
 */
async function smartRefreshPoolData() {
  console.log('[RPC Integration] Smart refresh initiated');

  try {
    const method = await determineFetchMethod();
    console.log(`[RPC Integration] Using method: ${method}`);

    if (method === 'rpc') {
      const result = await fetchPoolDataViaRpc({ useCache: false });
      if (result.success) {
        console.log(`[RPC Integration] ✓ Refreshed ${result.pools.length} pools via RPC`);
        return {
          success: true,
          method: 'rpc',
          poolCount: result.pools.length,
          duration: result.duration,
        };
      } else {
        throw new Error(result.error);
      }
    } else {
      // Fallback to DOM scraping
      console.log('[RPC Integration] Falling back to DOM scraping (not implemented here)');
      // The existing refresh button logic will handle this
      return {
        success: false,
        method: 'dom',
        message: 'DOM scraping fallback needed',
      };
    }
  } catch (error) {
    console.error('[RPC Integration] Smart refresh failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Initialize RPC integration on page load
 */
async function initializeRpcIntegration() {
  console.log('[RPC Integration] Initializing...');

  // Check if we have any pool data
  const result = await chrome.storage.local.get(['poolData', 'poolDataTimestamp']);

  if (!result.poolData || result.poolData.length === 0) {
    console.log('[RPC Integration] No pool data found, fetching via RPC...');
    await fetchPoolDataViaRpc();
  } else {
    // Check if data is stale (older than 5 minutes)
    const age = Date.now() - (result.poolDataTimestamp || 0);
    if (age > 300000) { // 5 minutes
      console.log('[RPC Integration] Pool data is stale, refreshing via RPC...');
      await fetchPoolDataViaRpc({ useCache: false });
    } else {
      console.log('[RPC Integration] Using cached pool data');
    }
  }
}

// Export functions for use in sidepanel
if (typeof window !== 'undefined') {
  window.rpcIntegration = {
    fetchPoolDataViaRpc,
    smartRefreshPoolData,
    initializeRpcIntegration,
    determineFetchMethod,
  };
  console.log('[RPC] rpc-integration loaded successfully, window.rpcIntegration available:', typeof window.rpcIntegration !== 'undefined');
}
