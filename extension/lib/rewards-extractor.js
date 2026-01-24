/**
 * Rewards Extractor from Multicall Responses
 * Extracts reward values from multicall RPC responses by finding pool addresses
 * and nearby reward values in the hex data
 */

export class RewardsExtractor {
  constructor(knownPools = []) {
    // Convert to lowercase set for fast lookup
    this.knownPools = new Set(
      knownPools.map(addr => addr.toLowerCase().replace('0x', ''))
    );
  }

  /**
   * Extract rewards from a multicall response
   * @param {string} responseHex - The hex response from multicall
   * @returns {Object} Map of pool address (lowercase) to reward value (USD)
   */
  extractRewards(responseHex) {
    if (!responseHex || responseHex === '0x') {
      return {};
    }

    // Remove 0x prefix and convert to lowercase
    let hexData = responseHex.startsWith('0x') 
      ? responseHex.slice(2).toLowerCase() 
      : responseHex.toLowerCase();

    const rewards = {};

    // Find each known pool address in the response
    for (const poolHex of this.knownPools) {
      const pos = hexData.indexOf(poolHex);
      
      if (pos === -1) continue;

      // Look for values after the address (within 500 chars)
      const searchArea = hexData.slice(pos + 40, pos + 500);

      // Find 64-char chunks (uint256 values)
      for (let i = 0; i < searchArea.length - 64; i += 64) {
        const chunk = searchArea.slice(i, i + 64);
        
        try {
          const value = BigInt('0x' + chunk);
          
          // Filter for reasonable reward values (1e20 to 1e27 wei)
          if (value > 1e20 && value < 1e27) {
            const usdValue = Number(value) / 1e18;
            
            // Filter for reasonable USD range (100 to 100M)
            if (usdValue > 100 && usdValue < 100000000) {
              const poolKey = '0x' + poolHex;
              const poolKeyLower = poolKey.toLowerCase();
              
              // Take the maximum value found (most recent/accurate)
              if (!rewards[poolKeyLower] || usdValue > rewards[poolKeyLower]) {
                rewards[poolKeyLower] = usdValue;
              }
              break; // Take first reasonable value
            }
          }
        } catch (e) {
          // Invalid hex, skip
          continue;
        }
      }
    }

    return rewards;
  }

  /**
   * Extract rewards from multiple multicall responses
   * @param {Array<string>} responses - Array of hex responses
   * @returns {Object} Map of pool address to reward value (max across all responses)
   */
  extractRewardsFromMultiple(responses) {
    const allRewards = {};

    for (const response of responses) {
      const rewards = this.extractRewards(response);
      
      for (const [pool, value] of Object.entries(rewards)) {
        if (!allRewards[pool] || value > allRewards[pool]) {
          allRewards[pool] = value;
        }
      }
    }

    return allRewards;
  }

  /**
   * Update known pools list
   */
  setKnownPools(pools) {
    this.knownPools = new Set(
      pools.map(addr => addr.toLowerCase().replace('0x', ''))
    );
  }
}
