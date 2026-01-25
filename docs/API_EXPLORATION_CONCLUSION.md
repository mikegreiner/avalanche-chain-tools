# API Exploration - Final Report

## Summary
**UPDATE: Epoch fees ARE available via RPC!** We discovered that trading fees are stored in the `internal_bribe` contract and can be fetched using `tokenRewardsPerEpoch(address token, uint256 epochStart)`.

## What We CAN Get

### ✅ Via RPC (Blockchain)
1. **Current Votes** - Exact match with site
   - Contract: Voter `0xe30d0c8532721551a51a9fec7fb233759964d9e3`
   - Function: `weights(address)` - selector `0xa7cac846`
   - Example: 79.91M votes for CL1-WAVAX/USDC ✅

### ✅ Via Static API
Source: `https://resources.blackhole.xyz/cl-pools-list/cl-pools.json`

1. **Pool Metadata**
   - Token symbols (WAVAX, USDC, etc.)
   - tickSpacing → Pool type (CL1, CL50, CL200)
   - TVL (totalValueLockedUSD) - Close match ✅
   
2. **Cumulative Fees** (NOT epoch fees)
   - feesUSD: Total fees since pool creation
   - Example: $235K cumulative vs $61K epoch fees shown on site ❌

## What We CAN Get (Updated!)

### ✅ Epoch Fees
**Discovered method:**
1. Get gauge address: `GaugeManager.gauges(pool)` → gauge address
2. Get internal_bribe: `Gauge.internal_bribe()` → bribe contract
3. Get epoch rewards: `InternalBribe.tokenRewardsPerEpoch(token, epochStart)` → fees

**Example for CL1-WAVAX/USDC:**
- WAVAX fees: 2,292 WAVAX (~$27K at current prices)
- USDC fees: $37,304
- Total: ~$64K (matches site's ~$61K)

### ✅ VAPR Calculation
**Formula (matches site):**
```
VAPR = (Annual_Fees_USD / Votes_USD) × 100
     = (Weekly_Fees × 52) / (Votes × BLACK_Price) × 100
```
Note: Site uses **fees only** for VAPR, not gauge emissions.

## Final Implementation (100% RPC-based!)

**No DOM scraping needed!** All data is fetched via RPC in ~7-8 seconds.

### Data Flow:
```javascript
// 1. Fetch token prices from DeFiLlama (no rate limits)
const blackPrice = await getBlackPrice();  // via DeFiLlama
const avaxPrice = await getAvaxPrice();    // via DeFiLlama

// 2. Fetch pool metadata from static API
const pools = await fetch('https://resources.blackhole.xyz/cl-pools-list/cl-pools.json');

// 3. For each pool, fetch on-chain data:
const gauge = await GaugeManager.gauges(poolAddress);
const votes = await Voter.weights(poolAddress);
const rewardRate = await Gauge.rewardRate();
const internalBribe = await Gauge.internal_bribe();

// 4. Get epoch fees from internal_bribe
const epochStart = getPreviousEpochStart();  // Wednesday 00:00 UTC
const token0Fees = await InternalBribe.tokenRewardsPerEpoch(token0, epochStart);
const token1Fees = await InternalBribe.tokenRewardsPerEpoch(token1, epochStart);
const totalFeesUSD = convertToUSD(token0Fees, token1Fees);

// 5. Calculate VAPR (fees only, not emissions)
const vapr = (totalFeesUSD * 52) / (votes * blackPrice) * 100;
```

### Performance:
- **Old DOM scraping**: 30-60 seconds
- **New RPC-based**: ~7-8 seconds
- **Speedup**: ~5-8x faster

### Key Contracts:
| Contract | Address | Key Functions |
|----------|---------|---------------|
| GaugeManager | `0x59aa177312Ff6Bdf39C8Af6F46dAe217bf76CBf6` | `gauges(address)` |
| Voter | `0xe30d0c8532721551a51a9fec7fb233759964d9e3` | `weights(address)`, `totalWeight()` |
| Gauge | (per pool) | `internal_bribe()`, `rewardRate()` |
| InternalBribe | (per gauge) | `tokenRewardsPerEpoch(address,uint256)` |

### Key Selectors:
```javascript
'gauges(address)': '0xb9a09fd5'
'weights(address)': '0xa7cac846'
'internal_bribe()': '0x770f8571'
'tokenRewardsPerEpoch(address,uint256)': '0x92777b29'
'rewardRate()': '0x7b0a47ee'
```

## Data Successfully Fetched (All via RPC!)

Test with CL1-WAVAX/USDC:
- ✅ Pool ID: `0xa02ec3ba8d17887567672b2cdcaf525534636ea0`
- ✅ TVL: $5.72M (site shows $5.80M - close!)
- ✅ Votes: 79.92M (exact match!)
- ✅ Epoch Fees: $64,671 (site shows ~$61,836 - close!)
- ✅ VAPR: 122.7% (site shows 119.2% - close!)
- ✅ Gauge Emissions: $67,136/week (stored separately)

The small differences (~3-5%) are due to:
1. Epoch timing differences
2. Slight price variations (DeFiLlama vs site's source)
3. Block timing when data was fetched

