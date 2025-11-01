# Test Suite for Avalanche Chain Tools

This directory contains comprehensive tests for all tools in the Avalanche Chain Tools project.

## Running Tests

### Run all tests
```bash
pytest tests/
```

### Run with verbose output
```bash
pytest tests/ -v
```

### Run specific test file
```bash
pytest tests/test_utils.py
```

### Run specific test
```bash
pytest tests/test_utils.py::TestGetTokenInfo::test_get_token_info_success
```

### Run with coverage (if pytest-cov is installed)
```bash
pytest tests/ --cov=. --cov-report=html
```

## Test Structure

- **`conftest.py`**: Shared fixtures and pytest configuration
- **`test_utils.py`**: Tests for `avalanche_utils` module (shared utilities)
- **`test_transaction_reader.py`**: Tests for transaction reader tool
- **`test_daily_swaps.py`**: Tests for daily swap analyzer
- **`test_transaction_narrator.py`**: Tests for transaction narrator
- **`test_pool_recommender.py`**: Tests for pool recommender

## Test Coverage

The test suite covers:

- ? All utility functions (get_token_info, get_token_price, format_amount, format_timestamp)
- ? Transaction parsing and processing
- ? Token transfer log parsing
- ? Error handling and edge cases
- ? API call mocking (no real API calls during tests)
- ? Pool recommender core functionality

## Mocking

All tests use mocking to avoid making real API calls:
- API responses are mocked using `unittest.mock`
- Network requests are intercepted and return test data
- Tests run quickly and don't depend on external services

## Requirements

Tests require:
- `pytest >= 7.0.0`
- `pytest-mock >= 3.10.0`

Install with:
```bash
pip install -r requirements.txt
```

## Writing New Tests

When adding new functionality:

1. Add tests to the appropriate test file
2. Use fixtures from `conftest.py` when possible
3. Mock external API calls
4. Test both success and error cases
5. Follow the naming convention: `test_<functionality>_<scenario>`

Example:
```python
def test_new_function_success(self):
    """Test new function with valid input"""
    result = new_function(valid_input)
    assert result == expected_output

def test_new_function_error(self):
    """Test new function with invalid input"""
    with pytest.raises(ValueError):
        new_function(invalid_input)
```
