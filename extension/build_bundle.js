/**
 * Simple build script to generate content-bundle.js from modular sources.
 * Run with: node extension/build_bundle.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXT_DIR = __dirname;
const LIB_DIR = path.join(EXT_DIR, 'lib');

async function build() {
    console.log('Building content-bundle.js...');

    // 1. Header
    let bundle = `/**
 * Content script bundle - includes all pool analysis logic
 * AUTO-GENERATED from lib/*.js - DO NOT EDIT DIRECTLY
 */

`;

    // Track declared constants and functions to avoid duplicates
    const declaredConstants = new Set();
    const declaredFunctions = new Set();
    const skipConstants = ['VOTER_ADDRESS', 'RPC_URL', 'MULTICALL3_ADDRESS', 'AGGREGATE_SELECTOR', 'SELECTORS', 'API_URL', 'VAMM_SAMM_POOLS', 'KNOWN_VAMM_SAMM_POOLS'];
    const skipFunctions = ['hexToBigInt', 'hexToAddress']; // Helper functions that appear in multiple files
    
    // Helper to strip module keywords line by line and handle duplicate constants
    const stripModules = (content) => {
        const lines = content.split('\n');
        const resultLines = [];
        let skipUntilSemicolon = false;
        let skipUntilClosingBrace = false;
        let braceDepth = 0;
        
        for (let i = 0; i < lines.length; i++) {
            let processed = lines[i];
            const originalLine = processed;
            
            // Skip lines that are part of a multi-line import/export
            if (skipUntilSemicolon) {
                // Check if this line completes the import/export
                if (processed.includes('from') || processed.includes(';') || processed.trim() === '}') {
                    skipUntilSemicolon = false;
                }
                continue;
            }
            
            // Remove imports (including multi-line)
            if (processed.trim().startsWith('import ')) {
                // Check if it's a multi-line import
                if (processed.includes('{') && !processed.includes('}')) {
                    skipUntilSemicolon = true;
                }
                continue;
            }
            
            // Remove export default
            if (processed.trim().startsWith('export default ')) {
                continue;
            }
            
            // Remove export { ... } (including multi-line)
            if (processed.trim().startsWith('export {')) {
                if (!processed.includes('}')) {
                    skipUntilSemicolon = true;
                }
                continue;
            }
            
            // Remove lines that are just closing braces from imports/exports
            if (processed.trim() === '}' && i > 0) {
                const prevLine = lines[i - 1];
                if (prevLine && (prevLine.includes('import') || prevLine.includes('export'))) {
                    continue;
                }
            }
            
            // Replace export function -> function
            processed = processed.replace('export function ', 'function ');
            processed = processed.replace('export async function ', 'async function ');
            
            // Replace export class -> class
            processed = processed.replace('export class ', 'class ');
            
            // Handle duplicate function declarations (but not class methods)
            const functionMatch = processed.match(/^(function|async function)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
            if (functionMatch && !processed.match(/^\s+/)) { // Only top-level functions, not class methods
                const funcName = functionMatch[2];
                if (skipFunctions.includes(funcName) && declaredFunctions.has(funcName)) {
                    // Skip duplicate function - find the closing brace
                    skipUntilClosingBrace = true;
                    braceDepth = 0;
                    // Count opening brace if on same line
                    for (const char of processed) {
                        if (char === '{') braceDepth++;
                        if (char === '}') braceDepth--;
                    }
                    continue;
                }
                if (skipFunctions.includes(funcName)) {
                    declaredFunctions.add(funcName);
                }
            }
            
            // Handle duplicate const declarations FIRST (before skip logic)
            // Pattern matches UPPER_CASE constants (with optional digits)
            const constMatch = processed.match(/^(const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=/);
            if (constMatch) {
                const constName = constMatch[2];
                // If it's a duplicate constant we want to skip
                if (skipConstants.includes(constName) && declaredConstants.has(constName)) {
                    // Check if it's an object assignment (has { on same or next line)
                    const hasBrace = processed.includes('{') || (i + 1 < lines.length && lines[i + 1].trim().startsWith('{'));
                    if (hasBrace) {
                        skipUntilClosingBrace = true;
                        braceDepth = 0;
                        // Count opening brace on this line
                        for (const char of processed) {
                            if (char === '{') braceDepth++;
                            if (char === '}') braceDepth--;
                        }
                    } else {
                        skipUntilSemicolon = true;
                    }
                    continue;
                }
                // Track constants we've seen
                if (skipConstants.includes(constName)) {
                    declaredConstants.add(constName);
                }
            }
            
            // Skip lines until we find the closing brace or semicolon
            if (skipUntilClosingBrace) {
                // Count braces
                for (const char of processed) {
                    if (char === '{') braceDepth++;
                    if (char === '}') braceDepth--;
                }
                if (braceDepth === 0 && processed.includes('}')) {
                    skipUntilClosingBrace = false;
                }
                continue;
            }
            
            if (skipUntilSemicolon) {
                if (processed.includes(';')) {
                    skipUntilSemicolon = false;
                }
                continue;
            }
            
            resultLines.push(processed);
        }
        
        return resultLines.join('\n');
    };

    // 2. Include Pool class
    let poolJs = fs.readFileSync(path.join(LIB_DIR, 'pool.js'), 'utf8');
    bundle += `// --- From pool.js ---
