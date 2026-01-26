# RPC-Driven Voting Implementation Plan

## Executive Summary

This document outlines the plan to implement direct RPC-driven voting in the Blackhole DEX Tools extension, eliminating the dependency on the Blackhole voting web UI for the voting process. Users will be able to select pools, configure vote splits, and submit votes entirely from the extension side panel using blockchain RPC calls and MetaMask transaction signing.

## Current State vs. Target State

### Current State (v1.1.3)
- ✅ RPC-based pool data fetching (20x faster than DOM scraping)
- ✅ Side panel shows recommendations with filtering/sorting
- ✅ Pool selection via DOM manipulation (search bar + button clicks)
- ✅ Vote splitting via DOM manipulation (fills input fields on web UI)
- ⚠️ **Requires web UI** - Users must navigate to blackhole.xyz/vote
- ⚠️ **Slow selection** - ~1.4s per pool (sequential DOM operations)
- ⚠️ **Fragile** - Breaks if web UI changes

### Target State (RPC-Driven Voting)
- ✅ 100% independent from web UI
- ✅ Pool selection in side panel (checkbox/click interface)
- ✅ Vote split configuration in side panel (manual percentages or auto-split)
- ✅ One-click voting via RPC transaction
- ✅ MetaMask integration for transaction signing
- ✅ Transaction preview before signing
- ✅ Vote validation (percentages sum to 100%, sufficient veBLACK balance)
- ✅ Instant execution (2-3 seconds regardless of number of pools)

---

## Architecture Overview

### New Components

```
┌─────────────────────────────────────────────────────────────┐
│ Extension Side Panel (Enhanced)                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. Pool Selection View                               │  │
│  │  - Recommendations list (existing)                   │  │
│  │  - Checkbox for each pool (NEW)                      │  │
│  │  - Selected pool counter (NEW)                       │  │
│  │  - "Select Top N" button (existing)                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 2. Vote Configuration View (NEW)                     │  │
│  │  - List of selected pools                            │  │
│  │  - Percentage input for each pool                    │  │
│  │  - "Split Evenly" button                             │  │
│  │  - Total percentage indicator (must = 100%)          │  │
│  │  - Vote preview (pools × voting power)               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 3. Transaction Preview (NEW)                         │  │
│  │  - Summary: X pools, Y total votes                   │  │
│  │  - Estimated gas cost                                │  │
│  │  - "Submit Vote Transaction" button                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Vote Transaction Builder (NEW)                              │
│ - extension/lib/vote-transaction-builder.js                 │
│ - Constructs voter.vote(poolAddresses[], weights[])         │
│ - Validates inputs                                          │
│ - Encodes transaction data                                  │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ MetaMask Integration (NEW)                                  │
│ - window.ethereum.request({ method: 'eth_sendTransaction' })│
│ - Transaction status monitoring                             │
│ - Success/error handling                                    │
└─────────────────────────────────────────────────────────────┘
                        ↓
                  Avalanche Blockchain
              (Voter Contract: 0xe30d0...9e3)
```

---

## Required RPC Discovery & Research

### Phase 1: Contract ABI Discovery

**Goal:** Understand the exact function signature and parameters for voter.vote()

**Python Script:** `scripts/discover_voter_abi.py`

```python
#!/usr/bin/env python3
"""
Discover the Voter contract ABI for the vote() function
We need to understand:
1. Function signature: vote(address[], uint256[]) or something else?
2. Weight format: Are weights in wei (1e18) or percentage (0-100)?
3. Any restrictions: min/max pools, weight limits, etc.
"""

from web3 import Web3
import json

VOTER = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"
RPC_URL = "https://api.avax.network/ext/bc/C/rpc"

# Try to fetch contract ABI from Snowtrace API
# Or extract from existing transactions
# Or probe with different function selectors

# Test function selectors:
# vote(address[],uint256[]): keccak256("vote(address[],uint256[])")[:4]
# vote(address[],int256[]): keccak256("vote(address[],int256[])")[:4]
# castVote(...): various patterns
```

