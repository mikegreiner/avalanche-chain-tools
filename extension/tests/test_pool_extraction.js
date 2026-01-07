/**
 * Tests for pool extraction logic
 * Compares JavaScript extraction against Python extraction results
 */

// Mock DOM structure based on actual page
function createMockPoolElement(html) {
  const div = document.createElement('div');
  div.className = 'liquidity-pool-cell even';
  div.innerHTML = html;
  return div;
}

// Test cases based on known good Python results
const testCases = [
  {
    name: 'CL200-WETH.e/WAVAX',
    poolId: '0x5E128EbC09C918DDAE3Ca1668d4EE9527dc00D78',
    expected: {
      total_rewards: 39340, // ~$39.34K
      vapr: 216.5,
      current_votes: 11090000 // 11.09M
    },
    html: `
      <div class="liquidity-pool-cell-left">
        <div class="liquidity-pool-cell-description">
          <div class="pool-description">
            <div class="name">CL200-WETH.e/WAVAX</div>
            <div class="bottom-info">
              <div class="gas-info">
                <div class="text">0.05%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="liquidity-pool-cell-right">
        <div class="liquidity-pool-cell-data">
          <div class="voting-pool-cell-slot">
            <div class="voting-pool-cell-slot-container">
              <div class="voting-pool-data total">~$6.54M</div>
              <div class="voting-pool-data">90.78K WAVAX</div>
            </div>
          </div>
        </div>
        <div class="liquidity-pool-cell-data">
          <div class="voting-pool-cell-slot">
            <div class="voting-pool-cell-slot-container">
              <div class="voting-pool-data">~$9.86K</div>
            </div>
          </div>
        </div>
        <div class="liquidity-pool-cell-data incentives">
          <div class="voting-pool-cell-slot-container">
            <div class="voting-pool-data">~$30.38K</div>
          </div>
        </div>
        <div class="liquidity-pool-cell-data total-rewards">
          <div class="voting-pool-cell-slot">
            <div class="voting-pool-cell-slot-container">
              <div class="voting-pool-data total">~$39.34K</div>
              <div class="voting-pool-data">Fees + Incentives</div>
            </div>
          </div>
        </div>
        <div class="liquidity-pool-cell-data last">
          <div class="voting-pool-cell-vapr-info">
            <div class="first">216.5%</div>
          </div>
        </div>
        <div class="liquidity-pool-cell-data end">
          <div class="voting-pool-cell-slot">
            <div class="voting-pool-cell-slot-container">
              <div class="voting-pool-data total">11.09M</div>
              <div class="voting-pool-data percentage">0.16%</div>
            </div>
          </div>
        </div>
      </div>
    `
  }
];

// Export for use in Node.js test environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testCases, createMockPoolElement };
}
