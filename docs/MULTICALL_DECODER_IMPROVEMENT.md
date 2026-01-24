# Improved Multicall Response Decoding

## What Was Done

Created a proper ABI decoder for Multicall3's `aggregate()` function that:
1. **Decodes requests** - Extracts function calls with their targets, selectors, and arguments
2. **Decodes responses** - Extracts return values with success flags
3. **Matches calls to returns** - Correctly pairs each function call with its return value
4. **Extracts rewards** - Identifies large uint256 values that could be rewards

## Implementation

### New File: `extension/lib/multicall-decoder.js`

**Functions:**
- `decodeMulticallRequest(requestHex)` - Decodes the request calldata
- `decodeMulticallResponse(responseHex)` - Decodes the response data
- `decodeFunctionReturn(returnData, selector)` - Decodes specific function return types
- `matchCallsToReturns(requests, returns)` - Matches calls to their return values
- `extractRewardsFromDecoded(matched, knownPools)` - Extracts rewards from decoded data

### Updated: `extension/lib/rpc-rewards-provider.js`

**Changes:**
- `extractFromResponse()` now accepts both `responseHex` and `requestHex`
- Uses improved decoding when both are available
- Falls back to pattern matching if decoding fails
- Intercepts both request and response to match them

**Interception Improvements:**
- Stores request data in cache
- Matches requests to responses by ID
- Passes both to `extractFromResponse()` for proper decoding

## How It Works

### Before (Pattern Matching)
```
1. Intercept multicall response
2. Search hex data for known pool addresses
3. Extract nearby large values
4. Assume they're rewards
```

### After (Proper Decoding)
```
1. Intercept multicall request AND response
2. Decode request → get function calls
3. Decode response → get return values
4. Match calls to returns by index
5. Decode return values based on function selector
6. Extract rewards from decoded values
```

## Benefits

1. **Accuracy** - Matches exact function calls to their return values
2. **Reliability** - No guessing about which value belongs to which pool
3. **Completeness** - Can extract rewards from any function, not just pattern matching
4. **Future-proof** - Can easily add new function selectors and decoding logic

## Testing

The decoder is integrated and will:
- Automatically use improved decoding when both request and response are available
- Fall back to pattern matching if decoding fails
- Log when improved decoding succeeds: `✓ Decoded X rewards from multicall`

## Next Steps

1. **Test in browser** - Verify it extracts rewards correctly
2. **Add more selectors** - Identify unknown function selectors that return rewards
3. **Improve error handling** - Handle edge cases in decoding
4. **Performance** - Optimize for large multicalls (100+ calls)
