# Contributing to Avalanche Chain Tools

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Getting Started

### Prerequisites

- Python 3.10 or higher
- Git
- Basic understanding of Python and blockchain concepts

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/yourusername/avalanche-chain-tools.git
   cd avalanche-chain-tools
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Verify setup**
   ```bash
   # Run tests to ensure everything works
   pytest tests/ -v
   ```

## Project Architecture

### Core Components

- **`avalanche_base.py`**: Base class (`AvalancheTool`) that all tools inherit from
- **`avalanche_utils.py`**: Shared utilities (API calls, formatting, exceptions, logging)
- **Tool modules**: Individual tool implementations inheriting from `AvalancheTool`
- **`config.yaml`**: Configuration file (optional, uses defaults if not present)

### Design Principles

1. **DRY (Don't Repeat Yourself)**: Common functionality is in `avalanche_utils.py`
2. **Inheritance**: All tools inherit from `AvalancheTool` base class
3. **Type Hints**: All functions should have complete type annotations
4. **Error Handling**: Use custom exceptions from `avalanche_utils`
5. **Logging**: Use `logger` from `avalanche_utils` instead of `print()`

## Code Style

### Python Style Guide

We follow [PEP 8](https://pep8.org/) with some modifications:

- **Line length**: 100 characters (soft limit)
- **Type hints**: Required for all function parameters and return values
- **Docstrings**: Google-style docstrings for all public functions/methods

### Example Code Structure

```python
from avalanche_base import AvalancheTool
from avalanche_utils import (
    AvalancheAPIError, NetworkError, logger
)
from typing import Dict, List, Optional, Any

class MyNewTool(AvalancheTool):
    """
    Description of what this tool does.
    
    More detailed explanation if needed.
    """
    
    def __init__(self, snowtrace_api_base: Optional[str] = None, 
                 headers: Optional[Dict[str, str]] = None) -> None:
        """Initialize the tool"""
        super().__init__(snowtrace_api_base, headers)
    
    def my_method(self, param: str) -> Dict[str, Any]:
        """
        Method description.
        
        Args:
            param: Description of parameter
            
        Returns:
            Description of return value
            
        Raises:
            AvalancheAPIError: If API call fails
        """
        try:
            # Implementation
            pass
        except requests.RequestException as e:
            raise NetworkError(f"Network error: {e}", original_error=e)
```

### Naming Conventions

- **Classes**: `PascalCase` (e.g., `AvalancheTransactionReader`)
- **Functions/Methods**: `snake_case` (e.g., `get_token_info`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `SNOWTRACE_API_BASE`)
- **Files**: `snake_case.py` (e.g., `avalanche_utils.py`)

## Adding New Features

### Before You Start

1. **Check existing issues** - Your feature might already be requested
2. **Create an issue** - Discuss the feature before implementing (for major changes)
3. **Keep it focused** - One feature per pull request

### Implementation Steps

1. **Create a feature branch**
   ```bash
   git checkout -b feature/my-new-feature
   ```

2. **Follow the architecture**
   - Inherit from `AvalancheTool` if it's a new tool
   - Use shared utilities from `avalanche_utils.py`
   - Add appropriate type hints and docstrings

3. **Write tests**
   - Add tests to appropriate file in `tests/`
   - Mock external API calls
   - Test both success and error cases
   - Ensure all tests pass: `pytest tests/ -v`

4. **Update documentation**
   - Update `README.md` if adding a new tool
   - Add tool-specific docs in `docs/` if needed
   - Update `CONFIGURATION.md` if adding config options

5. **Test manually**
   - Run the tool with real data (if safe)
   - Verify error handling works correctly
   - Check logging output

## Error Handling

### Use Custom Exceptions

Always use custom exceptions from `avalanche_utils`:

```python
from avalanche_utils import (
    AvalancheAPIError, NetworkError, 
    TransactionNotFoundError, InvalidInputError
)

# Good
if not tx_hash:
    raise InvalidInputError("Transaction hash is required")

# Good
if 'error' in api_response:
    raise AvalancheAPIError(f"API error: {api_response['error']}")

# Avoid
raise Exception("Something went wrong")  # ? Don't do this
```

### Error Logging

Always log errors before raising or returning:

```python
try:
    result = api_call()
except NetworkError as e:
    logger.error(f"Network error: {e}")
    raise
except Exception as e:
    logger.error(f"Unexpected error: {e}", exc_info=True)
    raise
```

## Testing

### Running Tests

```bash
# Run all tests
pytest tests/

# Run with verbose output
pytest tests/ -v

# Run specific test file
pytest tests/test_utils.py

# Run with coverage
pytest tests/ --cov=. --cov-report=html
```

### Writing Tests

- **Location**: Add tests to appropriate file in `tests/`
- **Naming**: `test_<functionality>_<scenario>` (e.g., `test_get_token_info_success`)
- **Mocking**: Always mock external API calls - see `tests/conftest.py` for fixtures
- **Coverage**: Aim for >80% coverage on new code

### Test Structure Example

```python
import pytest
from unittest.mock import Mock, patch
from avalanche_utils import get_token_info

class TestMyFeature:
    def test_feature_success(self):
        """Test feature with valid input"""
        with patch('avalanche_utils.requests.get') as mock_get:
            mock_get.return_value.json.return_value = {
                'status': '1',
                'result': [{'tokenName': 'Test Token', 'symbol': 'TEST'}]
            }
            result = get_token_info('0x123...')
            assert result['name'] == 'Test Token'
    
    def test_feature_error(self):
        """Test feature with invalid input"""
        with pytest.raises(InvalidInputError):
            get_token_info('invalid')
```

## Documentation

### Docstring Format

Use Google-style docstrings:

```python
def my_function(param1: str, param2: int = 10) -> Dict[str, Any]:
    """
    Brief description of what the function does.
    
    Longer description if needed, explaining any important
    details or behavior.
    
    Args:
        param1: Description of first parameter
        param2: Description of second parameter (default: 10)
        
    Returns:
        Description of return value with structure
        
    Raises:
        ValueError: If param1 is invalid
        NetworkError: If network request fails
        
    Example:
        >>> result = my_function("test", 5)
        >>> print(result)
        {'key': 'value'}
    """
```

### Updating README

- **New tools**: Add to "Tools" section with usage examples
- **New features**: Update relevant tool documentation
- **Breaking changes**: Note in a "Changelog" section (if you create one)

## Pull Request Process

### Before Submitting

1. **Ensure all tests pass**
   ```bash
   pytest tests/ -v
   ```

2. **Check code style** (optional, but recommended)
   ```bash
   # Using flake8 or similar
   flake8 *.py
   ```

3. **Update documentation** if needed

4. **Test manually** with real scenarios

### PR Checklist

- [ ] All tests pass (`pytest tests/ -v`)
- [ ] Code follows style guidelines
- [ ] Type hints added to all functions
- [ ] Docstrings added/updated
- [ ] Documentation updated (README, tool-specific docs)
- [ ] No hardcoded API keys or secrets
- [ ] Error handling uses custom exceptions
- [ ] Logging used instead of print statements

### PR Description

Include:
- **What**: Brief description of changes
- **Why**: Reason for the change
- **How**: Overview of implementation
- **Testing**: How you tested the changes

Example:
```
## What
Adds support for custom API endpoints in transaction reader.

## Why
Users need to use alternative API endpoints for testing or rate limiting.

## How
- Added optional `api_base` parameter to `AvalancheTransactionReader.__init__()`
- Updated base class to support custom API bases
- All API calls now use `self.snowtrace_api_base`

## Testing
- Added unit tests for custom API base
- Tested with Snowtrace API and local test endpoint
- All 57 existing tests still pass
```

## Common Tasks

### Adding a New Token

1. Update `config.yaml`:
   ```yaml
   tokens:
     NEW_TOKEN: "0x..."
   
   known_tokens:
     "0x...":
       name: "Token Name (SYMBOL)"
       decimals: 18
   ```

2. Or update defaults in `avalanche_utils.py` if it should be permanent

### Adding a New Tool

1. Create new file: `avalanche_my_tool.py`
2. Inherit from `AvalancheTool`
3. Follow existing tool patterns
4. Add to `README.md`
5. Create `docs/README_my_tool.md`
6. Add tests in `tests/test_my_tool.py`

### Modifying Shared Utilities

- **Be careful**: Changes affect all tools
- **Update tests**: Ensure `tests/test_utils.py` covers changes
- **Consider backwards compatibility**: Don't break existing tool behavior
- **Document changes**: Update relevant docs

## Getting Help

- **Questions**: Open a GitHub issue with the "question" label
- **Bug reports**: Open an issue with detailed description and steps to reproduce
- **Feature requests**: Open an issue describing the feature and use case

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and improve

Thank you for contributing! ??
