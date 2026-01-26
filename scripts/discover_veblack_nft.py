#!/usr/bin/env python3
"""
Discover veBLACK NFT functions

This script tests various NFT functions to find:
1. How to get user's veBLACK NFT token ID(s)
2. How to get voting power for a token ID
3. Whether users can have multiple NFTs
"""

import sys
from web3 import Web3

# Configuration
RPC_URL = "https://api.avax.network/ext/bc/C/rpc"
VE_BLACK = "0xEac562811cc6abDbB2c9EE88719eCA4eE79Ad763"

w3 = Web3(Web3.HTTPProvider(RPC_URL))

print("=" * 80)
print("veBLACK NFT DISCOVERY")
print("=" * 80)
print(f"veBLACK Token: {VE_BLACK}")
print(f"RPC: {RPC_URL}")
print()


def keccak(sig: str) -> str:
    """Compute function selector"""
    return "0x" + w3.keccak(text=sig)[:4].hex()


def eth_call(to: str, data: str) -> bytes:
    """Make eth_call"""
    try:
        return w3.eth.call({
            'to': Web3.to_checksum_address(to),
            'data': data
        })
    except Exception as e:
        return b''


def decode_uint256(data: bytes) -> int:
    """Decode uint256 from bytes"""
    if not data or len(data) < 32:
        return 0
    return int.from_bytes(data[:32], byteorder='big')


def decode_address(data: bytes) -> str:
    """Decode address from bytes"""
    if not data or len(data) < 32:
        return "0x" + "0" * 40
    addr_hex = data[12:32].hex()
    return "0x" + addr_hex


def encode_address(address: str) -> str:
    """Encode address as bytes32"""
    addr = address.lower()
    if addr.startswith('0x'):
        addr = addr[2:]
    return addr.zfill(64)


def encode_uint256(value: int) -> str:
    """Encode uint256 as bytes32"""
    return hex(value)[2:].zfill(64)


def test_nft_balance(user_address: str):
    """Test balanceOf - how many veBLACK NFTs does user have?"""
    print(f"\n[1] Testing balanceOf(address) for {user_address}...")

    selector = keccak("balanceOf(address)")
    param = encode_address(user_address)
    data = selector + param

    result = eth_call(VE_BLACK, data)

    if result:
        balance = decode_uint256(result)
        print(f"  ✓ User has {balance} veBLACK NFT(s)")
        return balance
    else:
        print(f"  ✗ Failed to get balance")
        return 0


def test_token_of_owner_by_index(user_address: str, index: int = 0):
    """Test tokenOfOwnerByIndex - get NFT ID by index"""
    print(f"\n[2] Testing tokenOfOwnerByIndex(address, {index})...")

    selector = keccak("tokenOfOwnerByIndex(address,uint256)")
    param1 = encode_address(user_address)
    param2 = encode_uint256(index)
    data = selector + param1 + param2

    result = eth_call(VE_BLACK, data)

    if result:
        token_id = decode_uint256(result)
        if token_id > 0:
            print(f"  ✓ Token ID at index {index}: {token_id}")
            return token_id
        else:
            print(f"  ✗ No token at index {index}")
            return None
    else:
        print(f"  ✗ Function not available or failed")
        return None


def test_token_of_owner(user_address: str):
    """Test tokenOfOwner - direct getter (if user can only have one NFT)"""
    print(f"\n[3] Testing tokenOfOwner(address)...")

    selector = keccak("tokenOfOwner(address)")
    param = encode_address(user_address)
    data = selector + param

    result = eth_call(VE_BLACK, data)

    if result:
        token_id = decode_uint256(result)
        if token_id > 0:
            print(f"  ✓ Token ID: {token_id}")
            return token_id
        else:
            print(f"  ✗ Returned 0 (no token or not implemented)")
            return None
    else:
        print(f"  ✗ Function not available")
        return None


def test_balance_of_nft(token_id: int):
    """Test balanceOfNFT - get voting power for token ID"""
    print(f"\n[4] Testing balanceOfNFT({token_id})...")

    selector = keccak("balanceOfNFT(uint256)")
    param = encode_uint256(token_id)
    data = selector + param

    result = eth_call(VE_BLACK, data)

    if result:
        balance = decode_uint256(result)
        balance_formatted = balance / 1e18
        print(f"  ✓ Voting power: {balance_formatted:,.2f} veBLACK ({balance} wei)")
        return balance_formatted
    else:
        print(f"  ✗ Function not available or failed")
        return None


def test_voting_power(token_id: int):
    """Test voting_power - Python/Vyper style naming"""
    print(f"\n[5] Testing voting_power({token_id})...")

    # Try both naming conventions
    selectors_to_try = [
        ("voting_power(uint256)", keccak("voting_power(uint256)")),
        ("votingPower(uint256)", keccak("votingPower(uint256)")),
        ("getVotes(uint256)", keccak("getVotes(uint256)")),
    ]

    for name, selector in selectors_to_try:
        param = encode_uint256(token_id)
        data = selector + param

        result = eth_call(VE_BLACK, data)

        if result and result != b'\x00' * 32:
            power = decode_uint256(result)
            power_formatted = power / 1e18
            print(f"  ✓ {name}: {power_formatted:,.2f} veBLACK ({power} wei)")
            return power_formatted

    print(f"  ✗ No voting power functions found")
    return None