${stripModules(poolJs)}
`;

    // 2b. Include RpcClient
    let rpcJs = fs.readFileSync(path.join(LIB_DIR, 'rpc-client.js'), 'utf8');
    bundle += `// --- From rpc-client.js ---
${stripModules(rpcJs)}
`;

    // 2c. Include RpcPoolProvider (needed by PoolDataProvider)
    let rpcPoolJs = fs.readFileSync(path.join(LIB_DIR, 'rpc-pool-provider.js'), 'utf8');
    bundle += `// --- From rpc-pool-provider.js ---
${stripModules(rpcPoolJs)}
`;

    // 2d. Include RpcRewardsProvider (needed by PoolDataProvider)
    let rpcRewardsJs = fs.readFileSync(path.join(LIB_DIR, 'rpc-rewards-provider.js'), 'utf8');
    bundle += `// --- From rpc-rewards-provider.js ---
${stripModules(rpcRewardsJs)}
`;

    // 2e. Include RewardsExtractor (needed by RpcRewardsProvider)
    let rewardsExtractorJs = fs.readFileSync(path.join(LIB_DIR, 'rewards-extractor.js'), 'utf8');
    bundle += `// --- From rewards-extractor.js ---
${stripModules(rewardsExtractorJs)}
`;

    // 2f. Include vAMM/sAMM static data
    let vammSammDataJs = fs.readFileSync(path.join(LIB_DIR, 'vamm-samm-data.js'), 'utf8');
    bundle += `// --- From vamm-samm-data.js ---
${stripModules(vammSammDataJs)}
`;

    // 2g. Include VammSammProvider (needs vamm-samm-data.js)
    let vammSammJs = fs.readFileSync(path.join(LIB_DIR, 'vamm-samm-provider.js'), 'utf8');
    bundle += `// --- From vamm-samm-provider.js ---
${stripModules(vammSammJs)}
`;

    // 2h. Include PoolDataProvider
    let providerJs = fs.readFileSync(path.join(LIB_DIR, 'pool-data-provider.js'), 'utf8');
    bundle += `// --- From pool-data-provider.js ---
${stripModules(providerJs)}
`;

    // 2i. Include UI Manager
    let uiManagerJs = fs.readFileSync(path.join(LIB_DIR, 'ui-manager.js'), 'utf8');
    bundle += `// --- From ui-manager.js ---
${stripModules(uiManagerJs)}
`;

    // 3. Include pool-recommender.js
    let recommenderJs = fs.readFileSync(path.join(LIB_DIR, 'pool-recommender.js'), 'utf8');
    bundle += `// --- From pool-recommender.js ---
${stripModules(recommenderJs)}
`;

    // 4. Include pool-extractor.js
    let extractorJs = fs.readFileSync(path.join(LIB_DIR, 'pool-extractor.js'), 'utf8');
    bundle += `// --- From pool-extractor.js ---
