/**
 * Test comparison: JavaScript extraction vs Python extraction
 * 
 * This test compares the JavaScript extraction results against known good Python results
 * to identify parsing issues.
 * 
 * Run with: node extension/tests/test_extraction_comparison.js
 * Or in browser console after loading content-bundle.js
 */

// Test cases based on actual MHTML structure and Python extraction results
const testCases = [
  {
    name: 'CL200-WETH.e/WAVAX',
    poolId: '0x5E128EbC09C918DDAE3Ca1668d4EE9527dc00D78',
    poolType: 'CL200',
    feePercentage: '0.06%',
    pythonResults: {
      total_rewards: 23770,  // ~$23.77K (from total-rewards section)
      vapr: 216.5,
      current_votes: 11090000  // 11.09M
    },
    // HTML structure from MHTML file - exact structure
    html: `
      <div class="liquidity-pool-cell even">
        <div class="liquidity-pool-cell-left">
          <div class="liquidity-pool-cell-description">
            <div class="pool-description">
              <div class="name">CL200-WETH.e/WAVAX</div>
              <div class="bottom-info">
                <div class="gas-info">
                  <div class="text" data-tooltip-id="pool-gas-tooltip">0.06%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="liquidity-pool-cell-right">
          <div class="liquidity-pool-cell-data">
            <div class="voting-pool-cell-slot">
              <div class="voting-pool-cell-slot-container">
                <div class="voting-pool-data total">~$4.92M</div>
                <div class="liquidity-pool-data-token">1.10K WETH.e</div>
                <div class="liquidity-pool-data-token">90.78K WAVAX</div>
              </div>
            </div>
          </div>
          <div class="liquidity-pool-cell-data">
            <div class="voting-pool-cell-slot">
              <div class="voting-pool-cell-slot-container">
                <div class="voting-pool-data total">~$20.73K</div>
                <div class="voting-pool-token-data">
                  <div class="first">3.12453 WETH.e</div>
                  <div class="fees">724.02 WAVAX</div>
                </div>
              </div>
            </div>
          </div>
          <div class="liquidity-pool-cell-data incentives">
            <div class="voting-pool-cell-slot-container">
              <div class="voting-pool-data total">~$3.03K</div>
              <div class="voting-pool-token-data">
                <div class="first"></div>
                <div class="incentives">58.14K BLACK</div>
              </div>
            </div>
          </div>
          <div class="liquidity-pool-cell-data total-rewards">
            <div class="voting-pool-cell-slot">
              <div class="voting-pool-cell-slot-container">
                <div class="voting-pool-data total">~$23.77K</div>
                <div class="voting-pool-token-data">
                  <div class="first total-rewards">Fees + Incentives</div>
                </div>
              </div>
            </div>
          </div>
          <div class="liquidity-pool-cell-data last">
            <div class="voting-pool-cell-vapr-info">
              <div class="first">216.5%</div>
              <div class="second clickable" data-tooltip-id="liquidity-pool-cell-vapr-tooltip-0x5E128EbC09C918DDAE3Ca1668d4EE9527dc00D78">
                <svg class="info-icon" width="21" height="20" viewBox="0 0 21 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g opacity="0.4"><path d="M10.1956 18.3337C14.798 18.3337 18.529 14.6027 18.529 10.0003C18.529 5.39795 14.798 1.66699 10.1956 1.66699C5.59326 1.66699 1.8623 5.39795 1.8623 10.0003C1.8623 14.6027 5.59326 18.3337 10.1956 18.3337Z" stroke="white" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"></path></g>
                </svg>
              </div>
            </div>
          </div>
          <div class="liquidity-pool-cell-data end">
            <div class="voting-pool-cell-slot">
              <div class="voting-pool-cell-slot-container">
                <div class="voting-pool-data total">11.09M</div>
                <div class="voting-pool-token-data">
                  <div class="first"></div>
                </div>
                <div class="votes-percentage">4.47%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  },
  {
    name: 'sAMM-CROC/WAVAX',
    poolId: '0xedCFA2d80cf06FB7642E956a1e95DBC37c75995b',
    poolType: 'sAMM',
    pythonResults: {
      total_rewards: 32140,  // ~$32.14K
      vapr: 200.8,
      current_votes: 16190000  // 16.19M
    },
    html: `
      <div class="liquidity-pool-cell odd">
        <div class="liquidity-pool-cell-left">
          <div class="name">sAMM-CROC/WAVAX</div>
        </div>
        <div class="liquidity-pool-cell-right">
          <div class="liquidity-pool-cell-data total-rewards">
            <div class="voting-pool-cell-slot">
              <div class="voting-pool-cell-slot-container">
                <div class="voting-pool-data total">~$32.14K</div>
                <div class="voting-pool-token-data">
                  <div class="first total-rewards">Fees + Incentives</div>
                </div>
              </div>
            </div>
          </div>
          <div class="liquidity-pool-cell-data last">
            <div class="voting-pool-cell-vapr-info">
              <div class="first">200.8%</div>
            </div>
          </div>
          <div class="liquidity-pool-cell-data end">
            <div class="voting-pool-cell-slot">
              <div class="voting-pool-cell-slot-container">
                <div class="voting-pool-data total">16.19M</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  }
];

// Tolerance for floating point comparisons
const TOLERANCE = {
  total_rewards: 100,  // $100 tolerance
  vapr: 0.1,           // 0.1% tolerance
  current_votes: 1000  // 1000 votes tolerance
};

