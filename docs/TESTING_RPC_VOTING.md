# Testing RPC Voting Integration

## Quick Start

The RPC voting feature is now integrated into the extension side panel!

### How to Test (Without Submitting Real Votes)

1. **Load the Extension**
   ```bash
   # In Chrome/Brave:
   # 1. Go to chrome://extensions/
   # 2. Enable "Developer mode"
   # 3. Click "Load unpacked"
   # 4. Select the extension/ directory
   ```

2. **Open the Side Panel**
   - Navigate to https://blackhole.xyz/vote
   - Click the extension icon
   - Click "Open side panel" (or it may auto-open)

3. **Configure RPC Voting Mode**
   - Click the "Settings" tab
   - Find "Voting Method" section
   - Select "RPC Direct (Recommended)" ✨
   - The setting auto-saves

4. **Connect Your Wallet**
   - In the header, you'll see "Connect Wallet" button
   - Click it to connect MetaMask
   - Approve the connection
   - Your wallet address will appear: 🔗 0xabc...def

5. **View Your veBLACK NFTs**
   - After connecting, your NFTs will auto-load
   - You'll see a dropdown showing your NFT(s):
     ```
     Token #24128 (2,237.23 veBLACK)
     ```
   - Select which NFT you want to vote with

6. **Select Pools & Configure Votes**
   - Go to "Recommendations" tab
   - Check the boxes next to pools you want to vote for
   - In RPC mode, each pool will have a percentage input field
   - Enter percentages (e.g., 20%, 30%, 50%)
   - **Total must equal 100%** → "Total: 100% ✓ Ready"

7. **Split Evenly (Quick Method)**
   - Select multiple pools
   - Click "Split Evenly" button
   - Percentages auto-calculate to 100%