${stripModules(extractorJs)}
`;

    // 4b. Include static-rewards-loader.js
    let staticRewardsJs = fs.readFileSync(path.join(LIB_DIR, 'static-rewards-loader.js'), 'utf8');
    bundle += `// --- From static-rewards-loader.js ---
${stripModules(staticRewardsJs)}
`;

    // 4c. Include multicall-decoder.js
    let multicallDecoderJs = fs.readFileSync(path.join(LIB_DIR, 'multicall-decoder.js'), 'utf8');
    bundle += `// --- From multicall-decoder.js ---
${stripModules(multicallDecoderJs)}
`;

    // 5. Append main content logic
    const existingBundle = fs.readFileSync(path.join(EXT_DIR, 'content-bundle.js'), 'utf8');
    
    const mainStartMarker = "// Now include the main content script logic";
    const mainStartIndex = existingBundle.indexOf(mainStartMarker);
    
    if (mainStartIndex !== -1) {
        bundle += existingBundle.substring(mainStartIndex);
    } else {
        const fallbackMarker = "function init()";
        const fallbackIndex = existingBundle.indexOf(fallbackMarker);
        if (fallbackIndex !== -1) {
            bundle += `\n// Now include the main content script logic\n${existingBundle.substring(fallbackIndex)}`;
        } else {
            console.error("Could not find start of main content script logic in existing content-bundle.js");
            process.exit(1);
        }
    }

    // 6. Validation - Check for remaining import/export keywords
    const finalLines = bundle.split('\n');
    let hasError = false;
    
    finalLines.forEach((line, index) => {
        const trimmed = line.trim();
        // Check if line starts with keyword (ignoring comments)
        if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
            if (trimmed.startsWith('import ') || (trimmed.startsWith('export ') && !trimmed.includes('export:'))) {
                console.error(`ERROR: Found remaining module keyword on line ${index + 1}: "${trimmed}"`);
                hasError = true;
            }
        }
    });

    if (hasError) {
        console.error("Bundle validation failed. Fix build_bundle.js logic.");
        process.exit(1);
    }

    fs.writeFileSync(path.join(EXT_DIR, 'content-bundle.js'), bundle);
    
    // Validate bundle
    console.log('Validating bundle...');
    
    // 1. Syntax check
    try {
        const { execSync } = await import('child_process');
        execSync(`node -c "${path.join(EXT_DIR, 'content-bundle.js')}"`, { stdio: 'pipe', encoding: 'utf8' });
        console.log('  ✓ Syntax check passed');
    } catch (e) {
        const errorMsg = e.stdout?.toString() || e.stderr?.toString() || e.message;
        if (errorMsg.includes('SyntaxError') || errorMsg.includes('Unexpected token')) {
            console.error('  ❌ Syntax error:', errorMsg.split('\n')[0]);
            process.exit(1);
        }
        // If it's a different error, continue
    }
    
    // 2. Check for required classes
    const requiredClasses = ['RpcPoolProvider', 'RpcRewardsProvider', 'RewardsExtractor', 'VammSammProvider', 'PoolDataProvider'];
    const bundleContent = fs.readFileSync(path.join(EXT_DIR, 'content-bundle.js'), 'utf8');
    const missing = [];
    for (const className of requiredClasses) {
        if (!new RegExp(`class\\s+${className}\\s*[({]`).test(bundleContent)) {
            missing.push(className);
        }
    }
    
    if (missing.length > 0) {
        console.error(`  ❌ Missing classes: ${missing.join(', ')}`);
        process.exit(1);
    }
    console.log('  ✓ All required classes present');
    
    // 3. Check for duplicate constants
    const constants = ['VOTER_ADDRESS', 'RPC_URL', 'SELECTORS'];
    for (const constant of constants) {
        const matches = bundleContent.match(new RegExp(`const\\s+${constant}\\s*=`, 'g'));
        if (matches && matches.length > 1) {
            console.error(`  ❌ Duplicate constant: ${constant} (found ${matches.length} times)`);
            process.exit(1);
        }
    }
    console.log('  ✓ No duplicate constants');
    
    console.log('Successfully built and validated content-bundle.js');
}

build();
