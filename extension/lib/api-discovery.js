/**
 * Enhanced API Discovery Tool
 * Injected into the page to intercept and log network requests.
 * Enhanced to detect pool endpoints, RPC calls, and categorize requests.
 */

(function() {
  console.log('🚀 Blackhole API Discovery tool active (Enhanced)');

  // Helper to analyze and categorize requests
  function analyzeRequest(url, method, requestBody, responseBody, status) {
    const analysis = {
      category: 'other',
      isPoolRelated: false,
      isRpcCall: false,
      poolType: null,
      endpointType: null,
      contractAddress: null,
      functionSelector: null,
      rpcMethod: null,
      isApiEndpoint: false,
      apiType: null,
      hasPoolData: false
    };

    const urlLower = url.toLowerCase();
    const urlStr = url.toString();

    // Check for API endpoints
    if (urlLower.includes('resources.blackhole.xyz')) {
      analysis.isApiEndpoint = true;
      analysis.category = 'api';
      
      if (urlLower.includes('cl-pools') || urlLower.includes('cl-pool')) {
        analysis.endpointType = 'CL';
        analysis.poolType = 'CL';
        analysis.isPoolRelated = true;
      } else if (urlLower.includes('vamm-pools') || urlLower.includes('vamm-pool')) {
        analysis.endpointType = 'vAMM';
        analysis.poolType = 'vAMM';
        analysis.isPoolRelated = true;
      } else if (urlLower.includes('samm-pools') || urlLower.includes('samm-pool')) {
        analysis.endpointType = 'sAMM';
        analysis.poolType = 'sAMM';
        analysis.isPoolRelated = true;
      } else if (urlLower.includes('pool')) {
        analysis.endpointType = 'pool';
        analysis.isPoolRelated = true;
      }
    }

    // Check for RPC calls
    if (urlLower.includes('rpc') || urlLower.includes('drpc') || urlLower.includes('eth_call') || 
        urlLower.includes('api.avax.network') || urlLower.includes('jsonrpc')) {
      analysis.isRpcCall = true;
      analysis.category = 'rpc';
      
      // Try to parse RPC request body
      if (requestBody) {
        try {
          const rpcBody = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
          if (rpcBody.method) {
            analysis.rpcMethod = rpcBody.method;
          }
          if (rpcBody.params && Array.isArray(rpcBody.params)) {
            for (const param of rpcBody.params) {
              if (typeof param === 'object' && param !== null) {
                if (param.to) {
                  analysis.contractAddress = param.to;
                }
                if (param.data && param.data.startsWith('0x') && param.data.length >= 10) {
                  analysis.functionSelector = param.data.substring(0, 10);
                }
              }
            }
          }
        } catch (e) {
          // Not JSON or not parseable
        }
      }
    }

    // Check response body for pool data
    if (responseBody) {
      const responseStr = typeof responseBody === 'string' 
        ? responseBody 
        : JSON.stringify(responseBody);
      const responseLower = responseStr.toLowerCase();
      
      // Check for pool indicators in response
      if (responseLower.includes('pool') || responseLower.includes('vamm') || 
          responseLower.includes('samm') || responseLower.includes('token0') || 
          responseLower.includes('token1') || responseLower.includes('liquidity')) {
        analysis.hasPoolData = true;
        analysis.isPoolRelated = true;
        
        // Try to detect pool type from response
        if (responseLower.includes('vamm') && !analysis.poolType) {
          analysis.poolType = 'vAMM';
        }
        if (responseLower.includes('samm') && !analysis.poolType) {
          analysis.poolType = 'sAMM';
        }
        if (responseLower.includes('cl') && !analysis.poolType) {
          analysis.poolType = 'CL';
        }
      }
      
      // Check if it's a JSON array/object that might contain pools
      if (typeof responseBody === 'object' && responseBody !== null) {
        if (Array.isArray(responseBody)) {
          if (responseBody.length > 0 && responseBody[0].token0 && responseBody[0].token1) {
            analysis.hasPoolData = true;
            analysis.isPoolRelated = true;
          }
        } else if (responseBody.pools || responseBody.data) {
          const pools = responseBody.pools || responseBody.data;
          if (Array.isArray(pools) && pools.length > 0 && pools[0].token0) {
            analysis.hasPoolData = true;
            analysis.isPoolRelated = true;
          }
        }
      }
    }

    // Categorize based on findings
    if (analysis.isPoolRelated) {
      analysis.category = 'pool';
    }

    return analysis;
  }

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const url = args[0];
    const options = args[1] || {};
    
    try {
      const response = await originalFetch(...args);
      const clone = response.clone();
      
      let body;
      const contentType = clone.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          body = await clone.json();
        } catch (e) {
          body = await clone.text();
        }
      } else {
        body = await clone.text();
      }

      // Analyze the request
      const analysis = analyzeRequest(
        url.toString(),
        options.method || 'GET',
        options.body,
        body,
        response.status
      );

      // Send to extension
      try {
        window.postMessage({
          type: 'NETWORK_REQUEST',
          data: {
            source: 'fetch',
            method: options.method || 'GET',
            url: url.toString(),
            requestBody: typeof options.body === 'string' ? options.body : (options.body ? '[Non-string body]' : null),
            status: response.status,
            responseBody: body,
            timestamp: Date.now(),
            analysis: analysis,
            headers: Object.fromEntries(clone.headers.entries())
          }
        }, '*');
      } catch (postErr) {
        console.warn('Discovery: Failed to post fetch log', postErr);
      }

      return response;
    } catch (error) {
      console.error(`❌ Fetch Error: ${url}`, error);
      throw error;
    }
  };

  const originalXHR = window.XMLHttpRequest.prototype.open;
  window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._url = url;
    this._method = method;
    return originalXHR.apply(this, [method, url, ...rest]);
  };

  const originalSend = window.XMLHttpRequest.prototype.send;
  window.XMLHttpRequest.prototype.send = function(body) {
    this.addEventListener('load', function() {
      let responseBody;
      try {
        responseBody = JSON.parse(this.responseText);
      } catch(e) {
        responseBody = this.responseText;
      }

      // Analyze the request
      const analysis = analyzeRequest(
        this._url.toString(),
        this._method,
        body,
        responseBody,
        this.status
      );

      // Send to extension
      try {
        window.postMessage({
          type: 'NETWORK_REQUEST',
          data: {
            source: 'xhr',
            method: this._method,
            url: this._url.toString(),
            requestBody: typeof body === 'string' ? body : (body ? '[Non-string body]' : null),
            status: this.status,
            responseBody: responseBody,
            timestamp: Date.now(),
            analysis: analysis
          }
        }, '*');
      } catch (postErr) {
        console.warn('Discovery: Failed to post XHR log', postErr);
      }
    });
    return originalSend.apply(this, arguments);
  };
})();
