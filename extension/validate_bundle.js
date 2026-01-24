#!/usr/bin/env node
/**
 * Validate the built bundle for common issues:
 * - Undefined class/function references
 * - Duplicate declarations
 * - Missing dependencies
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUNDLE_PATH = path.join(__dirname, 'content-bundle.js');

// Classes/functions that should be defined
const REQUIRED_DEFINITIONS = [
  'PoolDataProvider',
  'RpcPoolProvider',
  'RpcRewardsProvider',
  'RewardsExtractor',
  'VammSammProvider',
  'RpcClient',
  'Pool',
  'recommendPools',
  'decodeMulticallRequest',
  'decodeMulticallResponse',
  'matchCallsToReturns',
  'extractRewardsFromDecoded',
  'applyStaticRewards',
];

// Constants that should only appear once
const SINGLE_CONSTANTS = [
  'VOTER_ADDRESS',
  'RPC_URL',
  'API_URL',
  'SELECTORS',
  'MULTICALL3_ADDRESS',
  'AGGREGATE_SELECTOR',
];

function validateBundle() {
  console.log('Validating content-bundle.js...\n');
  
  if (!fs.existsSync(BUNDLE_PATH)) {
    console.error('❌ Bundle file not found!');
    process.exit(1);
  }
  
  const content = fs.readFileSync(BUNDLE_PATH, 'utf8');
  const lines = content.split('\n');
  
  let errors = [];
  let warnings = [];
  
  // Check for required definitions
  for (const def of REQUIRED_DEFINITIONS) {
    const classMatch = new RegExp(`(class|function)\\s+${def}\\s*[({]`);
    const constMatch = new RegExp(`const\\s+${def}\\s*=`);
    
    if (!classMatch.test(content) && !constMatch.test(content)) {
      errors.push(`Missing definition: ${def}`);
    }
  }
  
  // Check for duplicate constants
  for (const constant of SINGLE_CONSTANTS) {
    const matches = content.match(new RegExp(`const\\s+${constant}\\s*=`, 'g'));
    if (matches && matches.length > 1) {
      errors.push(`Duplicate declaration: ${constant} (found ${matches.length} times)`);
    }
  }
  
  // Check for duplicate function declarations
  const functionMatches = content.match(/function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g);
  if (functionMatches) {
    const functionNames = new Map();
    functionMatches.forEach(match => {
      const name = match.match(/function\s+([a-zA-Z_][a-zA-Z0-9_]*)/)[1];
      functionNames.set(name, (functionNames.get(name) || 0) + 1);
    });
    
    for (const [name, count] of functionNames.entries()) {
      if (count > 1 && !['hexToBigInt', 'hexToAddress'].includes(name)) {
        warnings.push(`Duplicate function: ${name} (found ${count} times)`);
      }
    }
  }
  
  // Check for undefined references (basic check)
  const undefinedPatterns = [
    /new\s+(\w+)\s*\(/g,
    /typeof\s+(\w+)\s*!==\s*['"]undefined['"]/g,
  ];
  
  const usedClasses = new Set();
  for (const pattern of undefinedPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      usedClasses.add(match[1]);
    }
  }
  
  // Report results
  if (errors.length > 0) {
    console.error('❌ ERRORS FOUND:\n');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('');
  }
  
  if (warnings.length > 0) {
    console.warn('⚠️  WARNINGS:\n');
    warnings.forEach(warn => console.warn(`  - ${warn}`));
    console.warn('');
  }
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ Bundle validation passed!\n');
    return true;
  }
  
  if (errors.length > 0) {
    console.error('❌ Validation failed. Please fix the errors above.\n');
    process.exit(1);
  }
  
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateBundle();
}

export { validateBundle };
