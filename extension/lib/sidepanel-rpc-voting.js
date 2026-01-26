/**
 * Sidepanel RPC Voting Integration
 *
 * Handles RPC-driven voting in the sidepanel UI
 * - Wallet connection
 * - NFT selection
 * - Transaction preview
 * - Transaction submission
 */

console.log('[SidepanelRpcVoting] Loading...');

class SidepanelRpcVoting {
  constructor() {
    // Initialize clients
    this.rpcClient = null; // Will be set from outside
    this.nftClient = null;
    this.txBuilder = new VoteTransactionBuilder();
    this.metamask = new MetaMaskIntegration();

    // State
    this.isRpcMode = false;
    this.connectedAccount = null;
    this.userNfts = [];
    this.selectedNftId = null;
    this.poolPercentages = new Map(); // poolAddress => percentage
    this.currentTransaction = null;

    // UI Elements
    this.elements = {};

    // Initialize
    this.initializeElements();
    this.setupEventListeners();
  }

  /**
   * Set RPC client instance
   */
  setRpcClient(rpcClient) {
    this.rpcClient = rpcClient;
    this.nftClient = new VeBlackNftClient(rpcClient);
    console.log('[SidepanelRpcVoting] RPC client initialized');
  }

  /**
   * Initialize UI elements
   */
  initializeElements() {
    this.elements = {
      // Settings
      votingMethodRpc: document.getElementById('votingMethodRpc'),
      votingMethodWeb: document.getElementById('votingMethodWeb'),

      // Wallet
      walletStatus: document.getElementById('walletStatus'),
      walletConnected: document.getElementById('walletConnected'),
      walletDisconnected: document.getElementById('walletDisconnected'),
      walletAddress: document.getElementById('walletAddress'),
      connectWalletBtn: document.getElementById('connectWalletBtn'),

      // RPC Controls
      rpcModeControls: document.getElementById('rpcModeControls'),
      nftSelector: document.getElementById('nftSelector'),
      voteTotal: document.getElementById('voteTotal'),
      voteTotalStatus: document.getElementById('voteTotalStatus'),

      // Buttons
      splitVotesRpcBtn: document.getElementById('splitVotesRpcBtn'),
      previewVoteBtn: document.getElementById('previewVoteBtn'),
      splitVotesBtn: document.getElementById('splitVotesBtn'),
      voteBtn: document.getElementById('voteBtn'),

      // Modal
      txPreviewModal: document.getElementById('txPreviewModal'),
      txPreviewContent: document.getElementById('txPreviewContent'),
      closeTxPreview: document.getElementById('closeTxPreview'),
      cancelTxPreview: document.getElementById('cancelTxPreview'),
      submitTxToMetaMask: document.getElementById('submitTxToMetaMask'),
    };

    console.log('[SidepanelRpcVoting] UI elements initialized');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Settings
    this.elements.votingMethodRpc?.addEventListener('change', () => this.onVotingMethodChange());
    this.elements.votingMethodWeb?.addEventListener('change', () => this.onVotingMethodChange());

    // Wallet
    this.elements.connectWalletBtn?.addEventListener('click', () => this.connectWallet());

    // NFT selector
    this.elements.nftSelector?.addEventListener('change', () => this.onNftSelectionChange());

    // RPC Mode buttons
    this.elements.splitVotesRpcBtn?.addEventListener('click', () => this.splitVotesEvenly());
    this.elements.previewVoteBtn?.addEventListener('click', () => this.previewVoteTransaction());

    // Modal
    this.elements.closeTxPreview?.addEventListener('click', () => this.closeModal());
    this.elements.cancelTxPreview?.addEventListener('click', () => this.closeModal());
    this.elements.submitTxToMetaMask?.addEventListener('click', () => this.submitTransaction());

    // Listen for pool selection changes (from main sidepanel code)
    document.addEventListener('poolSelectionChanged', () => this.updateVoteTotal());

    console.log('[SidepanelRpcVoting] Event listeners attached');
  }

