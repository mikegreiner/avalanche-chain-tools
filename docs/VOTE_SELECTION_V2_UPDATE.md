# Vote Selection & Split Updates (v2)

**Date:** January 25, 2026
**Status:** Implemented & Verified

## Overview
This update addresses critical reliability issues with the "Split Votes" feature, particularly when selecting a large number of pools (12+), and introduces a new "Select Top N" utility for faster selection.

## 1. Split Votes Reliability (Fix)
**Problem:** 
When splitting votes across >7 pools (causing the list to scroll), the previous logic would fail to find input fields for pools that were not currently visible in the virtual DOM. It also struggled with React re-renders detaching inputs mid-process.

**Solution: "Scan-Process-One-Then-Retry" Strategy**
The `splitVotesEvenly` function was completely refactored to:
1.  **Sync with UI:** Prioritize fetching the pool list directly from the open Vote Panel to ensure 100% alignment with what the user sees.
2.  **Reset Scroll:** Always start from the top of the list.
3.  **Single-Input Step:** Find *one* actionable input in the current view, update it, and then *immediately stop* the scan.
4.  **Re-Query:** Wait for a brief moment (allowing React to re-render), then restart the scan from scratch. This prevents "ghost writes" to stale DOM elements.
5.  **Sweep Scroll:** If no actionable inputs are found in the current view, scroll down incrementally and repeat.
6.  **Case-Insensitivity:** All pool address matching is now case-insensitive.

**Result:** 
- Successfully splits 100% voting power across 12+ pools (tested up to 50).
- Correctly handles pre-selected pools combined with newly selected ones.

## 2. New Feature: "Select Top N"
**Description:**
A new row has been added to the side panel above the action buttons.

**UI:**
- **Input:** Number field (default: 5).
- **Button:** "Pools" (Select).

**Functionality:**
- One-click selection of the top $N$ pools from the current recommendation list (respecting all active filters like "Hide vAMM").
- Status feedback provided ("Selected top 5 pools").

## 3. Cleanup
- **Removed:** The "Go to Voting Page" button at the bottom of the recommendation list was redundant and non-functional; it has been removed.
- **Default Value:** "Select Top" default changed from 10 to 5 for better usability.

## Testing
Two new local tests were created to verify the logic:
- `tests/test_split_math.js`: Validates the mathematical distribution logic (ensuring 100% sum).
- `tests/test_virtual_scroll_split.js`: Simulates a virtual scrolling DOM environment to verify the "Sweep" and search logic.
