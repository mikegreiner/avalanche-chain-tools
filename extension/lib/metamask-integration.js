/**
 * MetaMaskIntegration.js
 *
 * Handles MetaMask wallet integration for voting
 * Updated to use chrome.scripting to interact with MetaMask in the main page context
 */

console.log('[MetaMaskIntegration] Loading...');

class MetaMaskIntegration {
  constructor() {
    this.connectedAccount = null;
    this.chainId = null;

    // Avalanche C-Chain
    this.AVALANCHE_CHAIN_ID = '0xa86a'; // 43114 in hex
    this.AVALANCHE_CHAIN_ID_DECIMAL = 43114;
    
    // We can't detect provider directly in sidepanel, assume it might be there
    // and check via scripting when needed
  }

  /**
   * Helper to execute code in the main world of the active tab
   */
  async _runInPage(func, args = []) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        console.error('[MetaMaskIntegration] No active tab found');
        throw new Error('No active tab found');
      }

      console.log(`[MetaMaskIntegration] Injecting script into tab ${tab.id}: ${tab.url}`);

      if (!tab.url || (!tab.url.startsWith('http') && !tab.url.startsWith('https'))) {
        console.warn(`[MetaMaskIntegration] Cannot script non-web page: ${tab.url}`);
        throw new Error('Cannot connect to wallet on this page. Please navigate to a web page.');
      }

      // Wrap the function to capture errors inside the page context
      const wrapper = async (fnCode, ...args) => {
        try {
          // Reconstruct the function from string (since functions can't be passed directly easily if we wrap)
          // But here 'func' is passed as part of the injection. 
          // We can just execute 'func' directly if it's passed as 'func' to executeScript.
          // Wait, executeScript takes 'func'. We need to pass a wrapper as 'func', and the original 'func' is hard to pass.
          // Better: We assume 'func' is the code we want to run.
          // Actually, we can't easily wrap 'func' inside another function passed to executeScript unless we stringify it.
          // 
          // Alternative: We modify the passed 'func' to include try/catch? No.
          //
          // Correct approach: We cannot wrap 'func' easily if it's a native function reference.
          // BUT, we can make '_runInPage' assume 'func' is async and returns a value.
          // If 'func' throws, executeScript SHOULD propagate it, but maybe not for async rejections?
          // 
          // Let's rely on string execution or just trust that we can't wrap it easily.
          // Wait, if I pass a NEW function to executeScript, I can't call the OLD 'func' unless I pass it as a string?
          // No, 'func' parameter in executeScript must be a function.
          
          // Let's try to verify why the error isn't propagating. 
          // If 'window.ethereum.request' rejects, the async function rejects.
          // Chrome 90+ should handle this.
          
          // Debugging hack: checking results[0] structure.
          return await (func)(...args); 
        } catch (e) {
          // This catch block is useless here as written above.
          throw e;
        }
      };
      
      // Let's rely on the fact that we can't easily wrap without stringifying.
      // Instead, let's fix the call site to ensure we check for null results if that's what's happening.
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: func,
        args: args,
        world: 'MAIN',
      });

      if (!results || !results[0]) {
        console.error('[MetaMaskIntegration] No results from executeScript');
        throw new Error('Script execution failed');
      }
      
      // Check if the result itself indicates an error (if we were wrapping).
      // But we aren't wrapping. 
      
      // If result is null, it means the function returned null (or void).
      // Why would 'window.ethereum.request' return null on rejection? It should throw.
      
      return results[0].result;
    } catch (error) {
      // Check if the error message contains info from the page
      console.error('[MetaMaskIntegration] Script execution error:', error);
      if (error.message && error.message.includes('User denied')) {
         throw new Error('Transaction rejected by user');
      }
      throw error;
    }
  }

  /**
   * Check if MetaMask is installed in the active tab
   * @returns {Promise<boolean>}
   */
  async isInstalled() {
    try {
      return await this._runInPage(() => {
        return typeof window.ethereum !== 'undefined';
      });
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if wallet is connected
   * @returns {boolean}
   */
  isConnected() {
    return this.connectedAccount !== null;
  }

  /**
   * Get current connected account
   * @returns {string|null}
   */
  getConnectedAccount() {
    return this.connectedAccount;
  }

  /**
   * Connect to MetaMask wallet
   * @returns {Promise<string>} - Connected account address
   */
  async connectWallet() {
    console.log('[MetaMaskIntegration] Requesting wallet connection...');

    try {
      const accounts = await this._runInPage(async () => {
        if (!window.ethereum) throw new Error('MetaMask is not installed');
        return await window.ethereum.request({ method: 'eth_requestAccounts' });
      });

      if (accounts && accounts.length > 0) {
        this.connectedAccount = accounts[0];
        console.log('[MetaMaskIntegration] ✓ Connected to account:', this.connectedAccount);

        // Get chain ID
        this.chainId = await this._runInPage(async () => {
          return await window.ethereum.request({ method: 'eth_chainId' });
        });

        console.log('[MetaMaskIntegration] Chain ID:', this.chainId);

        return this.connectedAccount;
      } else {
        throw new Error('No accounts found. Please unlock MetaMask.');
      }
    } catch (error) {
      console.error('[MetaMaskIntegration] Failed to connect wallet:', error);
      // Clean up error message from injection
      const msg = error.message.replace(/Error: /, '');
      throw new Error(msg);
    }
  }

  /**
   * Get current accounts (without requesting permission)
   * @returns {Promise<string[]>} - Array of account addresses
   */
  async getAccounts() {
    try {
      const accounts = await this._runInPage(async () => {
        if (!window.ethereum) return [];
        return await window.ethereum.request({ method: 'eth_accounts' });
      });

      if (accounts && accounts.length > 0) {
        this.connectedAccount = accounts[0];
      }

      return accounts || [];
    } catch (error) {
      // Quietly fail for getAccounts
      return [];
    }
  }

  /**
   * Switch to Avalanche C-Chain
   * @returns {Promise<void>}
   */
  async switchToAvalanche() {
    console.log('[MetaMaskIntegration] Switching to Avalanche C-Chain...');
    const CHAIN_ID = this.AVALANCHE_CHAIN_ID;

    try {
      await this._runInPage(async (chainId) => {
        if (!window.ethereum) throw new Error('MetaMask is not installed');
        
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainId }]
          });
        } catch (switchError) {
          // Chain not added to MetaMask
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: chainId,
                chainName: 'Avalanche C-Chain',
                nativeCurrency: {
                  name: 'Avalanche',
                  symbol: 'AVAX',
                  decimals: 18
                },
                rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'],
                blockExplorerUrls: ['https://snowtrace.io/']
              }]
            });
          } else {
            throw switchError;
          }
        }
      }, [CHAIN_ID]);

      this.chainId = CHAIN_ID;
      console.log('[MetaMaskIntegration] ✓ Switched to Avalanche C-Chain');
    } catch (error) {
      console.error('[MetaMaskIntegration] Failed to switch/add chain:', error);
      throw new Error(`Failed to switch chain: ${error.message}`);
    }
  }

  /**
   * Check if on correct chain (Avalanche C-Chain)
   * @returns {Promise<boolean>}
   */
  async isOnAvalanche() {
    try {
      const chainId = await this._runInPage(async () => {
        if (!window.ethereum) return null;
        return await window.ethereum.request({ method: 'eth_chainId' });
      });

      if (!chainId) return false;
      
      this.chainId = chainId;
      const chainIdDecimal = parseInt(chainId, 16);
      return chainIdDecimal === this.AVALANCHE_CHAIN_ID_DECIMAL;
    } catch (error) {
      console.error('[MetaMaskIntegration] Failed to get chain ID:', error);
      return false;
    }
  }

  /**
   * Estimate gas for a transaction
   * @param {Object} transaction - Transaction object
   * @returns {Promise<string>} - Estimated gas in hex
   */
  async estimateGas(transaction) {
    console.log('[MetaMaskIntegration] Estimating gas...');

    try {
      const gasEstimate = await this._runInPage(async (tx) => {
        if (!window.ethereum) throw new Error('MetaMask not installed');
        return await window.ethereum.request({
          method: 'eth_estimateGas',
          params: [tx]
        });
      }, [transaction]);

      console.log('[MetaMaskIntegration] Gas estimate:', gasEstimate);
      return gasEstimate;
    } catch (error) {
      console.error('[MetaMaskIntegration] Failed to estimate gas:', error);
      return '0x30000'; // 196608 gas
    }
  }

  /**
   * Send vote transaction via MetaMask
   * @param {Object} transaction - Transaction object from VoteTransactionBuilder
   * @returns {Promise<string>} - Transaction hash
   */
  async sendVoteTransaction(transaction) {
    if (!this.connectedAccount) {
      throw new Error('Wallet not connected. Please connect your wallet first.');
    }

    // Check if on Avalanche
    const onAvalanche = await this.isOnAvalanche();
    if (!onAvalanche) {
      console.log('[MetaMaskIntegration] Not on Avalanche, switching...');
      await this.switchToAvalanche();
    }

    console.log('[MetaMaskIntegration] Sending vote transaction...');

    // Build transaction params
    const txParams = {
      from: this.connectedAccount,
      to: transaction.to,
      data: transaction.data,
      value: transaction.value || '0x0'
    };

    // Estimate gas
    try {
      const gasEstimate = await this.estimateGas(txParams);
      txParams.gas = gasEstimate;
    } catch (error) {
      console.warn('[MetaMaskIntegration] Gas estimation failed, proceeding without gas limit');
    }

    try {
      const txHash = await this._runInPage(async (params) => {
        return await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [params]
        });
      }, [txParams]);

      if (!txHash) {
        throw new Error('Transaction returned no hash (rejected by user?)');
      }

      console.log('[MetaMaskIntegration] ✓ Transaction sent:', txHash);
      return txHash;
    } catch (error) {
      console.error('[MetaMaskIntegration] Transaction failed:', error);
      // Clean up error message
      let msg = error.message || 'Unknown error';
      if (msg.includes('user rejected')) msg = 'Transaction rejected by user';
      throw new Error(msg);
    }
  }

  /**
   * Wait for transaction confirmation
   * @param {string} txHash - Transaction hash
   * @param {number} confirmations - Number of confirmations to wait for
   * @returns {Promise<Object>} - Transaction receipt
   */
  async waitForTransaction(txHash, confirmations = 1) {
    console.log(`[MetaMaskIntegration] Waiting for transaction ${txHash}...`);

    let attempts = 0;
    const maxAttempts = 60; // 2 minutes

    while (attempts < maxAttempts) {
      try {
        const receipt = await this._runInPage(async (hash) => {
          return await window.ethereum.request({
            method: 'eth_getTransactionReceipt',
            params: [hash]
          });
        }, [txHash]);

        if (receipt) {
          const blockNumber = parseInt(receipt.blockNumber, 16);
          console.log(`[MetaMaskIntegration] Transaction mined in block ${blockNumber}`);
          return receipt;
        }
      } catch (error) {
        console.warn('[MetaMaskIntegration] Error checking transaction:', error);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }

    throw new Error('Transaction confirmation timeout');
  }

  /**
   * Check transaction status
   * @param {string} txHash - Transaction hash
   * @returns {Promise<Object>} - Status object
   */
  async getTransactionStatus(txHash) {
    try {
      const receipt = await this._runInPage(async (hash) => {
        return await window.ethereum.request({
          method: 'eth_getTransactionReceipt',
          params: [hash]
        });
      }, [txHash]);

      if (!receipt) {
        return { status: 'pending', confirmed: false };
      }

      const success = parseInt(receipt.status, 16) === 1;
      return {
        status: success ? 'success' : 'failed',
        confirmed: true,
        blockNumber: parseInt(receipt.blockNumber, 16),
        gasUsed: parseInt(receipt.gasUsed, 16),
        receipt
      };
    } catch (error) {
      console.error('[MetaMaskIntegration] Failed to get transaction status:', error);
      throw error;
    }
  }
}

console.log('[MetaMaskIntegration] Loaded successfully');

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MetaMaskIntegration;
}