  /**
   * Initialize (call after DOM ready)
   */
  async initialize() {
    console.log('[SidepanelRpcVoting] Initializing...');

    // Load saved voting method
    const settings = await chrome.storage.local.get(['votingMethod']);
    const votingMethod = settings.votingMethod || 'rpc';

    console.log('[SidepanelRpcVoting] Loaded voting method:', votingMethod);

    // Set the radio button (but populateForm may have already done this)
    if (votingMethod === 'rpc') {
      this.elements.votingMethodRpc.checked = true;
    } else {
      this.elements.votingMethodWeb.checked = true;
    }

    // Force the mode change to update UI
    await this.onVotingMethodChange();

    console.log('[SidepanelRpcVoting] RPC mode active:', this.isRpcMode);
    console.log('[SidepanelRpcVoting] Initialization complete');

    // Show status to user
    if (this.isRpcMode) {
      this.showStatus('RPC voting mode active - Connect wallet to continue', 'info');
    }

    // Try to auto-connect wallet
    await this.autoConnectWallet();
  }

  /**
   * Handle voting method change
   */
  async onVotingMethodChange() {
    const isRpc = this.elements.votingMethodRpc?.checked;
    this.isRpcMode = isRpc;

    console.log('[SidepanelRpcVoting] Voting method:', isRpc ? 'RPC' : 'Web UI');

    // Save setting
    await chrome.storage.local.set({ votingMethod: isRpc ? 'rpc' : 'web' });

    // Update UI
    this.updateUIForMode();
  }

  /**
   * Update UI based on selected mode
   */
  updateUIForMode() {
    console.log('[SidepanelRpcVoting] Updating UI for mode:', this.isRpcMode ? 'RPC' : 'Web UI');

    if (this.isRpcMode) {
      // Show RPC controls
      if (this.elements.walletStatus) this.elements.walletStatus.style.display = 'block';
      if (this.elements.rpcModeControls) this.elements.rpcModeControls.style.display = 'block';
      if (this.elements.splitVotesRpcBtn) this.elements.splitVotesRpcBtn.style.display = 'inline-block';
      if (this.elements.previewVoteBtn) this.elements.previewVoteBtn.style.display = 'inline-block';

      // Hide Web UI buttons
      if (this.elements.splitVotesBtn) this.elements.splitVotesBtn.style.display = 'none';
      if (this.elements.voteBtn) this.elements.voteBtn.style.display = 'none';

      // Add percentage inputs to pool rows
      this.addPercentageInputsToPools();

      console.log('[SidepanelRpcVoting] RPC UI elements shown');
    } else {
      // Hide RPC controls
      if (this.elements.walletStatus) this.elements.walletStatus.style.display = 'none';
      if (this.elements.rpcModeControls) this.elements.rpcModeControls.style.display = 'none';
      if (this.elements.splitVotesRpcBtn) this.elements.splitVotesRpcBtn.style.display = 'none';
      if (this.elements.previewVoteBtn) this.elements.previewVoteBtn.style.display = 'none';

      // Show Web UI buttons
      if (this.elements.splitVotesBtn) this.elements.splitVotesBtn.style.display = 'inline-block';
      if (this.elements.voteBtn) this.elements.voteBtn.style.display = 'inline-block';

      // Remove percentage inputs
      this.removePercentageInputsFromPools();

      console.log('[SidepanelRpcVoting] Web UI elements shown');
    }
  }

  /**
   * Add percentage inputs to pool rows
   */
  addPercentageInputsToPools() {
    // Only target recommendation items (from sidepanel.js)
    const poolRows = document.querySelectorAll('.recommendation-item');

    console.log('[SidepanelRpcVoting] Adding percentage inputs to', poolRows.length, 'pools');

    if (poolRows.length === 0) {
      // This is expected during initial load before pools are rendered
      return;
    }

    poolRows.forEach(row => {
      // Check if container already exists (more robust than checking just input)
      if (row.querySelector('.pool-percentage-container')) return;

      const poolAddress = row.dataset.poolId;
      if (!poolAddress) return;

      // Create percentage input
      const inputContainer = document.createElement('div');
      inputContainer.style.display = 'flex';
      inputContainer.style.alignItems = 'center';
      inputContainer.style.gap = '4px';
      inputContainer.style.marginTop = '8px';
      inputContainer.className = 'pool-percentage-container'; // Add class for easy removal

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'pool-percentage-input';
      input.placeholder = '%';
      input.min = '0';
      input.max = '100';
      input.step = '0.1';
      input.value = this.poolPercentages.get(poolAddress) || '';
      
      // Styling to match dark theme
      input.style.width = '60px';
      input.style.padding = '2px 4px';
      input.style.fontSize = '12px';
      input.style.background = '#0a0a0a';
      input.style.border = '1px solid #333';
      input.style.color = '#fff';
      input.style.borderRadius = '4px';

      input.addEventListener('input', (e) => {
        // Stop propagation to prevent row click
        e.stopPropagation();
        const value = parseFloat(input.value) || 0;
        this.poolPercentages.set(poolAddress, value);
        this.updateVoteTotal();
      });
      
      input.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      const label = document.createElement('span');
      label.textContent = '%';
      label.style.fontSize = '12px';
      label.style.color = '#888';

      inputContainer.appendChild(input);
      inputContainer.appendChild(label);
      
      // Add to pool info section
      const infoDiv = row.querySelector('.pool-info');
      if (infoDiv) {
        infoDiv.appendChild(inputContainer);
      } else {
        row.appendChild(inputContainer);
      }
    });
  }

