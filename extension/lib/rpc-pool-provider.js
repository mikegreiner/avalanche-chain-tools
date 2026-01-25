/**
 * RpcPoolProvider.js
 * 
 * High-level pool data provider using RPC calls instead of DOM scraping.
 * Provides the same interface as existing pool providers but 20x faster.
 */

console.log('[RPC] RpcPoolProvider.js loading...');

class RpcPoolProvider {
  constructor() {
    this.client = new BlackholeRpcClient();
    this.pools = [];
    this.totalVotes = 0;
    this.blackPrice = 0;
    this.lastFetchTimestamp = 0;
    this.isFetching = false;
  }

  /**
   * Fetch all pool data
   * @param {Object} options - Fetch options
   * @param {boolean} options.includeGauges - Whether to fetch gauge data (slower)
   * @param {number} options.limit - Max number of pools to fetch
   * @returns {Promise<Array>} - Array of pool objects
   */
  async fetchAllPools(options = {}) {
    const { includeGauges = true, limit = 100 } = options;

    if (this.isFetching) {
      console.log('Already fetching pools, waiting...');
      // Wait for current fetch to complete
      while (this.isFetching) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return this.pools;
    }

    this.isFetching = true;

    try {
      console.log('[RpcPoolProvider] Starting pool fetch...');
      const startTime = Date.now();

      // Step 1: Fetch pool metadata from static API (need this first for token list)
      console.log('[RpcPoolProvider] Fetching CL pool metadata...');
      const metadata = await this.client.fetchClPoolsMetadata();
      console.log(`[RpcPoolProvider] Found ${metadata.length} CL pools`);

      // Step 2: Extract all unique token addresses and cache decimals
      const tokenAddresses = new Set();
      for (const pool of metadata) {
        if (pool.token0?.id) {
          tokenAddresses.add(pool.token0.id.toLowerCase());
          this.client.setTokenDecimals(pool.token0.id, parseInt(pool.token0.decimals || 18));
        }
        if (pool.token1?.id) {
          tokenAddresses.add(pool.token1.id.toLowerCase());
          this.client.setTokenDecimals(pool.token1.id, parseInt(pool.token1.decimals || 18));
        }
      }
      console.log(`[RpcPoolProvider] Found ${tokenAddresses.size} unique tokens`);

      // Step 3: Fetch all token prices in one batch
      console.log('[RpcPoolProvider] Fetching token prices from DeFiLlama...');
      await this.client.fetchTokenPrices([...tokenAddresses]);
      this.blackPrice = await this.client.getBlackPrice();
      const avaxPrice = this.client.getTokenPrice(this.client.TOKENS.WAVAX);
      
      // Count how many tokens have prices
      let pricedTokens = 0;
      for (const addr of tokenAddresses) {
        if (this.client.getTokenPrice(addr) > 0) pricedTokens++;
      }
      console.log(`[RpcPoolProvider] Got prices for ${pricedTokens}/${tokenAddresses.size} tokens, BLACK: $${this.blackPrice.toFixed(5)}, AVAX: $${avaxPrice.toFixed(2)}`);

      // Step 4: Fetch total votes
      console.log('[RpcPoolProvider] Fetching total votes...');
      this.totalVotes = await this.client.getTotalVotes();
      console.log(`[RpcPoolProvider] Total votes: ${this.totalVotes.toLocaleString()}`);

      // Step 4: Process pools (limit if requested)
      const poolsToProcess = metadata.slice(0, limit);
      this.pools = [];

      console.log(`[RpcPoolProvider] Processing ${poolsToProcess.length} pools...`);

      // Batch process pools for better performance
      const batchSize = 10;
      for (let i = 0; i < poolsToProcess.length; i += batchSize) {
        const batch = poolsToProcess.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (meta) => {
          try {
            const pool = await this.client.buildPoolData(
              meta.id,
              meta,
              this.blackPrice
            );
            
            // Calculate vote share
            pool.voteShare = this.totalVotes > 0 
              ? (pool.votes / this.totalVotes) * 100 
              : 0;
            
            return pool;
          } catch (error) {
            console.error(`Failed to process pool ${meta.id}:`, error);
            return null;
          }
        });

        const results = await Promise.all(batchPromises);
        this.pools.push(...results.filter(p => p !== null));

        console.log(`[RpcPoolProvider] Processed ${Math.min(i + batchSize, poolsToProcess.length)}/${poolsToProcess.length} pools`);
      }

      const elapsed = Date.now() - startTime;
      console.log(`[RpcPoolProvider] ✓ Fetched ${this.pools.length} pools in ${elapsed}ms`);

      this.lastFetchTimestamp = Date.now();
      return this.pools;

    } catch (error) {
      console.error('[RpcPoolProvider] Fetch failed:', error);
      throw error;
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Get pools sorted by a specific field
   * @param {string} sortBy - Field to sort by (vapr, votes, tvl)
   * @param {boolean} ascending - Sort direction
   * @returns {Array} - Sorted pools
   */
  getSortedPools(sortBy = 'vapr', ascending = false) {
    const sorted = [...this.pools].sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      return ascending ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }

  /**
   * Get top N pools by VAPR
   * @param {number} count - Number of pools to return
   * @returns {Array} - Top pools
   */
  getTopPoolsByVapr(count = 10) {
    return this.getSortedPools('vapr', false).slice(0, count);
  }

  /**
   * Get top N pools by votes
   * @param {number} count - Number of pools to return
   * @returns {Array} - Top pools
   */
  getTopPoolsByVotes(count = 10) {
    return this.getSortedPools('votes', false).slice(0, count);
  }

  /**
   * Find pool by address
   * @param {string} address - Pool address
   * @returns {Object|null} - Pool object or null
   */
  findPoolByAddress(address) {
    const addrLower = address.toLowerCase();
    return this.pools.find(p => p.address.toLowerCase() === addrLower) || null;
  }

  /**
   * Search pools by name or address
   * @param {string} query - Search query
   * @returns {Array} - Matching pools
   */
  searchPools(query) {
    const queryLower = query.toLowerCase();
    return this.pools.filter(p => 
      p.name.toLowerCase().includes(queryLower) ||
      p.address.toLowerCase().includes(queryLower) ||
      p.token0.symbol.toLowerCase().includes(queryLower) ||
      p.token1.symbol.toLowerCase().includes(queryLower)
    );
  }

  /**
   * Check if data is stale
   * @param {number} maxAgeMs - Max age in milliseconds
   * @returns {boolean} - True if data is stale
   */
  isStale(maxAgeMs = 300000) { // Default 5 minutes
    return Date.now() - this.lastFetchTimestamp > maxAgeMs;
  }

  /**
   * Get pool statistics
   * @returns {Object} - Stats object
   */
  getStats() {
    const poolsWithGauges = this.pools.filter(p => p.gauge !== null).length;
    const poolsWithVotes = this.pools.filter(p => p.votes > 0).length;
    const avgVapr = this.pools.length > 0
      ? this.pools.reduce((sum, p) => sum + p.vapr, 0) / this.pools.length
      : 0;
    const totalTvl = this.pools.reduce((sum, p) => sum + p.tvl, 0);

    return {
      totalPools: this.pools.length,
      poolsWithGauges,
      poolsWithVotes,
      totalVotes: this.totalVotes,
      totalTvl,
      avgVapr,
      blackPrice: this.blackPrice,
      lastFetch: new Date(this.lastFetchTimestamp).toISOString(),
    };
  }

  /**
   * Format pool data for display
   * @param {Object} pool - Pool object
   * @returns {Object} - Formatted data
   */
  formatPoolForDisplay(pool) {
    return {
      address: pool.address,
      name: pool.name,
      tvl: `$${pool.tvl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      votes: pool.votes > 1e6 
        ? `${(pool.votes / 1e6).toFixed(2)}M`
        : pool.votes.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      voteShare: `${pool.voteShare.toFixed(2)}%`,
      vapr: `${pool.vapr.toFixed(1)}%`,
      weeklyRewards: `$${pool.weeklyRewards.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      hasGauge: pool.gauge !== null,
    };
  }

  /**
   * Export pools to JSON
   * @returns {string} - JSON string
   */
  exportToJson() {
    return JSON.stringify({
      timestamp: new Date(this.lastFetchTimestamp).toISOString(),
      blackPrice: this.blackPrice,
      totalVotes: this.totalVotes,
      pools: this.pools,
      stats: this.getStats(),
    }, null, 2);
  }

  /**
   * Clear cached data
   */
  clearCache() {
    this.pools = [];
    this.totalVotes = 0;
    this.blackPrice = 0;
    this.lastFetchTimestamp = 0;
    console.log('[RpcPoolProvider] Cache cleared');
  }
}

console.log('[RPC] RpcPoolProvider loaded successfully, class available:', typeof RpcPoolProvider !== 'undefined');
