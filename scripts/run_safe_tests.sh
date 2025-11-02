#!/bin/bash
# Run all safe tests that don't require a real private key

set -e

echo "================================================================================"
echo "SAFE TESTING - No Private Key Required"
echo "================================================================================"
echo ""

# Test 1: Encoding Validation
echo "Test 1: Encoding Validation (No Key Needed)"
echo "--------------------------------------------"
python3 scripts/safe_encoding_validation.py
echo ""

# Test 2: Transaction Structure Tests
echo "Test 2: Transaction Structure Validation"
echo "--------------------------------------------"
python3 -m pytest tests/test_voter_transaction_matching.py::TestTransactionMatching::test_transaction_decoding -v
echo ""

# Test 3: Transaction Decoding Tests
echo "Test 3: Transaction Decoding Tests"
echo "--------------------------------------------"
python3 -m pytest tests/test_voter_transaction_matching.py::TestTransactionMatching::test_transaction_structure_validation -v
echo ""

# Test 4: Dummy Key Test (if web3 available)
echo "Test 4: Dummy Key Encoding Test"
echo "--------------------------------------------"
if python3 -c "import web3" 2>/dev/null; then
    python3 scripts/test_with_dummy_key.py
else
    echo "? web3 not installed - skipping dummy key test"
    echo "  Install with: pip install web3 eth-account"
fi
echo ""

echo "================================================================================"
echo "All Safe Tests Complete!"
echo "================================================================================"