def test_locked(token_id: int):
    """Test locked - get lock details for token"""
    print(f"\n[6] Testing locked({token_id})...")

    selector = keccak("locked(uint256)")
    param = encode_uint256(token_id)
    data = selector + param

    result = eth_call(VE_BLACK, data)

    if result and len(result) >= 64:
        # Decode struct: (int128 amount, uint256 end)
        amount_wei = int.from_bytes(result[:32], byteorder='big', signed=True)
        end_timestamp = int.from_bytes(result[32:64], byteorder='big')

        amount = amount_wei / 1e18

        print(f"  ✓ Locked amount: {amount:,.2f} BLACK")
        print(f"    Lock end: {end_timestamp} (Unix timestamp)")

        if end_timestamp > 0:
            from datetime import datetime
            lock_end = datetime.fromtimestamp(end_timestamp)
            print(f"    Lock end date: {lock_end.strftime('%Y-%m-%d %H:%M:%S UTC')}")

        return amount, end_timestamp
    else:
        print(f"  ✗ Function not available or failed")
        return None, None


def test_owner_of(token_id: int):
    """Test ownerOf - verify who owns the NFT"""
    print(f"\n[7] Testing ownerOf({token_id})...")

    selector = keccak("ownerOf(uint256)")
    param = encode_uint256(token_id)
    data = selector + param

    result = eth_call(VE_BLACK, data)

    if result:
        owner = decode_address(result)
        if owner != "0x" + "0" * 40:
            owner_checksum = Web3.to_checksum_address(owner)
            print(f"  ✓ Owner: {owner_checksum}")
            return owner_checksum
        else:
            print(f"  ✗ Returned zero address")
            return None
    else:
        print(f"  ✗ Function not available")
        return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python discover_veblack_nft.py <user_address>")
        print("\nExample:")
        print("  python discover_veblack_nft.py 0x1234567890123456789012345678901234567890")
        print("\nTo find voter addresses, visit: https://blackhole.xyz/vote")
        print("Click on any pool to see voters and their addresses")
        sys.exit(1)

    user_address = sys.argv[1]

    # Validate address
    if not Web3.is_address(user_address):
        print(f"✗ Invalid address: {user_address}")
        sys.exit(1)

    user_address = Web3.to_checksum_address(user_address)
    print(f"User address: {user_address}\n")

    # Step 1: Get number of NFTs user owns
    nft_count = test_nft_balance(user_address)

    if nft_count == 0:
        print("\n✗ User has no veBLACK NFTs")
        print("   They need to lock BLACK tokens to get voting power")
        sys.exit(0)

    # Step 2: Get token ID(s)
    token_ids = []

    # Try tokenOfOwnerByIndex for each index
    if nft_count > 0:
        for i in range(nft_count):
            token_id = test_token_of_owner_by_index(user_address, i)
            if token_id:
                token_ids.append(token_id)

    # Try tokenOfOwner (if it exists)
    if not token_ids:
        token_id = test_token_of_owner(user_address)
        if token_id:
            token_ids.append(token_id)

    if not token_ids:
        print("\n✗ Could not find token ID")
        print("   balanceOf() returned positive but can't enumerate tokens")
        sys.exit(1)

    print(f"\n{'=' * 80}")
    print(f"FOUND {len(token_ids)} veBLACK NFT(s)")
    print("=" * 80)

    # Step 3: For each token, get voting power
    for token_id in token_ids:
        print(f"\n--- Token ID: {token_id} ---")

        # Verify ownership
        owner = test_owner_of(token_id)
        if owner and owner.lower() != user_address.lower():
            print(f"  ⚠️  WARNING: Token {token_id} belongs to {owner}, not {user_address}")
            continue

        # Get voting power
        voting_power = test_balance_of_nft(token_id)

        if voting_power is None:
            voting_power = test_voting_power(token_id)

        # Get lock details
        locked_amount, lock_end = test_locked(token_id)

        print()

    # Summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"User: {user_address}")
    print(f"veBLACK NFTs: {len(token_ids)}")
    print()

    for token_id in token_ids:
        print(f"Token ID: {token_id}")

    print("\n" + "=" * 80)
    print("JAVASCRIPT IMPLEMENTATION")
    print("=" * 80)
    print("""
// Add to extension/lib/veblack-nft-client.js

async getUserTokenIds(userAddress) {
  // Get number of NFTs
  const balanceSelector = await this.keccak256('balanceOf(address)');
  const balanceParam = this.encodeAddress(userAddress);
  const balanceResult = await this.ethCall(this.VE_BLACK, balanceSelector + balanceParam);
  const nftCount = Number(this.decodeUint256(balanceResult));

  if (nftCount === 0) {
    return [];
  }

  // Get token IDs
  const tokenIds = [];
  const tokenSelector = await this.keccak256('tokenOfOwnerByIndex(address,uint256)');

  for (let i = 0; i < nftCount; i++) {
    const param1 = this.encodeAddress(userAddress);
    const param2 = this.encodeUint256(i);
    const result = await this.ethCall(this.VE_BLACK, tokenSelector + param1 + param2);
    const tokenId = Number(this.decodeUint256(result));

    if (tokenId > 0) {
      tokenIds.push(tokenId);
    }
  }

  return tokenIds;
}

async getVotingPower(tokenId) {
  const selector = await this.keccak256('balanceOfNFT(uint256)');
  const param = this.encodeUint256(tokenId);
  const result = await this.ethCall(this.VE_BLACK, selector + param);
  const power = Number(this.decodeUint256(result)) / 1e18;
  return power;
}
""")

    print("\n✓ Discovery complete!")


if __name__ == "__main__":
    main()