**Tasks:**
1. Check Snowtrace for verified contract ABI
2. Analyze recent vote transactions to extract function signature
3. Test vote function with small amounts on testnet (if available)
4. Determine weight scaling: 1e18 vs. percentage vs. absolute votes

**Expected Outputs:**
- Exact function signature
- ABI JSON for vote function
- Weight format specification
- Example encoded transaction data

### Phase 2: User Balance & Voting Power Discovery

**Goal:** Get user's veBLACK balance to calculate available voting power

**Python Script:** `scripts/discover_voting_power.py`

```python
#!/usr/bin/env python3
"""
Discover how to query user's voting power
We need:
1. veBLACK balance (locked BLACK tokens)
2. Current votes (already allocated)
3. Available votes (veBLACK - current votes)
4. Vote weights per pool
"""

VE_TOKEN = "0xEac562811cc6abDbB2c9EE88719eCA4eE79Ad763"
VOTER = "0xe30d0c8532721551a51a9fec7fb233759964d9e3"

# Functions to test:
# - balanceOf(address) on veBLACK token
# - totalWeight() on Voter (user's total allocated votes)
# - weights(address pool) on Voter (votes per pool)
```

**Tasks:**
1. Query veBLACK token balance for user address
2. Query total weight (current allocated votes)
3. Calculate available voting power: balanceOf - totalWeight
4. Verify calculations match web UI display

**Expected Outputs:**
- JavaScript function to get voting power
- Validation logic for vote splits
- User balance display in side panel

### Phase 3: Previous Votes Discovery

**Goal:** Detect if user has already voted this epoch and show current allocations

**Python Script:** `scripts/discover_previous_votes.py`

```python
#!/usr/bin/env python3
"""
Discover how to detect previous votes
We need:
1. List of pools user has voted for
2. Weight allocated to each pool
3. Epoch/period information
"""

# Approach 1: Iterate through all pools and check weights(pool)
# Approach 2: Listen to Vote events (requires archive node)
# Approach 3: Query voter.poolVote(user) or similar
```

**Tasks:**
1. Test if voter contract has a function to list user's votes
2. Fallback: batch-check weights for all known pools
3. Display current votes in side panel (if any)
4. Show "Modify Votes" vs "New Votes" flow

**Expected Outputs:**
- Function to get user's current vote allocations
- UI to show "Current Votes" section
- Ability to modify existing votes (not reset)

### Phase 4: Vote Reset Discovery

**Goal:** Understand if/how to clear previous votes before casting new ones

**Python Script:** `scripts/discover_vote_reset.py`

```python
#!/usr/bin/env python3
"""
Discover vote reset mechanics
Questions:
1. Does vote() overwrite previous votes or add to them?
2. Is there a reset() function?
3. Do we need to call reset() before vote()?
"""

# Check for reset() function on Voter contract
# Test vote behavior: incremental vs. replacement
```

**Tasks:**
1. Check if voter.reset() exists
2. Determine if reset is required before voting
3. Test vote transaction behavior (replace vs. add)
4. Document reset workflow if needed

**Expected Outputs:**
- Reset function signature (if exists)
- Documentation of vote behavior
- UI flow for reset + vote transaction

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal:** Set up infrastructure for RPC voting without breaking existing functionality

**Tasks:**

1. **Create vote transaction builder**
   - File: `extension/lib/vote-transaction-builder.js`
   - Functions:
     - `buildVoteTransaction(pools, percentages, votingPower)`
     - `validateVoteInputs(pools, percentages)`
     - `encodeVoteData(poolAddresses, weights)`
   - Dependencies: Uses existing `blackhole-rpc-client.js`

2. **Create MetaMask integration module**
   - File: `extension/lib/metamask-integration.js`
   - Functions:
     - `connectWallet()` - Request account access
     - `getConnectedAccount()` - Get current account
     - `sendVoteTransaction(transactionData)` - Submit to MetaMask
     - `waitForTransactionConfirmation(txHash)` - Monitor status
   - Error handling for common issues (user rejection, insufficient gas, etc.)

