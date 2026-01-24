/**
 * Improved Multicall3 Response Decoder
 * Properly decodes aggregate() return data to match function calls to return values
 * 
 * Structure:
 *   aggregate((address,bytes)[]) returns (uint256 blockNumber, (bool success, bytes returnData)[])
 */

const MULTICALL3_ADDRESS = '0xca11bde05977b3631167028862be2a173976ca11';
const AGGREGATE_SELECTOR = '0x82ad56cb';

// Known function selectors
const KNOWN_SELECTORS = {
  '0xa7cac846': 'weights(address)',
  '0xcc56b2c5': 'getGauge(address)',
  '0x0dfe1681': 'token0()',
  '0xd21220a7': 'token1()',
  '0xddca3f43': 'fee()',
  '0x1a686502': 'liquidity()',
  '0x18160ddd': 'totalSupply()',
  '0xedf59997': 'tokens_per_week(uint256)',
  '0x7116c60c': 'totalSupplyAtT(uint256)',
};

/**
 * Decode Multicall3 aggregate() request
 * @param {string} requestHex - The hex calldata
 * @returns {Array<{target: string, selector: string, args: string}>}
 */
export function decodeMulticallRequest(requestHex) {
  if (!requestHex || !requestHex.startsWith(AGGREGATE_SELECTOR)) {
    return [];
  }

  // Remove selector
  let hexData = requestHex.slice(10); // Remove "0x82ad56cb"
  if (hexData.startsWith('0x')) {
    hexData = hexData.slice(2);
  }
  hexData = hexData.toLowerCase();

  try {
    // Array encoding: offset (32 bytes) + length (32 bytes) + data
    const offset = parseInt(hexData.slice(0, 64), 16);
    const arrayStart = offset * 2; // offset is in bytes, hexData is in hex chars

    if (arrayStart >= hexData.length) {
      return [];
    }

    const length = parseInt(hexData.slice(arrayStart, arrayStart + 64), 16);
    const calls = [];
    let dataPos = arrayStart + 64;

    for (let i = 0; i < length; i++) {
      if (dataPos >= hexData.length) break;

      // Each tuple: (address, bytes)
      // Address is 32 bytes (right-aligned, last 20 bytes are the address)
      const addrHex = hexData.slice(dataPos, dataPos + 64);
      const target = '0x' + addrHex.slice(-40);
      dataPos += 64;

      // Bytes offset (points to where bytes data is stored)
      const bytesOffset = parseInt(hexData.slice(dataPos, dataPos + 64), 16);
      dataPos += 64;

      // Bytes data is stored at: offset + bytesOffset
      const bytesDataStart = (offset + bytesOffset) * 2;
      if (bytesDataStart >= hexData.length) break;

      // Get bytes length
      const bytesLength = parseInt(hexData.slice(bytesDataStart, bytesDataStart + 64), 16);
      const bytesDataPos = bytesDataStart + 64;

      // Round up to 32-byte boundary
      const paddedLength = Math.ceil(bytesLength / 32) * 32;
      if (bytesDataPos + (paddedLength * 2) > hexData.length) break;

      // Get bytes data
      const bytesDataHex = hexData.slice(bytesDataPos, bytesDataPos + (bytesLength * 2));
      const bytesData = '0x' + bytesDataHex;

      // Extract selector (first 4 bytes = 8 hex chars)
      const selector = bytesData.slice(0, 10);
      const args = bytesData.slice(10);

      calls.push({
        index: i,
        target,
        selector,
        args,
        calldata: bytesData,
      });
    }

    return calls;
  } catch (e) {
    console.warn('Error decoding multicall request:', e);
    return [];
  }
}

/**
 * Decode Multicall3 aggregate() response
 * @param {string} responseHex - The hex response
 * @returns {{blockNumber: number, returns: Array<{success: boolean, returnData: string}>}}
 */
export function decodeMulticallResponse(responseHex) {
  if (!responseHex || responseHex === '0x') {
    return { blockNumber: 0, returns: [] };
  }

  let hexData = responseHex;
  if (hexData.startsWith('0x')) {
    hexData = hexData.slice(2);
  }
  hexData = hexData.toLowerCase();

  if (hexData.length < 64) {
    return { blockNumber: 0, returns: [] };
  }

  try {
    // Structure: (uint256 blockNumber, (bool success, bytes returnData)[])
    // First 32 bytes: offset to blockNumber
    const blockOffset = parseInt(hexData.slice(0, 64), 16);
    const blockPos = blockOffset * 2;
    const blockNumber = parseInt(hexData.slice(blockPos, blockPos + 64), 16);

    // Next 32 bytes: offset to returnData array
    const returnsOffset = parseInt(hexData.slice(64, 128), 16);
    const returnsArrayStart = returnsOffset * 2;

    if (returnsArrayStart >= hexData.length) {
      return { blockNumber, returns: [] };
    }

    // Get array length
    const returnsLength = parseInt(hexData.slice(returnsArrayStart, returnsArrayStart + 64), 16);
    const returns = [];
    let dataPos = returnsArrayStart + 64;

    for (let i = 0; i < returnsLength; i++) {
      if (dataPos >= hexData.length) break;

      // Each element is a tuple: (bool success, bytes returnData)
      // Get offset to this tuple
      const tupleOffset = parseInt(hexData.slice(dataPos, dataPos + 64), 16);
      const tupleStart = (returnsOffset + tupleOffset) * 2;
      dataPos += 64;

      if (tupleStart >= hexData.length) break;

      // Decode tuple: (bool, bytes)
      // Bool is 32 bytes (padded)
      const successHex = hexData.slice(tupleStart, tupleStart + 64);
      const success = parseInt(successHex, 16) !== 0;

      // Bytes: offset (32 bytes) + length (32 bytes) + data
      const bytesOffset = parseInt(hexData.slice(tupleStart + 64, tupleStart + 128), 16);
      const bytesDataStart = tupleStart + (bytesOffset * 2);

      if (bytesDataStart >= hexData.length) {
        returns.push({ success, returnData: '0x' });
        continue;
      }

      // Get length
      const bytesLength = parseInt(hexData.slice(bytesDataStart, bytesDataStart + 64), 16);
      const bytesDataPos = bytesDataStart + 64;

      // Get data (padded to 32-byte boundary)
      const paddedLength = Math.ceil(bytesLength / 32) * 32;
      if (bytesDataPos + (paddedLength * 2) > hexData.length) {
        returns.push({ success, returnData: '0x' });
        continue;
      }

      const bytesDataHex = hexData.slice(bytesDataPos, bytesDataPos + (bytesLength * 2));
      const returnData = '0x' + bytesDataHex;

      returns.push({ success, returnData });
    }

    return { blockNumber, returns };
  } catch (e) {
    console.warn('Error decoding multicall response:', e);
    return { blockNumber: 0, returns: [] };
  }
}

