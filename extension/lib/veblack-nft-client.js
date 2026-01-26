/**
 * VeBlackNftClient.js
 *
 * Client for interacting with veBLACK NFT contract
 * Handles:
 * - Getting user's veBLACK NFT token IDs
 * - Getting voting power for specific token IDs
 * - Getting lock details
 */

console.log('[VeBlackNftClient] Loading...');

class VeBlackNftClient {
  constructor(rpcClient) {
    // Use existing BlackholeRpcClient instance
    this.rpcClient = rpcClient;

    // veBLACK token contract address
    this.VE_BLACK = '0xEac562811cc6abDbB2c9EE88719eCA4eE79Ad763';

    // Cache for token data
    this.cache = {
      userTokenIds: new Map(),  // userAddress => tokenIds[]
      votingPower: new Map(),   // tokenId => votingPower
      lockDetails: new Map(),   // tokenId => {amount, end}
      cacheTime: new Map(),     // key => timestamp
    };

    // Cache TTL: 2 minutes
    this.CACHE_TTL_MS = 120000;
  }

  /**
   * Get cache key for user token IDs
   */
  getUserCacheKey(userAddress) {
    return `user:${userAddress.toLowerCase()}`;
  }

  /**
   * Get cache key for token voting power
   */
  getPowerCacheKey(tokenId) {
    return `power:${tokenId}`;
  }

  /**
   * Check if cache is valid
   */
  isCacheValid(key) {
    const cacheTime = this.cache.cacheTime.get(key);
    if (!cacheTime) return false;
    return (Date.now() - cacheTime) < this.CACHE_TTL_MS;
  }

  /**
   * Get number of veBLACK NFTs a user owns
   * @param {string} userAddress - User's wallet address
   * @returns {Promise<number>} - Number of NFTs
   */
  async getNftBalance(userAddress) {
    console.log(`[VeBlackNftClient] Getting NFT balance for ${userAddress}`);

    const selector = await this.rpcClient.keccak256('balanceOf(address)');
    const param = this.rpcClient.encodeAddress(userAddress);
    const callData = selector + param;

    console.log(`[VeBlackNftClient] balanceOf callData: ${callData} for user ${userAddress}`);

    const result = await this.rpcClient.ethCall(this.VE_BLACK, callData);

    console.log(`[VeBlackNftClient] raw balance result:`, result);

    if (!result) {
      console.warn('[VeBlackNftClient] Failed to get NFT balance (null result)');
      return 0;
    }

    const balance = Number(this.rpcClient.decodeUint256(result));
    console.log(`[VeBlackNftClient] User has ${balance} veBLACK NFT(s) (decoded)`);
    return balance;
  }

  /**
   * Get user's veBLACK NFT token IDs
   * @param {string} userAddress - User's wallet address
   * @param {boolean} useCache - Whether to use cached data
   * @returns {Promise<number[]>} - Array of token IDs
   */
  async getUserTokenIds(userAddress, useCache = true) {
    const cacheKey = this.getUserCacheKey(userAddress);

    // Check cache
    if (useCache && this.isCacheValid(cacheKey)) {
      const cached = this.cache.userTokenIds.get(cacheKey);
      if (cached) {
        console.log(`[VeBlackNftClient] Using cached token IDs: ${cached.join(', ')}`);
        return cached;
      }
    }

    console.log(`[VeBlackNftClient] Fetching token IDs for ${userAddress}`);

    // Get number of NFTs
    const nftCount = await this.getNftBalance(userAddress);

    if (nftCount === 0) {
      console.log('[VeBlackNftClient] User has no veBLACK NFTs');
      this.cache.userTokenIds.set(cacheKey, []);
      this.cache.cacheTime.set(cacheKey, Date.now());
      return [];
    }

    // Get token IDs using tokenOfOwnerByIndex
    const tokenIds = [];
    const selector = await this.rpcClient.keccak256('tokenOfOwnerByIndex(address,uint256)');

    for (let i = 0; i < nftCount; i++) {
      const param1 = this.rpcClient.encodeAddress(userAddress);
      const param2 = this.rpcClient.encodeUint256(i);
      const callData = selector + param1 + param2;

      const result = await this.rpcClient.ethCall(this.VE_BLACK, callData);

      if (result) {
        const tokenId = Number(this.rpcClient.decodeUint256(result));
        if (tokenId > 0) {
          tokenIds.push(tokenId);
          console.log(`[VeBlackNftClient] Found token ID: ${tokenId} at index ${i}`);
        }
      }
    }

    // Cache results
    this.cache.userTokenIds.set(cacheKey, tokenIds);
    this.cache.cacheTime.set(cacheKey, Date.now());

    console.log(`[VeBlackNftClient] Found ${tokenIds.length} token ID(s): ${tokenIds.join(', ')}`);
    return tokenIds;
  }

  /**
   * Get voting power for a specific veBLACK NFT
   * @param {number} tokenId - veBLACK NFT token ID
   * @param {boolean} useCache - Whether to use cached data
   * @returns {Promise<number>} - Voting power (in veBLACK units)
   */
  async getVotingPower(tokenId, useCache = true) {
    const cacheKey = this.getPowerCacheKey(tokenId);

    // Check cache
    if (useCache && this.isCacheValid(cacheKey)) {
      const cached = this.cache.votingPower.get(cacheKey);
      if (cached !== undefined) {
        console.log(`[VeBlackNftClient] Using cached voting power for token ${tokenId}: ${cached}`);
        return cached;
      }
    }

    console.log(`[VeBlackNftClient] Fetching voting power for token ID ${tokenId}`);

    const selector = await this.rpcClient.keccak256('balanceOfNFT(uint256)');
    const param = this.rpcClient.encodeUint256(tokenId);
    const callData = selector + param;

    const result = await this.rpcClient.ethCall(this.VE_BLACK, callData);

    if (!result) {
      console.warn(`[VeBlackNftClient] Failed to get voting power for token ${tokenId}`);
      return 0;
    }

    const powerWei = this.rpcClient.decodeUint256(result);
    const power = Number(powerWei) / 1e18;

    // Cache result
    this.cache.votingPower.set(cacheKey, power);
    this.cache.cacheTime.set(cacheKey, Date.now());

    console.log(`[VeBlackNftClient] Token ${tokenId} has ${power.toFixed(2)} veBLACK voting power`);
    return power;
  }

