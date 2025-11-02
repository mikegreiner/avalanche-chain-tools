# Voting Implementation Guide - Ready for Implementation

## ? COMPLETE UNDERSTANDING ACHIEVED

### Voting Mechanism

**Single Function Call:** `vote(uint256 _tokenId, address[] _poolVote, uint256[] _weights)` on voter contract

**Contract:** `0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525` (voter implementation)  
**Function Selector:** `0x7ac09bf7` ? VERIFIED  
**ABI:** Available in `voter_contract_abi.json`

### Decoded Example Transaction

**Transaction:** `0x4d7488026056bf83b3a0a2cd292b2d009708be76c47681630dfdf88f29cf7ac8`

**Parameters:**
- Token ID: 4438
- Pools: [`0x8fef4fe4970a5d6bfa7c65871a2ebfd0f42aa822`]
- Weights: [1000] (represents 100.00%)

**Key Insight:** Weights are passed as integers that sum to 1000 (representing percentages ? 10, or can be any values that get normalized by contract)

## Implementation Code

### Python Implementation

```python
from web3 import Web3
from eth_account import Account

# Setup
w3 = Web3(Web3.HTTPProvider("https://api.avax.network/ext/bc/C/rpc"))
private_key = os.getenv('BLACKHOLE_VOTER_PRIVATE_KEY')
account = Account.from_key(private_key)

# Load voter contract ABI
with open('voter_contract_abi.json', 'r') as f:
    voter_abi = json.load(f)

voter_address = "0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525"
voter_contract = w3.eth.contract(
    address=Web3.to_checksum_address(voter_address),
    abi=voter_abi
)

# Prepare vote parameters
token_id = 4438  # User's lock token ID
pool_addresses = [
    "0xfd9a46c213532401ef61f8d34e67a3653b70837a",
    "0x40435bdffa4e5b936788b33a2fd767105c67bef7"
]

# Weights: can be percentages (will be normalized by contract)
# Example: [600, 400] = 60% and 40%, or [1000, 0] = 100% and 0%
weights = [500, 500]  # 50% each

# Build transaction
nonce = w3.eth.get_transaction_count(account.address)
gas_price = w3.eth.gas_price

transaction = voter_contract.functions.vote(
    token_id,
    pool_addresses,
    weights
).build_transaction({
    'from': account.address,
    'nonce': nonce,
    'gas': 300000,  # Estimate or get from contract
    'gasPrice': gas_price,
    'chainId': 43114  # Avalanche C-Chain
})

# Sign and send
signed = account.sign_transaction(transaction)
tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)

# Wait for receipt
receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
```

## Required Components

### 1. Voter Contract
- **Address:** `0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525`
- **ABI:** `voter_contract_abi.json`
- **Function:** `vote(uint256, address[], uint256[])`

### 2. Pool Address Mapping
- Need to map pool names (from recommender) to contract addresses
- Example: "CL200-WAVAX/USDC" ? `0x8fef4fe4970a5d6bfa7c65871a2ebfd0f42aa822`

### 3. Token ID
- Need to get user's lock token ID(s) from VotingEscrow
- Can query via ERC-721 functions: `balanceOf(address)`, `tokenOfOwnerByIndex(address, index)`

### 4. Weights
- Pass as uint256 array
- Contract will normalize them
- Can be percentages (0-100) or larger values

## Security Checklist

Before implementing:
- ? Contract address verified
- ? Function signature verified (`0x7ac09bf7`)
- ? ABI available
- ? Transaction decoded successfully
- ?? Need to test with minimal funds
- ?? Need to verify pool address mapping
- ?? Need to get user's token ID(s)

## Next Implementation Steps

1. **Update blackhole_voter.py:**
   - Use voter contract address (`0x6bD81E7eaFA4B21d5AD069B452Ab4b8bb40c4525`)
   - Load voter ABI from `voter_contract_abi.json`
   - Implement `vote()` function call with proper array encoding

2. **Implement Token ID Query:**
   - Query VotingEscrow for user's lock token IDs
   - Use ERC-721 `balanceOf()` and `tokenOfOwnerByIndex()`

3. **Implement Pool Address Mapping:**
   - Extract from voting page HTML
   - Or create manual mapping file
   - Enhance pool recommender to capture addresses

4. **Test:**
   - Use dry-run mode first
   - Test with minimal test transaction
   - Verify events and state changes
