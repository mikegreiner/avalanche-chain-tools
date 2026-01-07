# Extension Extraction Tests

This directory contains tests to compare JavaScript extraction results against the working Python extraction code.

## Test Files

- `test_extraction_comparison.js` - Main test suite with test cases and comparison logic
- `run_tests_node.js` - Node.js test runner using jsdom
- `test_runner.html` - Browser-based test runner (open in browser)

## Running Tests

### In Browser Console

1. Load the extension on `blackhole.xyz/vote`
2. Open browser console
3. The tests will auto-run if `extractPoolFromElement` is available
4. Or manually run: `runAllTests()`

### In Node.js

```bash
# Install jsdom if not already installed
npm install jsdom

# Run tests
node extension/tests/run_tests_node.js
```

### In Browser (HTML Test Runner)

1. Open `extension/tests/test_runner.html` in your browser
2. Make sure `content-bundle.js` is loaded (you may need to adjust paths)
3. Tests will run automatically

## Test Cases

Test cases are based on actual HTML structure from the MHTML file and known good Python extraction results.

### Current Test Cases

1. **CL200-WETH.e/WAVAX**
   - Expected: total_rewards=23770, vapr=216.5, votes=11090000
   - This is the pool that was showing incorrect values

2. **sAMM-CROC/WAVAX**
   - Expected: total_rewards=32140, vapr=200.8, votes=16190000

## Adding New Test Cases

Add new test cases to the `testCases` array in `test_extraction_comparison.js`:

```javascript
{
  name: 'Pool-Name',
  poolId: '0x...',
  poolType: 'CL200',
  pythonResults: {
    total_rewards: 12345,
    vapr: 150.0,
    current_votes: 5000000
  },
  html: `<div class="liquidity-pool-cell">...</div>`
}
```

## Tolerance

Tests use tolerance values to account for floating-point precision:
- `total_rewards`: ±$100
- `vapr`: ±0.1%
- `current_votes`: ±1000 votes

Adjust these in `TOLERANCE` object if needed.
