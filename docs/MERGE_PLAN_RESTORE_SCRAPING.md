# Merge Plan: Restore Scraping & Repo Cleanup

This document outlines the strategy for merging the `refactor/restore-scraping` branch back into `main`. This branch successfully organized the repository and resolved critical issues with the browser extension's data extraction logic.

## 1. Overview of Changes

### Repository Reorganization
- **Python Scripts**: All root-level `.py` files moved to `scripts/`.
- **Legacy JS**: Standalone automation scripts moved to `scripts/js/`.
- **Data & Assets**: Untracked and historical JSON, HAR, MHTML, and Image files moved to `data/`.
- **Documentation**: Consolidated various logs and research notes.

### Extension Logic (Critical Fixes)
- **Robust Pagination**: Restored and improved the ability to detect the `.size-per-page` selector, temporarily increase it to 100, and iterate through all pages.
- **Page 1 Extraction Fix**: Resolved a bug where the scraper skipped Page 1 data immediately after resizing.
- **Navigation Resilience**: The scraper now correctly identifies the end of the pool list by checking if the page number actually advances after a click.
- **View Restoration**: Added a forced return to Page 1 and multiple scroll-to-top attempts to ensure the user is left in a clean state after refresh.

### User Experience
- **Visual Feedback**: Created `ui-manager.js` and added CSS for a translucent "Refreshing Pools..." overlay.
- **State Management**: Integrated the overlay into the `fetchPoolData` lifecycle so users know when background scraping is active.

## 2. Pre-Merge Checklist

- [ ] **Functional Verification**:
    - [ ] Open Blackhole Voting page.
    - [ ] Trigger "Refresh" from the extension.
    - [ ] Verify "Refreshing Pools" overlay appears.
    - [ ] Verify console shows 100+ pools extracted.
    - [ ] Verify page returns to Page 1 (Top) at 10 items per page.
- [ ] **Build Integrity**:
    - [ ] Run `node extension/build_bundle.js` to ensure `content-bundle.js` is perfectly synced.
- [ ] **Linting**:
    - [ ] Verify no syntax errors in the browser console.

## 3. Merge Strategy

Since this branch involves significant file moves, we will use a standard merge to preserve the refactoring history.

```bash
# 1. Ensure you are on the refactor branch and everything is committed
git checkout refactor/restore-scraping
git status

# 2. Update main
git checkout main
git pull origin main

# 3. Merge the refactor branch
git merge refactor/restore-scraping

# 4. Resolve any conflicts (primarily README or manifest versioning)
# 5. Push to origin
git push origin main
```

## 4. Post-Merge Cleanup

1.  **Branch Deletion**: Once `main` is verified, the `refactor/restore-scraping` branch can be deleted.
2.  **Tagging**: Consider tagging the release as `v1.2.0` given the structural cleanup and UI additions.
3.  **Sync Feature Branches**: Any other active feature branches (like `feature/api-pool-data`) should be rebased onto `main` to adopt the new `scripts/` and `data/` structure.