  /**
   * Remove percentage inputs from pool rows
   */
  removePercentageInputsFromPools() {
    const containers = document.querySelectorAll('.pool-percentage-container');
    containers.forEach(container => container.remove());
  }

  /**
   * Auto-connect wallet if previously connected
   */
  async autoConnectWallet() {
    const installed = await this.metamask.isInstalled();
    if (!installed) {
      console.log('[SidepanelRpcVoting] MetaMask not installed');
      this.elements.walletDisconnected.style.display = 'block';
      return;
    }

    try {
      const accounts = await this.metamask.getAccounts();
      if (accounts.length > 0) {
        this.connectedAccount = accounts[0];
        await this.onWalletConnected();
      } else {
        this.elements.walletDisconnected.style.display = 'block';
      }
    } catch (error) {
      console.error('[SidepanelRpcVoting] Auto-connect failed:', error);
      this.elements.walletDisconnected.style.display = 'block';
    }
  }

  /**
   * Connect wallet
   */
  async connectWallet() {
    try {
      this.connectedAccount = await this.metamask.connectWallet();
      await this.onWalletConnected();
    } catch (error) {
      console.error('[SidepanelRpcVoting] Wallet connection failed:', error);
      this.showStatus(`Failed to connect: ${error.message}`, 'error');
    }
  }

  /**
   * Handle wallet connected
   */
  async onWalletConnected() {
    console.log('[SidepanelRpcVoting] Wallet connected:', this.connectedAccount);

    // Update UI
    this.elements.walletConnected.style.display = 'block';
    this.elements.walletDisconnected.style.display = 'none';
    this.elements.walletAddress.textContent = this.formatAddress(this.connectedAccount);

    // Load NFTs
    await this.loadUserNfts();
  }

  /**
   * Load user's veBLACK NFTs
   */
  async loadUserNfts() {
    if (!this.nftClient) {
      console.warn('[SidepanelRpcVoting] NFT client not initialized');
      return;
    }

    try {
      console.log('[SidepanelRpcVoting] Loading NFTs...');

      this.userNfts = await this.nftClient.getUserNfts(this.connectedAccount, false);

      if (this.userNfts.length === 0) {
        this.elements.nftSelector.innerHTML = '<option value="">No veBLACK NFTs found</option>';
        this.showStatus('No veBLACK NFTs found. You need to lock BLACK tokens to vote.', 'warning');
        return;
      }

      // Populate NFT selector
      this.elements.nftSelector.innerHTML = '';
      this.userNfts.forEach(nft => {
        const option = document.createElement('option');
        option.value = nft.tokenId;
        option.textContent = `Token #${nft.tokenId} (${nft.votingPower.toFixed(2)} veBLACK)`;
        this.elements.nftSelector.appendChild(option);
      });

      // Select first NFT
      if (this.userNfts.length > 0) {
        this.selectedNftId = this.userNfts[0].tokenId;
        this.elements.nftSelector.value = this.selectedNftId;
      }

      console.log(`[SidepanelRpcVoting] Loaded ${this.userNfts.length} NFT(s)`);

    } catch (error) {
      console.error('[SidepanelRpcVoting] Failed to load NFTs:', error);
      this.showStatus(`Failed to load NFTs: ${error.message}`, 'error');
    }
  }

  /**
   * Handle NFT selection change
   */
  onNftSelectionChange() {
    this.selectedNftId = parseInt(this.elements.nftSelector.value);
    console.log('[SidepanelRpcVoting] Selected NFT:', this.selectedNftId);
  }

  /**
   * Get selected pools from UI
   */
  getSelectedPools() {
    const selectedItems = document.querySelectorAll('.recommendation-item.pool-selected');
    return Array.from(selectedItems).map(item => item.dataset.poolId).filter(Boolean);
  }