3. **Python exploration scripts**
   - `scripts/discover_voter_abi.py` - Extract vote function ABI
   - `scripts/discover_voting_power.py` - Get user balance/voting power
   - `scripts/test_vote_encoding.py` - Test transaction encoding
   - `scripts/simulate_vote_transaction.py` - Dry-run vote transaction

4. **Testing**
   - Test transaction encoding with known pool addresses
   - Verify weight calculations match web UI
   - Test MetaMask connection flow

**Deliverables:**
- Working transaction builder (tested with console logs)
- MetaMask connection working
- Python scripts document all required RPC calls
- ABI for vote function confirmed

### Phase 2: Side Panel UI Enhancement (Week 2)

**Goal:** Add pool selection and vote configuration UI to side panel

**Tasks:**

1. **Pool selection UI**
   - Add checkboxes to pool list in recommendations view
   - Add "Selected: X pools" counter at top
   - Persist selections in memory (not chrome.storage yet)
   - Update existing "Select All" / "Clear All" buttons to work with checkboxes
   - Add visual distinction for selected pools (highlight, different background)

2. **Vote configuration view**
   - New tab or collapsible section: "Configure Votes"
   - List selected pools with percentage inputs
   - "Split Evenly" button to auto-calculate percentages
   - Real-time percentage total calculator
   - Validation: Show error if total ≠ 100%
   - Show vote preview: Pool name → X% → Y votes (calculated from voting power)

3. **Voting power display**
   - Fetch user's veBLACK balance via RPC
   - Display at top of side panel: "Your Voting Power: X veBLACK"
   - Show already allocated votes (if any)
   - Show available votes remaining

4. **State management**
   - Create `extension/lib/vote-state-manager.js`
   - Track: selected pools, percentages, voting power
   - Sync between different panel views
   - Persist to chrome.storage.local (survive browser restart)
   - Clear state after successful vote transaction

**Deliverables:**
- Enhanced side panel with pool selection checkboxes
- Vote configuration UI working
- Voting power display accurate
- State persists across panel reopens

### Phase 3: Transaction Preview & Submission (Week 3)

**Goal:** Complete the voting flow with transaction preview and MetaMask signing

**Tasks:**

1. **Transaction preview UI**
   - New section/modal: "Review & Submit"
   - Summary display:
     ```
     ┌───────────────────────────────────────┐
     │ Vote Transaction Preview              │
     ├───────────────────────────────────────┤
     │ Pools: 5                              │
     │ Total Voting Power: 10,000 veBLACK    │
     │                                       │
     │ CL200-WAVAX/USDC: 20% → 2,000 votes  │
     │ CL50-USDC/USDt: 15% → 1,500 votes    │
     │ ...                                   │
     │                                       │
     │ Estimated Gas: ~0.002 AVAX (~$0.05)  │
     ├───────────────────────────────────────┤
     │ [Cancel] [Submit to MetaMask]        │
     └───────────────────────────────────────┘
     ```
   - Gas estimation via `eth_estimateGas`
   - Warnings for edge cases (voting for pool with 0 TVL, etc.)

2. **Transaction submission**
   - "Submit to MetaMask" button triggers MetaMask popup
   - Show transaction status: "Waiting for signature..."
   - After signing: "Transaction submitted: 0xabc..."
   - Monitor transaction: "Confirming... (1/3 blocks)"
   - Success: "✅ Votes submitted successfully!"
   - Error handling: "❌ Transaction failed: [reason]"

3. **Post-vote actions**
   - Clear vote configuration state
   - Refresh pool data to show new vote weights
   - Show success message with transaction link
   - Update voting power display (now 0 available)

4. **Error handling**
   - MetaMask not installed → Show installation instructions
   - User rejects transaction → "Transaction cancelled by user"
   - Insufficient gas → "Add more AVAX for gas"
   - Contract revert → Parse error message and show user-friendly explanation
   - Network errors → "Network error, please try again"

**Deliverables:**
- Complete voting flow working end-to-end
- Transaction preview shows accurate data
- MetaMask integration robust
- Error messages helpful and user-friendly

### Phase 4: Advanced Features (Week 4)

**Goal:** Add quality-of-life features and optimizations

**Tasks:**

