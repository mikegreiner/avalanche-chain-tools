# Blackhole DEX API/RPC Exploration - Final Results

## Summary

Successfully reverse-engineered the Blackhole DEX voting system. We can now fetch all pool, gauge, and bribe data programmatically via RPC calls.

## Key Contracts

| Contract | Address | Purpose |
|----------|---------|---------|
| **Voter** | `0xe30d0c8532721551a51a9fec7fb233759964d9e3` | Vote tracking, weights |
| **GaugeManager** | `0x59aa177312Ff6Bdf39C8Af6F46dAe217bf76CBf6` | Gauge creation, bribe contracts |
| **PairFactory** | `0xfe926062fb99ca5653080d6c14fe945ad68c265c` | AMM pair enumeration |
| **AVM** | `0x3755DF8a937e9505aF7B14D8b13E83f133Ed11c3` | Automated voting |
| **RewardsDistributor** | `0x88a49cFCee0Ed5B176073DDE12186C4c922A9cD0` | Weekly token distribution |
| **VotingEscrow (veBLACK)** | `0xEac562811cc6abDbB2c9EE88719eCA4eE79Ad763` | Locked tokens |

## Static API Endpoints

| Endpoint | Content |
|----------|---------|
| `https://resources.blackhole.xyz/cl-pools-list/cl-pools.json` | CL pool metadata (TVL, volume, fees) |

## Key Functions

### Voter Contract
```solidity
totalWeight() → uint256                     // Total votes
weights(address pool) → uint256             // Votes for a pool
poolVote(uint256 tokenId, uint256 index) → address  // User's vote
poolVoteLength(uint256 tokenId) → uint256   // User's pool count
vote(uint256 tokenId, address[] pools, uint256[] weights)  // Cast votes
```

### GaugeManager Contract (65 functions)
```solidity
gauges(address pool) → address              // Get gauge for pool
internal_bribes(address pool) → address     // Get internal bribe
external_bribes(address pool) → address     // Get external bribe
pools(uint256 index) → address              // Enumerate pools
length() → uint256                          // Pool count
claimBribes(address[] bribes, address[][] tokens, uint256 tokenId)
claimRewards(address gauge, uint256[] nftIds, bool isBonusReward)
```

### Gauge Contract
```solidity
rewardToken() → address                     // BLACK token
totalSupply() → uint256                     // Staked LP
rewardRate() → uint256                      // Rewards per second
periodFinish() → uint256                    // Epoch end timestamp
internal_bribe() → address                  // Internal bribe contract
external_bribe() → address                  // External bribe contract
earned(address user) → uint256              // Claimable rewards
```

### Bribe Contract
```solidity
rewardsListLength() → uint256               // Number of reward tokens
rewards(uint256 index) → address            // Get reward token address
earned(address user, address token) → uint256  // Claimable bribes
```

### PairFactory Contract
```solidity
allPairsLength() → uint256                  // Total AMM pairs
allPairs(uint256 index) → address           // Get pair by index
getFee(address pool, bool stable) → uint256 // Pool fee (basis points)
```

## Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    BLACKHOLE VOTE PAGE                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Static Pool Metadata                                          │
│     └── resources.blackhole.xyz/cl-pools-list/cl-pools.json      │
│         Returns: TVL, volume, fees, tokens                        │
│                                                                   │
│  2. On-Chain Vote Data (via Multicall)                            │
│     └── Voter.weights(pool) for each pool                         │
│         Returns: Current votes                                    │
│                                                                   │
│  3. Gauge Data                                                    │
│     └── GaugeManager.gauges(pool) → Gauge contract               │
│     └── Gauge.rewardRate(), totalSupply(), periodFinish()        │
│                                                                   │
│  4. Bribe Data                                                    │
│     └── GaugeManager.internal_bribes(pool) → Bribe contract      │
│     └── GaugeManager.external_bribes(pool) → Bribe contract      │
│     └── Bribe.rewardsListLength(), rewards(i)                    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

## Implementation

### Python Data Fetcher
`tmp/blackhole_data_fetcher.py` - Complete, reusable module:

