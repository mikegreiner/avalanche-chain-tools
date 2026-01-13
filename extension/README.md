# Blackhole DEX Tools Browser Extension

**Version:** 1.0.1

A browser extension that brings powerful pool analysis and voting tools directly to the Blackhole DEX voting page. Get personalized pool recommendations, split votes evenly, and manage your voting selections all without leaving the page.

## 🚀 Quick Start

### Installation (Developer Mode)

1. **Open Extensions Page**
   - **Chrome/Edge**: Navigate to `chrome://extensions`
   - **Brave**: Navigate to `brave://extensions`
   - **Firefox**: Navigate to `about:debugging#/runtime/this-firefox` (requires different setup)

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

3. **Load the Extension**
   - Click "Load unpacked" button
   - Select the `extension/` folder from this repository
   - The extension should now appear in your extensions list

4. **Pin the Extension (Optional)**
   - Click the puzzle piece icon in your browser toolbar
   - Find "Blackhole DEX Tools" and click the pin icon to keep it visible

### First-Time Setup

1. **Navigate to Voting Page**
   - Go to `https://blackhole.xyz/vote`
   - Wait for the page to fully load

2. **Configure Your Settings**
   - Click the extension icon in your browser toolbar
   - Enter your **voting power** (veBLACK amount)
   - Adjust other filters as needed:
     - **Top N**: Number of recommendations (default: 10)
     - **Min Rewards**: Minimum total rewards filter (optional)
     - **Max Pool %**: Maximum percentage per pool (optional)
     - **Sort By**: Auto, reward, profitability, or stability
     - **Hide vAMM**: Toggle to hide vAMM pools
   - Settings are automatically saved

3. **View Recommendations**
   - The recommendations panel should appear on the voting page
   - If not visible, click the extension icon and ensure "Overlay" is enabled
   - You can drag the panel anywhere on the page

## 📖 Key Features

### Pool Recommendations
- **Smart Analysis**: Automatically extracts pool data from the voting page
- **Personalized Estimates**: Shows estimated USD rewards based on your voting power
- **Multiple Metrics**: Displays VAPR, votes, total rewards, and profitability scores
- **Visual Feedback**: Selected pools are highlighted in green

### Voting Tools
- **Select All**: Quickly select all recommended pools
- **Clear All**: Remove all current pool selections
- **Split Votes**: Automatically split your voting power evenly across selected pools
- **Individual Selection**: Click "Select" or "Deselect" on any recommendation

### Customization
- **Draggable Panel**: Click and drag the header to move the panel anywhere
- **Position Memory**: Panel position is saved and restored on reload
- **Filter Options**: Customize recommendations with various filters
- **Auto-Refresh**: Recommendations update automatically when filters change

## 🎯 Usage Guide

### Basic Workflow

1. **Set Your Voting Power**
   - Open extension popup
   - Enter your veBLACK voting power
   - Settings auto-save

2. **Review Recommendations**
   - Panel shows top pools ranked by your selected criteria
   - Each pool shows:
     - Rank number
     - Pool name
     - Key metrics (VAPR, votes, rewards)
     - Estimated USD reward for you
     - Profitability and stability scores

3. **Select Pools**
   - Click "Select All" to select all recommendations
   - Or click individual "Select" buttons
   - Selected pools show green highlight

4. **Allocate Votes**
   - Click "Split Votes" to evenly distribute voting power
   - Opens the voting dialog automatically
   - Fills in percentages for each selected pool
   - Adjust manually if needed

5. **Submit Your Vote**
   - Review allocations in the voting dialog
   - Click the vote button to submit

### Advanced Features

**Filtering Recommendations**
- **Min Rewards**: Filter out pools with low total rewards
- **Max Pool %**: Limit maximum percentage per pool (useful for diversification)
- **Sort By**: Choose sorting method:
  - `auto`: Balances rewards and stability
  - `reward`: Highest estimated USD rewards
  - `profitability`: Best profitability scores
  - `stability`: Most stable pools (higher vote density)

**Managing Selections**
- **Clear All**: Removes all pool selections (useful at epoch start)
- **Individual Deselect**: Click "Deselect" on any selected pool
- Works even if pools are not visible (scrolls to them automatically)

**Panel Management**
- **Drag to Reposition**: Click and drag the header to move the panel
- **Toggle Visibility**: Use the close button (×) or extension popup toggle
- **Position Persists**: Panel position is saved between sessions

## 🔧 Troubleshooting

### Recommendations Not Showing
- Ensure you're on `https://blackhole.xyz/vote`
- Check that "Overlay" is enabled in extension popup
- Refresh the page if needed
- Check browser console for errors (F12)

### Data Looks Incorrect
- Pool data is extracted from the page DOM
- If values seem off, the page structure may have changed
- Try refreshing the page
- Check that pools have loaded on the voting page

### Split Votes Not Working
- Make sure pools are selected first
- Ensure the voting dialog is open
- Check that your voting power is set in the extension popup
- Voting inputs use 1 decimal place (e.g., 33.3%)

### Panel Position Issues
- Panel position is saved per session
- If it's off-screen, clear browser storage or reload extension
- You can always drag it back to a visible position

## 📁 File Structure

```
extension/
├── manifest.json          # Extension configuration (v1.0.1)
├── popup.html            # Extension popup UI
├── popup.css             # Popup styles
├── popup.js              # Popup logic and settings
├── content-bundle.js     # Main content script (pool extraction & recommendations)
├── content.css           # Overlay styles
├── background.js         # Background service worker
├── icons/                # Extension icons
└── README.md             # This file
```

## 🛠️ Development

### Load Extension for Development

1. Follow the installation steps above
2. Make changes to extension files
3. Go to `chrome://extensions`
4. Click the refresh icon on the extension card
5. Reload the voting page to see changes

### Testing

See `tests/README.md` for information on running the test suite.

## 📝 Version History

### 1.0.1 (Current)
- 🐛 Fixed extension context invalidation errors (handles extension reloads gracefully)
- 🐛 Fixed overlay visibility when saved position was off-screen
- 🐛 Fixed "Clear All" to handle pools on multiple pagination pages
- ✨ "Clear All" now automatically navigates through all pages and returns to page 1
- 🐛 Improved percentage splitting for odd number of pools (1 decimal precision)
- 🐛 Fixed close button positioning within panel

### 1.0.0
- ✅ Pool recommendations with accurate data extraction
- ✅ Select/deselect pools with visual feedback
- ✅ Clear all votes functionality
- ✅ Split votes evenly across selected pools
- ✅ Draggable panel (horizontal and vertical)
- ✅ Dark-themed UI matching Blackhole DEX
- ✅ Styled scrollbar
- ✅ Position persistence
- ✅ Auto-refresh on filter changes

## 🔗 Related Tools

- `blackhole_pool_recommender.py` - Original Python CLI tool
- `track_pool_changes.py` - Pool tracking (future extension feature)
- `avalanche_transaction_narrator.py` - Transaction analysis (future extension feature)

## 📄 License

See main repository LICENSE file.
