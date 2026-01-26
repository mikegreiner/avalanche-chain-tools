# Vote Selection Issues & Solutions

## Problems Identified

### 1. Page Navigation Hell
**Current behavior:** Code navigates page-by-page through the entire pool list
**Where it happens:**
- `scrapeAllPoolsToMemory()` - Pages through all pools to build memory map
- `clearAllSelectedPools()` - Pages through to find CLEAR links
- `getSelectedPools()` - Pages through to find selected pools
- `splitVotesEvenly()` - Calls `getSelectedPools()` which pages through

**Why it's slow:**
- Each page navigation takes 1-2 seconds
- With 100+ pools across 5-10 pages = 10-20 seconds just for navigation
- This happens on EVERY operation

### 2. Pre-Selected Pools Not Styled
**Current behavior:** When page loads with pre-selected pools (from prior epoch), they don't show as selected in sidepanel

**Root cause:**
```javascript
// In scrapeAllPoolsToMemory() - Only scrapes CURRENT PAGE initially
const allPoolCells = document.querySelectorAll('div.liquidity-pool-cell');
for (let cell of allPoolCells) {
  const isSelected = isPoolSelectedOnCell(cell);
  if (isSelected) {
    selectedPoolIdsSet.add(normalizedId);  // Only adds visible pools!
  }
}

// In GET_SELECTED_POOLS handler - Returns from Set
const selectedPools = Array.from(selectedPoolIdsSet).map(poolId => ({ poolId }));
```

**Problem:** If pools on page 2, 3, etc. are pre-selected, they're not in the set initially.

### 3. Select/Deselect Doesn't Update Styling
**Current behavior:** After clicking Select or Deselect, the styling doesn't update consistently

**Root cause:**
```javascript
// In selectSinglePool() - Updates selectedPoolIdsSet
selectedPoolIdsSet.add(normalizedId);  // ✓ Updates
poolData.isSelected = true;             // ✓ Updates

// But sidepanel already rendered, it doesn't know to re-render!
// It waits 500ms then calls loadAndRenderRecommendations()
await new Promise(resolve => setTimeout(resolve, 500));
await loadAndRenderRecommendations();  // This re-queries GET_SELECTED_POOLS
```

**Problem:** 500ms delay + the sidepanel has to query the content script again

### 4. We Have RPC Data But Don't Use It!
**Opportunity missed:**
- We already fetch ALL pool data via RPC (fast, ~2 seconds for all pools)
- Pool data includes pool IDs
- We could use search bar + RPC data instead of paging

## The Solution: Search-Based Selection State

### Core Insight
**We don't need to navigate pages AT ALL!**

Why:
1. We have RPC data with all pool IDs
2. The search bar can filter to any pool by ID
3. Search is FAST (400ms per pool)
4. We can check selection state via search

### New Architecture

```
RPC Data (already available)
    ↓
List of all pool IDs
    ↓
For each pool we care about:
  1. Search for it (400ms)
  2. Check if selected on filtered page
  3. Cache the state
    ↓
selectedPoolIdsSet now contains ALL selected pools
    ↓
Sidepanel shows correct styling
```

### Implementation Plan

#### Phase 1: Search-Based State Discovery
**Goal:** Find all selected pools without paging

```javascript
async function discoverSelectedPoolsViaSearch() {
  // Get all pool IDs from RPC data
  const poolData = await chrome.storage.local.get(['poolData']);
  const allPoolIds = poolData.poolData.map(p => p.pool_id);

  const searchInput = getSearchInput();
  selectedPoolIdsSet.clear();

  for (const poolId of allPoolIds) {
    // Search for this pool
    searchInput.value = poolId;
    triggerSearch(searchInput);
    await wait(400);

    // Check if it's selected
    const cell = findPoolCell(poolId);
    if (cell && isPoolSelectedOnCell(cell)) {
      selectedPoolIdsSet.add(poolId.toLowerCase());
    }
  }

  // Clear search
  searchInput.value = '';
  triggerSearch(searchInput);
}
```

**Problem:** This checks ALL pools (100+) = 40+ seconds

**Better approach:** Only check pools in our recommendations!

```javascript
async function discoverSelectedPoolsInRecommendations() {
  // Get recommendations (top 10-20 pools user cares about)
  const poolData = await chrome.storage.local.get(['poolData']);
  const settings = await chrome.storage.local.get(['blackholeSettings']);
  const recommendations = recommendPools(poolData, settings);

  const recommendedIds = recommendations.map(p => p.pool_id);

  // Check only these pools via search
  for (const poolId of recommendedIds) {
    const isSelected = await checkPoolSelectionViaSearch(poolId);
    if (isSelected) {
      selectedPoolIdsSet.add(poolId.toLowerCase());
    }
  }
}
```