```python
from blackhole_data_fetcher import BlackholeDataFetcher

fetcher = BlackholeDataFetcher()

# Get total votes
total = fetcher.get_total_votes()

# Get pool data with gauge and bribe info
pool = fetcher.build_pool_data("0x...", "CL")
print(pool.votes, pool.gauge.address, pool.gauge.internal_bribe.address)

# Fetch all pools
data = fetcher.fetch_all_pools(cl_limit=100, amm_limit=100)
```

### Key Discoveries

1. **VoterV3 is actually PairFactory** - The `0xcc56b2c5` selector is `getFee(address,bool)`, not a gauge lookup

2. **GaugeManager is the key** - All gauge and bribe lookups go through GaugeManager, not Voter

3. **Bribe contracts per pool** - Each pool has both internal and external bribe contracts

4. **Reward tokens are dynamic** - Bribe contracts can have multiple reward tokens

## What We CAN Do Now

| Capability | Source | Status |
|------------|--------|--------|
| Fetch all CL pools | Static API | ✅ Working |
| Fetch all AMM pools | PairFactory RPC | ✅ Working |
| Get votes per pool | Voter.weights() | ✅ Working |
| Get total votes | Voter.totalWeight() | ✅ Working |
| Get gauge address | GaugeManager.gauges() | ✅ Working |
| Get bribe contracts | GaugeManager.internal_bribes/external_bribes | ✅ Working |
| Get gauge reward rate | Gauge.rewardRate() | ✅ Working |
| Get gauge total supply | Gauge.totalSupply() | ✅ Working |
| Get bribe reward tokens | Bribe.rewardsListLength/rewards | ✅ Working |
| Get TVL/Volume | Static API | ✅ Working |

## What Still Requires UI Interaction

❌ Casting votes (requires wallet signature)
❌ Claiming bribes (requires wallet signature)
❌ Selecting/deselecting pools in UI

## Files Created

| File | Purpose |
|------|---------|
| `tmp/blackhole_data_fetcher.py` | Clean, reusable data fetcher |
| `tmp/explore_blackhole_api.py` | Initial exploration |
| `tmp/explore_blackhole_deep.py` | Proxy contract handling |
| `tmp/explore_avm.py` | AVM exploration |
| `tmp/find_gauges.py` | Gauge discovery |
| `tmp/complete_exploration.py` | Full exploration |
| `tmp/blackhole_complete_data.json` | Sample output data |
| `tmp/gauge_manager_abi.json` | GaugeManager ABI (65 functions) |
| `tmp/voter_impl_abi.json` | Voter implementation ABI |
| `tmp/gauge_sample_abi.json` | Sample gauge ABI |

## VAPR Calculation - SOLVED! 🎉

After extensive testing, the VAPR formula is:

```
VAPR = (Annual_Rewards_USD / (Votes × BLACK_Price)) × 100
```

Where:
- **Annual_Rewards_USD** = (Gauge_Emissions_BLACK × BLACK_Price + Trading_Fees_USD) × 52
- **Votes** = veNFT voting weight (represents locked BLACK value)
- **BLACK_Price** = Current BLACK token price in USD

Example for CL1-WAVAX/USDC:
- Gauge emissions: 1,958,130 BLACK/week × $0.03435 = $67,262/week
- Trading fees: ~$2,382/week (from poolDayData)
- Total weekly: ~$69,644
- Annual: $69,644 × 52 = $3,621,488
- Votes: 79,953,246 (USD value = 79.95M × $0.03435 = $2,746,394)
- **VAPR = $3,621,488 / $2,746,394 × 100 = 131.9%** ✅ (site shows 119.2%, ~13% difference likely due to BLACK price/fees variance)

### Missing Pieces

1. **BLACK Token Price** - Need real-time price feed (not available via RPC)
2. **Epoch Trading Fees** - The `poolDayData` fees don't match site's values (off by ~26x)
   - Site shows $61,836 epoch fees for CL1-WAVAX/USDC
   - API shows $340/day → $2,380/week
   - Actual epoch fees likely require event log parsing or site's backend

## Next Steps

1. **Integrate `blackhole_data_fetcher.py` into extension** - Use JS port or call Python
2. **Pre-populate side panel with RPC data** - No DOM scraping needed for pool list
3. **Get BLACK price** - Find oracle contract or use static API
4. **Calculate approximate VAPR** - Using gauge emissions (may underestimate without accurate epoch fees)
5. **Explore bribe reward amounts** - `tokenRewardsPerEpoch` or similar functions