8. **Preview Transaction (NO SUBMISSION)**
   - Click "Preview Vote" button
   - A modal opens showing:
     - veBLACK NFT ID
     - Total voting power
     - Each pool with votes allocated
     - **"Preview Mode" warning** (safe, won't submit)
   - Review all details

9. **Close Preview (Testing Mode)**
   - Click "Close Preview" to cancel
   - Nothing was submitted
   - Try different configurations
   - Repeat steps 6-8 as many times as you want

10. **Actually Submit (Optional, LIVE)**
    - ⚠️ **WARNING: This submits a real transaction!**
    - Only click "Submit to MetaMask" if you want to actually vote
    - MetaMask will open with transaction preview
    - You can still reject in MetaMask
    - Gas cost: ~0.002-0.005 AVAX (~$0.05-0.12)

---

## Testing Scenarios

### Scenario 1: Single Pool Vote
- Select 1 pool
- Set 100%
- Preview → should show full voting power to that pool

### Scenario 2: Multi-Pool Split
- Select 5 pools
- Click "Split Evenly"
- Each should show 20%
- Total should be 100%

### Scenario 3: Custom Allocation
- Select 3 pools
- Pool A: 50%
- Pool B: 30%
- Pool C: 20%
- Preview → verify vote amounts

### Scenario 4: Validation Errors
- Select pools but total ≠ 100%
- Try to preview
- Should show validation error

### Scenario 5: No NFT
- If your address has no veBLACK NFTs
- Should show: "No veBLACK NFTs found"
- Can't vote (as expected)

### Scenario 6: Multiple NFTs
- If you have multiple NFTs
- Dropdown should show all of them
- Select different ones and see voting power change

---

## Comparison: Web UI vs RPC Mode

### Web UI Mode (Legacy)
1. Settings → Select "Web UI (Legacy)"
2. Select pools
3. Click "Split Votes" (manipulates web page DOM)
4. Click "Vote" (clicks web page button)
5. Takes ~20 seconds for 5 pools

### RPC Mode (New)
1. Settings → Select "RPC Direct"
2. Connect wallet
3. Select NFT
4. Select pools + percentages
5. Click "Preview Vote"
6. Review and submit
7. Takes ~5 seconds total ✨

---

## UI Features in RPC Mode

### Header (New)
```
🔗 0xabc...def (Connected)
```
- Shows wallet connection status
- Auto-connects if previously connected

### RPC Controls (New)
```
veBLACK NFT: [Token #24128 (2,237 veBLACK) ▼]

Total: 100% ✓ Ready
```
- NFT selector dropdown
- Live percentage total calculator
- Status indicator (✓ Ready / ✗ Too high / ✗ Too low)

### Pool Rows (Enhanced)
```
☑ CL200-WAVAX/USDC
   Rewards: $1,234 | VAPR: 45.2%
   [20.00] %  ← NEW percentage input
```

### Buttons (Conditional)
- **RPC Mode:** "Split Evenly" | "Preview Vote"
- **Web UI Mode:** "Split Votes" | "Vote"

### Preview Modal
```
┌────────────────────────────────────┐
│ Vote Transaction Preview      [×]  │
├────────────────────────────────────┤
│ veBLACK NFT: #24128               │
│ Voting Power: 2,237.23 veBLACK    │
│ Pools: 3                           │
│                                    │
│ 0xA02E...6Ea0                     │
│ 20.00% → 447.45 votes             │
│                                    │
│ 0x9A61...1dcA                     │
│ 30.00% → 671.17 votes             │
│                                    │
│ ...                                │
│                                    │
│ ℹ️ Preview Mode                    │
│ This has NOT been submitted       │
│                                    │
│ [Close Preview] [Submit to MM]    │
└────────────────────────────────────┘
```

---

## Troubleshooting

### "Connect Wallet" button not showing
- Make sure Settings → Voting Method = "RPC Direct"
- Refresh the side panel

### "No veBLACK NFTs found"
- Your address has no locked BLACK tokens
- You need to lock BLACK to get veBLACK NFTs
- Visit blackhole.xyz to lock BLACK

### Percentage inputs not showing
- Switch to "RPC Direct" in Settings
- Make sure you're on the Recommendations tab
- Try refreshing pool data

### "MetaMask not installed" error
- Install MetaMask extension
- Restart browser
- Try connecting again

### Transaction preview shows wrong data
- Double-check pool selection (checkboxes)
- Verify percentages sum to 100%
- Make sure correct NFT is selected

### Can't submit transaction
- Make sure you're on Avalanche network in MetaMask
- Check you have enough AVAX for gas (~0.005 AVAX)
- Try switching networks and back

---

## Files Modified

```
extension/
├── sidepanel.html              (Enhanced: wallet status, NFT selector, modal)
├── sidepanel.js                (Enhanced: RPC voting init, settings)
├── sidepanel-rpc.css           (New: modal and RPC UI styles)
│
└── lib/
    ├── veblack-nft-client.js         (New: NFT functions)
    ├── vote-transaction-builder.js   (New: transaction encoding)
    ├── metamask-integration.js       (New: wallet integration)
    └── sidepanel-rpc-voting.js       (New: UI integration)
```

---

## Next Steps

After testing, you can:

1. **Use it for real voting**
   - Much faster than web UI
   - Transaction preview for safety
   - Same security (MetaMask signs everything)

2. **Report issues**
   - Open GitHub issue with details
   - Include console errors if any

3. **Try edge cases**
   - Very small percentages (0.1%)
   - Many pools (10+ pools)
   - Multiple NFTs

4. **Compare performance**
   - Time the Web UI method
   - Time the RPC method
   - Should be ~4x faster!

---

## Safety Notes

✅ **Safe to test:**
- Connecting wallet
- Loading NFTs
- Selecting pools
- Entering percentages
- Clicking "Preview Vote"
- Clicking "Close Preview"

⚠️ **Real transaction:**
- Clicking "Submit to MetaMask"
- Approving in MetaMask popup
- **These actually submit votes on-chain!**

💡 **Tip:** Test with "Preview Vote" as many times as you want. Only the final "Submit to MetaMask" → "Confirm" in MetaMask actually sends a transaction.

---

**Happy Testing! 🚀**

*If you find any bugs or have suggestions, please let us know!*
