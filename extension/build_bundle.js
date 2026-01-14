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

    // 2. Include Pool class
    let poolJs = fs.readFileSync(path.join(LIB_DIR, 'pool.js'), 'utf8');
    // Remove all export statements
    poolJs = poolJs.replace(/export\s+default\s+\w+;?/g, '');
    poolJs = poolJs.replace(/export\s+/g, '');
    bundle += `// --- From pool.js ---
${poolJs}
`;

    // 3. Include pool-recommender.js
    let recommenderJs = fs.readFileSync(path.join(LIB_DIR, 'pool-recommender.js'), 'utf8');
    // Remove imports
    recommenderJs = recommenderJs.replace(/import\s+.*from\s+['"].*['"]/g, '');
    // Remove all export statements
    recommenderJs = recommenderJs.replace(/export\s+function/g, 'function');
    recommenderJs = recommenderJs.replace(/export\s+async\s+function/g, 'async function');
    recommenderJs = recommenderJs.replace(/export\s+{[^}]+};?/g, '');
    bundle += `// --- From pool-recommender.js ---
${recommenderJs}
`;

    // 4. Include pool-extractor.js
    let extractorJs = fs.readFileSync(path.join(LIB_DIR, 'pool-extractor.js'), 'utf8');
    // Remove imports
    extractorJs = extractorJs.replace(/import\s+.*from\s+['"].*['"]/g, '');
    // Remove all export statements
    extractorJs = extractorJs.replace(/export\s+function/g, 'function');
    extractorJs = extractorJs.replace(/export\s+async\s+function/g, 'async function');
    extractorJs = extractorJs.replace(/export\s+{[^}]+};?/g, '');
    bundle += `// --- From pool-extractor.js ---
${extractorJs}
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
            bundle += `
// Now include the main content script logic
${existingBundle.substring(fallbackIndex)}`;
        } else {
            console.error("Could not find start of main content script logic in existing content-bundle.js");
            return;
        }
    }

    fs.writeFileSync(path.join(EXT_DIR, 'content-bundle.js'), bundle);
    console.log('Successfully built content-bundle.js');
}

build();