**Time:** 10 pools × 400ms = 4 seconds (acceptable!)

#### Phase 2: Optimized Clear All
**Goal:** Clear all votes without paging

**Option A: Use site's "Reset" button if available**
```javascript
const resetButton = document.querySelector('button:contains("Reset")');
if (resetButton) {
  resetButton.click();
  selectedPoolIdsSet.clear();
  return;
}
```

**Option B: Search for each selected pool and clear**
```javascript
async function clearAllOptimized() {
  // We know which pools are selected from selectedPoolIdsSet
  const selectedIds = Array.from(selectedPoolIdsSet);

  for (const poolId of selectedIds) {
    // Search, find, click CLEAR
    await searchAndClearPool(poolId);
  }

  selectedPoolIdsSet.clear();
}
```

**Time:** 10 selected pools × 600ms = 6 seconds (vs 15+ seconds now)

#### Phase 3: Reactive Sidepanel Updates
**Goal:** Sidepanel updates instantly when selection changes

**Solution:** Use message passing

```javascript
// In content script - after select/deselect
selectedPoolIdsSet.add(poolId);
chrome.runtime.sendMessage({
  type: 'POOL_SELECTION_CHANGED',
  poolId: poolId,
  isSelected: true
});

// In sidepanel
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'POOL_SELECTION_CHANGED') {
    // Update styling immediately without re-rendering everything
    const poolItem = document.querySelector(`[data-pool-id="${message.poolId}"]`);
    if (poolItem) {
      poolItem.classList.toggle('pool-selected', message.isSelected);
      const button = poolItem.querySelector('.select-pool-btn');
      if (button) {
        button.textContent = message.isSelected ? 'Deselect' : 'Select';
        button.classList.toggle('btn-primary', message.isSelected);
        button.classList.toggle('btn-secondary', !message.isSelected);
      }
    }
  }
});
```

**Result:** Instant visual feedback!

## Implementation Priority

### HIGH PRIORITY (Do First)
1. ✅ **Reactive sidepanel updates** - Makes UI feel responsive
2. ✅ **Search-based selection discovery for recommendations** - Fixes pre-selected pool styling
3. ✅ **Optimized Clear All** - Use search instead of paging

### MEDIUM PRIORITY (Phase 2)
4. **Batched select operations** - Use optimized-pool-selector.js
5. **Optimized Split Votes** - Use search instead of paging

### LOW PRIORITY (Nice to have)
6. **Smart caching** - Remember selection state longer
7. **Parallel operations** - Check multiple pools simultaneously

## Concrete Next Steps

1. **Fix immediate styling issue:**
   - Add message passing for selection changes
   - Update sidepanel to listen and update DOM instantly

2. **Fix pre-selected pools on load:**
   - On sidepanel load, check recommendations via search
   - Update selectedPoolIdsSet
   - Re-render with correct styling

3. **Optimize Clear All:**
   - Use selectedPoolIdsSet + search instead of paging
   - Or find/use a "Reset" button if available

4. **Test thoroughly:**
   - Load page with pre-selected pools
   - Click Select - should highlight instantly
   - Click Deselect - should un-highlight instantly
   - Clear All - should be fast
   - Split Votes - should be fast

## Files to Modify

1. `extension/content-bundle.js`:
   - Add `checkPoolSelectionViaSearch(poolId)` function
   - Add `discoverSelectedPoolsInRecommendations()` function
   - Modify `clearAllSelectedPools()` to use search
   - Modify `selectSinglePool()` to send message after state change
   - Modify `getSelectedPools()` to use selectedPoolIdsSet

2. `extension/sidepanel.js`:
   - Add message listener for POOL_SELECTION_CHANGED
   - Add `updatePoolStyling(poolId, isSelected)` function
   - Call `discoverSelectedPools()` on load

3. `extension/lib/optimized-pool-selector.js`:
   - Already written! Just needs integration

## Success Metrics

**Before:**
- Clear All: 15-20 seconds (pages through all pools)
- Pre-selected pools: Not styled correctly
- Select/Deselect: 1-2 second delay before styling updates
- Split Votes: 10-15 seconds (pages through all pools)

**After:**
- Clear All: 5-8 seconds (search-based, proportional to selected pools)
- Pre-selected pools: Correctly styled on load
- Select/Deselect: Instant styling update (< 100ms)
- Split Votes: 5-8 seconds (search-based)
- Bonus: No page navigation!
