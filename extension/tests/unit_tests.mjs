
import Pool from '../lib/pool.js';
import { recommendPools } from '../lib/pool-recommender.js';

async function runTests() {
  console.log('🚀 Starting Extension Logic Unit Tests...');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      passed++;
      console.log(`  ✅ PASSED: ${message}`);
    } else {
      failed++;
      console.error(`  ❌ FAILED: ${message}`);
    }
  }

  function assertEquals(actual, expected, message) {
    if (actual === expected) {
      passed++;
      console.log(`  ✅ PASSED: ${message} (${actual})`);
    } else {
      failed++;
      console.error(`  ❌ FAILED: ${message} | Expected: ${expected}, Got: ${actual}`);
    }
  }

  // --- Pool Class Tests ---
  console.log('\n--- Testing Pool Class ---');
  
  const poolData = {
    name: 'TEST/POOL',
    total_rewards: 1000,
    vapr: 100,
    current_votes: 1000,
    pool_id: '0x123',
    pool_type: 'vAMM'
  };
  
  const pool = new Pool(poolData);
  
  assertEquals(pool.name, 'TEST/POOL', 'Pool name correctly set');
  assertEquals(pool.total_rewards, 1000, 'Total rewards correctly set');
  
  // Test calculateShare
  assertEquals(pool.calculateShare(1000), 50, 'calculateShare(1000): 1000 power + 1000 existing = 50%');
  assertEquals(pool.calculateShare(0), 0, 'calculateShare(0): Expected 0%');
  assertEquals(pool.calculateShare(3000), 75, 'calculateShare(3000): 3000 power + 1000 existing = 75%');

  // Test estimateUserRewards
  assertEquals(pool.estimateUserRewards(1000), 500, 'estimateUserRewards(1000): 50% of $1000 = $500');
  assertEquals(pool.estimateUserRewards(3000), 750, 'estimateUserRewards(3000): 75% of $1000 = $750');

  // Test rewardsPerVote
  assertEquals(pool.rewardsPerVote(), 1, 'rewardsPerVote(): $1000 / 1000 votes = $1.00');

  // --- recommendPools Tests ---
  console.log('\n--- Testing recommendPools ---');
  
  const pools = [
    new Pool({ name: 'AVAX/USDC', total_rewards: 1000, vapr: 10, current_votes: 1000 }),
    new Pool({ name: 'BTC/AVAX', total_rewards: 2000, vapr: 20, current_votes: 1000 }),
    new Pool({ name: 'WETH/USDC', total_rewards: 500, vapr: 50, current_votes: 1000 })
  ];

  // Test sorting by profitability (POOL2 has highest total rewards and vapr, same votes)
  const recs = recommendPools(pools, { topN: 2, sortBy: 'profitability' });
  assertEquals(recs.length, 2, 'TopN filter applied');
  assertEquals(recs[0].name, 'BTC/AVAX', 'Sorting by profitability works (BTC/AVAX first)');

  // Test wildcard filtering
  const filteredRecs = recommendPools(pools, { poolName: '*USDC' });
  assertEquals(filteredRecs.length, 2, 'Wildcard filter "*USDC" works');
  assert(filteredRecs.every(p => p.name.includes('USDC')), 'All filtered pools contain USDC');

  // Test multiple patterns filtering (AND logic)
  const multiFiltered = recommendPools(pools, { poolName: ['*USDC', 'AVAX*'] });
  assertEquals(multiFiltered.length, 1, 'Multi-pattern filter (AND) works');
  assertEquals(multiFiltered[0].name, 'AVAX/USDC', 'Correct pool found with multi-filter');

  // Test maxPoolPercentage filter
  // With 1000 voting power:
  // AVAX/USDC: 1000/(1000+1000) = 50%
  // BTC/AVAX: 1000/(1000+1000) = 50%
  const pctFiltered = recommendPools(pools, { 
    userVotingPower: 1000, 
    maxPoolPercentage: 40 
  });
  assertEquals(pctFiltered.length, 0, 'maxPoolPercentage filter correctly removed pools exceeding 40%');

  const pctFilteredHigh = recommendPools(pools, { 
    userVotingPower: 1000, 
    maxPoolPercentage: 60 
  });
  assertEquals(pctFilteredHigh.length, 3, 'maxPoolPercentage filter correctly kept pools under 60%');

  console.log(`\n✨ Test Summary: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('💥 Test Execution Error:', err);
  process.exit(1);
});
