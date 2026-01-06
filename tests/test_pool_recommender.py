"""
Tests for blackhole_pool_recommender module.
"""
import pytest
import json
import pickle
import io
import re
from unittest.mock import Mock, patch
from blackhole_pool_recommender import BlackholePoolRecommender, Pool


class TestPool:
    """Tests for Pool dataclass"""
    
    def test_pool_creation(self):
        """Test creating a Pool instance"""
        pool = Pool(
            name='Test Pool',
            total_rewards=1000.0,
            vapr=50.0,
            current_votes=10000.0
        )
        
        assert pool.name == 'Test Pool'
        assert pool.total_rewards == 1000.0
        assert pool.vapr == 50.0
        assert pool.current_votes == 10000.0
    
    def test_pool_profitability_score(self):
        """Test profitability score calculation"""
        pool = Pool(
            name='Test Pool',
            total_rewards=1000.0,
            vapr=50.0,
            current_votes=10000.0
        )
        
        score = pool.profitability_score()
        
        assert isinstance(score, float)
        assert score >= 0
    
    def test_pool_estimate_user_rewards(self):
        """Test user reward estimation"""
        pool = Pool(
            name='Test Pool',
            total_rewards=1000.0,
            vapr=50.0,
            current_votes=10000.0
        )
        
        user_voting_power = 5000.0
        estimated = pool.estimate_user_rewards(user_voting_power)
        
        assert isinstance(estimated, float)
        assert estimated >= 0
        assert estimated <= pool.total_rewards  # Can't get more than total
    
    def test_pool_estimate_user_rewards_no_votes(self):
        """Test reward estimation when pool has no votes"""
        pool = Pool(
            name='Test Pool',
            total_rewards=1000.0,
            vapr=50.0,
            current_votes=None
        )
        
        estimated = pool.estimate_user_rewards(5000.0)
        
        # Should return total rewards if no current votes
        assert estimated == 1000.0


