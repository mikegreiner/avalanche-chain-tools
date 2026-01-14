# Blackhole DEX Tools Browser Extension

**Version:** 1.1.1

A browser extension that brings powerful pool analysis and voting tools directly to the Blackhole DEX voting page. Get personalized pool recommendations, split votes evenly, and manage your voting selections using a convenient side panel.

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

### Usage

1. **Navigate to Voting Page**
   - Go to `https://blackhole.xyz/vote`
   - Wait for the page to fully load

2. **Open the Side Panel**
   - Click the extension icon in your browser toolbar
   - The side panel will open on the right side of your browser

3. **Configure Your Settings (First Run)**
   - Switch to the **Settings** tab
   - Enter your **voting power** (veBLACK amount) for personalized reward estimates
   - Adjust filters:
     - **Top N**: Number of recommendations (default: 10)
     - **Pool Name Filter**: Persistent filter (e.g., "WAVAX" to always only show WAVAX pools)
     - **Sort By**: Choose your ranking strategy (Auto, Reward, Profitability, Stability)
   - Settings auto-save instantly

4. **Vote with Recommendations**
   - Switch to the **Recommendations** tab
   - Use the **Filter** input to quickly find specific pools
   - Click **Select All** to select all recommended pools
   - Click **Split Votes** to evenly distribute your voting power
   - Click **Vote** to submit!

## 📖 Key Features

### Side Panel Interface
- **Persistent Workspace**: A dedicated sidebar that stays open while you browse
- **Two Tabs**: Separate views for Recommendations and Settings
- **Real-time Updates**: Recommendations update instantly as you change filters

### Advanced Filtering
- **Global Filter**: Set a persistent filter in Settings (e.g., "USDC") to always restrict recommendations
- **View Filter**: Use the quick filter in the Recommendations tab to narrow down the current list
- **Dual Logic**: Both filters work together (AND logic)
- **Smart Matching**: Supports partial matches and wildcards

### Voting Tools
- **Select All**: Select all currently visible recommendations
- **Clear All**: Deselect all pools across all pages (auto-scrolls to top)
- **Split Votes**: Automatically calculate and fill in even percentages
- **Smart Vote Button**: Finds and clicks the vote button for you### Action Buttons: Added "Vote", "Select All", "Clear All", and "Split Votes" buttons directly to the side panel
  - **Vote Button**: Smart "Vote" button finds the main page button or modal confirmation button automatically

## 🛠️ Development

This extension uses a modular structure in `lib/`. For the content script to work reliably on the voting page, these modules are bundled into `content-bundle.js`.

### Prerequisites
- Node.js installed

### Setup
```bash
cd extension
npm install
```

### Running Tests
```bash
cd extension
npm test
```

### Building the Bundle
If you modify any files in `lib/`, you must rebuild the bundle:
```bash
cd extension
npm run build
```
The build process includes an automatic validation step to ensure no ES module keywords (`import`/`export`) leak into the final bundle, preventing syntax errors in the browser.

## 🔧 Troubleshooting

### Panel Not Opening
- Ensure you are on `https://blackhole.xyz/vote` (or click the extension icon to verify permissions)
- Try refreshing the page

### "Error communicating with page"
- Refresh the webpage
- Ensure the extension is enabled/reloaded

### Scroll Position Issues
- The extension tries to scroll to the top after clearing votes. If it fails, manually scroll to the top to reset the view.

## 📁 File Structure

```
extension/
├── manifest.json          # Extension configuration (v1.1.1)
├── sidepanel.html        # Side panel UI
├── sidepanel.css         # Side panel styles
├── sidepanel.js          # Side panel logic
├── popup-helper.js       # Shared pool analysis logic
├── content-bundle.js     # Main content script (pool extraction & page interaction)
├── content.css           # Content styles (overlay remnants)
├── background.js         # Background service worker
├── icons/                # Extension icons
└── README.md             # This file
```

## 📄 License

See main repository LICENSE file.