/**
 * Compare two values with tolerance
 */
function compareWithTolerance(actual, expected, tolerance, fieldName) {
  const diff = Math.abs(actual - expected);
  const percentDiff = expected > 0 ? (diff / expected) * 100 : 0;
  const passed = diff <= tolerance;
  
  return {
    passed,
    actual,
    expected,
    diff,
    percentDiff: percentDiff.toFixed(2) + '%',
    tolerance
  };
}

/**
 * Run extraction test on a test case
 * Requires extractPoolFromElement to be available (from content-bundle.js)
 */
function runExtractionTest(testCase) {
  if (typeof extractPoolFromElement === 'undefined') {
    throw new Error('extractPoolFromElement function not found. Make sure content-bundle.js is loaded.');
  }
  
  // Create DOM element from HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(testCase.html, 'text/html');
  const element = doc.querySelector('.liquidity-pool-cell');
  
  if (!element) {
    throw new Error(`Failed to parse HTML for test case: ${testCase.name}`);
  }
  
  // Extract pool data using JavaScript function
  const jsResult = extractPoolFromElement(element);
  
  if (!jsResult) {
    return {
      testCase: testCase.name,
      passed: false,
      error: 'extractPoolFromElement returned null'
    };
  }
  
  // Compare results
  const python = testCase.pythonResults;
  const js = {
    total_rewards: jsResult.total_rewards || 0,
    vapr: jsResult.vapr || 0,
    current_votes: jsResult.current_votes !== null && jsResult.current_votes !== undefined ? jsResult.current_votes : null
  };
  
  const totalRewardsComparison = compareWithTolerance(
    js.total_rewards,
    python.total_rewards,
    TOLERANCE.total_rewards,
    'total_rewards'
  );
  
  const vaprComparison = compareWithTolerance(
    js.vapr,
    python.vapr,
    TOLERANCE.vapr,
    'vapr'
  );
  
  let votesComparison = null;
  if (python.current_votes !== null && python.current_votes !== undefined) {
    if (js.current_votes === null || js.current_votes === undefined) {
      votesComparison = {
        passed: false,
        actual: null,
        expected: python.current_votes,
        error: 'JavaScript extraction returned null for votes'
      };
    } else {
      votesComparison = compareWithTolerance(
        js.current_votes,
        python.current_votes,
        TOLERANCE.current_votes,
        'current_votes'
      );
    }
  }
  
  const allPassed = totalRewardsComparison.passed && 
                    vaprComparison.passed && 
                    (votesComparison === null || votesComparison.passed);
  
  return {
    testCase: testCase.name,
    passed: allPassed,
    poolId: jsResult.pool_id,
    poolType: jsResult.pool_type,
    name: jsResult.name,
    comparisons: {
      total_rewards: totalRewardsComparison,
      vapr: vaprComparison,
      current_votes: votesComparison
    },
    rawResults: {
      python,
      javascript: js
    }
  };
}

/**
 * Run all tests
 */
function runAllTests() {
  console.log('🧪 Running extraction comparison tests...\n');
  
  const results = [];
  let passedCount = 0;
  let failedCount = 0;
  
  for (const testCase of testCases) {
    try {
      const result = runExtractionTest(testCase);
      results.push(result);
      
      if (result.passed) {
        passedCount++;
        console.log(`✅ ${result.testCase}: PASSED`);
      } else {
        failedCount++;
        console.log(`❌ ${result.testCase}: FAILED`);
        
        // Show detailed comparison
        console.log('   Comparisons:');
        for (const [field, comparison] of Object.entries(result.comparisons)) {
          if (comparison && !comparison.passed) {
            console.log(`     ${field}:`);
            console.log(`       Expected: ${comparison.expected}`);
            console.log(`       Actual:   ${comparison.actual}`);
            console.log(`       Diff:     ${comparison.diff} (${comparison.percentDiff})`);
            console.log(`       Tolerance: ${comparison.tolerance}`);
          } else if (comparison && comparison.error) {
            console.log(`     ${field}: ${comparison.error}`);
          }
        }
      }
      
      // Show raw results for debugging
      console.log(`   Raw results:`);
      console.log(`     Python:    total_rewards=${result.rawResults.python.total_rewards}, vapr=${result.rawResults.python.vapr}, votes=${result.rawResults.python.current_votes}`);
      console.log(`     JavaScript: total_rewards=${result.rawResults.javascript.total_rewards}, vapr=${result.rawResults.javascript.vapr}, votes=${result.rawResults.javascript.current_votes}`);
      console.log('');
      
    } catch (error) {
      failedCount++;
      console.error(`❌ ${testCase.name}: ERROR - ${error.message}`);
      console.error(error.stack);
      console.log('');
    }
  }
  
  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Summary: ${passedCount} passed, ${failedCount} failed out of ${testCases.length} tests`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  return {
    total: testCases.length,
    passed: passedCount,
    failed: failedCount,
    results
  };
}

// Export for Node.js (if using jsdom)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    testCases,
    runExtractionTest,
    runAllTests,
    compareWithTolerance,
    TOLERANCE
  };
}

// Auto-run if in browser console
if (typeof window !== 'undefined' && typeof extractPoolFromElement !== 'undefined') {
  console.log('Auto-running tests in browser...');
  runAllTests();
}
