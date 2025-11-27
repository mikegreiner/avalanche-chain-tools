# Supermassive NFT Claim Enhancement

## Summary

Enhanced the Avalanche Transaction Narrator (v1.3.0) to display comprehensive Supermassive NFT information for claim transactions, including NFT token ID, locked amount, lock expiration date, and voting power.

## What Changed

### Before
```
**Description:** Burned 12.340999 BLACK (claim operation)
```

### After (Permalocked NFT)
```
**Description:** Claimed 12.340999 BLACK rewards (burned to zero address) from veBLACK NFT #4438 (18226.40 veBLACK permalocked)
```

For time-locked NFTs (voting power < locked amount due to decay):
```
**Description:** Claimed rewards from veBLACK NFT #1234 (103.27 BLACK locked until 2029-07-04, 93.04 veBLACK voting power)
```

## Features Added

### 1. NFT Token ID Detection
- Automatically extracts the veBLACK NFT token ID from claim transactions
- Parses RewardsClaimer event logs to identify which NFT was used

### 2. Locked Amount Display
- For burned/fully claimed NFTs: Shows the total amount that was locked (extracted from VotingEscrow Withdraw event)
- For active NFTs: Shows the current locked amount (queried from VotingEscrow contract)

### 3. Lock Expiration Date
- For active NFTs that still exist, displays when the lock expires
- Format: `YYYY-MM-DD` (e.g., `2026-12-31`)

### 4. Voting Power
- For active NFTs, displays the current voting power in veBLACK
- Calculated based on locked amount and time remaining until lock expiration
- Retrieved using `balanceOfNFT(uint256)` function from VotingEscrow contract

## Technical Details

### New Methods in `AvalancheTransactionNarrator`

#### 1. `get_nft_info_from_claim_logs(receipt, tx)`
Extracts NFT information from transaction logs:
- **RewardsClaimer Event**: Parses claim event to get token ID and claimed amount
  - Topic: `0xcae2990aa9af8eb1c64713b7eddb3a80bf18e49a94a13fe0d0002b5d61d58f00`
  - Data: `tokenId (uint256), amount (uint256), timestamp (uint256), week (uint256)`

- **VotingEscrow Withdraw Event**: Gets the locked amount for burned NFTs
  - Topic: `0xff04ccafc360e16b67d682d17bd9503c4c6b9a131f6be6325762dc9ffc7de624`
  - Data: `tokenId (uint256), locked_amount (uint256), ? (uint256), timestamp (uint256)`

#### 2. Enhanced `get_nft_locked_info(token_id)`
Now retrieves comprehensive NFT information:
- **locked(uint256)**: Gets locked amount and end timestamp
  - Function signature: `0xcbf9fe5f`
  - Returns: `(int128 amount, uint256 end)`
  
- **balanceOfNFT(uint256)**: Gets current voting power
  - Function signature: `0x8e8e2925`
  - Returns: `uint256 voting_power` (in veBLACK)

#### 3. Enhanced `describe_claim(token_transfers, tx, receipt)`
Now includes NFT information in claim descriptions:
- Displays NFT token ID for all claim operations
- Shows locked amount for burned NFTs (from Withdraw event)
- Shows lock expiration and voting power for active NFTs (from contract query)
- Handles both regular claims and burn/claim operations

## Example Transactions

### Burned/Fully Claimed NFT
Transaction: [0x57b9c3b46825b908bbdafefd24fb833056d845c765cdaa42ca416168356c6726](https://snowtrace.io/tx/0x57b9c3b46825b908bbdafefd24fb833056d845c765cdaa42ca416168356c6726)

**Output:**
```
### November 27, 2025 at 09:02:06 AM MST / November 27, 2025 at 04:02:06 PM UTC - [TX] Claim [SUCCESS]

**Transaction:** [0x57b9c3b4...](https://snowtrace.io/tx/0x57b9c3b46825b908bbdafefd24fb833056d845c765cdaa42ca416168356c6726)
**Description:** Burned 12.340999 BLACK (claim operation) from veBLACK NFT #4438 (12.34 BLACK was locked)
```

**NFT Information Shown:**
- Token ID: #4438
- Locked Amount: 12.34 BLACK (extracted from Withdraw event)

### Active NFT (Example)
For an active NFT that hasn't been fully claimed:

**Output:**
```
**Description:** Claimed Blackhole DEX Supermassive rewards: 5.123 BLACK from veBLACK NFT #1234 (100.00 BLACK locked until 2026-12-31, 75.50 veBLACK voting power)
```

**NFT Information Shown:**
- Token ID: #1234
- Locked Amount: 100.00 BLACK (total locked in the NFT)
- Lock End: 2026-12-31
- Voting Power: 75.50 veBLACK

## Contract Addresses

- **RewardsClaimer**: `0x88a49cfcee0ed5b176073dde12186c4c922a9cd0`
- **VotingEscrow**: `0xeac562811cc6abdbb2c9ee88719eca4ee79ad763`

## Usage

No changes to the command-line interface. The enhancement works automatically:

```bash
python3 avalanche_transaction_narrator.py YOUR_ADDRESS -d 7
```

## Testing

Added comprehensive tests:
- `test_get_nft_info_from_claim_logs()`: Tests NFT info extraction from transaction logs
- `test_describe_claim_with_nft_info()`: Tests claim description with NFT information

All tests pass successfully.

## Version

Current version: **1.3.0**

Check version:
```bash
python3 avalanche_transaction_narrator.py --version
```

## Technical Solution

### The Challenge
Initial attempts to query NFT data using raw HTTP requests to Snowtrace API and direct RPC calls failed with "execution reverted" errors. The issue was that proper ABI encoding/decoding is required.

### The Solution
Integrated `web3.py` library which handles:
- Proper ABI encoding/decoding
- Contract function calls through a Web3 provider
- Checksum address validation

### New Dependency
- Added `web3>=6.0.0` to `requirements.txt`

## Notes

- Uses `web3.py` to query VotingEscrow contract directly via Avalanche RPC
- For permalocked NFTs (lock_end = 0), displays "permalocked" status
- For time-locked NFTs (lock_end > 0), shows expiration date
- Voting power equals locked amount for permalocked NFTs
- Voting power decreases over time for time-locked NFTs (typical ve-model behavior)
- Falls back to showing claimed amount from transaction logs if web3.py is not available
