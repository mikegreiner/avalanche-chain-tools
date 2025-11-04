"""
Tests for blackhole_pool_recommender module.
"""
import pytest
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