/**
 * Decode function return value based on selector
 * @param {string} returnData - The hex return data
 * @param {string} selector - The function selector
 * @returns {any} Decoded value
 */
export function decodeFunctionReturn(returnData, selector) {
  if (!returnData || returnData === '0x') {
    return null;
  }

  const funcSig = KNOWN_SELECTORS[selector];
  if (!funcSig) {
    return null;
  }

  try {
    let hexData = returnData;
    if (hexData.startsWith('0x')) {
      hexData = hexData.slice(2);
    }

    if (funcSig === 'weights(address)') {
      // Returns uint256
      const value = BigInt('0x' + hexData.slice(0, 64));
      return Number(value) / 1e18;
    } else if (funcSig === 'getGauge(address)') {
      // Returns address
      const addr = '0x' + hexData.slice(-40);
      if (addr === '0x' + '0'.repeat(40)) {
        return null;
      }
      return addr;
    } else if (funcSig === 'token0()' || funcSig === 'token1()') {
      // Returns address
      const addr = '0x' + hexData.slice(-40);
      if (addr === '0x' + '0'.repeat(40)) {
        return null;
      }
      return addr;
    } else if (funcSig === 'fee()') {
      // Returns uint24 (padded to uint256)
      return parseInt(hexData.slice(0, 64), 16);
    } else if (funcSig === 'liquidity()' || funcSig === 'totalSupply()') {
      // Returns uint256
      const value = BigInt('0x' + hexData.slice(0, 64));
      return Number(value) / 1e18;
    } else if (funcSig === 'tokens_per_week(uint256)') {
      // Returns uint256
      const value = BigInt('0x' + hexData.slice(0, 64));
      return Number(value) / 1e18;
    } else {
      // Unknown function, return raw hex
      return returnData;
    }
  } catch (e) {
    console.warn(`Error decoding function return for ${funcSig}:`, e);
    return null;
  }
}

/**
 * Match function calls to their return values
 * @param {Array} requests - Decoded requests
 * @param {Array} returns - Decoded returns
 * @returns {Array<Object>} Matched calls with their return values
 */
export function matchCallsToReturns(requests, returns) {
  const matched = [];

  for (let i = 0; i < Math.min(requests.length, returns.length); i++) {
    const req = requests[i];
    const ret = returns[i];

    const funcName = KNOWN_SELECTORS[req.selector] || `unknown(${req.selector})`;
    let decodedValue = null;

    if (ret.success && ret.returnData) {
      decodedValue = decodeFunctionReturn(ret.returnData, req.selector);
    }

    matched.push({
      index: i,
      target: req.target,
      selector: req.selector,
      function: funcName,
      args: req.args,
      success: ret.success,
      returnData: ret.returnData,
      decodedValue,
    });
  }

  return matched;
}

/**
 * Extract rewards from decoded multicall data
 * Looks for large uint256 values that could be rewards
 * @param {Array} matched - Matched calls from matchCallsToReturns
 * @param {Set<string>} knownPools - Set of known pool addresses (lowercase, no 0x)
 * @returns {Object} Map of pool address to reward value
 */
export function extractRewardsFromDecoded(matched, knownPools) {
  const rewards = {};

  for (const call of matched) {
    // Check if this call is for a known pool
    const targetLower = call.target.toLowerCase();
    const poolKey = targetLower.slice(2); // Remove 0x

    if (!knownPools.has(poolKey)) {
      continue;
    }

    // Check if return value is a large number (could be reward)
    if (call.decodedValue !== null && typeof call.decodedValue === 'number') {
      const value = call.decodedValue;
      // Filter for reasonable reward range (100 to 100M USD)
      if (value > 100 && value < 100000000) {
        const poolAddr = targetLower;
        if (!rewards[poolAddr] || value > rewards[poolAddr]) {
          rewards[poolAddr] = value;
        }
      }
    }

    // Also check raw return data for large values
    if (call.returnData && call.returnData !== '0x' && call.returnData.length >= 66) {
      try {
        const hexData = call.returnData.slice(2);
        const value = BigInt('0x' + hexData.slice(0, 64));
        const usdValue = Number(value) / 1e18;

        if (usdValue > 100 && usdValue < 100000000) {
          const poolAddr = targetLower;
          if (!rewards[poolAddr] || usdValue > rewards[poolAddr]) {
            rewards[poolAddr] = usdValue;
          }
        }
      } catch (e) {
        // Not a valid number
      }
    }
  }

  return rewards;
}
