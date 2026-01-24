/**
 * RPC Rewards Provider
 * Gets rewards by intercepting multicall responses and extracting values
 * This is a hybrid approach: we intercept the site's multicalls and extract rewards
 */

import { RewardsExtractor } from './rewards-extractor.js';
import { RpcClient } from './rpc-client.js';
import { 
  decodeMulticallRequest, 
  decodeMulticallResponse, 
  matchCallsToReturns,
  extractRewardsFromDecoded 
} from './multicall-decoder.js';

const RPC_URL = 'https://api.avax.network/ext/bc/C/rpc';
const MULTICALL3_ADDRESS = '0xca11bde05977b3631167028862be2a173976ca11';
const AGGREGATE_SELECTOR = '0x82ad56cb';

export class RpcRewardsProvider {
  constructor(knownPools = []) {
    this.extractor = new RewardsExtractor(knownPools);
    this.rpc = new RpcClient(RPC_URL);
    this.rewardsCache = new Map(); // pool -> reward
  }

  /**
   * Extract rewards from a multicall response
   * This is called when we intercept a multicall response
   * Now uses improved decoding to match calls to returns
   */
  extractFromResponse(responseHex, requestHex = null) {
    // Try improved decoding if we have both request and response
    if (requestHex && requestHex.startsWith('0x82ad56cb')) {
      try {
        const requests = decodeMulticallRequest(requestHex);
        const { returns } = decodeMulticallResponse(responseHex);
        
        if (requests.length === returns.length) {
          const matched = matchCallsToReturns(requests, returns);
          const poolSet = new Set(
            Array.from(this.extractor.knownPools).map(p => p.toLowerCase().replace('0x', ''))
          );
          const decodedRewards = extractRewardsFromDecoded(matched, poolSet);
          
          // Update cache with decoded rewards
          for (const [pool, value] of Object.entries(decodedRewards)) {
            this.rewardsCache.set(pool.toLowerCase(), value);
          }
          
          if (Object.keys(decodedRewards).length > 0) {
            console.log(`✓ Decoded ${Object.keys(decodedRewards).length} rewards from multicall`);
            return decodedRewards;
          }
        }
      } catch (e) {
        console.warn('Improved decoding failed, falling back to pattern matching:', e);
      }
    }
    
    // Fallback to pattern matching
    const rewards = this.extractor.extractRewards(responseHex);
    
    // Update cache
    for (const [pool, value] of Object.entries(rewards)) {
      this.rewardsCache.set(pool.toLowerCase(), value);
    }
    
    return rewards;
  }

  /**
   * Get reward for a specific pool
   */
  getReward(poolAddress) {
    return this.rewardsCache.get(poolAddress.toLowerCase()) || 0;
  }

  /**
   * Get rewards for multiple pools
   */
  getRewards(poolAddresses) {
    const rewards = {};
    for (const addr of poolAddresses) {
      rewards[addr] = this.getReward(addr);
    }
    return rewards;
  }

  /**
   * Update known pools list
   */
  setKnownPools(pools) {
    this.extractor.setKnownPools(pools);
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.rewardsCache.clear();
  }

  /**
   * Get all cached rewards
   */
  getAllRewards() {
    const rewards = {};
    for (const [pool, value] of this.rewardsCache.entries()) {
      rewards[pool] = value;
    }
    return rewards;
  }
}

/**
 * Intercept fetch/XHR calls to RPC endpoints and extract rewards
 * This should be called from a content script that can intercept network requests
 */
export function interceptMulticallResponses(rewardsProvider) {
  // Store request data to match with responses
  const requestCache = new Map();
  
  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = args[0];
    const options = args[1] || {};
    
    // Check if it's an RPC call
    if (typeof url === 'string' && (url.includes('rpc') || url.includes('avax.network'))) {
      // Try to extract request data
      let requestHex = null;
      if (options.body) {
        try {
          const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
          if (body.params && body.params[0] && body.params[0].data) {
            requestHex = body.params[0].data;
            // Store request with a unique ID (use timestamp + random)
            const requestId = body.id || Date.now();
            requestCache.set(requestId, requestHex);
          }
        } catch (e) {
          // Not JSON or no data
        }
      }
    }
    
    const response = await originalFetch.apply(this, args);
    
    // Check if it's an RPC call
    if (typeof url === 'string' && (url.includes('rpc') || url.includes('avax.network'))) {
      // Clone response to read it
      const clonedResponse = response.clone();
      
      clonedResponse.json().then(data => {
        if (data && data.result) {
          // Check if it's a multicall response
          if (data.result.startsWith('0x') && data.result.length > 1000) {
            // Try to get matching request
            const requestId = data.id;
            const requestHex = requestCache.get(requestId);
            
            // Extract rewards (with improved decoding if we have request)
            rewardsProvider.extractFromResponse(data.result, requestHex);
            
            // Clean up cache (keep last 100)
            if (requestCache.size > 100) {
              const firstKey = requestCache.keys().next().value;
              requestCache.delete(firstKey);
            }
          }
        }
      }).catch(() => {
        // Not JSON, ignore
      });
    }
    
    return response;
  };

  // Intercept XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._url = url;
    return originalOpen.apply(this, [method, url, ...rest]);
  };
  
  XMLHttpRequest.prototype.send = function(body) {
    // Store request data
    let requestHex = null;
    if (body && typeof body === 'string') {
      try {
        const bodyObj = JSON.parse(body);
        if (bodyObj.params && bodyObj.params[0] && bodyObj.params[0].data) {
          requestHex = bodyObj.params[0].data;
          const requestId = bodyObj.id || Date.now();
          requestCache.set(requestId, requestHex);
        }
      } catch (e) {
        // Not JSON
      }
    }
    
    this.addEventListener('load', function() {
      if (this._url && (this._url.includes('rpc') || this._url.includes('avax.network'))) {
        try {
          const data = JSON.parse(this.responseText);
          if (data && data.result && data.result.startsWith('0x') && data.result.length > 1000) {
            // Try to get matching request
            const requestId = data.id;
            const matchingRequest = requestCache.get(requestId) || requestHex;
            
            rewardsProvider.extractFromResponse(data.result, matchingRequest);
            
            // Clean up cache
            if (requestCache.size > 100) {
              const firstKey = requestCache.keys().next().value;
              requestCache.delete(firstKey);
            }
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    });
    
    return originalSend.apply(this, arguments);
  };
}