1. **Vote modification support**
   - Detect if user has already voted this epoch
   - Show "Current Votes" section in side panel
   - Pre-fill vote configuration with current allocations
   - Support incremental changes (add/remove pools, adjust percentages)
   - Handle reset() if required before re-voting

2. **Vote presets/templates**
   - Save vote configurations as presets
   - "Top 5 Pools by Rewards" → one-click apply
   - "Last Week's Votes" → reuse previous allocation
   - Custom presets: user can name and save configurations
   - Stored in chrome.storage.local

3. **Batch operations UI**
   - "Quick Vote: Top 5" button → Select top 5, split evenly, submit (3 clicks total)
   - "Quick Vote: Top 10" button
   - Configurable in settings: default split strategy (even, by rewards, by APR)

4. **Transaction history**
   - Store last 10 vote transactions in chrome.storage.local
   - Show in side panel: "Recent Votes" tab
   - Display: timestamp, pools voted, transaction hash
   - Link to Snowtrace for details

5. **Settings integration**
   - Add setting: "Default vote method" (RPC vs. Web UI)
   - Add setting: "Auto-refresh after vote" (yes/no)
   - Add setting: "Show gas estimates" (yes/no)
   - Add setting: "Confirm before submit" (yes/no, default yes)

**Deliverables:**
- Vote modification working (if user already voted)
- Presets feature working
- Quick vote buttons functional
- Transaction history tracking
- New settings available

### Phase 5: Testing & Documentation (Week 5)

**Goal:** Ensure robustness and document everything

**Tasks:**

1. **Comprehensive testing**
   - Test with 1 pool, 5 pools, 10 pools, 20+ pools
   - Test vote modification (changing existing votes)
   - Test edge cases: 0.1% allocations, 99.9% to one pool
   - Test error scenarios: insufficient gas, network failures, MetaMask rejection
   - Test with different voting power amounts (100 veBLACK, 10,000 veBLACK, 1M veBLACK)
   - Test state persistence across browser restart
   - Test on different browsers (Chrome, Edge, Brave)

2. **Performance testing**
   - Measure time from "Submit" to transaction confirmation
   - Compare with web UI method (search + select + split + vote)
   - Document performance improvements
   - Optimize if needed (batch RPC calls, reduce re-renders)

3. **User documentation**
   - Update `docs/USAGE_GUIDE.md` with RPC voting instructions
   - Create `docs/RPC_VOTING_USER_GUIDE.md` with screenshots
   - Document differences between RPC voting and web UI voting
   - Create troubleshooting section for common issues

4. **Developer documentation**
   - Document transaction encoding format
   - Document weight calculations
   - Document RPC endpoints used
   - Create API reference for vote-transaction-builder.js
   - Add JSDoc comments to all new functions

5. **Migration guide**
   - Document for users: "How to switch to RPC voting"
   - Explain benefits: faster, more reliable, no web UI needed
   - Provide fallback: Web UI method still available as backup

**Deliverables:**
- All tests passing
- Performance benchmarks documented
- User guide complete with screenshots
- Developer documentation complete
- Migration guide ready

---

## RPC Endpoints & Functions Reference

### Voter Contract (0xe30d0c8532721551a51a9fec7fb233759964d9e3)

| Function | Selector | Purpose | Parameters | Returns |
|----------|----------|---------|------------|---------|
| `vote(address[],uint256[])` | TBD | Submit votes | Pool addresses, weights | - |
| `reset()` | TBD | Clear previous votes | - | - |
| `weights(address)` | 0xa7cac846 | Get pool votes | Pool address | uint256 |
| `totalWeight()` | 0x96c82e57 | Get total votes | - | uint256 |
| `poke(address)` | TBD | Update vote weights | User address | - |

### VeBLACK Token (0xEac562811cc6abDbB2c9EE88719eCA4eE79Ad763)

| Function | Selector | Purpose | Parameters | Returns |
|----------|----------|---------|------------|---------|
| `balanceOf(address)` | 0x70a08231 | Get veBLACK balance | User address | uint256 |
| `locked(address)` | TBD | Get lock details | User address | struct |

### MetaMask Methods

