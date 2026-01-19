/**
 * Simple JSON-RPC 2.0 Client
 */
export class RpcClient {
  constructor(url) {
    this.url = url;
    this.id = 1;
  }

  async call(method, params = []) {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'PROXY_REQUEST',
          url: this.url,
          options: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: method,
              params: params,
              id: this.id++,
            })
          }
        }, result => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });

      if (!response.success) {
        throw new Error(response.error || `HTTP error! status: ${response.status}`);
      }

      const data = response.data;
      if (data.error) {
        throw new Error(data.error.message || 'RPC Error');
      }
      return data.result;
    } catch (error) {
      console.error(`RPC Call Error (${method}):`, error);
      throw error;
    }
  }

  async ethCall(to, data) {
    return this.call('eth_call', [{ to: to, data: data }, 'latest']);
  }

  async getBlockNumber() {
    return this.call('eth_blockNumber');
  }
}
