/**
 * VoteTransactionBuilder.js
 *
 * Builds vote transactions for submission to Voter contract
 * Handles:
 * - Input validation
 * - Vote weight calculation
 * - Transaction encoding
 * - Transaction preview data
 */

console.log('[VoteTransactionBuilder] Loading...');

class VoteTransactionBuilder {
  constructor() {
    // Voter contract address
    this.VOTER_CONTRACT = '0xE30D0C8532721551a51a9FeC7FB233759964d9e3';

    // vote(uint256 tokenId, address[] _poolVote, uint256[] _weights)
    // Note: No 0x prefix - will be added when returning encoded data
    this.VOTE_SELECTOR = '7ac09bf7';
  }

  /**
   * Validate vote inputs
   * @param {number} tokenId - veBLACK NFT token ID
   * @param {Array<string>} pools - Pool addresses
   * @param {Array<number>} percentages - Vote percentages (must sum to 100)
   * @param {number} votingPower - Total voting power available
   * @returns {Object} - Validation result {valid: boolean, errors: string[]}
   */
  validateInputs(tokenId, pools, percentages, votingPower) {
    const errors = [];

    // Validate token ID
    if (!tokenId || tokenId <= 0) {
      errors.push('Invalid veBLACK NFT token ID');
    }

    // Validate pools
    if (!pools || pools.length === 0) {
      errors.push('No pools selected');
    }

    if (pools.length > 50) {
      errors.push('Too many pools selected (max 50)');
    }

    // Validate pool addresses
    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      if (!pool || !pool.match(/^0x[a-fA-F0-9]{40}$/)) {
        errors.push(`Invalid pool address at index ${i}: ${pool}`);
      }
    }

    // Check for duplicate pools
    const uniquePools = new Set(pools.map(p => p.toLowerCase()));
    if (uniquePools.size !== pools.length) {
      errors.push('Duplicate pools detected');
    }

    // Validate percentages
    if (!percentages || percentages.length !== pools.length) {
      errors.push(`Percentages length (${percentages?.length || 0}) doesn't match pools length (${pools.length})`);
    }

    // Validate each percentage
    for (let i = 0; i < percentages.length; i++) {
      const pct = percentages[i];
      if (typeof pct !== 'number' || isNaN(pct)) {
        errors.push(`Invalid percentage at index ${i}: ${pct}`);
      }
      if (pct < 0) {
        errors.push(`Negative percentage at index ${i}: ${pct}`);
      }
      if (pct > 100) {
        errors.push(`Percentage too high at index ${i}: ${pct}%`);
      }
    }

    // Validate percentages sum to 100 (allow 0.01% tolerance for rounding)
    if (percentages && percentages.length > 0) {
      const total = percentages.reduce((sum, pct) => sum + pct, 0);
      const diff = Math.abs(total - 100);
      if (diff > 0.01) {
        errors.push(`Percentages must sum to 100% (current: ${total.toFixed(2)}%)`);
      }
    }

