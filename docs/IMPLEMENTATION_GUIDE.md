# Implementation Guide: Search-Based Selection Improvements

## Overview

This guide shows exactly how to integrate the search-based selection improvements
into the existing codebase.

## Files Created

1. `extension/lib/search-based-selection.js` - Core search-based functions
2. `extension/lib/sidepanel-reactive-updates.js` - Reactive UI updates
3. `extension/lib/optimized-pool-selector.js` - Batched operations (already created)

## Integration Steps

### Step 1: Add to content-bundle.js

The `content-bundle.js` is auto-generated from lib/*.js files. We need to add our new
modules to the build process.

**In `extension/build_bundle.js`:**

Add to the list of files to bundle:
```javascript
const libFiles = [
  'pool.js',
  'pool-recommender.js',
  'pool-extractor.js',
  'rewards-extractor.js',
  'search-based-selection.js',  // ADD THIS
  // ... other files
];
```

Then rebuild:
```bash
cd extension
node build_bundle.js
```

### Step 2: Update Message Handlers in content-bundle.js

**Location:** Find the `chrome.runtime.onMessage.addListener` around line 4281

**Add new message handler for CHECK_POOLS_SELECTION:**

```javascript
} else if (message.type === 'CHECK_POOLS_SELECTION') {
  // Check selection state for specific pools via search
  const poolIds = message.poolIds || [];

  (async () => {
    try {
      const selectedSet = await discoverSelectedPools(poolIds);
      const selectedPools = Array.from(selectedSet);
      sendResponse({ success: true, selectedPools });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep channel open for async response
```

**Modify GET_SELECTED_POOLS handler to be smarter:**

```javascript
} else if (message.type === 'GET_SELECTED_POOLS') {
  // If we have pool data, use search-based discovery for visible recommendations
  (async () => {
    try {
      const result = await chrome.storage.local.get(['poolData']);
      const poolData = result.poolData || [];

      if (poolData.length > 0) {
        // Use search-based discovery for recommended pools only
        const selectedSet = await getSelectedPoolsInRecommendations();
        // Update our in-memory set
        selectedPoolIdsSet.clear();
        selectedSet.forEach(id => selectedPoolIdsSet.add(id));
      }

      // Return from in-memory tracking
      const selectedPools = Array.from(selectedPoolIdsSet).map(poolId => ({ poolId }));
      sendResponse({ success: true, selectedPools });
    } catch (error) {
      // Fallback to old method
      const selectedPools = Array.from(selectedPoolIdsSet).map(poolId => ({ poolId }));
      sendResponse({ success: true, selectedPools });
    }
  })();

  return true; // Keep channel open for async response
```

**Modify CLEAR_ALL_VOTES handler:**

```javascript
} else if (message.type === 'CLEAR_ALL_VOTES') {
  (async () => {
    try {
      // Use search-based clear instead of page navigation
      const clearedCount = await clearAllViaSearch(selectedPoolIdsSet, (current, total, status) => {
        console.log(`Clear progress: ${current}/${total} - ${status}`);
      });

      selectedPoolIdsSet.clear();
      updateOverlay();
      sendResponse({ success: true, count: clearedCount });
    } catch (error) {
      console.error('Clear all failed:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep channel open for async response
```

### Step 3: Update selectSinglePool to Notify Sidepanel

**Location:** Find `async function selectSinglePool` around line 7482

**Add notification after selection state changes:**

After line 7659 (where it adds to selectedPoolIdsSet):
```javascript
selectedPoolIdsSet.add(normalizedId);
poolData.isSelected = true;

// ADD THIS: Notify sidepanel immediately
notifySelectionChanged(poolId, true);
```

After line 7635 (where it removes from selectedPoolIdsSet):
```javascript
selectedPoolIdsSet.delete(normalizedId);
poolData.isSelected = false;

// ADD THIS: Notify sidepanel immediately
notifySelectionChanged(poolId, false);
```

### Step 4: Update sidepanel.js

**Location:** `extension/sidepanel.js`

**At the top, add import (if using modules) or include reactive updates:**

```javascript
// Add after other imports
import { initializeReactiveUpdates, refreshSelectionState } from './lib/sidepanel-reactive-updates.js';
```

**In the DOMContentLoaded handler (around line 14):**

Add after `setupTabs()`:
```javascript
setupTabs();

// ADD THIS: Initialize reactive updates
initializeReactiveUpdates();
```

**In loadAndRenderRecommendations function (around line 684):**

After rendering the pool items (around line 820), add:
```javascript
container.innerHTML = html;

// ADD THIS: Refresh selection state for newly rendered pools
setTimeout(() => {
  refreshSelectionState();
}, 100);
```

### Step 5: Update sidepanel.html

**Location:** `extension/sidepanel.html`

**Add script tag for reactive updates module:**

```html
<script type="module" src="./lib/sidepanel-reactive-updates.js"></script>
<script type="module" src="./sidepanel.js"></script>
```

### Step 6: Update CSS for Better Feedback

**Location:** `extension/sidepanel.css` or `extension/content.css`

**Add transition for smoother visual updates:**

```css
.recommendation-item {
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.select-pool-btn {
  transition: background 0.2s ease, color 0.2s ease;
}
```

## Testing Checklist

### Test 1: Pre-Selected Pools on Load
1. Select a few pools on the blackhole site
2. Close and reopen the extension sidepanel
3. ✓ Pre-selected pools should show with green styling immediately

### Test 2: Select Button Reactivity
1. Click "Select" on a pool
2. ✓ Button should change to "Deselect" instantly
3. ✓ Pool should get green styling instantly
4. ✓ No 500ms delay

### Test 3: Deselect Button Reactivity
1. Click "Deselect" on a selected pool
2. ✓ Button should change to "Select" instantly
3. ✓ Green styling should disappear instantly

### Test 4: Clear All Performance
1. Select 10 pools
2. Click "Clear All"
3. ✓ Should complete in < 10 seconds (vs 15-20 seconds before)
4. ✓ All pools should show as deselected in sidepanel

### Test 5: Split Votes Performance
1. Select 10 pools
2. Click "Split Votes"
3. ✓ Should complete in < 10 seconds
4. ✓ Vote modal should open with correct percentages

## Rollback Plan

If something breaks:

1. Revert content-bundle.js changes:
   ```bash
   git checkout extension/content-bundle.js
   ```

2. Revert sidepanel.js changes:
   ```bash
   git checkout extension/sidepanel.js
   ```

3. Remove new lib files:
   ```bash
   rm extension/lib/search-based-selection.js
   rm extension/lib/sidepanel-reactive-updates.js
   ```

## Performance Expectations

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Pre-selected pools styling | Not working | Works | ∞ |
| Select/Deselect feedback | 500-1000ms | <100ms | 5-10x faster |
| Clear All (10 pools) | 15-20s | 5-8s | 2-3x faster |
| Split Votes (10 pools) | 15-20s | 5-8s | 2-3x faster |
| Initial load time | Same | +2-4s (discovery) | Acceptable trade-off |

## Common Issues & Solutions

### Issue: "Search input not found"
**Solution:** Ensure voting page is fully loaded before operations

### Issue: Pool not found after search
**Solution:** Increase wait time in search (400ms → 600ms)

### Issue: Styling not updating
**Solution:** Check that chrome.runtime.sendMessage is working and sidepanel is listening

### Issue: Too slow on initial load
**Solution:** Reduce number of pools checked (topN setting)

## Next Steps

After this is working:

1. **Add progress indicators** for Clear All and Split Votes
2. **Implement batched selection** using optimized-pool-selector.js
3. **Add caching** to avoid re-checking selection state too often
4. **Consider direct contract calls** (Phase 2) for ultimate speed

## Questions?

- How does search-based discovery work? See `docs/VOTE_SELECTION_ISSUES.md`
- Why is this faster? See `docs/VOTE_SELECTION_PERFORMANCE.md`
- What's the overall plan? See `docs/VOTE_SELECTION_IMPROVEMENT_PLAN.md`
