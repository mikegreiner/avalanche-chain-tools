/**
 * BlackholeRpcClient.js
 * 
 * Web3 RPC client for fetching Blackhole DEX data directly from Avalanche blockchain.
 * Based on successful Python implementation in tmp/blackhole_data_fetcher.py
 * 
 * This eliminates the need for slow DOM scraping by using direct contract calls.
 * Performance: ~5 seconds for all pools vs ~100+ seconds for DOM scraping (20x faster)
 */

console.log('[RPC] BlackholeRpcClient.js loading...');

class BlackholeRpcClient {
  constructor() {
    // Contract addresses
    this.CONTRACTS = {
      VOTER: '0xe30d0c8532721551a51a9fec7fb233759964d9e3',
      GAUGE_MANAGER: '0x59aa177312Ff6Bdf39C8Af6F46dAe217bf76CBf6',
      PAIR_FACTORY: '0xfe926062fb99ca5653080d6c14fe945ad68c265c',
      EPOCH_MANAGER: '0x3935f7e11e33e676b6108f6e86ab8578d8e32d43',
      REWARDS_DISTRIBUTOR: '0x88a49cFCee0Ed5B176073DDE12186C4c922A9cD0',
      VE_TOKEN: '0xEac562811cc6abDbB2c9EE88719eCA4eE79Ad763',
    };

    // Static data endpoints
    this.APIS = {
      CL_POOLS: 'https://resources.blackhole.xyz/cl-pools-list/cl-pools.json',
      // DeFiLlama price API (no rate limits, more reliable than CoinGecko)
      DEFILLAMA_PRICES: 'https://coins.llama.fi/prices/current/',
    };
    
    // vAMM/sAMM pools data (will be loaded from bundled data or extension storage)
    this.vammSammPools = null;

    // RPC endpoint
    this.RPC_URL = 'https://api.avax.network/ext/bc/C/rpc';

    // Cache
    this.cache = {
      blackPrice: null,
      blackPriceTimestamp: 0,
      clPools: null,
      clPoolsTimestamp: 0,
    };

    // Constants
    this.SECONDS_PER_WEEK = 604800;
    this.CACHE_TTL_MS = 60000; // 1 minute

    // Common token addresses on Avalanche
    this.TOKENS = {
      WAVAX: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
      USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      USDt: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
      BLACK: '0xcd94a87696fac69edae3a70fe5725307ae1c43f6',
    };

    // Token prices cache - will be fetched from DeFiLlama
    // Keys are lowercase addresses
    this.tokenPrices = {};
    
    // Token decimals cache - will be populated from metadata
    // Keys are lowercase addresses
    this.tokenDecimals = {};
  }

  /**
   * Get function selector for a given signature
   * Uses precomputed selectors for known functions
   * @param {string} signature - Function signature like "weights(address)"
   * @returns {string} - 4-byte selector as hex string
   */
  async keccak256(signature) {
    // Precomputed selectors (computed using keccak256, verified with Python)
    const selectors = {
      'totalWeight()': '0x96c82e57',
      'weights(address)': '0xa7cac846',
      'gauges(address)': '0xb9a09fd5',
      'internal_bribes(address)': '0xeae40f26',
      'external_bribes(address)': '0xae21c4cb',
      'rewardToken()': '0xf7c618c1',
      'rewardRate()': '0x7b0a47ee',
      'totalSupply()': '0x18160ddd',
      'periodFinish()': '0xebe2b12b',
      'internal_bribe()': '0x770f8571',
      'external_bribe()': '0x03fbf83a',
      'token0()': '0x0dfe1681',
      'token1()': '0xd21220a7',
      'symbol()': '0x95d89b41',
      'name()': '0x06fdde03',
      'decimals()': '0x313ce567',
      'allPairsLength()': '0x574f2ba3',
      'allPairs(uint256)': '0x1e3dd18b',
      'getFee(address,bool)': '0xcc56b2c5',
      'getNextEpochStart()': '0x8bf2fa94',
      // Fee/bribe related selectors
      'tokenRewardsPerEpoch(address,uint256)': '0x92777b29',
      'rewardsListLength()': '0xe6886396',
      'rewards(uint256)': '0xf301af42',
    };

    const selector = selectors[signature];
    if (!selector) {
      console.warn(`Unknown function signature: ${signature}`);
      return '0x00000000';
    }

    return selector;
  }