  /**
   * Get lock details for a veBLACK NFT
   * @param {number} tokenId - veBLACK NFT token ID
   * @returns {Promise<{amount: number, end: number}>} - Lock amount and end timestamp
   */
  async getLockDetails(tokenId) {
    console.log(`[VeBlackNftClient] Fetching lock details for token ID ${tokenId}`);

    const selector = await this.rpcClient.keccak256('locked(uint256)');
    const param = this.rpcClient.encodeUint256(tokenId);
    const callData = selector + param;

    const result = await this.rpcClient.ethCall(this.VE_BLACK, callData);

    // Strip 0x prefix
    const hex = result.startsWith('0x') ? result.slice(2) : result;

    if (hex.length < 128) {
      console.warn(`[VeBlackNftClient] Failed to get lock details for token ${tokenId} (data too short)`);
      return { amount: 0, end: 0 };
    }

    // Decode struct: (int128 amount, uint256 end)
    // Amount is int128 (signed) in first 32 bytes (64 hex chars)
    const amountBytes = hex.substring(0, 64);
    const endBytes = hex.substring(64, 128);

    // Convert hex to BigInt, treating as signed for amount
    const amountWei = BigInt('0x' + amountBytes);
    const endTimestamp = BigInt('0x' + endBytes);

    const amount = Number(amountWei) / 1e18;
    const end = Number(endTimestamp);

    console.log(`[VeBlackNftClient] Token ${tokenId}: ${amount.toFixed(2)} BLACK locked until ${end}`);

    return { amount, end };
  }

  /**
   * Verify that a token ID is owned by a specific address
   * @param {number} tokenId - veBLACK NFT token ID
   * @param {string} expectedOwner - Expected owner address
   * @returns {Promise<boolean>} - True if expectedOwner owns the token
   */
  async verifyOwnership(tokenId, expectedOwner) {
    console.log(`[VeBlackNftClient] Verifying ownership of token ${tokenId}`);

    const selector = await this.rpcClient.keccak256('ownerOf(uint256)');
    const param = this.rpcClient.encodeUint256(tokenId);
    const callData = selector + param;

    const result = await this.rpcClient.ethCall(this.VE_BLACK, callData);

    if (!result) {
      console.warn(`[VeBlackNftClient] Failed to get owner of token ${tokenId}`);
      return false;
    }

    const owner = this.rpcClient.decodeAddress(result);

    if (!owner || owner === '0x' + '0'.repeat(40)) {
      console.warn(`[VeBlackNftClient] Token ${tokenId} has no owner`);
      return false;
    }

    const ownerLower = owner.toLowerCase();
    const expectedLower = expectedOwner.toLowerCase();

    const isOwner = ownerLower === expectedLower;

    if (isOwner) {
      console.log(`[VeBlackNftClient] ✓ Token ${tokenId} is owned by ${expectedOwner}`);
    } else {
      console.warn(`[VeBlackNftClient] ✗ Token ${tokenId} is owned by ${owner}, not ${expectedOwner}`);
    }

    return isOwner;
  }

  /**
   * Get all NFT data for a user (token IDs, voting power, lock details)
   * @param {string} userAddress - User's wallet address
   * @param {boolean} useCache - Whether to use cached data
   * @returns {Promise<Array>} - Array of NFT objects
   */
  async getUserNfts(userAddress, useCache = true) {
    console.log(`[VeBlackNftClient] Getting all NFT data for ${userAddress}`);

    // Get token IDs
    const tokenIds = await this.getUserTokenIds(userAddress, useCache);

    if (tokenIds.length === 0) {
      return [];
    }

    // Get data for each token
    const nfts = [];

    for (const tokenId of tokenIds) {
      const votingPower = await this.getVotingPower(tokenId, useCache);
      const lockDetails = await this.getLockDetails(tokenId);

      nfts.push({
        tokenId,
        votingPower,
        lockedAmount: lockDetails.amount,
        lockEnd: lockDetails.end,
        lockEndDate: lockDetails.end > 0 ? new Date(lockDetails.end * 1000) : null,
      });
    }

    console.log(`[VeBlackNftClient] User has ${nfts.length} NFT(s) with total voting power: ${nfts.reduce((sum, nft) => sum + nft.votingPower, 0).toFixed(2)}`);

    return nfts;
  }

  /**
   * Clear cache (useful after voting or when refreshing data)
   */
  clearCache() {
    console.log('[VeBlackNftClient] Clearing cache');
    this.cache.userTokenIds.clear();
    this.cache.votingPower.clear();
    this.cache.lockDetails.clear();
    this.cache.cacheTime.clear();
  }

  /**
   * Clear cache for specific user
   */
  clearUserCache(userAddress) {
    const cacheKey = this.getUserCacheKey(userAddress);
    console.log(`[VeBlackNftClient] Clearing cache for ${userAddress}`);
    this.cache.userTokenIds.delete(cacheKey);
    this.cache.cacheTime.delete(cacheKey);
  }
}

console.log('[VeBlackNftClient] Loaded successfully');

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VeBlackNftClient;
}
