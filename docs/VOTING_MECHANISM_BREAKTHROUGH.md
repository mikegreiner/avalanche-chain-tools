# Voting Mechanism BREAKTHROUGH

## ? CRITICAL DISCOVERIES

### 1. Function Selector = `merge(uint256,uint256)`
- **4byte.directory:** `0xd1c2babb` = `merge(uint256,uint256)`
- **VotingEscrow ABI:** Has `merge(uint256 _from, uint256 _to)` function
- **Transaction params:** 20156 (from), 4438 (to)

### 2. Voter Contract Found
- **Proxy:** `0xe30d0c8532721551a51a9fec7fb233759964d9e3`
- **Implementation:** `0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525`
- **Has:** `vote(uint256, address[], uint256[])` function

### 3. All Transactions Have Identical Parameters
- **All 5 transactions:** Same params (20156, 4438)
- This suggests **pools/weights are set separately** or stored

## Working Theory: How Voting Actually Works

### Hypothesis: Multi-Step Process

**Step 1: Set Pools/Weights (via UI or separate transaction)**
- User selects pools and weights on voting page
- This might be:
  - Stored in browser/UI state
  - Sent via a separate transaction (not found yet)
  - Set via a different function call

**Step 2: Trigger Voting via merge()**
- User calls `merge(uint256 _from, uint256 _to)` on VotingEscrow
- `merge()` merges lock `_from` into lock `_to`
- `merge()` calls `IVoter(voter).poke(_to)` internally
- `poke()` triggers voting with **pre-set pools/weights** stored in voter contract

**Why This Makes Sense:**
- Transaction input is short (just 2 uint256) ?
- Voting events are still emitted ?
- Pools/weights are in voter contract storage ?
- Token ID 4438 is the target token ?

## Verification Needed

1. **Check merge() implementation** - does it call `voter.poke()`?
2. **Find where pools/weights are set** - is there a separate transaction?
3. **Verify poke() function** - does it use stored pools/weights?
4. **Check if UI stores pools** - might be client-side before transaction

## Implications

If this theory is correct:
- Voting requires **two steps**:
  1. Set pools/weights (how?)
  2. Call `merge()` to trigger voting

- OR voting requires:
  1. Call `vote(uint256, address[], uint256[])` on voter contract directly
  2. Not via VotingEscrow

**Current blocker:** We haven't found where/how pools are set before voting.