    // Validate voting power
    if (!votingPower || votingPower <= 0) {
      errors.push('Invalid voting power (must be > 0)');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Calculate vote weights in wei
   * @param {Array<number>} percentages - Vote percentages (must sum to 100)
   * @param {number} votingPower - Total voting power
   * @returns {Array<string>} - Array of weight strings (in wei)
   */
  calculateWeights(percentages, votingPower) {
    const weights = [];

    for (const pct of percentages) {
      // Calculate vote amount for this pool
      const voteAmount = (votingPower * pct) / 100;

      // Convert to wei (multiply by 1e18)
      // Use BigInt to avoid precision issues
      const voteAmountWei = BigInt(Math.floor(voteAmount * 1e18));

      weights.push(voteAmountWei.toString());
    }

    return weights;
  }

  /**
   * Encode address array for ABI encoding
   * @param {Array<string>} addresses - Array of addresses
   * @returns {string} - Encoded address array (hex string)
   */
  encodeAddressArray(addresses) {
    // ABI encoding for address[]:
    // - Offset to array data (always 0x20 = 32 bytes for first dynamic param)
    // - Array length
    // - Array elements (each padded to 32 bytes)

    const length = addresses.length;
    let encoded = '';

    // Array length
    encoded += length.toString(16).padStart(64, '0');

    // Array elements
    for (const addr of addresses) {
      // Remove 0x prefix and pad to 64 chars (32 bytes)
      const addrHex = addr.toLowerCase().replace('0x', '').padStart(64, '0');
      encoded += addrHex;
    }

    return encoded;
  }

  /**
   * Encode uint256 array for ABI encoding
   * @param {Array<string>} values - Array of uint256 values (as strings)
   * @returns {string} - Encoded uint256 array (hex string)
   */
  encodeUint256Array(values) {
    // ABI encoding for uint256[]:
    // - Offset to array data
    // - Array length
    // - Array elements (each 32 bytes)

    const length = values.length;
    let encoded = '';

    // Array length
    encoded += length.toString(16).padStart(64, '0');

    // Array elements
    for (const val of values) {
      // Convert string to BigInt to hex
      const valBigInt = BigInt(val);
      const valHex = valBigInt.toString(16).padStart(64, '0');
      encoded += valHex;
    }

    return encoded;
  }

  /**
   * Encode vote transaction data
   * @param {number} tokenId - veBLACK NFT token ID
   * @param {Array<string>} pools - Pool addresses
   * @param {Array<string>} weights - Vote weights (in wei, as strings)
   * @returns {string} - Encoded transaction data (hex string with 0x prefix)
   */
  encodeVoteData(tokenId, pools, weights) {
    // Function: vote(uint256 tokenId, address[] _poolVote, uint256[] _weights)
    // Selector: 0x7ac09bf7

    let encoded = this.VOTE_SELECTOR;

    // Parameter 1: tokenId (uint256)
    const tokenIdHex = tokenId.toString(16).padStart(64, '0');
    encoded += tokenIdHex;

    // Parameter 2: offset to address[] (dynamic type)
    // Offset = 3 * 32 = 96 bytes (0x60)
    // (tokenId + pools_offset + weights_offset = 3 params before array data)
    encoded += '60'.padStart(64, '0');

    // Parameter 3: offset to uint256[] (dynamic type)
    // Offset = 96 + 32 + (pools.length * 32)
    // = 96 + 32 + (pools.length * 32)
    const poolsDataSize = 32 + (pools.length * 32);
    const weightsOffset = 96 + poolsDataSize;
    encoded += weightsOffset.toString(16).padStart(64, '0');

    // Array data for pools
    encoded += this.encodeAddressArray(pools);

    // Array data for weights
    encoded += this.encodeUint256Array(weights);

    return '0x' + encoded;
  }

  /**
   * Build vote transaction
   * @param {number} tokenId - veBLACK NFT token ID
   * @param {Array<string>} pools - Pool addresses
   * @param {Array<number>} percentages - Vote percentages (must sum to 100)
   * @param {number} votingPower - Total voting power
   * @returns {Object} - Transaction object or error
   */
  buildVoteTransaction(tokenId, pools, percentages, votingPower) {
    console.log('[VoteTransactionBuilder] Building vote transaction');
    console.log(`  Token ID: ${tokenId}`);
    console.log(`  Pools: ${pools.length}`);
    console.log(`  Voting Power: ${votingPower}`);

    // Validate inputs
    const validation = this.validateInputs(tokenId, pools, percentages, votingPower);

    if (!validation.valid) {
      console.error('[VoteTransactionBuilder] Validation failed:', validation.errors);
      return {
        success: false,
        errors: validation.errors
      };
    }

    // Calculate weights
    const weights = this.calculateWeights(percentages, votingPower);

    console.log('[VoteTransactionBuilder] Calculated weights:');
    weights.forEach((weight, i) => {
      const weightNum = Number(BigInt(weight)) / 1e18;
      console.log(`  Pool ${i}: ${weightNum.toFixed(2)} votes (${percentages[i]}%)`);
    });

    // Encode transaction data
    const data = this.encodeVoteData(tokenId, pools, weights);

    console.log('[VoteTransactionBuilder] Encoded transaction data:', data.substring(0, 100) + '...');

    // Build transaction object
    const transaction = {
      to: this.VOTER_CONTRACT,
      data: data,
      value: '0x0', // No ETH value needed

      // Metadata for preview
      tokenId,
      pools,
      percentages,
      weights: weights.map(w => Number(BigInt(w)) / 1e18),
      votingPower,
      totalVotes: votingPower
    };

    console.log('[VoteTransactionBuilder] ✓ Transaction built successfully');

    return {
      success: true,
      transaction
    };
  }

  /**
   * Build transaction preview data for display to user
   * @param {Object} transaction - Transaction object from buildVoteTransaction
   * @param {Array<Object>} poolData - Pool metadata (name, tokens, etc.)
   * @returns {Object} - Preview data
   */
  buildTransactionPreview(transaction, poolData = []) {
    const preview = {
      tokenId: transaction.tokenId,
      totalVotes: transaction.votingPower,
      poolCount: transaction.pools.length,
      allocations: []
    };

    for (let i = 0; i < transaction.pools.length; i++) {
      const poolAddress = transaction.pools[i];
      const percentage = transaction.percentages[i];
      const votes = transaction.weights[i];

      // Find pool metadata
      const pool = poolData.find(p => p.address?.toLowerCase() === poolAddress.toLowerCase());

      const poolName = pool?.name || `${poolAddress.substring(0, 8)}...`;

      preview.allocations.push({
        poolAddress,
        poolName,
        percentage: percentage.toFixed(2),
        votes: votes.toFixed(2),
        estimatedRewards: pool?.estimateUserRewards?.(votes) || 0
      });
    }

    // Sort by votes descending
    preview.allocations.sort((a, b) => b.votes - a.votes);

    return preview;
  }

  /**
   * Format transaction preview as text for display
   * @param {Object} preview - Preview object from buildTransactionPreview
   * @returns {string} - Formatted preview text
   */
  formatPreviewText(preview) {
    let text = `Vote Transaction Preview\n`;
    text += `${'='.repeat(50)}\n`;
    text += `veBLACK NFT ID: ${preview.tokenId}\n`;
    text += `Total Votes: ${preview.totalVotes.toFixed(2)}\n`;
    text += `Pools: ${preview.poolCount}\n\n`;

    for (const allocation of preview.allocations) {
      text += `${allocation.poolName}\n`;
      text += `  ${allocation.percentage}% → ${allocation.votes} votes\n`;
      if (allocation.estimatedRewards > 0) {
        text += `  Est. rewards: $${allocation.estimatedRewards.toFixed(2)}/week\n`;
      }
      text += '\n';
    }

    return text;
  }
}

console.log('[VoteTransactionBuilder] Loaded successfully');

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VoteTransactionBuilder;
}
