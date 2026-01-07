/**
 * Test comparison: JavaScript extraction vs Python extraction
 * 
 * This test file helps identify discrepancies between JS and Python extraction
 */

// Test data based on actual pool from Python output
const testPools = [
  {
    name: 'CL200-WETH.e/WAVAX',
    pythonResults: {
      name: 'CL200-WETH.e/WAVAX',
      total_rewards: 39340, // ~$39.34K
      vapr: 216.5,
      current_votes: 11090000, // 11.09M
      pool_type: 'CL200',
      fee_percentage: '0.05%'
    },
    // What JS is currently extracting (wrong)
    jsResults: {
      total_rewards: 0, // Way off
      vapr: 0.05, // Should be 216.5%, getting fee percentage instead
      current_votes: 90780 // Should be 11.09M (11,090,000)
    }
  },
  {
    name: 'vAMM-CHAMP/USDC',
    pythonResults: {
      name: 'vAMM-CHAMP/USDC',
      total_rewards: 57560, // ~$57.56K
      vapr: 0.7,
      current_votes: 28660, // 28.66K
      pool_type: 'vAMM'
    }
  }
];

// Helper to parse values with suffixes (matching Python logic)
function parseValueWithSuffix(value) {
  if (!value) return null;
  
  // Remove ~$ prefix
  value = value.toString().replace(/~?\$?/g, '').trim();
  
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

// Test suffix parsing
function testSuffixParsing() {
  console.log('=== Testing Suffix Parsing ===');
  
  const tests = [
    { input: '11.09M', expected: 11090000, desc: '11.09M votes' },
    { input: '28.66K', expected: 28660, desc: '28.66K votes' },
    { input: '~$39.34K', expected: 39340, desc: '~$39.34K rewards' },
    { input: '~$57.56K', expected: 57560, desc: '~$57.56K rewards' },
    { input: '216.5%', expected: 216.5, desc: '216.5% VAPR' },
    { input: '0.7%', expected: 0.7, desc: '0.7% VAPR' },
    { input: '0.05%', expected: 0.05, desc: '0.05% fee' }
  ];
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach(test => {
    const result = parseValueWithSuffix(test.input);
    const success = Math.abs(result - test.expected) < 0.01;
    if (success) {
      console.log(`✓ ${test.desc}: "${test.input}" → ${result}`);
      passed++;
    } else {
      console.error(`✗ ${test.desc}: "${test.input}" → ${result} (expected ${test.expected})`);
      failed++;
    }
  });
  
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.testSuffixParsing = testSuffixParsing;
  window.parseValueWithSuffix = parseValueWithSuffix;
  console.log('Test functions available:');
  console.log('  - testSuffixParsing() - Test suffix parsing logic');
  console.log('  - parseValueWithSuffix(value) - Parse a value with k/K/m/M suffix');
}

// Run tests if in Node environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testSuffixParsing, parseValueWithSuffix, testPools };
}
