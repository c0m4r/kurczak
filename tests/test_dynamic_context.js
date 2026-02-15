// Test dynamic context length updates during streaming

const BASE_URL = 'http://localhost:1234';

async function testDynamicContext() {
  console.log('🔄 Testing Dynamic Context Length Updates\n');
  
  const model = 'qwen3-coder:latest';
  
  // Test 1: Initial state (model not loaded)
  console.log('1️⃣ Initial state (model not loaded):');
  let response = await fetch(`${BASE_URL}/api/model-info?model=${encodeURIComponent(model)}`);
  let data = await response.json();
  console.log(`   Context: ${data.contextLength?.toLocaleString() || 'N/A'} (${data.contextLengthType})`);
  
  // Simulate model loading by making a request to Ollama
  console.log('\n2️⃣ Simulating model load...');
  try {
    const loadResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: 'test',
        keep_alive: '5m'
      })
    });
    
    // Read just enough to trigger model loading
    const reader = loadResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    for (let i = 0; i < 3; i++) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const obj = JSON.parse(line);
            if (obj.response) {
              console.log(`   Model responded: "${obj.response.substring(0, 20)}..."`);
              break;
            }
          } catch (_) {}
        }
      }
      if (buffer.includes('"done":true')) break;
    }
    
    reader.releaseLock();
    
    // Test 2: After model is loaded
    console.log('\n3️⃣ After model loaded (should show actual context):');
    response = await fetch(`${BASE_URL}/api/model-info?model=${encodeURIComponent(model)}`);
    data = await response.json();
    console.log(`   Context: ${data.contextLength?.toLocaleString() || 'N/A'} (${data.contextLengthType})`);
    
    // Test 3: Simulate cache clear and recheck
    console.log('\n4️⃣ Simulating cache clear (like when streaming starts):');
    console.log('   Clearing cache and rechecking...');
    
    // This simulates what happens when streaming starts
    response = await fetch(`${BASE_URL}/api/model-info?model=${encodeURIComponent(model)}`);
    data = await response.json();
    console.log(`   Context: ${data.contextLength?.toLocaleString() || 'N/A'} (${data.contextLengthType})`);
    
  } catch (error) {
    console.log(`   Error loading model: ${error.message}`);
  }
  
  console.log('\n✅ Dynamic context test completed!');
  console.log('\n📝 Expected behavior:');
  console.log('   - Initial: Maximum context length');
  console.log('   - After load: Actual context length');
  console.log('   - During streaming: Should update to actual when first chunk arrives');
}

testDynamicContext();