  /**
   * Make an eth_call to the RPC endpoint
   * @param {string} to - Contract address
   * @param {string} data - Encoded function call
   * @returns {Promise<string|null>} - Response data or null on error
   */
  async ethCall(to, data) {
    try {
      const response = await fetch(this.RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to, data }, 'latest']
        })
      });

      const result = await response.json();
      if (result.error) {
        console.warn('eth_call error:', result.error);
        return null;
      }

      return result.result;
    } catch (error) {
      console.error('RPC call failed:', error);
      return null;
    }
  }

  /**
   * Decode address from bytes32
   * @param {string} data - Hex string
   * @param {number} offset - Byte offset (default 0)
   * @returns {string|null} - Checksummed address or null
   */
  decodeAddress(data, offset = 0) {
    if (!data || data === '0x') return null;
    
    // Remove '0x' prefix
    const hex = data.startsWith('0x') ? data.slice(2) : data;
    
    // Each byte is 2 hex chars, so offset in hex chars is offset * 2
    const hexOffset = offset * 2;
    
    // Address is 20 bytes (40 hex chars), padded to 32 bytes (64 hex chars)
    // Address starts at byte 12 (hex char 24)
    const addressHex = hex.substring(hexOffset + 24, hexOffset + 64);
    
    // Check if it's a zero address
    if (addressHex === '0'.repeat(40)) return null;
    
    return '0x' + addressHex;
  }

  /**
   * Decode uint256 from bytes
   * @param {string} data - Hex string
   * @param {number} offset - Byte offset (default 0)
   * @returns {bigint} - Decoded uint256 as BigInt
   */
  decodeUint256(data, offset = 0) {
    if (!data || data === '0x') return 0n;
    
    const hex = data.startsWith('0x') ? data.slice(2) : data;
    const hexOffset = offset * 2;
    const uint256Hex = hex.substring(hexOffset, hexOffset + 64);
    
    return BigInt('0x' + uint256Hex);
  }

  /**
   * Encode address as bytes32
   * @param {string} address - Ethereum address
   * @returns {string} - 64-char hex string (32 bytes)
   */
  encodeAddress(address) {
    const hex = address.startsWith('0x') ? address.slice(2) : address;
    return hex.toLowerCase().padStart(64, '0');
  }

  /**
   * Encode uint256 as bytes32
   * @param {number|bigint} value - Number to encode
   * @returns {string} - 64-char hex string (32 bytes)
   */
  encodeUint256(value) {
    return BigInt(value).toString(16).padStart(64, '0');
  }

  // ============================================================================
  // VOTER CONTRACT METHODS
  // ============================================================================

  /**
   * Get total voting weight across all pools
   * @returns {Promise<number>} - Total votes (in ether units)
   */
  async getTotalVotes() {
    const selector = await this.keccak256('totalWeight()');
    const result = await this.ethCall(this.CONTRACTS.VOTER, selector);
    
    if (!result) return 0;
    
    const votes = this.decodeUint256(result);
    return Number(votes) / 1e18;
  }

  /**
   * Get votes for a specific pool
   * @param {string} poolAddress - Pool contract address
   * @returns {Promise<number>} - Pool votes (in ether units)
   */
  async getPoolVotes(poolAddress) {
    const selector = await this.keccak256('weights(address)');
    const param = this.encodeAddress(poolAddress);
    const result = await this.ethCall(this.CONTRACTS.VOTER, selector + param);
    
    if (!result) return 0;
    
    const votes = this.decodeUint256(result);
    return Number(votes) / 1e18;
  }

  // ============================================================================
  // GAUGE MANAGER CONTRACT METHODS
  // ============================================================================

  /**
   * Get gauge address for a pool
   * @param {string} poolAddress - Pool contract address
   * @returns {Promise<string|null>} - Gauge address or null
   */
  async getGaugeForPool(poolAddress) {
    const selector = await this.keccak256('gauges(address)');
    const param = this.encodeAddress(poolAddress);
    const callData = selector + param;
    
    const result = await this.ethCall(this.CONTRACTS.GAUGE_MANAGER, callData);
    
    return this.decodeAddress(result);
  }

  // ============================================================================
  // GAUGE CONTRACT METHODS
  // ============================================================================

  /**
   * Get gauge data for a gauge address
   * @param {string} gaugeAddress - Gauge contract address
   * @returns {Promise<Object>} - Gauge data
   */
  async getGaugeData(gaugeAddress) {
    const data = {
      address: gaugeAddress,
      rewardToken: null,
      rewardRate: 0,
      totalSupply: 0,
      periodFinish: 0,
    };

    // Get reward token
    const rewardTokenSelector = await this.keccak256('rewardToken()');
    const rewardTokenResult = await this.ethCall(gaugeAddress, rewardTokenSelector);
    data.rewardToken = this.decodeAddress(rewardTokenResult);

    // Get reward rate (tokens per second)
    const rewardRateSelector = await this.keccak256('rewardRate()');
    const rewardRateResult = await this.ethCall(gaugeAddress, rewardRateSelector);
    if (rewardRateResult) {
      const rate = this.decodeUint256(rewardRateResult);
      data.rewardRate = Number(rate) / 1e18;
    }

    // Get total supply
    const totalSupplySelector = await this.keccak256('totalSupply()');
    const totalSupplyResult = await this.ethCall(gaugeAddress, totalSupplySelector);
    if (totalSupplyResult) {
      const supply = this.decodeUint256(totalSupplyResult);
      data.totalSupply = Number(supply) / 1e18;
    }

    // Note: periodFinish() is not needed for VAPR calculation
    // Weekly rewards = rewardRate * 604800 (seconds per week)
    data.periodFinish = 0;

    return data;
  }

  /**
   * Get the current epoch start timestamp
   * The site shows ongoing/current epoch fees (accumulated so far this week),
   * not the previous completed epoch.
   * Epoch boundaries are Thursday 00:00 UTC (Unix week boundary)
   * @returns {number} - Unix timestamp of current epoch start
   */
  getCurrentEpochStart() {
    const now = Math.floor(Date.now() / 1000);
    // Unix week starts on Thursday 00:00 UTC (Jan 1, 1970 was a Thursday)
    const currentEpochStart = Math.floor(now / this.SECONDS_PER_WEEK) * this.SECONDS_PER_WEEK;
    return currentEpochStart;
  }

  /**
   * Get epoch fees from internal_bribe contract
   * @param {string} gaugeAddress - Gauge contract address
   * @param {string} token0Address - First token address
   * @param {string} token1Address - Second token address
   * @returns {Promise<{token0Fees: number, token1Fees: number, totalFeesUSD: number}>}
   */
  async getEpochFees(gaugeAddress, token0Address, token1Address) {
    const result = { token0Fees: 0, token1Fees: 0, totalFeesUSD: 0 };

    try {
      // Get internal_bribe address from gauge
      const internalBribeSelector = await this.keccak256('internal_bribe()');
      const bribeResult = await this.ethCall(gaugeAddress, internalBribeSelector);
      const bribeAddress = this.decodeAddress(bribeResult);

      if (!bribeAddress) {
        return result;
      }

      // Get current epoch timestamp (site shows ongoing week's fees)
      const epochStart = this.getCurrentEpochStart();
      const epochParam = epochStart.toString(16).padStart(64, '0');

      // Get token0 rewards for epoch
      const token0Param = token0Address.slice(2).toLowerCase().padStart(64, '0');
      const selector = await this.keccak256('tokenRewardsPerEpoch(address,uint256)');
      const token0Result = await this.ethCall(bribeAddress, selector + token0Param + epochParam);
      
      if (token0Result) {
        result.token0Fees = Number(this.decodeUint256(token0Result));
      }

      // Get token1 rewards for epoch
      const token1Param = token1Address.slice(2).toLowerCase().padStart(64, '0');
      const token1Result = await this.ethCall(bribeAddress, selector + token1Param + epochParam);
      
      if (token1Result) {
        result.token1Fees = Number(this.decodeUint256(token1Result));
      }

      // Calculate USD value using cached prices and decimals
      const token0Lower = token0Address.toLowerCase();
      const token1Lower = token1Address.toLowerCase();

      const token0Decimals = this.getTokenDecimals(token0Address);
      const token1Decimals = this.getTokenDecimals(token1Address);
      const token0Price = this.getTokenPrice(token0Address);
      const token1Price = this.getTokenPrice(token1Address);

      // Convert raw amounts to token units using decimals, then multiply by price
      const token0USD = (result.token0Fees / Math.pow(10, token0Decimals)) * token0Price;
      const token1USD = (result.token1Fees / Math.pow(10, token1Decimals)) * token1Price;

      result.totalFeesUSD = token0USD + token1USD;
      result.token0USD = token0USD;
      result.token1USD = token1USD;

    } catch (error) {
      console.warn('Error fetching epoch fees:', error);
    }

    return result;
  }

  // ============================================================================
  // STATIC DATA METHODS
  // ============================================================================

  /**
   * Fetch CL pools metadata from static API
   * @param {boolean} useCache - Whether to use cached data
   * @returns {Promise<Array>} - Array of pool metadata objects
   */
  async fetchClPoolsMetadata(useCache = true) {
    // Check cache
    if (useCache && this.cache.clPools && 
        (Date.now() - this.cache.clPoolsTimestamp) < this.CACHE_TTL_MS) {
      return this.cache.clPools;
    }

    try {
      const response = await fetch(this.APIS.CL_POOLS);
      const data = await response.json();
      const pools = data.pools || data;
      
      // Cache result
      this.cache.clPools = pools;
      this.cache.clPoolsTimestamp = Date.now();
      
      return pools;
    } catch (error) {
      console.error('Failed to fetch CL pools:', error);
      return [];
    }
  }

  /**
   * Set vAMM/sAMM pools data (loaded from bundled file or extension storage)
   * @param {Array} pools - Array of vAMM/sAMM pool metadata
   */
  setVammSammPools(pools) {
    this.vammSammPools = pools;
    console.log(`[RPC] Loaded ${pools?.length || 0} vAMM/sAMM pools`);
  }

  /**
   * Get vAMM/sAMM pools metadata
   * @returns {Array} - Array of pool metadata objects
   */
  getVammSammPools() {
    return this.vammSammPools || [];
  }

  /**
   * Fetch all pools metadata (CL + vAMM/sAMM)
   * @param {boolean} useCache - Whether to use cached data
   * @returns {Promise<Array>} - Array of all pool metadata objects
   */
  async fetchAllPoolsMetadata(useCache = true) {
    const clPools = await this.fetchClPoolsMetadata(useCache);
    const vammSammPools = this.getVammSammPools();
    
    console.log(`[RPC] Total pools: ${clPools.length} CL + ${vammSammPools.length} vAMM/sAMM = ${clPools.length + vammSammPools.length}`);
    
    return [...clPools, ...vammSammPools];
  }

  /**
   * Get BLACK token price in USD
   * @param {boolean} useCache - Whether to use cached price
   * @returns {Promise<number>} - BLACK price in USD
   */
  async getBlackPrice(useCache = true) {
    // Check cache
    if (useCache && this.cache.blackPrice && 
        (Date.now() - this.cache.blackPriceTimestamp) < this.CACHE_TTL_MS) {
      return this.cache.blackPrice;
    }

    try {
      // Use DeFiLlama API for BLACK price
      const blackAddr = this.TOKENS.BLACK;
      const response = await fetch(`${this.APIS.DEFILLAMA_PRICES}avax:${blackAddr}`);
      const data = await response.json();
      const price = data.coins?.[`avax:${blackAddr}`]?.price || 0.007; // Fallback
      
      // Cache result
      this.cache.blackPrice = price;
      this.cache.blackPriceTimestamp = Date.now();
      
      return price;
    } catch (error) {
      console.warn('Failed to fetch BLACK price, using fallback:', error);
      return this.cache.blackPrice || 0.007;
    }
  }

  /**
   * Get AVAX token price in USD and update tokenPrices
   * @returns {Promise<number>} - AVAX price in USD
   */
  async getAvaxPrice() {
    try {
      const wavaxAddr = this.TOKENS.WAVAX.toLowerCase();
      const response = await fetch(`${this.APIS.DEFILLAMA_PRICES}avax:${wavaxAddr}`);
      const data = await response.json();
      const price = data.coins?.[`avax:${wavaxAddr}`]?.price || 22.0;
      this.tokenPrices[wavaxAddr] = price;
      return price;
    } catch (error) {
      console.warn('Failed to fetch AVAX price, using fallback:', error);
      return 22.0;
    }
  }

  /**
   * Fetch prices for multiple tokens at once from DeFiLlama
   * @param {string[]} addresses - Array of token addresses
   * @returns {Promise<Object>} - Map of lowercase address to price
   */
  async fetchTokenPrices(addresses) {
    if (!addresses || addresses.length === 0) return {};

    try {
      // DeFiLlama accepts comma-separated coins
      const coins = addresses.map(addr => `avax:${addr.toLowerCase()}`).join(',');
      const response = await fetch(`${this.APIS.DEFILLAMA_PRICES}${coins}`);
      const data = await response.json();

      // Parse response and update cache
      for (const [key, info] of Object.entries(data.coins || {})) {
        const addr = key.replace('avax:', '').toLowerCase();
        this.tokenPrices[addr] = info.price || 0;
      }

      return this.tokenPrices;
    } catch (error) {
      console.warn('Failed to fetch token prices:', error);
      return this.tokenPrices;
    }
  }

  /**
   * Get token price from cache, or return 0 if unknown
   * @param {string} address - Token address
   * @returns {number} - Token price in USD
   */
  getTokenPrice(address) {
    const addr = address.toLowerCase();
    return this.tokenPrices[addr] || 0;
  }

  /**
   * Get token decimals from cache
   * @param {string} address - Token address
   * @returns {number} - Token decimals (default 18)
   */
  getTokenDecimals(address) {
    const addr = address.toLowerCase();
    return this.tokenDecimals[addr] || 18;
  }

  /**
   * Set token decimals in cache
   * @param {string} address - Token address
   * @param {number} decimals - Token decimals
   */
  setTokenDecimals(address, decimals) {
    this.tokenDecimals[address.toLowerCase()] = decimals;
  }

  // ============================================================================
  // HIGH-LEVEL METHODS
  // ============================================================================

  /**
   * Calculate VAPR for a pool
   * @param {number} weeklyBlack - Weekly BLACK token emissions
   * @param {number} weeklyFeesUsd - Weekly trading fees in USD
   * @param {number} votes - Current pool votes
   * @param {number} blackPrice - BLACK token price in USD
   * @returns {number} - VAPR percentage
   */
  /**
   * Calculate VAPR (Voter APR) for a pool
   * Note: Site calculates VAPR using only trading fees, NOT gauge emissions
   * VAPR = (Annual_Fees_USD / Votes_USD) × 100
   * @param {number} weeklyFeesUsd - Weekly trading fees in USD
   * @param {number} votes - Current pool votes
   * @param {number} blackPrice - BLACK token price in USD
   * @returns {number} - VAPR percentage
   */
  calculateVapr(weeklyFeesUsd, votes, blackPrice) {
    if (votes === 0 || blackPrice === 0) return 0;
    
    // Annual fees (site uses fees only for VAPR, not gauge emissions)
    const annualFeesUsd = weeklyFeesUsd * 52;
    
    // Votes USD value (votes represent locked BLACK)
    const votesUsd = votes * blackPrice;
    
    // VAPR = (annual_fees / votes_usd) * 100
    return (annualFeesUsd / votesUsd) * 100;
  }

  /**
   * Build complete pool data object
   * @param {string} poolAddress - Pool address
   * @param {Object} metadata - Static metadata from API
   * @param {number} blackPrice - Current BLACK price
   * @returns {Promise<Object>} - Complete pool data
   */
  async buildPoolData(poolAddress, metadata, blackPrice) {
    const pool = {
      address: poolAddress,
      name: '',
      poolType: 'CL',
      token0: {},
      token1: {},
      fee: 0,
      tvl: 0,
      votes: 0,
      voteShare: 0,
      gauge: null,
      vapr: 0,
      weeklyRewards: 0,
    };

    // Get votes
    pool.votes = await this.getPoolVotes(poolAddress);

    // Parse metadata
    if (metadata) {
      const t0 = metadata.token0 || {};
      const t1 = metadata.token1 || {};
      
      // Determine pool type - vAMM/sAMM pools have explicit type, CL pools use tickSpacing
      let poolType;
      let tickSpacing = 0;
      
      if (metadata.type === 'vAMM' || metadata.type === 'sAMM') {
        // vAMM/sAMM pool format
        poolType = metadata.type;
      } else {
        // CL pool format - use tickSpacing
        tickSpacing = parseInt(metadata.tickSpacing || 0);
        // CL1 = 0.01% fee, CL50 = 0.05%, CL100 = 0.1%, CL150 = 0.15%, CL200 = 0.5%
        if (tickSpacing === 1) poolType = 'CL1';
        else if (tickSpacing === 50) poolType = 'CL50';
        else if (tickSpacing === 100) poolType = 'CL100';
        else if (tickSpacing === 150) poolType = 'CL150';
        else if (tickSpacing === 200) poolType = 'CL200';
        else if (tickSpacing > 0) poolType = `CL${tickSpacing}`;
        else poolType = 'CL';
      }
      
      pool.token0 = {
        address: t0.id || '',
        symbol: t0.symbol || '?',
        decimals: parseInt(t0.decimals || 18),
      };
      pool.token1 = {
        address: t1.id || '',
        symbol: t1.symbol || '?',
        decimals: parseInt(t1.decimals || 18),
      };
      
      // Cache token decimals for fee calculation
      if (t0.id) this.setTokenDecimals(t0.id, parseInt(t0.decimals || 18));
      if (t1.id) this.setTokenDecimals(t1.id, parseInt(t1.decimals || 18));
      
      pool.fee = parseInt(metadata.fee || 0);
      pool.name = `${poolType}-${t0.symbol}/${t1.symbol}`;
      pool.tvl = parseFloat(metadata.totalValueLockedUSD || 0);
      pool.tickSpacing = tickSpacing;
      pool.poolType = poolType;
    }

    // Get gauge data
    const gaugeAddress = await this.getGaugeForPool(poolAddress);
    if (gaugeAddress) {
      pool.gauge = await this.getGaugeData(gaugeAddress);
      
      // Calculate weekly BLACK emissions
      const weeklyBlack = pool.gauge.rewardRate * this.SECONDS_PER_WEEK;
      const weeklyEmissionsUsd = weeklyBlack * blackPrice;
      
      // Get epoch fees from internal_bribe contract (much more accurate than poolDayData)
      let weeklyFeesUsd = 0;
      if (pool.token0.address && pool.token1.address) {
        const epochFees = await this.getEpochFees(gaugeAddress, pool.token0.address, pool.token1.address);
        weeklyFeesUsd = epochFees.totalFeesUSD;
        pool.epochFees = epochFees;
      }
      
      // Fallback to poolDayData estimate if epoch fees not available
      if (weeklyFeesUsd === 0 && metadata?.poolDayData?.[0]?.feesUSD) {
        weeklyFeesUsd = parseFloat(metadata.poolDayData[0].feesUSD) * 7;
      }
      
      pool.weeklyEmissionsUsd = weeklyEmissionsUsd;
      pool.weeklyFeesUsd = weeklyFeesUsd;
      pool.weeklyRewards = weeklyFeesUsd; // Site shows fees only as "Total Rewards"
      
      // Calculate VAPR (site uses fees only, not emissions)
      pool.vapr = this.calculateVapr(weeklyFeesUsd, pool.votes, blackPrice);
    }

    return pool;
  }
}

console.log('[RPC] BlackholeRpcClient loaded successfully, class available:', typeof BlackholeRpcClient !== 'undefined');
