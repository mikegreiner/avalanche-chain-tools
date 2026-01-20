/**
 * API Discovery Tool
 * Injected into the page to intercept and log network requests.
 */

(function() {
  console.log('🚀 Blackhole API Discovery tool active');

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
        body = await clone.json();
      } else {
        body = await clone.text();
      }

      // Send to extension
      window.postMessage({
        type: 'NETWORK_REQUEST',
        data: {
          source: 'fetch',
          method: options.method || 'GET',
          url: url,
          requestBody: options.body,
          status: response.status,
          responseBody: body,
          timestamp: Date.now()
        }
      }, '*');

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

      // Send to extension
      window.postMessage({
        type: 'NETWORK_REQUEST',
        data: {
          source: 'xhr',
          method: this._method,
          url: this._url,
          requestBody: body,
          status: this.status,
          responseBody: responseBody,
          timestamp: Date.now()
        }
      }, '*');
    });
    return originalSend.apply(this, arguments);
  };
})();
