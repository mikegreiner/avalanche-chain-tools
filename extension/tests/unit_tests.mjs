import Pool from '../lib/pool.js';
import { recommendPools } from '../lib/pool-recommender.js';

// Mock chrome API for unit tests
global.chrome = {
  storage: {
    local: {
      get: (keys) => Promise.resolve({}),
      set: (data) => Promise.resolve()
    },
    onChanged: {
      addListener: () => {}
    }
  },
  runtime: {
    id: 'test-extension-id',
    sendMessage: () => Promise.resolve({ success: true }),
    onMessage: {
      addListener: () => {}
    }
  },
  tabs: {
    query: () => Promise.resolve([{ id: 1, url: 'https://blackhole.xyz/vote' }]),
    sendMessage: () => Promise.resolve({ success: true, selectedPools: [{ poolId: '0x123' }] })
  }
};

async function runTests() {
  console.log('🚀 Starting Extension Logic & UI State Tests...');
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

  // --- recommendPools Tests ---
  console.log('\n--- Testing recommendPools ---');
  
  const pools = [
    new Pool({ name: 'AVAX/USDC', total_rewards: 1000, vapr: 10, current_votes: 1000, pool_id: '0x123' }),
    new Pool({ name: 'BTC/AVAX', total_rewards: 2000, vapr: 20, current_votes: 1000, pool_id: '0x456' })
  ];

  const recs = recommendPools(pools, { topN: 2, sortBy: 'profitability' });
  assertEquals(recs.length, 2, 'TopN filter applied');

  // --- UI State Logic Tests ---
  console.log('\n--- Testing UI State Logic (Selection) ---');
  
  // Simulate the logic used in sidepanel.js and popup.js
  const selectedIds = ['0x123']; // Result from mock GET_SELECTED_POOLS
  
  recs.forEach(p => {
    const isSelected = selectedIds.includes(p.pool_id);
    const selectedClass = isSelected ? 'pool-selected' : '';
    const buttonText = isSelected ? 'Deselect' : 'Select';
    
    if (p.pool_id === '0x123') {
      assertEquals(isSelected, true, `Pool 0x123 correctly identified as selected`);
      assertEquals(selectedClass, 'pool-selected', `Pool 0x123 correctly assigned pool-selected class`);
      assertEquals(buttonText, 'Deselect', `Pool 0x123 correctly assigned Deselect button text`);
    } else {
      assertEquals(isSelected, false, `Pool ${p.pool_id} correctly identified as NOT selected`);
      assertEquals(selectedClass, '', `Pool ${p.pool_id} correctly assigned empty class`);
      assertEquals(buttonText, 'Select', `Pool ${p.pool_id} correctly assigned Select button text`);
    }
  });

  console.log(`\n✨ Test Summary: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('💥 Test Execution Error:', err);
  process.exit(1);
});
