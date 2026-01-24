# RPC Decoding Status

## Current State

We have code to decode RPC calls, but it needs refinement:

### Available Tools

1. **`scripts/analyze_multicall_logs.py`** - Basic multicall analyzer (has issues with decoding)
2. **`scripts/decode_rpc_calls.py`** - Attempts to use eth-abi (has ABI encoding issues)
3. **`scripts/decode_rpc_calls_web3.py`** - Attempts to use web3.py (ABI format issues)

### What We Know

- **Multicall3 Contract**: `0xca11bde05977b3631167028862be2a173976ca11`
- **Function Selector**: `0x82ad56cb` (aggregate function)
- **Function Signature**: `aggregate((address,bytes)[])`
- **Data Format**: ABI-encoded array of tuples `(address, bytes)[]`

### Current Issues

1. **ABI Decoding**: The complex ABI encoding for tuples with dynamic bytes is challenging to decode
2. **Web3.py API**: The ABI format or API usage may need adjustment
3. **Manual Parsing**: The manual parsing approach needs refinement

### What Works

- ✅ We can identify multicall requests (145 found in latest logs)
- ✅ We can extract the function selector (0x82ad56cb)
- ✅ We can identify the Multicall3 contract address
- ❌ Decoding the individual calls within multicalls is not working yet

### Next Steps

1. **Fix ABI Decoding**: 
   - Use proper Multicall3 ABI from verified source
   - Or improve manual ABI parsing for `(address,bytes)[]` format

2. **Alternative Approach**:
   - Use a library that specifically handles Multicall3
   - Or query the Multicall3 contract directly to understand its ABI

3. **Simpler Solution**:
   - Focus on identifying which contracts are called (even without full decoding)
   - Look for patterns in the hex data to extract addresses

### Recommendation

For now, we can:
1. **Identify multicall requests** - ✅ Working
2. **Extract contract addresses from hex patterns** - Can be improved
3. **Use the enhanced API Discovery tool** to capture more detailed information

The enhanced API Discovery tool in the browser extension is working well and provides good categorization. For RPC decoding, we may need to:
- Use a verified Multicall3 ABI
- Or implement a more robust manual parser
- Or use a specialized library for Multicall3 decoding
