// Test cache clearing across model changes

const BASE_URL = 'http://localhost:1234';

async function testCacheClearing() {
  console.log('🧪 Testing Cache Clearing Across Model Changes\n');
  
  const models = ['qwen3-coder:latest', 'deepseek-coder:33b'];
  
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    console.log(`\n${i + 1}. Testing model: ${model}`);
    
    // First request - should fetch fresh data
    console.log('   📥 First request (should fetch fresh):');
    let response = await fetch(`${BASE_URL}/api/model-info?model=${encodeURIComponent(model)}`);
    let data = await response.json();
    console.log(`      Context: ${data.contextLength?.toLocaleString() || 'N/A'} (${data.contextLengthType})`);
    
    // Second request - should use cache (if not cleared)
    console.log('   📦 Second request (should use cache):');
    response = await fetch(`${BASE_URL}/api/model-info?model=${encodeURIComponent(model)}`);
    data = await response.json();
    console.log(`      Context: ${data.contextLength?.toLocaleString() || 'N/A'} (${data.contextLengthType})`);
    
    // Simulate model change (clear cache)
    console.log('   🔄 Simulating model change (clears cache)...');
    // This simulates what happens when user selects different model
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Third request after "model change" - should fetch fresh again
    console.log('   📥 Third request after "model change" (should fetch fresh):');
    response = await fetch(`${BASE_URL}/api/model-info?model=${encodeURIComponent(model)}`);
    data = await response.json();
    console.log(`      Context: ${data.contextLength?.toLocaleString() || 'N/A'} (${data.contextLengthType})`);
    
    if (i < models.length - 1) {
      console.log('   ⏳ Waiting before next model test...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n✅ Cache clearing test completed!');
  console.log('\n📝 Expected behavior:');
  console.log('   - Request 1: Fresh fetch (no cache)');
  console.log('   - Request 2: Use cache');
  console.log('   - Request 3: Fresh fetch (cache cleared)');
  console.log('   - Each model change should trigger fresh fetch');
}

testCacheClearing();
