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
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: method,
          params: params,
          id: this.id++,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
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
