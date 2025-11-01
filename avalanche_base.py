#!/usr/bin/env python3
"""
Avalanche Chain Tools - Base Class

Base class providing common functionality for all Avalanche chain analysis tools.
"""

from typing import Dict, Optional
from abc import ABC, abstractmethod

from avalanche_utils import SNOWTRACE_API_BASE, DEFAULT_HEADERS


class AvalancheTool(ABC):
    """
    Base class for all Avalanche chain analysis tools.
    
    Provides common initialization and shared functionality.
    """
    
    def __init__(self, snowtrace_api_base: Optional[str] = None, 
                 headers: Optional[Dict[str, str]] = None) -> None:
        """
        Initialize the Avalanche tool.
        
        Args:
            snowtrace_api_base: Optional custom API base URL (defaults to SNOWTRACE_API_BASE)
            headers: Optional custom headers (defaults to DEFAULT_HEADERS)
        """
        self.snowtrace_api_base: str = snowtrace_api_base or SNOWTRACE_API_BASE
        self.headers: Dict[str, str] = headers or DEFAULT_HEADERS.copy()
    
    def get_api_timeout(self, quick: bool = False) -> int:
        """
        Get API timeout value.
        
        Args:
            quick: If True, return quick timeout (5s), otherwise default (10s)
            
        Returns:
            Timeout value in seconds
        """
        return 5 if quick else 10
    
    def __repr__(self) -> str:
        """String representation of the tool"""
        return f"{self.__class__.__name__}(api_base={self.snowtrace_api_base})"