class TestPoolRecommender:
    """Tests for BlackholePoolRecommender class"""
    
    def test_init(self):
        """Test that recommender initializes correctly"""
        recommender = BlackholePoolRecommender()
        
        assert recommender.url == "https://blackhole.xyz/vote"
        assert recommender.headless is True
        assert recommender.pools == []
    
    def test_init_with_headless_false(self):
        """Test initialization with headless=False"""
        recommender = BlackholePoolRecommender(headless=False)
        
        assert recommender.headless is False
    
    def test_print_recommendations_empty(self):
        """Test printing recommendations with no pools"""
        recommender = BlackholePoolRecommender()
        
        # Should handle empty list gracefully
        recommender.print_recommendations([])
        # No assertion needed, just shouldn't crash
    
    def test_print_recommendations_with_pools(self):
        """Test printing recommendations with pools"""
        recommender = BlackholePoolRecommender()
        
        pools = [
            Pool('Test Pool 1', 1000.0, 50.0, 10000.0),
            Pool('Test Pool 2', 2000.0, 75.0, 5000.0)
        ]
        
        # Should not crash
        recommender.print_recommendations(pools)
        # No assertion needed, just shouldn't crash
    
    def test_print_recommendations_json(self):
        """Test JSON output"""
        recommender = BlackholePoolRecommender()
        
        pools = [
            Pool('Test Pool', 1000.0, 50.0, 10000.0)
        ]
        
        # Get JSON output
        output = recommender.print_recommendations(pools, output_json=True, return_output=True)
        
        import json
        data = json.loads(output)
        
        assert 'pools' in data
        assert len(data['pools']) == 1
    
    def test_print_recommendations_return_output(self):
        """Test getting output as string"""
        recommender = BlackholePoolRecommender()
        
        pools = [
            Pool('Test Pool', 1000.0, 50.0, 10000.0)
        ]
        
        output = recommender.print_recommendations(pools, return_output=True)
        
        assert isinstance(output, str)
        assert 'BLACKHOLE DEX POOL RECOMMENDATIONS' in output
        assert 'Test Pool' in output
    
    def test_print_recommendations_single_line(self):
        """Test single-line output format"""
        recommender = BlackholePoolRecommender()
        
        pools = [
            Pool('CL200-SPX/USDC', 5000.0, 50.0, 10000.0),
            Pool('CL1-USDC/GHO', 2000.0, 75.0, 5000.0),
            Pool('CL200-SUPER/USDC', 3000.0, 60.0, 8000.0)
        ]
        
        output = recommender.print_recommendations(
            pools,
            user_voting_power=15000.0,
            single_line=True,
            return_output=True
        )
        
        assert isinstance(output, str)
        assert 'BLACKHOLE DEX RECOMMENDATIONS' in output or 'BLACKHOLE DEX POOL RECOMMENDATIONS' in output
        
        # Check that each pool appears on a single line with the expected format
        lines = output.split('\n')
        pool_lines = [line for line in lines if line.strip().startswith(('1.', '2.', '3.'))]
        
        assert len(pool_lines) == 3
        
        # Check format: should have pool name, dollar amount, and share percentage
        for line in pool_lines:
            assert '$' in line  # Should have dollar amount
            assert '% share' in line  # Should have share percentage
            assert 'CL200' in line or 'CL1' in line  # Should have pool name
        
        # Check that dollar amounts are aligned (all should have similar spacing)
        # The dollar signs should be at similar positions after padding
        dollar_positions = []
        for line in pool_lines:
            dollar_pos = line.find('$')
            if dollar_pos > 0:
                dollar_positions.append(dollar_pos)
        
        # All dollar signs should be at similar positions (within a few characters for alignment)
        if len(dollar_positions) > 1:
            max_pos = max(dollar_positions)
            min_pos = min(dollar_positions)
            # Allow some variation but should be roughly aligned
            assert (max_pos - min_pos) < 10  # Should be within 10 characters
    
    def test_print_recommendations_single_line_no_voting_power(self):
        """Test single-line output format without voting power"""
        recommender = BlackholePoolRecommender()
        
        pools = [
            Pool('CL200-SPX/USDC', 5000.0, 50.0, 10000.0),
            Pool('CL1-USDC/GHO', 2000.0, 75.0, 5000.0)
        ]
        
        output = recommender.print_recommendations(
            pools,
            single_line=True,
            return_output=True
        )
        
        assert isinstance(output, str)
        
        # Without voting power, should just show pool names
        lines = output.split('\n')
        pool_lines = [line for line in lines if line.strip().startswith(('1.', '2.'))]
        
        assert len(pool_lines) == 2
        # Should have pool names but no dollar amounts (since no voting power)
        for line in pool_lines:
            assert 'CL200' in line or 'CL1' in line
            # Should not have dollar amounts or share percentages when no voting power
            assert '$' not in line
            assert '% share' not in line
    
    def test_recommend_pools_sorting(self):
        """Test pool sorting by profitability"""
        recommender = BlackholePoolRecommender()
        
        # Mock fetch_pools to return test pools
        with patch.object(recommender, 'fetch_pools') as mock_fetch:
            mock_fetch.return_value = [
                Pool('Low Reward', 100.0, 10.0, 10000.0),
                Pool('High Reward', 1000.0, 50.0, 5000.0),
                Pool('Medium Reward', 500.0, 30.0, 8000.0)
            ]
            
            recommendations = recommender.recommend_pools(top_n=2, quiet=True)
            
            # Should return top 2, sorted by profitability
            assert len(recommendations) == 2
            # Highest reward pool should be first
            assert recommendations[0].total_rewards >= recommendations[1].total_rewards
    
    def test_recommend_pools_with_voting_power(self):
        """Test pool recommendations with voting power"""
        recommender = BlackholePoolRecommender()
        
        with patch.object(recommender, 'fetch_pools') as mock_fetch:
            mock_fetch.return_value = [
                Pool('Pool A', 1000.0, 50.0, 10000.0),
                Pool('Pool B', 2000.0, 75.0, 5000.0)
            ]
            
            recommendations = recommender.recommend_pools(
                top_n=2,
                user_voting_power=15000.0,
                quiet=True
            )
            
            assert len(recommendations) == 2
            # Should be sorted by estimated reward, not profitability score
    
    def test_recommend_pools_hide_vamm(self):
        """Test filtering out vAMM pools"""
        recommender = BlackholePoolRecommender()
        
        with patch.object(recommender, 'fetch_pools') as mock_fetch:
            mock_fetch.return_value = [
                Pool('vAMM-Pool', 1000.0, 50.0, 10000.0, pool_type='vAMM'),
                Pool('CL200-Pool', 2000.0, 75.0, 5000.0, pool_type='CL200')
            ]
            
            recommendations = recommender.recommend_pools(
                top_n=5,
                hide_vamm=True,
                quiet=True
            )
            
            # Should only have CL200 pool
            assert len(recommendations) == 1
            assert recommendations[0].pool_type != 'vAMM'
    
    def test_recommend_pools_max_pool_percentage(self):
        """Test filtering by maximum pool percentage"""
        recommender = BlackholePoolRecommender()
        
        # Pool 1: User would have 0.4% (15000 / (3500000 + 15000) * 100 = 0.43%)
        # Pool 2: User would have 0.6% (15000 / (2485000 + 15000) * 100 = 0.60%)
        # Pool 3: User would have 0.3% (15000 / (4985000 + 15000) * 100 = 0.30%)
        with patch.object(recommender, 'fetch_pools') as mock_fetch:
            mock_fetch.return_value = [
                Pool('Pool A', 1000.0, 50.0, 3500000.0),  # ~0.43% - should be included
                Pool('Pool B', 2000.0, 75.0, 2485000.0),  # ~0.60% - should be filtered
                Pool('Pool C', 3000.0, 80.0, 4985000.0)  # ~0.30% - should be included
            ]
            
            recommendations = recommender.recommend_pools(
                top_n=5,
                user_voting_power=15000.0,
                max_pool_percentage=0.5,  # Filter out pools where user would have > 0.5%
                quiet=True
            )
            
            # Should only have pools A and C (both <= 0.5%)
            assert len(recommendations) == 2
            assert 'Pool A' in [p.name for p in recommendations]
            assert 'Pool C' in [p.name for p in recommendations]
            assert 'Pool B' not in [p.name for p in recommendations]
    
    def test_recommend_pools_max_pool_percentage_no_votes(self):
        """Test max pool percentage filter with pools that have no votes"""
        recommender = BlackholePoolRecommender()
        
        with patch.object(recommender, 'fetch_pools') as mock_fetch:
            mock_fetch.return_value = [
                Pool('Pool No Votes', 1000.0, 50.0, None),  # No votes - would be 100%
                Pool('Pool Zero Votes', 2000.0, 75.0, 0.0),  # Zero votes - would be 100%
                Pool('Pool With Votes', 3000.0, 80.0, 1000000.0)  # Has votes - ~1.48%
            ]
            
            recommendations = recommender.recommend_pools(
                top_n=5,
                user_voting_power=15000.0,
                max_pool_percentage=0.5,  # Filter out pools where user would have > 0.5%
                quiet=True
            )
            
            # Pools with no votes would give user 100%, so they should be filtered out
            # Pool with votes gives ~1.48%, so also filtered
            assert len(recommendations) == 0
    
    def test_recommend_pools_min_rewards(self):
        """Test filtering by minimum rewards"""
        recommender = BlackholePoolRecommender()
        
        with patch.object(recommender, 'fetch_pools') as mock_fetch:
            mock_fetch.return_value = [
                Pool('Pool A', 500.0, 50.0, 10000.0),   # Below threshold
                Pool('Pool B', 1500.0, 75.0, 5000.0),   # Above threshold
                Pool('Pool C', 2000.0, 80.0, 8000.0)   # Above threshold
            ]
            
            recommendations = recommender.recommend_pools(
                top_n=5,
                min_rewards=1000.0,  # Filter out pools with < $1000 rewards
                quiet=True
            )
            
            # Should only have pools B and C (both >= $1000)
            assert len(recommendations) == 2
            assert 'Pool B' in [p.name for p in recommendations]
            assert 'Pool C' in [p.name for p in recommendations]
            assert 'Pool A' not in [p.name for p in recommendations]
    
    def test_recommend_pools_pool_name(self):
        """Test filtering by pool name using shell-style wildcards"""
        recommender = BlackholePoolRecommender()
        
        with patch.object(recommender, 'fetch_pools') as mock_fetch:
            mock_fetch.return_value = [
                Pool('WAVAX/USDC', 1000.0, 50.0, 10000.0),
                Pool('WAVAX/USDT', 1500.0, 75.0, 5000.0),
                Pool('BTC.b/USDC', 2000.0, 80.0, 8000.0),
                Pool('ETH.e/USDC', 2500.0, 85.0, 12000.0),
                Pool('CL200-WAVAX/USDC', 3000.0, 90.0, 15000.0)
            ]
            
            # Test wildcard pattern: WAVAX/*
            recommendations = recommender.recommend_pools(
                top_n=5,
                pool_name='WAVAX/*',
                quiet=True
            )
            
            # Should only have pools starting with "WAVAX/"
            assert len(recommendations) == 2
            assert all('WAVAX/' in p.name for p in recommendations)
            assert 'BTC.b/USDC' not in [p.name for p in recommendations]
            assert 'ETH.e/USDC' not in [p.name for p in recommendations]
    
    def test_recommend_pools_pool_name_case_insensitive(self):
        """Test that pool name filtering is case-insensitive"""
        recommender = BlackholePoolRecommender()
        
        with patch.object(recommender, 'fetch_pools') as mock_fetch:
            mock_fetch.return_value = [
                Pool('WAVAX/USDC', 1000.0, 50.0, 10000.0),
                Pool('wavax/usdt', 1500.0, 75.0, 5000.0),
                Pool('Wavax/USDC', 2000.0, 80.0, 8000.0),
                Pool('BTC.b/USDC', 2500.0, 85.0, 12000.0)
            ]
            
            # Test with lowercase pattern
            recommendations = recommender.recommend_pools(
                top_n=5,
                pool_name='wavax/*',
                quiet=True
            )
            
            # Should match all WAVAX pools regardless of case
            assert len(recommendations) == 3
            assert all('wavax' in p.name.lower() for p in recommendations)
            assert 'BTC.b/USDC' not in [p.name for p in recommendations]
    
    def test_recommend_pools_pool_name_contains(self):
        """Test pool name filtering with *BLACK* pattern"""
        recommender = BlackholePoolRecommender()
        
        with patch.object(recommender, 'fetch_pools') as mock_fetch:
            mock_fetch.return_value = [
                Pool('WAVAX/BLACK', 1000.0, 50.0, 10000.0),
                Pool('BLACK/USDC', 1500.0, 75.0, 5000.0),
                Pool('BTC.b/USDC', 2000.0, 80.0, 8000.0),
                Pool('CL200-BLACK/USDC', 2500.0, 85.0, 12000.0)
            ]
            
            # Test pattern: *BLACK*
            recommendations = recommender.recommend_pools(
                top_n=5,
                pool_name='*BLACK*',
                quiet=True
            )
            
            # Should match all pools containing "BLACK"
            assert len(recommendations) == 3
            assert all('BLACK' in p.name.upper() for p in recommendations)
            assert 'BTC.b/USDC' not in [p.name for p in recommendations]
    
    def test_recommend_pools_pool_name_prefix(self):
        """Test pool name filtering with CL200-* pattern"""
        recommender = BlackholePoolRecommender()
        
        with patch.object(recommender, 'fetch_pools') as mock_fetch:
            mock_fetch.return_value = [
                Pool('CL200-WAVAX/USDC', 1000.0, 50.0, 10000.0),
                Pool('CL200-BTC.b/USDC', 1500.0, 75.0, 5000.0),
                Pool('CL1-WAVAX/USDC', 2000.0, 80.0, 8000.0),
                Pool('WAVAX/USDC', 2500.0, 85.0, 12000.0)
            ]
            
            # Test pattern: CL200-*
            recommendations = recommender.recommend_pools(
                top_n=5,
                pool_name='CL200-*',
                quiet=True
            )
            
            # Should only match pools starting with "CL200-"
            assert len(recommendations) == 2
            assert all(p.name.startswith('CL200-') for p in recommendations)
            assert 'CL1-WAVAX/USDC' not in [p.name for p in recommendations]
            assert 'WAVAX/USDC' not in [p.name for p in recommendations]
    
    def test_recommend_pools_pool_name_auto_wildcard(self):
        """Test that pool name without wildcards is automatically wrapped with *"""
        recommender = BlackholePoolRecommender()
        
        with patch.object(recommender, 'fetch_pools') as mock_fetch:
            mock_fetch.return_value = [
                Pool('WAVAX/BTC.b', 1000.0, 50.0, 10000.0),
                Pool('BTC.b/USDC', 1500.0, 75.0, 5000.0),
                Pool('ETH.e/USDC', 2000.0, 80.0, 8000.0),
                Pool('CL200-BTC.b/USDC', 2500.0, 85.0, 12000.0)
            ]
            
            # Test pattern without wildcards: "btc.b" should become "*btc.b*"
            recommendations = recommender.recommend_pools(
                top_n=5,
                pool_name='btc.b',
                quiet=True
            )
            
            # Should match all pools containing "btc.b" (case-insensitive)
            assert len(recommendations) == 3
            assert all('btc.b' in p.name.lower() for p in recommendations)
            assert 'ETH.e/USDC' not in [p.name for p in recommendations]
    
    def test_recommend_pools_pool_name_explicit_wildcard_preserved(self):
        """Test that explicit wildcards are not double-wrapped"""
        recommender = BlackholePoolRecommender()
        
        with patch.object(recommender, 'fetch_pools') as mock_fetch:
            mock_fetch.return_value = [
                Pool('WAVAX/USDC', 1000.0, 50.0, 10000.0),
                Pool('WAVAX/USDT', 1500.0, 75.0, 5000.0),
                Pool('BTC.b/USDC', 2000.0, 80.0, 8000.0)
            ]
            
            # Test pattern with explicit wildcard: "WAVAX/*" should not be wrapped
            recommendations = recommender.recommend_pools(
                top_n=5,
                pool_name='WAVAX/*',
                quiet=True
            )
            
            # Should only match pools starting with "WAVAX/"
            assert len(recommendations) == 2
            assert all(p.name.startswith('WAVAX/') for p in recommendations)
            assert 'BTC.b/USDC' not in [p.name for p in recommendations]
    
    def test_generate_voting_script_with_pools(self):
        """Test generating voting script with pools that have pool_id"""
        recommender = BlackholePoolRecommender()
        
        pools = [
            Pool('Test Pool 1', 1000.0, 50.0, 10000.0, pool_id='0x1234567890123456789012345678901234567890'),
            Pool('Test Pool 2', 2000.0, 75.0, 5000.0, pool_id='0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
        ]
        
        script = recommender.generate_voting_script(pools, quiet=True)
        
        assert script is not None
        assert isinstance(script, str)
        assert '0x1234567890123456789012345678901234567890' in script
        assert '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' in script
        assert 'Test Pool 1' in script or 'Test Pool 2' in script
    
    def test_generate_voting_script_without_pool_ids(self):
        """Test generating voting script with pools that don't have pool_id"""
        recommender = BlackholePoolRecommender()
        
        pools = [
            Pool('Test Pool 1', 1000.0, 50.0, 10000.0, pool_id=None),
            Pool('Test Pool 2', 2000.0, 75.0, 5000.0, pool_id=None)
        ]
        
        script = recommender.generate_voting_script(pools, quiet=True)
        
        # Should return None if no pool_ids available
        assert script is None
    
    def test_generate_voting_script_empty_list(self):
        """Test generating voting script with empty pool list"""
        recommender = BlackholePoolRecommender()
        
        script = recommender.generate_voting_script([], quiet=True)
        
        assert script is None
    
    def test_generate_voting_script_mixed_pool_ids(self):
        """Test generating voting script with some pools having pool_id and some not"""
        recommender = BlackholePoolRecommender()
        
        pools = [
            Pool('Test Pool 1', 1000.0, 50.0, 10000.0, pool_id='0x1234567890123456789012345678901234567890'),
            Pool('Test Pool 2', 2000.0, 75.0, 5000.0, pool_id=None)  # No pool_id
        ]
        
        script = recommender.generate_voting_script(pools, quiet=True)
        
        # Should still generate script if at least one pool has pool_id
        assert script is not None
        assert isinstance(script, str)
        assert '0x1234567890123456789012345678901234567890' in script


class TestCaching:
    """Tests for caching functionality"""
    
    def test_init_with_no_cache(self):
        """Test initialization with no_cache=True"""
        recommender = BlackholePoolRecommender(no_cache=True)
        
        assert recommender.no_cache is True
        assert recommender.cache_enabled is False  # Cache reading disabled
    
    def test_init_without_no_cache(self):
        """Test initialization without no_cache (default)"""
        recommender = BlackholePoolRecommender()
        
        assert recommender.no_cache is False
        # cache_enabled depends on config, but should not be forced False
    
    def test_fetch_pools_skips_cache_when_no_cache_true(self):
        """Test that fetch_pools skips cache when no_cache=True"""
        recommender = BlackholePoolRecommender(no_cache=True)
        
        test_pools = [
            Pool('Test Pool 1', 1000.0, 50.0, 10000.0),
            Pool('Test Pool 2', 2000.0, 75.0, 5000.0)
        ]
        
        # Mock _load_from_cache to return cached data
        with patch.object(recommender, '_load_from_cache') as mock_load:
            mock_load.return_value = {'pools': test_pools}
            
            # Mock fetch_pools_selenium to return fresh data
            with patch.object(recommender, 'fetch_pools_selenium') as mock_selenium:
                mock_selenium.return_value = test_pools
                
                # Should skip cache and call fetch_pools_selenium
                pools = recommender.fetch_pools(quiet=True)
                
                # Should not have called _load_from_cache
                mock_load.assert_not_called()
                # Should have called fetch_pools_selenium
                mock_selenium.assert_called_once()
                assert pools == test_pools
    
    def test_fetch_pools_uses_cache_when_no_cache_false(self):
        """Test that fetch_pools uses cache when no_cache=False"""
        recommender = BlackholePoolRecommender(no_cache=False)
        
        # Create test pools with enough pools (>= 50) to pass the completeness check
        test_pools = [
            Pool(f'Test Pool {i}', 1000.0 + i * 100, 50.0 + i, 10000.0 + i * 1000)
            for i in range(1, 51)  # 50 pools (minimum for cache to be considered complete)
        ]
        
        # Mock _load_from_cache to return cached data
        with patch.object(recommender, '_load_from_cache') as mock_load:
            mock_load.return_value = {'pools': test_pools}
            
            # Mock cache file to exist and have reasonable size (passes size check)
            # 50 pools * 100 bytes = 5000 bytes minimum
            from pathlib import Path
            original_exists = Path.exists
            original_stat = Path.stat
            
            def mock_exists(self):
                if self == recommender.cache_file:
                    return True
                return original_exists(self)
            
            # Create a mock stat result
            class MockStatResult:
                def __init__(self):
                    self.st_size = 10000  # 10KB, well above minimum
            
            def mock_stat(self, *args, **kwargs):
                if self == recommender.cache_file:
                    return MockStatResult()
                return original_stat(self)
            
            # Also need to ensure pools have high rewards to pass validation
            # Add some high-reward pools to test_pools
            test_pools_with_high_rewards = test_pools.copy()
            # First pool already has high rewards (1000 + 1*100 = 1100), but need > 10000
            # Let's modify a few to have high rewards
            for i in range(min(5, len(test_pools_with_high_rewards))):
                test_pools_with_high_rewards[i] = Pool(
                    test_pools_with_high_rewards[i].name,
                    20000.0 + i * 1000,  # High rewards
                    test_pools_with_high_rewards[i].vapr,
                    test_pools_with_high_rewards[i].current_votes,
                    test_pools_with_high_rewards[i].pool_id,
                    test_pools_with_high_rewards[i].pool_type,
                    test_pools_with_high_rewards[i].fee_percentage
                )
            mock_load.return_value = {'pools': test_pools_with_high_rewards}
            
            with patch.object(Path, 'exists', mock_exists):
                with patch.object(Path, 'stat', mock_stat):
                    # Should use cache and return cached pools
                    # Patch fetch_pools_selenium class method to be safe
                    with patch('blackhole_pool_recommender.BlackholePoolRecommender.fetch_pools_selenium') as mock_selenium:
                        mock_selenium.return_value = test_pools_with_high_rewards
                        
                        pools = recommender.fetch_pools(quiet=True)
                        
                        # Should have called _load_from_cache
                        mock_load.assert_called_once()
                        # Just check we got pools back, not exact match (since we modified them)
                        assert len(pools) == len(test_pools_with_high_rewards)
    
    def test_fetch_pools_skips_incomplete_cache(self):
        """Test that fetch_pools skips cache if it has very few pools (< 50)"""
        recommender = BlackholePoolRecommender(no_cache=False)
        
        # Create test pools with too few pools (< 50) - should be skipped
        incomplete_pools = [
            Pool('Test Pool 1', 1000.0, 50.0, 10000.0),
            Pool('Test Pool 2', 2000.0, 75.0, 5000.0)
        ]
        
        fresh_pools = [
            Pool(f'Fresh Pool {i}', 2000.0 + i * 100, 60.0 + i, 15000.0 + i * 1000)
            for i in range(1, 51)  # 50 pools (minimum for cache to be considered complete)
        ]
        
        # Mock _load_from_cache to return incomplete cached data
        with patch.object(recommender, '_load_from_cache') as mock_load:
            mock_load.return_value = {'pools': incomplete_pools}
            
            # Mock fetch_pools_selenium to return fresh data
            with patch.object(recommender, 'fetch_pools_selenium') as mock_selenium:
                mock_selenium.return_value = fresh_pools
                
                # Should skip incomplete cache and fetch fresh data
                pools = recommender.fetch_pools(quiet=True)
                
                # Should have called _load_from_cache
                mock_load.assert_called_once()
                # Should have called fetch_pools_selenium (skipped cache)
                mock_selenium.assert_called_once()
                # Should return fresh pools, not cached ones
                assert pools == fresh_pools
    
    def test_save_to_cache_still_works_with_no_cache(self):
        """Test that _save_to_cache still works even when no_cache=True"""
        recommender = BlackholePoolRecommender(no_cache=True)
        
        # Create valid pools (50+ pools to pass validation)
        test_pools = []
        for i in range(1, 51):
            rewards = 1000.0 + i * 100
            if i == 50:
                rewards = 20000.0  # High reward pool
            
            test_pools.append(Pool(
                name=f'Test Pool {i}',
                total_rewards=rewards,
                vapr=50.0 + i,
                current_votes=10000.0 + i * 1000,
                pool_id=f'0x{i:040d}'  # Mock pool_id
            ))
        
        # Mock _ensure_cache_dir and file operations
        with patch.object(recommender, '_ensure_cache_dir') as mock_ensure:
            # Mock open to handle both binary (pickle) and text (JSON) file operations
            # Also need to mock fcntl for file locking
            import io
            
            # Track if files were opened
            files_opened = []
            
            class MockFile:
                """Mock file object with fileno() for fcntl"""
                def __init__(self, filename, mode):
                    self.filename = filename
                    self.mode = mode
                    self._fileno = 42  # Dummy file descriptor
                    if 'b' in mode:
                        self._file = io.BytesIO()
                    else:
                        self._file = io.StringIO()
                
                def fileno(self):
                    return self._fileno
                
                def __getattr__(self, name):
                    return getattr(self._file, name)
                
                def __enter__(self):
                    return self
                
                def __exit__(self, *args):
                    pass
            
            def mock_open_func(filename, mode='r', *args, **kwargs):
                files_opened.append((filename, mode))
                return MockFile(filename, mode)
            
            with patch('builtins.open', side_effect=mock_open_func):
                with patch('fcntl.flock'):  # Mock fcntl.flock to avoid actual locking
                    # Should still save to cache (to refresh it) without raising exception
                    try:
                        recommender._save_to_cache(test_pools)
                        exception_raised = False
                    except Exception:
                        exception_raised = True
                    
                    # Should not have raised an exception
                    assert not exception_raised
                    # Should have called _ensure_cache_dir
                    mock_ensure.assert_called_once()
                    # Should have opened at least lock file and temp cache file
                    # (metadata file might not be opened if cache file write fails in test)
                    assert len(files_opened) >= 2
    
    def test_get_cache_info_no_cache(self):
        """Test _get_cache_info when no cache exists"""
        recommender = BlackholePoolRecommender()
        
        # Mock cache metadata file not existing by patching Path.exists
        from pathlib import Path
        original_exists = Path.exists
        
        def mock_exists(self):
            if self == recommender.cache_metadata_file:
                return False
            return original_exists(self)
        
        with patch.object(Path, 'exists', mock_exists):
            cache_info = recommender._get_cache_info()
            assert cache_info is None
    
    def test_get_cache_info_with_cache(self):
        """Test _get_cache_info when cache exists with valid content"""
        recommender = BlackholePoolRecommender()
        
        # Create mock cache metadata
        from datetime import datetime, timezone, timedelta
        test_timestamp = datetime.now(timezone.utc) - timedelta(minutes=2)
        test_metadata = {
            'timestamp': test_timestamp.isoformat(),
            'pool_count': 50,
            'expiry_minutes': 7
        }
        
        # Create valid pools for content validation (50+ pools with valid data)
        valid_pools = []
        for i in range(60):
            pool = Pool(
                name=f"Pool {i}",
                total_rewards=10000.0 + i * 100,  # High rewards
                vapr=50.0,
                pool_id=f"pool_{i}",
                pool_type="CL200"
            )
            valid_pools.append(pool)
        
        # Mock Path.exists to return True for both cache files
        from pathlib import Path
        original_exists = Path.exists
        original_stat = Path.stat
        
        def mock_exists(self):
            if self == recommender.cache_metadata_file or self == recommender.cache_file:
                return True
            return original_exists(self)
        
        def mock_stat(self, *args, **kwargs):
            if self == recommender.cache_file:
                # Mock file size (60 pools * 100 bytes = 6000 bytes minimum)
                mock_stat_result = Mock()
                mock_stat_result.st_size = 10000  # Valid size
                return mock_stat_result
            return original_stat(self)
        
        # Mock cache metadata file and cache file
        with patch.object(Path, 'exists', mock_exists):
            with patch.object(Path, 'stat', mock_stat):
                with patch('builtins.open', create=True) as mock_open:
                    call_count = [0]
                    
                    def mock_open_side_effect(path, mode='r', *args, **kwargs):
                        call_count[0] += 1
                        if 'metadata' in str(path) or path == recommender.cache_metadata_file:
                            # Return metadata JSON
                            mock_file = io.StringIO(json.dumps(test_metadata))
                        elif 'rb' in mode or path == recommender.cache_file:
                            # Return pickled pools data
                            mock_file = io.BytesIO(pickle.dumps({'pools': valid_pools}))
                        else:
                            # Lock file
                            mock_file = io.StringIO('')
                        
                        mock_file_obj = Mock()
                        mock_file_obj.__enter__ = Mock(return_value=mock_file)
                        mock_file_obj.__exit__ = Mock(return_value=None)
                        mock_file_obj.fileno = Mock(return_value=1)
                        return mock_file_obj
                    
                    mock_open.side_effect = mock_open_side_effect
                    
                    # Mock fcntl for file locking
                    with patch('fcntl.flock'):
                        cache_info = recommender._get_cache_info()
                        
                        assert cache_info is not None
                        assert cache_info['pool_count'] == 60  # Actual pool count from loaded data
                        assert cache_info['expiry_minutes'] == 7
                        assert cache_info['is_valid'] is True
                        assert cache_info['timestamp_valid'] is True
                        assert cache_info['content_valid'] is True
                        assert cache_info['age_minutes'] >= 1.9  # Should be around 2 minutes
                        assert 'timestamp' in cache_info
                        assert 'expiry_time' in cache_info
                        assert 'time_until_expiry' in cache_info
                        assert 'validation_issues' in cache_info
                        assert len(cache_info['validation_issues']) == 0  # No validation issues
    
    def test_get_cache_info_expired_cache(self):
        """Test _get_cache_info with expired cache (timestamp expired)"""
        recommender = BlackholePoolRecommender()
        
        # Create mock cache metadata with old timestamp (expired)
        from datetime import datetime, timezone, timedelta
        test_timestamp = datetime.now(timezone.utc) - timedelta(minutes=10)  # 10 minutes ago
        test_metadata = {
            'timestamp': test_timestamp.isoformat(),
            'pool_count': 50,
            'expiry_minutes': 7  # Expired 3 minutes ago
        }
        
        # Mock Path.exists to return True for cache metadata file
        from pathlib import Path
        original_exists = Path.exists
        
        def mock_exists(self):
            if self == recommender.cache_metadata_file:
                return True
            return original_exists(self)
        
        # Mock cache metadata file exists (but timestamp expired, so content validation won't run)
        with patch.object(Path, 'exists', mock_exists):
            with patch('builtins.open', create=True) as mock_open:
                mock_file = io.StringIO(json.dumps(test_metadata))
                mock_open.return_value.__enter__.return_value = mock_file
                mock_open.return_value.__exit__ = lambda *args: None
                
                cache_info = recommender._get_cache_info()
                
                assert cache_info is not None
                assert cache_info['is_valid'] is False
                assert cache_info['timestamp_valid'] is False
                assert cache_info['pool_count'] == 50  # From metadata
    
    def test_get_cache_info_invalid_content(self):
        """Test _get_cache_info with valid timestamp but invalid content"""
        recommender = BlackholePoolRecommender()
        
        # Create mock cache metadata with recent timestamp (valid)
        from datetime import datetime, timezone, timedelta
        test_timestamp = datetime.now(timezone.utc) - timedelta(minutes=2)
        test_metadata = {
            'timestamp': test_timestamp.isoformat(),
            'pool_count': 30,  # Less than 50
            'expiry_minutes': 7
        }
        
        # Create invalid pools (too few pools)
        invalid_pools = []
        for i in range(30):
            pool = Pool(
                name=f"Pool {i}",
                total_rewards=1000.0,
                vapr=50.0,
                pool_id=f"pool_{i}",
                pool_type="CL200"
            )
            invalid_pools.append(pool)
        
        # Mock Path.exists to return True for both cache files
        from pathlib import Path
        original_exists = Path.exists
        original_stat = Path.stat
        
        def mock_exists(self):
            if self == recommender.cache_metadata_file or self == recommender.cache_file:
                return True
            return original_exists(self)
        
        def mock_stat(self, *args, **kwargs):
            if self == recommender.cache_file:
                mock_stat_result = Mock()
                mock_stat_result.st_size = 5000  # Valid size
                return mock_stat_result
            return original_stat(self)
        
        # Mock cache metadata file and cache file
        with patch.object(Path, 'exists', mock_exists):
            with patch.object(Path, 'stat', mock_stat):
                with patch('builtins.open', create=True) as mock_open:
                    def mock_open_side_effect(path, mode='r', *args, **kwargs):
                        if 'metadata' in str(path) or path == recommender.cache_metadata_file:
                            mock_file = io.StringIO(json.dumps(test_metadata))
                        elif 'rb' in mode or path == recommender.cache_file:
                            mock_file = io.BytesIO(pickle.dumps({'pools': invalid_pools}))
                        else:
                            mock_file = io.StringIO('')
                        
                        mock_file_obj = Mock()
                        mock_file_obj.__enter__ = Mock(return_value=mock_file)
                        mock_file_obj.__exit__ = Mock(return_value=None)
                        mock_file_obj.fileno = Mock(return_value=1)
                        return mock_file_obj
                    
                    mock_open.side_effect = mock_open_side_effect
                    
                    # Mock fcntl for file locking
                    with patch('fcntl.flock'):
                        cache_info = recommender._get_cache_info()
                        
                        assert cache_info is not None
                        assert cache_info['pool_count'] == 30  # Actual pool count
                        assert cache_info['is_valid'] is False  # Invalid due to content
                        assert cache_info['timestamp_valid'] is True  # Timestamp is valid
                        assert cache_info['content_valid'] is False  # Content validation failed
                        assert 'validation_issues' in cache_info
                        assert len(cache_info['validation_issues']) > 0  # Should have validation issues
                        # Should mention too few pools
                        assert any('only 30 pools' in issue for issue in cache_info['validation_issues'])
    
    def test_validate_cache_content(self):
        """Test _validate_cache_content method"""
        recommender = BlackholePoolRecommender()
        
        # Test with valid pools (50+ pools, good data)
        valid_pools = []
        for i in range(60):
            pool = Pool(
                name=f"Pool {i}",
                total_rewards=10000.0 + i * 100,  # High rewards
                vapr=50.0,
                pool_id=f"pool_{i}",
                pool_type="CL200"
            )
            valid_pools.append(pool)
        
        # Mock cache file size
        from pathlib import Path
        original_stat = Path.stat
        
        def mock_stat(self, *args, **kwargs):
            if self == recommender.cache_file:
                mock_stat_result = Mock()
                mock_stat_result.st_size = 10000  # Valid size
                return mock_stat_result
            return original_stat(self)
        
        with patch.object(Path, 'stat', mock_stat):
            is_valid, issues = recommender._validate_cache_content(valid_pools)
            assert is_valid is True
            assert len(issues) == 0
        
        # Test with too few pools
        few_pools = valid_pools[:30]
        with patch.object(Path, 'stat', mock_stat):
            is_valid, issues = recommender._validate_cache_content(few_pools)
            assert is_valid is False
            assert len(issues) > 0
            assert any('only 30 pools' in issue for issue in issues)
        
        # Test with missing data
        pools_with_missing_data = []
        for i in range(60):
            # First 10 pools missing essential data
            if i < 10:
                pool = Pool(
                    name="",  # Missing name
                    total_rewards=None,  # Missing rewards
                    vapr=50.0,
                    pool_id=None,  # Missing pool_id
                    pool_type="CL200"
                )
            else:
                pool = Pool(
                    name=f"Pool {i}",
                    total_rewards=10000.0,
                    vapr=50.0,
                    pool_id=f"pool_{i}",
                    pool_type="CL200"
                )
            pools_with_missing_data.append(pool)
        
        with patch.object(Path, 'stat', mock_stat):
            is_valid, issues = recommender._validate_cache_content(pools_with_missing_data)
            assert is_valid is False
            assert len(issues) > 0
            assert any('missing essential data' in issue for issue in issues)


class TestVAPRExtraction:
    """Tests for VAPR extraction with comma-separated numbers"""
    
    def test_vapr_extraction_with_commas(self):
        """Test that VAPR values with commas are correctly extracted"""
        # Test the regex pattern used in the code
        vapr_pattern = r'([\d,]+\.?\d*)\s*%'
        
        # Test cases: (input_text, expected_value)
        test_cases = [
            ("1,684.6%", 1684.6),
            ("697.20%", 697.20),
            ("1,000%", 1000.0),
            ("50.5%", 50.5),
            ("10,000.25%", 10000.25),
            ("VAPR: 1,234.56%", 1234.56),
            ("Some text 2,500.75% more text", 2500.75),
        ]
        
        for input_text, expected_value in test_cases:
            match = re.search(vapr_pattern, input_text)
            assert match is not None, f"Pattern should match '{input_text}'"
            extracted_value = float(match.group(1).replace(',', ''))
            assert extracted_value == expected_value, \
                f"Expected {expected_value} from '{input_text}', got {extracted_value}"
    
    def test_vapr_extraction_findall_with_commas(self):
        """Test findall pattern for multiple VAPR values with commas"""
        vapr_pattern = r'([\d,]+\.?\d*)\s*%'
        
        # Text with multiple percentages
        text = "Pool has VAPR: 1,684.6% and fee: 0.5%"
        percentages = re.findall(vapr_pattern, text)
        
        assert len(percentages) == 2
        vapr_values = [float(p.replace(',', '')) for p in percentages]
        
        # Should extract both values correctly
        assert 1684.6 in vapr_values
        assert 0.5 in vapr_values
        
        # Test with large VAPR value
        text2 = "VAPR: 2,500.75%"
        percentages2 = re.findall(vapr_pattern, text2)
        assert len(percentages2) == 1
        assert float(percentages2[0].replace(',', '')) == 2500.75


class TestRewardExtractionWithSuffixes:
    """Tests for reward extraction with k (thousands) and M (millions) suffixes"""
    
    def test_reward_extraction_with_k_suffix(self):
        """Test that reward values with 'k' suffix are correctly parsed as thousands"""
        # Test the regex pattern used in the code
        reward_pattern = r'\$([\d,]+\.?\d*)\s*([kKmM])?'
        
        # Test cases: (input_text, expected_value)
        test_cases = [
            ("$26.49k", 26490.0),
            ("$1.5k", 1500.0),
            ("$100k", 100000.0),
            ("$1,234.56k", 1234560.0),
            ("$26.49K", 26490.0),  # Uppercase K
            ("Fees + Incentives: $26.49k", 26490.0),
            ("Total: $31.70", 31.70),  # No suffix
            ("$5.21", 5.21),  # No suffix
        ]
        
        for input_text, expected_value in test_cases:
            matches = re.findall(reward_pattern, input_text)
            assert len(matches) > 0, f"Pattern should match '{input_text}'"
            
            # Process the first match
            match = matches[0]
            num_str = match[0].replace(',', '')
            val = float(num_str)
            suffix = match[1] if len(match) > 1 and match[1] else ''
            
            # Apply multiplier
            if suffix.lower() == 'k':
                val *= 1000
            elif suffix.lower() == 'm':
                val *= 1000000
            
            assert abs(val - expected_value) < 0.01, \
                f"Expected {expected_value} from '{input_text}', got {val}"
    
    def test_reward_extraction_with_m_suffix(self):
        """Test that reward values with 'M' suffix are correctly parsed as millions"""
        reward_pattern = r'\$([\d,]+\.?\d*)\s*([kKmM])?'
        
        test_cases = [
            ("$1.5M", 1500000.0),
            ("$2.5m", 2500000.0),
            ("$10M", 10000000.0),
            ("$1,234.56M", 1234560000.0),
            ("Total Rewards: $5.2M", 5200000.0),
        ]
        
        for input_text, expected_value in test_cases:
            matches = re.findall(reward_pattern, input_text)
            assert len(matches) > 0, f"Pattern should match '{input_text}'"
            
            match = matches[0]
            num_str = match[0].replace(',', '')
            val = float(num_str)
            suffix = match[1] if len(match) > 1 and match[1] else ''
            
            if suffix.lower() == 'k':
                val *= 1000
            elif suffix.lower() == 'm':
                val *= 1000000
            
            assert abs(val - expected_value) < 0.01, \
                f"Expected {expected_value} from '{input_text}', got {val}"
    
    def test_reward_extraction_multiple_values(self):
        """Test extraction when multiple dollar amounts are present (fees + incentives)"""
        reward_pattern = r'\$([\d,]+\.?\d*)\s*([kKmM])?'
        
        # Test case: fees and incentives shown separately
        text = "Fees: $5.21\nIncentives: $26.49k\nTotal: $31.70k"
        matches = re.findall(reward_pattern, text)
        
        assert len(matches) >= 3, f"Should find at least 3 values in '{text}'"
        
        # Extract and process all values
        values = []
        for match in matches:
            num_str = match[0].replace(',', '')
            val = float(num_str)
            suffix = match[1] if len(match) > 1 and match[1] else ''
            
            if suffix.lower() == 'k':
                val *= 1000
            elif suffix.lower() == 'm':
                val *= 1000000
            
            values.append(val)
        
        # Should find $5.21, $26,490, and $31,700
        assert 5.21 in values or abs(min(values, key=lambda x: abs(x - 5.21)) - 5.21) < 0.01
        assert 26490.0 in values or abs(min(values, key=lambda x: abs(x - 26490.0)) - 26490.0) < 1.0
        assert 31700.0 in values or abs(min(values, key=lambda x: abs(x - 31700.0)) - 31700.0) < 1.0
    
    def test_reward_extraction_total_pattern(self):
        """Test extraction of 'Total' labeled values with suffixes"""
        # Pattern matches the actual pattern used in code: "Total: $X", "Total $X", "= $X", etc.
        total_pattern = r'(?:total\s*:?\s*|=\s*)\$?([\d,]+\.?\d*)\s*([kKmM])?'
        
        test_cases = [
            ("Total: $31.70k", 31700.0),
            ("Total = $26.49k", 26490.0),
            ("Total $26.49k", 26490.0),  # Without colon or equals
            ("total: $1.5M", 1500000.0),
            ("= $100k", 100000.0),
        ]
        
        for input_text, expected_value in test_cases:
            match = re.search(total_pattern, input_text, re.IGNORECASE)
            assert match is not None, f"Pattern should match '{input_text}'"
            
            num_str = match.group(1).replace(',', '')
            val = float(num_str)
            suffix = match.group(2) if match.lastindex >= 2 and match.group(2) else ''
            
            if suffix and suffix.lower() == 'k':
                val *= 1000
            elif suffix and suffix.lower() == 'm':
                val *= 1000000
            
            assert abs(val - expected_value) < 0.01, \
                f"Expected {expected_value} from '{input_text}', got {val}"


class TestVoteExtraction:
    """Tests for vote count extraction with K/M suffixes"""
    
    def test_vote_extraction_k_suffix(self):
        """Test parsing votes with K (thousands) suffix"""
        # Simulate the regex used in code: re.search(r'([\d,]+\.?\d*)\s*([MmKk])', text)
        vote_pattern = r'([\d,]+\.?\d*)\s*([MmKk])'
        
        test_cases = [
            ("580.81K", 580810.0),
            ("580.81k", 580810.0),
            ("100K", 100000.0),
            ("1.5K", 1500.0),
            ("2,345.67K", 2345670.0),
            ("Votes: 580.81K", 580810.0),
        ]
        
        for text, expected in test_cases:
            match = re.search(vote_pattern, text)
            assert match is not None, f"Should match '{text}'"
            
            val_str = match.group(1).replace(',', '')
            suffix = match.group(2).lower()
            
            multiplier = 1_000_000 if suffix == 'm' else 1_000
            votes = float(val_str) * multiplier
            
            assert abs(votes - expected) < 0.01, f"Expected {expected}, got {votes}"

    def test_vote_extraction_m_suffix(self):
        """Test parsing votes with M (millions) suffix"""
        vote_pattern = r'([\d,]+\.?\d*)\s*([MmKk])'
        
        test_cases = [
            ("16.03M", 16030000.0),
            ("16.03m", 16030000.0),
            ("1M", 1000000.0),
            ("1.5M", 1500000.0),
            ("1,234.56M", 1234560000.0),
        ]
        
        for text, expected in test_cases:
            match = re.search(vote_pattern, text)
            assert match is not None, f"Should match '{text}'"
            
            val_str = match.group(1).replace(',', '')
            suffix = match.group(2).lower()
            
            multiplier = 1_000_000 if suffix == 'm' else 1_000
            votes = float(val_str) * multiplier
            
            assert abs(votes - expected) < 0.01, f"Expected {expected}, got {votes}"
            
    def test_vote_extraction_fallback_regex(self):
        """Test the fallback regex which requires word boundary"""
        # Fallback pattern used in code: re.search(r'([\d,]+\.?\d*)\s*([MmKk])\b', text)
        fallback_pattern = r'([\d,]+\.?\d*)\s*([MmKk])\b'
        
        test_cases = [
            ("Total Votes: 580.81K", 580810.0),
            ("Total Votes: 16.03M", 16030000.0),
            ("580.81K votes", 580810.0),
        ]
        
        for text, expected in test_cases:
            match = re.search(fallback_pattern, text)
            assert match is not None, f"Should match '{text}'"
            
            val_str = match.group(1).replace(',', '')
            suffix = match.group(2).lower()
            
            multiplier = 1_000_000 if suffix == 'm' else 1_000
            votes = float(val_str) * multiplier
            
            assert abs(votes - expected) < 0.01, f"Expected {expected}, got {votes}"
            
    def test_vote_extraction_no_suffix(self):
        """Test parsing raw number votes (>= 1000)"""
        # Logic matches: re.findall(r'\b([\d,]+)\b', first_line)
        # Then checks if val >= 1000
        
        text = "6,967"
        numbers = re.findall(r'\b([\d,]+)\b', text)
        votes = None
        for num_str in numbers:
            val = float(num_str.replace(',', ''))
            if val >= 1000:
                votes = val
                break
                
        assert votes == 6967.0
        
        # Should ignore small numbers
        text_mixed = "123 items with 6,967 votes"
        numbers = re.findall(r'\b([\d,]+)\b', text_mixed)
        votes = None
        for num_str in numbers:
            val = float(num_str.replace(',', ''))
            if val >= 1000:
                votes = val
                break # Takes first valid one
        
        assert votes == 6967.0