  /**
   * Split votes evenly across selected pools
   */
  splitVotesEvenly() {
    const selectedPools = this.getSelectedPools();

    if (selectedPools.length === 0) {
      this.showStatus('No pools selected', 'warning');
      return;
    }

    const percentage = 100 / selectedPools.length;

    selectedPools.forEach(poolAddress => {
      this.poolPercentages.set(poolAddress, percentage);
    });

    // Update UI
    this.updatePercentageInputs();
    this.updateVoteTotal();

    this.showStatus(`Split ${percentage.toFixed(2)}% evenly across ${selectedPools.length} pools`, 'success');
  }

  /**
   * Update percentage inputs in UI
   */
  updatePercentageInputs() {
    const inputs = document.querySelectorAll('.pool-percentage-input');

    inputs.forEach(input => {
      const poolRow = input.closest('.recommendation-item');
      const poolAddress = poolRow?.dataset.poolId;

      if (poolAddress && this.poolPercentages.has(poolAddress)) {
        input.value = this.poolPercentages.get(poolAddress).toFixed(2);
      }
    });
  }

  /**
   * Update vote total display
   */
  updateVoteTotal() {
    let total = 0;

    this.poolPercentages.forEach(percentage => {
      total += percentage;
    });

    this.elements.voteTotal.textContent = total.toFixed(2);

    // Update status
    const diff = Math.abs(total - 100);
    if (diff < 0.01 && total > 0) {
      this.elements.voteTotalStatus.textContent = 'Ready';
      this.elements.voteTotalStatus.className = 'valid';
    } else if (total > 100) {
      this.elements.voteTotalStatus.textContent = 'Too high';
      this.elements.voteTotalStatus.className = 'invalid';
    } else if (total > 0 && total < 100) {
      this.elements.voteTotalStatus.textContent = 'Too low';
      this.elements.voteTotalStatus.className = 'invalid';
    } else {
      this.elements.voteTotalStatus.textContent = '';
      this.elements.voteTotalStatus.className = '';
    }
  }

  /**
   * Preview vote transaction
   */
  async previewVoteTransaction() {
    console.log('[SidepanelRpcVoting] Building transaction preview...');

    // Validate
    if (!this.selectedNftId) {
      this.showStatus('Please select a veBLACK NFT', 'error');
      return;
    }

    const selectedPools = this.getSelectedPools();
    if (selectedPools.length === 0) {
      this.showStatus('Please select at least one pool', 'error');
      return;
    }

    // Get percentages
    const pools = [];
    const percentages = [];

    selectedPools.forEach(poolAddress => {
      const percentage = this.poolPercentages.get(poolAddress) || 0;
      if (percentage > 0) {
        pools.push(poolAddress);
        percentages.push(percentage);
      }
    });

    if (pools.length === 0) {
      this.showStatus('Please allocate percentages to selected pools', 'error');
      return;
    }

    // Get selected NFT
    const selectedNft = this.userNfts.find(nft => nft.tokenId === this.selectedNftId);
    if (!selectedNft) {
      this.showStatus('Selected NFT not found', 'error');
      return;
    }

    // Build transaction
    const result = this.txBuilder.buildVoteTransaction(
      this.selectedNftId,
      pools,
      percentages,
      selectedNft.votingPower
    );

    if (!result.success) {
      this.showStatus(`Validation failed:\n${result.errors.join('\n')}`, 'error');
      return;
    }

    this.currentTransaction = result.transaction;

    // Show preview modal
    this.showTransactionPreview(result.transaction, selectedNft);
  }

  /**
   * Show transaction preview modal
   */
  showTransactionPreview(transaction, nft) {
    let html = '<div class="tx-preview-section">';
    html += '<h4>Transaction Details</h4>';
    html += '<div class="tx-preview-info">';
    html += `<strong>veBLACK NFT:</strong> #${transaction.tokenId}<br>`;
    html += `<strong>Voting Power:</strong> ${nft.votingPower.toFixed(2)} veBLACK<br>`;
    html += `<strong>Pools:</strong> ${transaction.pools.length}`;
    html += '</div></div>';

    html += '<div class="tx-preview-section">';
    html += '<h4>Vote Allocations</h4>';

    transaction.pools.forEach((pool, i) => {
      html += '<div class="tx-preview-pool">';
      html += `<div class="tx-preview-pool-name">${this.formatAddress(pool)}</div>`;
      html += '<div class="tx-preview-pool-details">';
      html += `${transaction.percentages[i].toFixed(2)}% → `;
      html += `<span class="tx-preview-pool-votes">${transaction.weights[i].toFixed(2)} votes</span>`;
      html += '</div>';
      html += '</div>';
    });

    html += '</div>';

    html += '<div class="modal-message info">';
    html += '<strong>ℹ️ Preview Mode</strong><br>';
    html += 'This transaction has NOT been submitted. Click "Submit to MetaMask" to proceed, or "Close Preview" to cancel.';
    html += '</div>';

    this.elements.txPreviewContent.innerHTML = html;
    this.elements.txPreviewModal.style.display = 'flex';
  }

