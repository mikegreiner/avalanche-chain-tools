#!/usr/bin/env node
/**
 * Run extraction comparison tests in Node.js environment
 * 
 * This script uses jsdom to simulate the browser DOM environment
 * so we can test the extraction logic without a browser.
 * 
 * Usage: node extension/tests/run_tests_node.js
 * 
 * Requires: npm install jsdom
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Create a DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://blackhole.xyz/vote',
  pretendToBeVisual: true,
  resources: 'usable'
});

// Set up global objects
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;
global.console = console;

// Load the content-bundle.js file
const contentBundlePath = path.join(__dirname, '..', 'content-bundle.js');
const contentBundleCode = fs.readFileSync(contentBundlePath, 'utf8');

// Execute the content bundle in the jsdom context
try {
  dom.window.eval(contentBundleCode);
} catch (error) {
  console.error('Error loading content-bundle.js:', error);
  process.exit(1);
}

// Now load and run the tests
const testPath = path.join(__dirname, 'test_extraction_comparison.js');
const testCode = fs.readFileSync(testPath, 'utf8');

// Make extractPoolFromElement available globally
dom.window.extractPoolFromElement = dom.window.extractPoolFromElement || 
  (() => {
    // Try to find it in the eval'd context
    const func = dom.window.eval('extractPoolFromElement');
    return func;
  });

// Execute test code
try {
  dom.window.eval(testCode);
  
  // Run tests
  if (dom.window.runAllTests) {
    const results = dom.window.runAllTests();
    
    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);
  } else {
    console.error('runAllTests function not found');
    process.exit(1);
  }
} catch (error) {
  console.error('Error running tests:', error);
  console.error(error.stack);
  process.exit(1);
}
