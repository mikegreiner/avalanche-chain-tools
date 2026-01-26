# UX Improvements - Round 2

## Issues Fixed

### 1. ✅ Vote Panel Opening Unnecessarily
**Problem:** Vote panel opened for every select/deselect operation, stayed open

**Root Cause:** `GET_SELECTED_POOLS` was calling `getSelectedPoolsFromVotePanel()` which opens the modal

**Fix:** Changed `GET_SELECTED_POOLS` to use in-memory tracking first, only check DOM if needed (never opens vote panel)

```javascript
// OLD: Opened vote panel every time
selectedSet = await getSelectedPoolsFromVotePanel(true);

// NEW: Use in-memory, never opens panel
let selectedSet = new Set(selectedPoolIdsSet);
if (selectedSet.size === 0) {
  // Check current page DOM only
}
```

### 2. ✅ Select All Unselecting Already-Selected Pools
**Problem:** "Select All" toggled pools instead of ensuring they're all selected

**Fix:** Added `forceSelect` parameter to `SELECT_POOLS` handler
- Skips pools that are already selected
- Only selects unselected pools

```javascript
// Sidepanel sends:
{ type: 'SELECT_POOLS', poolIds: pools, forceSelect: true }

// Content script checks:
if (forceSelect && selectedPoolIdsSet.has(poolId)) {
  console.log('Pool already selected, skipping');
  continue;
}
```

### 3. ✅ No Visual Feedback During Operations
**Problem:** User couldn't tell when operations were in progress

**Fix:** Added button state changes and operation lock
- Buttons show "Selecting...", "Clearing...", "Splitting..." during operation
- Buttons disabled during operation
- Status messages show results
- Global lock prevents concurrent operations

```javascript
btn.textContent = 'Selecting...';
btn.disabled = true;
try {
  await operation();
  showStatus('Selected 12 pools', 'success');
} finally {
  btn.textContent = originalText;
  btn.disabled = false;
}
```

### 4. ✅ Rapid Click Race Conditions
**Problem:** Clicking buttons rapidly caused errors like "Could not find pool..."

**Fix:** Added global operation lock
- Only one pool operation at a time
- Subsequent clicks show "Operation in progress, please wait..."
- Increased wait times between operations (800ms)

```javascript
let operationInProgress = false;
async function withOperationLock(operation) {
  if (operationInProgress) {
    showStatus('Operation in progress, please wait...', 'error');
    return null;
  }
  operationInProgress = true;
  try {
    return await operation();
  } finally {
    operationInProgress = false;
  }
}
```

### 5. 🔄 Split Votes Math Issues (Investigated)
**Problem:** Split votes doesn't total 100%, leaves some pools at 0%

**Status:** The split votes function is in the content script. Need to investigate the math logic.

**Note:** This issue will require looking at the `splitVotesEvenly()` function in `content-bundle.js`

## What Users Will See Now

### Clear All
```
1. User clicks "Clear All"
2. Button changes to "Clearing..." and disables
3. Vote panel opens briefly
4. "Clear Votes" button clicked
5. Vote panel closes
6. Button re-enables, shows "All votes cleared"
7. Total time: ~1-2 seconds
```

### Select All
```
1. User clicks "Select All" (4 pools already selected, 8 recommended)
2. Button changes to "Selecting..." and disables
3. Skips the 4 already-selected pools
4. Selects the remaining 8 pools
5. Button re-enables, shows "Selected 8 pools"
6. All 12 pools now selected
```

### Individual Pool Select
```
1. User clicks "Select" on pool
2. Button changes to "Selecting..." and disables
3. Pool is selected (800ms operation)
4. UI refreshes, pool highlighted
5. If user clicks another button during operation:
   → "Operation in progress, please wait..."
```

## Technical Changes

### `sidepanel.js`
- Added `operationInProgress` flag and `withOperationLock()` function
- Wrapped all button handlers with operation lock
- Added button state changes (text, disabled)
- Increased wait times (500ms → 800ms, 1000ms)
- Added error handling with user-friendly messages

### `content-bundle.js`
- Modified `GET_SELECTED_POOLS` to use in-memory tracking (no vote panel)
- Added `forceSelect` parameter to `SELECT_POOLS` handler
- Increased delay between operations (100ms → 150ms)
- Added skip logic for already-selected pools

## Performance Impact

| Operation | Before | After | Notes |
|-----------|--------|-------|-------|
| Get selected pools | Opens panel | No panel | Much faster, no UI disruption |
| Select All (mixed) | Toggles all | Selects only unselected | Smarter behavior |
| Rapid clicks | Race conditions | Queued/blocked | No more errors |
| User feedback | None | Button states + messages | Clear progress indication |

## Remaining Issue: Split Votes Math

The split votes functionality needs investigation. Symptoms:
- For 12 pools: puts 14.3% in items 2-7, 14.2% in first, 0% in last
- Total doesn't reach 100%
- Seems to "give up" on larger numbers of pools

This requires examining the `splitVotesEvenly()` function in `content-bundle.js` to fix the rounding logic.

## Testing Checklist

- [x] Code compiles and builds
- [ ] Vote panel doesn't open during GET_SELECTED_POOLS
- [ ] Select All doesn't unselect already-selected pools
- [ ] Buttons show progress (Selecting..., Clearing...)
- [ ] Rapid clicks are blocked with message
- [ ] Clear All completes in 1-2 seconds
- [ ] Individual pool selection works without errors
- [ ] Split votes math needs fixing (known issue)

## Next Steps

1. Test the current fixes
2. Investigate `splitVotesEvenly()` function for math errors
3. Possibly need to handle the vote panel staying open after Clear All

Bundle has been rebuilt and is ready for testing!
