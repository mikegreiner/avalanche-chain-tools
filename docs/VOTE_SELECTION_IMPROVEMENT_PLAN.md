# Vote Selection Improvement Plan

## Current State Analysis

### How It Works Now (extension/content-bundle.js:7482)

The `selectSinglePool()` function:
1. Scrapes all pools to memory
2. Searches for pool by address using the site's search bar
3. Waits 800ms for page to filter
4. Finds the pool cell in filtered results
5. Locates SELECT or CLEAR button in the cell
6. Clicks the button
7. Waits 300ms
8. Clears the search input
9. Waits another 300ms for page to unfilter

**Performance:** ~1.4 seconds per pool, sequential processing

**Pain Points:**
- Multiple waits add up quickly for many pools
- Clears search after each pool (unnecessary overhead)
- Depends on DOM stability
- Sequential = slow for bulk operations
- Search bar might fail/be unavailable

## Proposed Solutions

### Option 1: Direct Contract Interaction (RECOMMENDED)

**Strategy:** Bypass the UI entirely and interact directly with the Voter contract

**How it works:**
```javascript
// Using Web3/ethers to call the Voter contract
const voterContract = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"

// Function: vote(address[] memory _poolVote, uint256[] memory _weights)
// This is what the site's "VOTE" button ultimately calls

async function voteDirectly(poolAddresses, weights) {
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  const signer = provider.getSigner()
  const voter = new ethers.Contract(voterContract, voterAbi, signer)

  // Single transaction to vote on all pools
  const tx = await voter.vote(poolAddresses, weights)
  await tx.wait()
}
```

**Benefits:**
- ⚡ **Fastest possible** - one transaction for all pools
- 🎯 **100% reliable** - no DOM dependencies
- 🔒 **Most secure** - user sees exactly what they're signing
- 🧹 **Clean** - no UI manipulation needed

**Drawbacks:**
- Requires user to approve transaction
- Needs proper ABI for Voter contract
- More complex implementation

**Implementation Steps:**
1. Add ethers.js library to extension
2. Get Voter contract ABI (can extract from site or use RPC)
3. Create `voteDirectly()` function in content script
4. Add UI in sidepanel: "Quick Vote (requires wallet approval)"
5. Show transaction preview before signing
6. Handle transaction errors gracefully

**User Experience:**
```
User clicks "Apply Votes" →
Extension shows preview:
  "You are voting on 5 pools:
   - CL200-WAVAX/USDC: 10,000 votes
   - CL50-USDC/USDt: 8,500 votes
   ..." →
User approves MetaMask transaction →
Done! (2-3 seconds total)
```

---

### Option 2: Optimized Search-Based (Quick Win)

**Strategy:** Keep the search approach but eliminate unnecessary waits

**Optimizations:**
1. **Batch processing:** Don't clear search between pools in a batch
2. **Reduce waits:** 800ms → 400ms, 300ms → 150ms (test empirically)
3. **Parallel search:** Search for next pool while clicking current pool
4. **Smart caching:** Remember button positions in cells
5. **Visual feedback:** Show progress in extension UI

**Code changes:**
```javascript
async function selectMultiplePools(poolIds) {
  const searchInput = getSearchInput()

  for (let i = 0; i < poolIds.length; i++) {
    const poolId = poolIds[i]

    // Search for this pool
    searchInput.value = poolId
    triggerSearch(searchInput)
    await wait(400) // Reduced from 800ms

    // Find and click button
    const cell = findPoolCell(poolId)
    const button = findButton(cell)
    button.click()
    await wait(150) // Reduced from 300ms

    // Don't clear search yet - continue to next pool
  }

  // Clear search only at the very end
  searchInput.value = ''
  triggerSearch(searchInput)
}
```

**Benefits:**
- ✅ Easy to implement (minor tweaks to existing code)
- ✅ No transaction signing needed
- ✅ 40-50% faster than current approach

**Drawbacks:**
- Still depends on DOM
- Still relatively slow for many pools
- Search bar failures still possible