  /**
   * Close modal
   */
  closeModal() {
    this.elements.txPreviewModal.style.display = 'none';
    this.currentTransaction = null;
  }

  /**
   * Submit transaction to MetaMask
   */
  async submitTransaction() {
    if (!this.currentTransaction) {
      this.showStatus('No transaction to submit', 'error');
      return;
    }

    console.log('[SidepanelRpcVoting] Submitting transaction to MetaMask...');

    try {
      // Show loading
      this.elements.txPreviewContent.innerHTML = '<div class="spinner"></div><p style="text-align: center;">Waiting for MetaMask...</p>';

      const txHash = await this.metamask.sendVoteTransaction(this.currentTransaction);

      console.log('[SidepanelRpcVoting] Transaction sent:', txHash);

      // Show success
      let html = '<div class="modal-message success">';
      html += '<strong>✓ Transaction Submitted!</strong><br>';
      html += 'Transaction hash:<br>';
      html += `<a href="https://snowtrace.io/tx/${txHash}" target="_blank" class="tx-link">${txHash}</a>`;
      html += '</div>';

      html += '<div class="modal-message info">';
      html += '⏱️ Waiting for confirmation...';
      html += '</div>';

      this.elements.txPreviewContent.innerHTML = html;

      // Wait for confirmation
      const receipt = await this.metamask.waitForTransaction(txHash, 1);
      const status = await this.metamask.getTransactionStatus(txHash);

      if (status.status === 'success') {
        html = '<div class="modal-message success">';
        html += '<strong>✅ Vote Submitted Successfully!</strong><br>';
        html += `Block: ${status.blockNumber}<br>`;
        html += `Gas Used: ${status.gasUsed}<br>`;
        html += `<a href="https://snowtrace.io/tx/${txHash}" target="_blank" class="tx-link">View on Snowtrace</a>`;
        html += '</div>';

        this.elements.txPreviewContent.innerHTML = html;

        // Clear state
        this.poolPercentages.clear();
        this.updateVoteTotal();
        this.updatePercentageInputs();

      } else {
        throw new Error('Transaction failed');
      }

    } catch (error) {
      console.error('[SidepanelRpcVoting] Transaction failed/cancelled:', error);

      let html = '';
      const errorMessage = error.message || '';

      if (errorMessage.includes('rejected by user') || errorMessage.includes('User denied')) {
        html = '<div class="modal-message info">';
        html += '<strong>🚫 Transaction Cancelled</strong><br>';
        html += 'You rejected the transaction in MetaMask.';
        html += '</div>';
      } else {
        html = '<div class="modal-message error">';
        html += '<strong>✗ Transaction Failed</strong><br>';
        html += errorMessage;
        html += '</div>';
      }

      this.elements.txPreviewContent.innerHTML = html;
    }
  }

  /**
   * Format address for display
   */
  formatAddress(address) {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(38)}`;
  }

  /**
   * Show status message
   */
  showStatus(message, type = 'info') {
    console.log(`[SidepanelRpcVoting] ${type.toUpperCase()}: ${message}`);

    // Dispatch event for main sidepanel to handle
    document.dispatchEvent(new CustomEvent('showStatus', {
      detail: { message, type }
    }));
  }
}

// Initialize when DOM is ready
let rpcVoting;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    rpcVoting = new SidepanelRpcVoting();
    // Re-assign to window when initialized inside callback
    window.rpcVoting = rpcVoting;
  });
} else {
  rpcVoting = new SidepanelRpcVoting();
}

// Export
window.SidepanelRpcVoting = SidepanelRpcVoting;
// Assign here as well for immediate access if possible, or undefined initially
window.rpcVoting = rpcVoting;

console.log('[SidepanelRpcVoting] Module loaded');