| Method | Purpose | Parameters |
|--------|---------|------------|
| `eth_requestAccounts` | Connect wallet | - |
| `eth_accounts` | Get connected accounts | - |
| `eth_sendTransaction` | Submit transaction | Transaction object |
| `eth_estimateGas` | Estimate gas cost | Transaction object |
| `eth_getTransactionReceipt` | Check tx status | Transaction hash |

---

## UI/UX Design Specifications

### Side Panel Layout (Enhanced)

```
┌─────────────────────────────────────────────────┐
│ Blackhole DEX Tools                             │
├─────────────────────────────────────────────────┤
│ [Pools] [Vote Config] [Settings]        (tabs)  │
├─────────────────────────────────────────────────┤
│                                                  │
│ 💼 Voting Power: 10,000 veBLACK                 │
│    Allocated: 0 | Available: 10,000             │
│ 🔗 Wallet: 0xabc...def (Connected)              │
│                                                  │
│ ✓ Selected: 5 pools                             │
│ [Select Top 5] [Select Top 10] [Clear All]      │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ Search: [________________]  [Refresh]       │ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ Pool Recommendations                             │
│ ┌─────────────────────────────────────────────┐ │
│ │ ☑ CL200-WAVAX/USDC                          │ │
│ │   Rewards: $1,234 | VAPR: 45.2%             │ │
│ │   Votes: 12,500 → Est. return: $125/week    │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ ☐ CL50-USDC/USDt                            │ │
│ │   Rewards: $987 | VAPR: 38.1%               │ │
│ │   Votes: 15,234 → Est. return: $98/week     │ │
│ └─────────────────────────────────────────────┘ │
│ ...                                              │
│                                                  │
│ [← Back] [Configure Votes →]                    │
└─────────────────────────────────────────────────┘
```

### Vote Configuration Tab

```
┌─────────────────────────────────────────────────┐
│ Vote Configuration                               │
├─────────────────────────────────────────────────┤
│                                                  │
│ Total: 100% ✓                                   │
│ Voting Power: 10,000 veBLACK                     │
│                                                  │
│ [Split Evenly] [Split by Rewards] [Clear All]   │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ CL200-WAVAX/USDC                            │ │
│ │ [20] % → 2,000 votes                        │ │
│ │ Est. return: $125/week                      │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ CL50-USDC/USDt                              │ │
│ │ [20] % → 2,000 votes                        │ │
│ │ Est. return: $98/week                       │ │
│ └─────────────────────────────────────────────┘ │
│ ...                                              │
│                                                  │
│ [← Back to Pools] [Review & Submit →]           │
└─────────────────────────────────────────────────┘
```

### Transaction Preview Modal

```
┌─────────────────────────────────────────────────┐
│ Review Vote Transaction                          │
├─────────────────────────────────────────────────┤
│                                                  │
│ You are voting on 5 pools:                      │
│                                                  │
│ • CL200-WAVAX/USDC: 20% → 2,000 votes           │
│ • CL50-USDC/USDt: 20% → 2,000 votes             │
│ • CL100-WAVAX/BLACK: 20% → 2,000 votes          │
│ • vAMM-GCROC/WAVAX: 20% → 2,000 votes           │
│ • CL200-USDC/DAI: 20% → 2,000 votes             │
│                                                  │
│ Total: 100% | 10,000 votes                      │
│                                                  │
│ Estimated rewards: $446/week                     │
│ Estimated gas cost: ~0.002 AVAX ($0.05)         │
│                                                  │
│ ⚠️  This will replace your current votes (if any)│
│                                                  │
│ [Cancel] [Submit to MetaMask]                   │
└─────────────────────────────────────────────────┘
```

### Transaction Status Messages

```
⏳ Waiting for MetaMask signature...
📤 Transaction submitted: 0xabc...
⏱️  Confirming... (Block 1/3)
✅ Votes submitted successfully!
   View on Snowtrace: [link]
```

---

