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

function build() {
    console.log('Building content-bundle.js...');

    // 1. Header
    let bundle = `/**
 * Content script bundle - includes all pool analysis logic
 * AUTO-GENERATED from lib/*.js - DO NOT EDIT DIRECTLY
 */

`;

    // Helper to strip module keywords line by line
    const stripModules = (content) => {
        const lines = content.split('\n');
        const resultLines = lines.map(line => {
            let processed = line;
            
            // Remove imports
            if (processed.trim().startsWith('import ')) {
                return null;
            }
            
            // Remove export default
            if (processed.trim().startsWith('export default ')) {
                return null;
            }
            
            // Remove export { ... }
            if (processed.trim().startsWith('export {')) {
                return null;
            }
            
            // Replace export function -> function
            processed = processed.replace('export function ', 'function ');
            processed = processed.replace('export async function ', 'async function ');
            
            // Replace export class -> class
            processed = processed.replace('export class ', 'class ');
            
            return processed;
        }).filter(line => line !== null);
        
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

    // 2c. Include PoolDataProvider
    let providerJs = fs.readFileSync(path.join(LIB_DIR, 'pool-data-provider.js'), 'utf8');
    bundle += `// --- From pool-data-provider.js ---
${stripModules(providerJs)}
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
    console.log('Successfully built and validated content-bundle.js');
}

build();
