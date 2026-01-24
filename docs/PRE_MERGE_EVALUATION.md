# Pre-Merge Evaluation - API Discovery Feature

## Current State

### ✅ Completed Features

1. **RPC Pool Data Provider**
   - Gets weights, tokens, fees, liquidity via RPC
   - Works for all 138 pools
   - Fast and reliable

2. **Rewards Extraction**
   - Extracts rewards from multicall responses
   - 51 pools with extracted rewards
   - Integrated into pool data provider

3. **vAMM/sAMM Support**
   - Discovered 80 vAMM/sAMM pools
   - RPC-based fetching
   - Integrated with main provider

4. **API Discovery Tab**
   - Captures network requests
   - Logs RPC calls and API endpoints
   - Saves to JSON files

### ⚠️ API Discovery Tab Considerations

**Current Behavior**: API Discovery tab is always visible and active

**Issues**:
- May capture unnecessary data if user doesn't need it
- Could impact performance (logging all requests)
- UI clutter if not being used

**Recommendation**: Make it opt-in with a setting

## Proposed Changes

### 1. Make API Discovery Off by Default

**Option A: Settings Toggle**
- Add a setting: "Enable API Discovery" (default: off)
- Only show API Discovery tab when enabled
- Only capture requests when enabled

**Option B: Hidden by Default**
- Hide API Discovery tab by default
- Add a developer mode toggle to show it
- Or add a keyboard shortcut to toggle

**Recommendation**: Option A (Settings toggle) - more user-friendly

### 2. Implementation

```javascript
// In settings/storage
{
  apiDiscoveryEnabled: false  // Default: off
}

// In sidepanel
if (settings.apiDiscoveryEnabled) {
  // Show API Discovery tab
  // Enable request interception
}
```

## Work Remaining Before Merge

### Must-Have (Before Merge)

1. ✅ **RPC Pool Provider** - Complete
2. ✅ **Rewards Extraction** - Complete
3. ⚠️ **API Discovery Settings** - Needs implementation
4. ⚠️ **Testing** - Should test with real extension
5. ⚠️ **Documentation** - Update README with new features

### Nice-to-Have (Can Do Later)

1. ⏳ **VAPR Calculation** - Needs time period + emission data
2. ⏳ **Token Symbol Fetching** - Can query contracts or use API
3. ⏳ **Error Handling** - Add retry logic, better error messages
4. ⏳ **Caching Strategy** - Cache RPC data to reduce calls
5. ⏳ **Performance Optimization** - Batch RPC calls

## Testing Checklist

- [ ] Test RPC pool provider with real pools
- [ ] Test rewards extraction with live multicall responses
- [ ] Test API Discovery toggle (on/off)
- [ ] Test extension on voting page
- [ ] Test extension on other pages
- [ ] Verify no performance degradation
- [ ] Check memory usage (request logging)

## Files to Review Before Merge

### New Files
- `extension/lib/rpc-pool-provider.js`
- `extension/lib/rewards-extractor.js`
- `extension/lib/rpc-rewards-provider.js`
- `scripts/create_rewards_extractor.py`
- `scripts/find_rewards_in_nested_data.py`
- `rewards_map.json`
- `rpc_pool_data.json`

### Modified Files
- `extension/lib/pool-data-provider.js`
- `extension/lib/vamm-samm-provider.js`
- `extension/sidepanel.js` (if API Discovery tab exists)

## Merge Readiness

### Ready to Merge ✅
- Core RPC functionality
- Rewards extraction
- vAMM/sAMM support

### Should Add Before Merge ⚠️
- API Discovery settings toggle
- Basic error handling
- Documentation updates

### Can Do After Merge ⏳
- VAPR calculation
- Performance optimizations
- Advanced features

## Recommendation

**Merge Status**: Almost ready, but add API Discovery toggle first

**Action Items**:
1. Add settings toggle for API Discovery (default: off)
2. Test with real extension
3. Update documentation
4. Merge to main

This keeps the feature branch focused and allows incremental improvements after merge.