## Risk Assessment & Mitigation

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Vote function signature unknown | Medium | High | Phase 1 discovery scripts; analyze existing transactions |
| Weight scaling incorrect | Medium | High | Test with small amounts first; verify against web UI |
| MetaMask integration issues | Low | Medium | Use well-documented ethereum provider API |
| Gas estimation failures | Low | Low | Hardcode reasonable defaults (0.005 AVAX) |
| Transaction reverts | Medium | Medium | Implement validation before submission |
| State synchronization bugs | Medium | Low | Thorough testing of state management |

### User Experience Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Users confused by new UI | Medium | Low | Clear instructions, tooltips, user guide |
| Users lose MetaMask access | Low | High | Maintain web UI voting as fallback |
| Users make mistakes in percentages | Medium | Medium | Validation, warnings, preview before submit |
| Users vote for wrong pools | Low | High | Clear preview, confirmation dialog |

### Security Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Malicious transaction data | Very Low | Critical | Code review, transaction preview visible to user |
| Phishing (fake MetaMask) | Low | High | User education, verify MetaMask domain |
| Private key exposure | Very Low | Critical | Never handle private keys (MetaMask does this) |

---

## Success Metrics

### Performance Metrics

| Metric | Current (Web UI) | Target (RPC) | Improvement |
|--------|------------------|--------------|-------------|
| Time to select 5 pools | ~7 seconds | <1 second | 7x faster |
| Time to split votes | ~3 seconds | <1 second | 3x faster |
| Time to submit votes | ~10 seconds | 2-3 seconds | 3-5x faster |
| **Total time (select + split + vote)** | **~20 seconds** | **~5 seconds** | **4x faster** |

### User Experience Metrics

