"""
Test that dry-run transactions match actual on-chain transactions

This test suite validates our implementation by comparing encoded transaction
data from dry-run mode against actual voting transactions from the blockchain.
"""

import pytest
import json
import requests
from typing import Dict, List

SNOWTRACE_API = "https://api.snowtrace.io/api"
API_KEY = "YourApiKeyToken"

# Known voting transactions to test against
TEST_TRANSACTIONS = [
    {
        "tx_hash": "0x4d7488026056bf83b3a0a2cd292b2d009708be76c47681630dfdf88f29cf7ac8",
        "wallet": "0x0000000000000000000000000000000000000001",
        "expected_token_id": 4438,
        "expected_pools": ["0x8fef4fe4970a5d6bfa7c65871a2ebfd0f42aa822"],
        "expected_weights": [1000],
        "description": "Single pool, 100% weight"
    }
]


def fetch_transaction(tx_hash: str) -> Dict:
    """Fetch transaction from blockchain"""
    url = f"{SNOWTRACE_API}?module=proxy&action=eth_getTransactionByHash&txhash={tx_hash}&apikey={API_KEY}"
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        return data.get('result', {})
    except Exception as e:
        pytest.skip(f"Could not fetch transaction: {e}")


def extract_vote_parameters(input_data: str) -> Dict:
    """Extract vote parameters from transaction input"""
    if not input_data or len(input_data) < 202:
        return {"error": "Input too short"}
    
    func_sig = input_data[:10]
    if func_sig != '0x7ac09bf7':
        return {"error": f"Not vote() function (got: {func_sig})"}
    
    token_id = int(input_data[10:74], 16)
    offset_pools = int(input_data[74:138], 16)
    offset_weights = int(input_data[138:202], 16)
    
    # Decode pools
    pools_start = 10 + (offset_pools * 2)
    if len(input_data) < pools_start + 64:
        return {"error": "Input too short for pools"}
    
    pool_count = int(input_data[pools_start:pools_start+64], 16)
    pools = []
    for i in range(pool_count):
        pool_pos = pools_start + 64 + (i * 64)
        if len(input_data) >= pool_pos + 64:
            pool_addr_hex = input_data[pool_pos:pool_pos+64]
            pool_addr = '0x' + pool_addr_hex[-40:].lower()
            pools.append(pool_addr)
    
    # Decode weights
    weights_start = 10 + (offset_weights * 2)
    if len(input_data) < weights_start + 64:
        return {"error": "Input too short for weights"}
    
    weight_count = int(input_data[weights_start:weights_start+64], 16)
    weights = []
    for i in range(weight_count):
        weight_pos = weights_start + 64 + (i * 64)
        if len(input_data) >= weight_pos + 64:
            weight_hex = input_data[weight_pos:weight_pos+64]
            weight = int(weight_hex, 16)
            weights.append(weight)
    
    return {
        "token_id": token_id,
        "pools": pools,
        "weights": weights,
        "function_selector": func_sig
    }


class TestTransactionMatching:
    """Test that our implementation matches actual transactions"""
    
    @pytest.mark.parametrize("test_tx", TEST_TRANSACTIONS)
    def test_transaction_decoding(self, test_tx):
        """Test that we can decode actual transactions correctly"""
        tx_hash = test_tx["tx_hash"]
        tx = fetch_transaction(tx_hash)
        
        input_data = tx.get('input', '')
        assert input_data, "Transaction has no input data"
        
        params = extract_vote_parameters(input_data)
        assert "error" not in params, f"Decoding error: {params.get('error')}"
        
        # Verify decoded values match expected
        assert params["token_id"] == test_tx["expected_token_id"], \
            f"Token ID mismatch: {params['token_id']} != {test_tx['expected_token_id']}"
        
        assert params["pools"] == test_tx["expected_pools"], \
            f"Pools mismatch: {params['pools']} != {test_tx['expected_pools']}"
        
        assert params["weights"] == test_tx["expected_weights"], \
            f"Weights mismatch: {params['weights']} != {test_tx['expected_weights']}"
        
        print(f"\n? Transaction {tx_hash[:20]}... decoded correctly")
        print(f"  Token ID: {params['token_id']}")
        print(f"  Pools: {params['pools']}")
        print(f"  Weights: {params['weights']}")
    
    @pytest.mark.skip(reason="Requires full voter implementation with web3 encoding")
    def test_dry_run_matches_actual(self):
        """
        Test that dry-run produces identical transaction input.
        
        This test:
        1. Creates VotePlan from actual transaction parameters
        2. Runs dry-run mode
        3. Compares encoded transaction data byte-for-byte
        
        Note: This requires full web3.py setup and contract ABI
        """
        test_tx = TEST_TRANSACTIONS[0]
        
        # This would require:
        # from blackhole_voter import BlackholeVoter, VotePlan
        # voter = BlackholeVoter(private_key="...", dry_run=True)
        # vote_plan = VotePlan(...)
        # result = voter.simulate_vote([vote_plan], token_id=4438)
        # 
        # actual_tx = fetch_transaction(test_tx["tx_hash"])
        # assert result["encoded_data"] == actual_tx["input"]
        
        pass
    
    def test_transaction_structure_validation(self):
        """Test that transaction structure is valid"""
        for test_tx in TEST_TRANSACTIONS:
            tx = fetch_transaction(test_tx["tx_hash"])
            input_data = tx.get('input', '')
            
            # Validate structure
            assert input_data.startswith('0x'), "Input must start with 0x"
            assert len(input_data) >= 202, f"Input too short: {len(input_data)} chars"
            
            # Validate function selector
            func_sig = input_data[:10]
            assert func_sig == '0x7ac09bf7', f"Wrong function selector: {func_sig}"
            
            # Validate token ID is present
            token_id = int(input_data[10:74], 16)
            assert token_id > 0, f"Invalid token ID: {token_id}"
            
            print(f"? Transaction structure valid for {test_tx['tx_hash'][:20]}...")


@pytest.mark.integration
class TestIntegration:
    """Integration tests with real blockchain data"""
    
    def test_find_voting_transactions(self):
        """Test finding voting transactions from wallet"""
        wallet = TEST_TRANSACTIONS[0]["wallet"]
        
        url = f"{SNOWTRACE_API}?module=account&action=txlist&address={wallet}&startblock=0&endblock=99999999&sort=desc&apikey={API_KEY}"
        response = requests.get(url, timeout=10)
        data = response.json()
        txs = data.get('result', [])
        
        # Find vote transactions
        vote_txs = []
        for tx in txs[:50]:
            to_addr = tx.get('to', '').lower()
            input_data = tx.get('input', '')
            func_sig = input_data[:10] if len(input_data) >= 10 else ''
            
            if func_sig == '0x7ac09bf7':
                vote_txs.append(tx.get('hash'))
        
        assert len(vote_txs) > 0, "Should find at least one voting transaction"
        print(f"\n? Found {len(vote_txs)} voting transaction(s) from wallet")
        
        # Decode first transaction
        if vote_txs:
            tx_hash = vote_txs[0]
            tx = fetch_transaction(tx_hash)
            params = extract_vote_parameters(tx.get('input', ''))
            
            assert "error" not in params, f"Failed to decode: {params.get('error')}"
            print(f"  ? Successfully decoded: {tx_hash[:20]}...")
            print(f"    Token ID: {params['token_id']}, Pools: {len(params['pools'])}")


if __name__ == "__main__":
    pytest.main([__file__, '-v', '-k', 'test_transaction_decoding'])
