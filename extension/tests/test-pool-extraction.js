/**
 * Tests for pool extraction logic
 * Compares JavaScript extraction against Python extraction results
 */

// Mock DOM element for testing
function createMockPoolElement(data) {
  const element = document.createElement('div');
  element.className = 'liquidity-pool-cell even';
  
  // Set innerHTML to match the structure
  element.innerHTML = `
    <div class="liquidity-pool-cell-left">
      <div class="name">${data.name}</div>
      <div class="gas-info">
        <div class="text">${data.feePercentage || ''}</div>
      </div>
    </div>
    <div class="liquidity-pool-cell-right">
      <div class="voting-pool-cell-slot">TVL: ~$${data.tvl || '0'}</div>
      <div class="voting-pool-cell-slot">FEES: ~$${data.fees || '0'}</div>
      <div class="voting-pool-cell-slot">INCENTIVES: ~$${data.incentives || '0'}</div>
      <div class="voting-pool-cell-slot">TOTAL REWARDS: ~$${data.totalRewards || '0'} Fees + Incentives</div>
      <div class="voting-pool-cell-slot">VAPR: ${data.vapr || '0'}%</div>
      <div class="voting-pool-cell-slot">VOTES: ${data.votes || '0'}</div>
    </div>
  `;
  
  return element;
}

// Test cases based on actual pool data
const testCases = [
  {
    name: 'CL200-WETH.e/WAVAX',
    expected: {
      name: 'CL200-WETH.e/WAVAX',
      total_rewards: 0, // Will be calculated from fees + incentives
      vapr: 216.5,
      current_votes: 11090000, // 11.09M
      pool_type: 'CL200',
      fee_percentage: '0.05%'
    },
    mockData: {
      name: 'CL200-WETH.e/WAVAX',
      fees: '39.34K',
      incentives: '0',
      totalRewards: '39.34K',
      vapr: '216.5',
      votes: '11.09M',
      feePercentage: '0.05%'
    }
  },
  {
    name: 'vAMM-CHAMP/USDC',
    expected: {
      name: 'vAMM-CHAMP/USDC',
      total_rewards: 57560,
      vapr: 0.7,
      current_votes: 28660, // 28.66k
      pool_type: 'vAMM'
    },
    mockData: {
      name: 'vAMM-CHAMP/USDC',
      fees: '27.18K',
      incentives: '30.38K',
      totalRewards: '57.56K',
      vapr: '0.7',
      votes: '28.66K',
      feePercentage: '1%'
    }
  }
];

// Import extraction function (we'll need to make it testable)
// For now, we'll test the parsing logic directly

function testSuffixParsing() {
  console.log('=== Testing Suffix Parsing ===');
  
  const tests = [
    { input: '11.09M', expected: 11090000, description: 'Millions with decimals' },
    { input: '28.66K', expected: 28660, description: 'Thousands with decimals' },
    { input: '583.21K', expected: 583210, description: 'Thousands with decimals' },
    { input: '16.01M', expected: 16010000, description: 'Millions' },
    { input: '39.34K', expected: 39340, description: 'Thousands' },
    { input: '~$32.07K', expected: 32070, description: 'Dollar amount with K' },
    { input: '~$57.56K', expected: 57560, description: 'Dollar amount with K' },
    { input: '216.5%', expected: 216.5, description: 'Percentage' },
    { input: '0.7%', expected: 0.7, description: 'Small percentage' },
    { input: '0.05%', expected: 0.05, description: 'Very small percentage' }
  ];
  
  function parseWithSuffix(value) {
    // Remove ~$ prefix
    value = value.replace(/~?\$?/g, '');
    
    // Check for percentage
    if (value.includes('%')) {
      return parseFloat(value.replace('%', '').replace(/,/g, ''));
    }
    
    // Check for K/M suffix
    const match = value.match(/([\d,]+\.?\d*)\s*([KkMm])?/);
    if (match) {
      let num = parseFloat(match[1].replace(/,/g, ''));
      const suffix = match[2];
      if (suffix) {
        const suffixLower = suffix.toLowerCase();
        if (suffixLower === 'm') {
          num *= 1000000;
        } else if (suffixLower === 'k') {
          num *= 1000;
        }
      }
      return num;
    }
    
    return parseFloat(value.replace(/,/g, ''));
  }
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach(test => {
    const result = parseWithSuffix(test.input);
    const success = Math.abs(result - test.expected) < 0.01;
    if (success) {
      console.log(`✓ ${test.description}: "${test.input}" → ${result} (expected ${test.expected})`);
      passed++;
    } else {
      console.error(`✗ ${test.description}: "${test.input}" → ${result} (expected ${test.expected})`);
      failed++;
    }
  });
  
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Run tests
if (typeof window !== 'undefined') {
  // Browser environment
  window.testPoolExtraction = testSuffixParsing;
  console.log('Run testPoolExtraction() in console to test suffix parsing');
} else {
  // Node environment (for automated testing)
  testSuffixParsing();
}