- ✅ No dependency on web UI navigation
- ✅ No DOM scraping (100% reliable)
- ✅ Works even if blackhole.xyz is down (data from RPC)
- ✅ Clear transaction preview (users see exactly what they're signing)
- ✅ One-click voting for common scenarios (top 5, top 10)

### Adoption Metrics

- Target: 50% of extension users switch to RPC voting within 1 month
- Measurement: Track usage in chrome.storage (RPC votes vs. web UI votes)
- Feedback: Add "Rate this feature" prompt after successful vote

---

## Testing Strategy

### Unit Tests

**File:** `tests/test_vote_transaction_builder.js`

- Test vote data encoding with various inputs
- Test validation logic (percentages, pool addresses)
- Test weight calculations
- Test error cases (invalid addresses, negative percentages)

### Integration Tests

**File:** `tests/test_rpc_voting_flow.js`

- Test full flow: select pools → configure → preview → submit
- Test state persistence across panel reopens
- Test wallet connection/disconnection
- Mock MetaMask responses

### Manual Testing Checklist

- [ ] Connect wallet via MetaMask
- [ ] Select 1 pool, configure 100%, submit
- [ ] Select 5 pools, split evenly, submit
- [ ] Select 10 pools, manual percentages, submit
- [ ] Test vote modification (change existing votes)
- [ ] Test with insufficient veBLACK (should show error)
- [ ] Test with invalid percentages (should show validation error)
- [ ] Test MetaMask rejection (cancel transaction)
- [ ] Test network error (disconnect internet)
- [ ] Verify transaction on Snowtrace
- [ ] Verify votes updated on blackhole.xyz/vote
- [ ] Test on Chrome, Edge, Brave browsers

### Python Testing Scripts

**File:** `scripts/test_vote_transaction.py`

```python
#!/usr/bin/env python3
"""
Test vote transaction encoding and submission
Dry-run mode: encode transaction without submitting
"""

from web3 import Web3
import json

# Encode a test vote transaction
pools = [
    "0x9A6142eF0766915dB02066f791D969C22eba1dcA",  # CL200-WAVAX/BLACK
    "0x78F5A53731564894A7e4FfF827a88E5FbF9cfCb6",  # vAMM-GCROC/WAVAX
]
weights = [5000, 5000]  # 50% each (assuming 10,000 total voting power)

# Encode vote(address[], uint256[])
# Print encoded transaction data
# Verify against known good transaction
```

---

## File Structure (New Files)

```
extension/
├── lib/
│   ├── vote-transaction-builder.js       (NEW - Phase 1)
│   ├── metamask-integration.js            (NEW - Phase 1)
│   ├── vote-state-manager.js              (NEW - Phase 2)
│   └── vote-presets-manager.js            (NEW - Phase 4)
├── sidepanel.html                         (MODIFIED - Phase 2)
├── sidepanel.js                           (MODIFIED - Phases 2-3)
└── sidepanel.css                          (MODIFIED - Phase 2)

scripts/
├── discover_voter_abi.py                  (NEW - Phase 1)
├── discover_voting_power.py               (NEW - Phase 1)
├── discover_previous_votes.py             (NEW - Phase 1)
├── discover_vote_reset.py                 (NEW - Phase 1)
├── test_vote_encoding.py                  (NEW - Phase 1)
├── simulate_vote_transaction.py           (NEW - Phase 1)
└── test_vote_transaction.py               (NEW - Phase 5)

tests/
├── test_vote_transaction_builder.js       (NEW - Phase 5)
└── test_rpc_voting_flow.js                (NEW - Phase 5)

docs/
├── RPC_DRIVEN_VOTING_PLAN.md              (THIS FILE)
├── RPC_VOTING_USER_GUIDE.md               (NEW - Phase 5)
└── VOTE_TRANSACTION_API.md                (NEW - Phase 5)
```

---

## Next Steps

### Immediate Actions (This Week)

1. ✅ Create feature branch: `feature/rpc-driven-voting`
2. ✅ Create this planning document
3. 🔲 Run Python discovery scripts to find voter.vote() ABI
4. 🔲 Analyze recent vote transactions on Snowtrace
5. 🔲 Document exact function signature and weight format
6. 🔲 Create prototype vote transaction builder in Python
7. 🔲 Test transaction encoding with known data

### Phase 1 Kickoff (Next Week)

1. 🔲 Create `vote-transaction-builder.js` skeleton
2. 🔲 Create `metamask-integration.js` skeleton
3. 🔲 Test MetaMask connection from extension
4. 🔲 Implement vote data encoding
5. 🔲 Test encoding against Python prototype

### Questions to Answer (Discovery Phase)

- [ ] What is the exact function signature of voter.vote()?
- [ ] Are weights in wei (1e18) or absolute votes or percentage?
- [ ] Is there a maximum number of pools per vote transaction?
- [ ] Does vote() replace existing votes or add to them?
- [ ] Is reset() required before voting?
- [ ] How to get user's current vote allocations?
- [ ] How to get user's available voting power?
- [ ] What are the gas costs for voting (1 pool vs. 10 pools)?

---

## References

### Existing Documentation
- `docs/VOTE_SELECTION_IMPROVEMENT_PLAN.md` - Original improvement ideas
- `docs/RPC_SOLUTION.md` - RPC endpoints discovered
- `extension/lib/blackhole-rpc-client.js` - Existing RPC infrastructure

### External Resources
- Voter Contract: https://snowtrace.io/address/0xe30d0c8532721551a51a9fec7fb233759964d9e3
- VeBLACK Token: https://snowtrace.io/address/0xEac562811cc6abDbB2c9EE88719eCA4eE79Ad763
- MetaMask Docs: https://docs.metamask.io/wallet/how-to/send-transactions/
- Web3.js Docs: https://web3js.readthedocs.io/

### Similar Projects
- Velodrome Voting UI (Optimism)
- Curve Voting UI (Ethereum)
- Balancer Voting UI (Multiple chains)

---

## Conclusion

This plan outlines a comprehensive approach to implementing RPC-driven voting in the Blackhole DEX Tools extension. The phased approach allows for incremental development, testing, and validation while maintaining the existing functionality as a fallback.

The key innovation is eliminating the dependency on DOM manipulation and the Blackhole web UI, providing users with a faster, more reliable, and more user-friendly voting experience entirely within the browser extension.

**Estimated Timeline:** 5 weeks (1 week per phase)
**Estimated Effort:** ~80-100 hours total
**Risk Level:** Medium (requires RPC discovery and MetaMask integration)
**Expected Impact:** High (4x faster voting, 100% reliability, improved UX)

---

*Last Updated: 2026-01-25*
*Branch: feature/rpc-driven-voting*
*Status: Planning Phase*