**Implementation Steps:**
1. Modify `selectSinglePool()` to accept `skipSearchClear` flag
2. Create `selectMultiplePools()` wrapper
3. Reduce wait times (test on real site)
4. Update sidepanel to use new function

---

### Option 3: Hybrid Approach (BEST OF BOTH WORLDS)

**Strategy:** Offer both methods, let user choose

**Implementation:**
1. Add setting in sidepanel: "Vote Method"
   - Direct Contract (fast, requires approval)
   - Search UI (slower, no approval needed)
2. Default to Search UI for safety
3. Show "Try Direct Mode" banner with benefits
4. Detect if wallet is connected before offering Direct mode

**Benefits:**
- 🎯 Flexibility for different user preferences
- 🚀 Fast path available for power users
- 🛡️ Safe path for cautious users

---

## Recommended Implementation Plan

### Phase 1: Quick Win (Option 2)
**Time:** 2-4 hours
1. Optimize search-based approach
2. Add batch processing
3. Reduce wait times
4. Test thoroughly

**Deliverable:** 40-50% faster pool selection

### Phase 2: Direct Contract (Option 1)
**Time:** 8-12 hours
1. Research Voter contract ABI
2. Add ethers.js to extension
3. Implement `voteDirectly()` function
4. Add transaction preview UI
5. Test with small amounts first
6. Add error handling

**Deliverable:** Lightning-fast voting option

### Phase 3: Polish
**Time:** 2-4 hours
1. Add user choice (Option 3)
2. Add progress indicators
3. Add error recovery
4. Update documentation

## Technical Details

### Voter Contract Analysis
```
Address: 0xe30d0c8532721551a51a9fec7fb233759964d9e3
Key Functions:
- vote(address[] memory _poolVote, uint256[] memory _weights)
- reset()
- poke(address _owner)
- weights(address _pool) → uint256 (view)
```

### Search Bar Selectors
```javascript
const searchInput = document.querySelector(
  '.search-container input.input, .search-bar-outer input.input'
)
```

### Pool Cell Selectors
```javascript
const cells = document.querySelectorAll('div.liquidity-pool-cell')
```

### Button Selectors
```javascript
// Select button
const selectBtn = cell.querySelector(
  'button.btn.yellow-btn.clickable, ' +
  'button.btn.yellow-btn:not([disabled]), ' +
  'button.yellow-btn, ' +
  '.select-to-vote-container button'
)

// Clear button (actually a link)
const clearLink = cell.querySelector('span.link.underline')
```

## Success Metrics

### Current Performance
- Single pool: ~1.4 seconds
- 5 pools: ~7 seconds
- 10 pools: ~14 seconds

### Target Performance (Option 2)
- Single pool: ~0.6 seconds
- 5 pools: ~3 seconds
- 10 pools: ~6 seconds

### Target Performance (Option 1)
- Any number of pools: ~2-3 seconds (transaction time)

## Risks & Mitigation

### Risk: Direct contract calls fail
**Mitigation:** Always have search-based fallback

### Risk: Search bar changes
**Mitigation:** Multiple selector fallbacks, error handling

### Risk: Wait times too short
**Mitigation:** Make configurable, test empirically

### Risk: User doesn't understand direct contract
**Mitigation:** Clear UI explanation, show transaction preview

## Next Steps

1. **Decide:** Which option to implement first?
2. **Test:** What are the minimum safe wait times?
3. **Research:** Get Voter contract ABI
4. **Implement:** Start with Option 2 as foundation
5. **Enhance:** Add Option 1 as premium feature

---

## Alternative Crazy Ideas (For Consideration)

### 4. React DevTools Approach
Detect React's internal fiber tree and manipulate state directly
- **Pro:** Very fast
- **Con:** Extremely fragile, breaks with React updates

### 5. Virtual DOM Injection
Inject our own UI that mimics the site's voting interface
- **Pro:** Full control
- **Con:** Complex, might conflict with site

### 6. Keyboard Automation
Use keyboard navigation (Tab + Enter) instead of mouse clicks
- **Pro:** More reliable than pixel-perfect clicking
- **Con:** Still slow, depends on focus management

**Verdict:** Stick with Options 1-3
