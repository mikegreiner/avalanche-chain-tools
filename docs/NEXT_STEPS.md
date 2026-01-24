# Next Steps for vAMM/sAMM Pool Discovery

## Current Status

✅ **Completed:**
- Enhanced API Discovery tool (working well)
- Analyzed captured API logs
- Identified that site uses RPC calls, not HTTP APIs for pool data
- Found 145 multicall requests in latest capture

❌ **Still Missing:**
- vAMM pool endpoints/contracts
- sAMM pool endpoints/contracts
- Proper RPC call decoding

## Recommended Next Steps (Priority Order)

### 1. **Extract Contract Addresses from Multicalls** (High Priority)

Even without perfect ABI decoding, we can extract contract addresses from the hex data:

**Action:** Create a simple hex pattern matcher to find Ethereum addresses in multicall data
- Ethereum addresses are 20 bytes (40 hex chars)
- In ABI encoding, they're left-padded to 32 bytes (64 hex chars)
- We can scan for valid address patterns

**Why:** This will tell us which contracts are being called, even if we can't decode the full structure.

### 2. **Query the Voter Contract for All Pools** (High Priority)

The voter contract likely has a method to list all registered pools regardless of type.

**Action:** 
- Query `allPoolsLength()` to get total pool count
- Query `allPools(uint256)` for each index to get all pool addresses
- This should include CL, vAMM, and sAMM pools

**Why:** The voter contract is the central registry - it should know about all pools.

### 3. **Identify Factory Contracts** (Medium Priority)

vAMM and sAMM pools are likely created by factory contracts.

**Action:**
- Research/document known vAMM and sAMM factory contracts on Avalanche
- Query factory contracts for pool lists
- Check if factories have `allPools()` or similar methods

**Why:** Factory contracts typically maintain lists of pools they've created.

### 4. **Monitor RPC Calls When vAMM/sAMM Pools Appear** (Medium Priority)

Use the enhanced API Discovery tool while interacting with vAMM/sAMM pools in the UI.

**Action:**
- Navigate to voting page
- Scroll/filter to find vAMM or sAMM pools
- Capture RPC calls that happen when these pools load
- Analyze which contracts are called

**Why:** This will show us exactly how the site fetches these pools.

### 5. **Improve RPC Decoder** (Lower Priority)

Fix the ABI decoding to properly extract all call details.

**Action:**
- Get verified Multicall3 ABI from official source
- Or implement robust manual parser
- Or use a specialized Multicall3 library

**Why:** Full decoding would be nice, but we can work around it with simpler approaches.

## Immediate Action Plan

### Step 1: Extract Addresses from Multicalls (Quick Win)

Create a simple script that:
1. Finds all multicall requests
2. Scans hex data for valid Ethereum addresses
3. Lists unique contracts being called
4. Groups by contract to see patterns

### Step 2: Query Voter Contract (Most Likely to Succeed)

Create a script that:
1. Connects to Avalanche RPC
2. Calls `allPoolsLength()` on voter contract
3. Iterates through all pools
4. For each pool, determines its type (CL/vAMM/sAMM) by checking:
   - Which factory created it
   - Contract code/interface
   - Pool metadata

### Step 3: Research Factory Contracts

Look for:
- vAMM factory contract address
- sAMM factory contract address
- Any registry contracts

## Tools to Create

1. **`scripts/extract_contracts_from_multicalls.py`** - Simple hex pattern matcher
2. **`scripts/query_voter_all_pools.py`** - Query voter for all pools
3. **`scripts/identify_pool_types.py`** - Determine pool type from contract

## Expected Outcome

After these steps, we should:
- Know which contracts are called for pool data
- Have a list of all pools from the voter contract
- Understand how to identify vAMM vs sAMM vs CL pools
- Be able to fetch pool data directly from contracts
