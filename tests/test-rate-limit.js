#!/usr/bin/env node

// Simple test to verify endpoint-specific rate limiting
const BASE_URL = 'http://localhost:1234';

async function testRateLimit() {
    console.log('Testing file system endpoint rate limiting...\n');

    // Test /api/config endpoint (file system operation)
    console.log('1. Testing /api/config (should allow 10 requests, then rate limit)');
    let successCount = 0;
    let rateLimitedCount = 0;

    for (let i = 0; i < 15; i++) {
        try {
            const response = await fetch(`${BASE_URL}/api/config`);
            if (response.status === 429) {
                rateLimitedCount++;
                if (rateLimitedCount === 1) {
                    console.log(`   ✓ Request ${i + 1}: Rate limited (429) - EXPECTED after 10 requests`);
                }
            } else if (response.ok) {
                successCount++;
            }
        } catch (e) {
            console.error(`   ✗ Request ${i + 1} failed:`, e.message);
        }
    }

    console.log(`\n   Results: ${successCount} successful, ${rateLimitedCount} rate-limited`);

    if (successCount === 10 && rateLimitedCount === 5) {
        console.log('   ✓ PASS: File system rate limiter working correctly!\n');
    } else {
        console.log(`   ✗ FAIL: Expected 10 successful and 5 rate-limited, got ${successCount} and ${rateLimitedCount}\n`);
    }

    // Wait for rate limit window to reset
    console.log('2. Waiting 61 seconds for rate limit window to reset...');
    await new Promise(resolve => setTimeout(resolve, 61000));

    // Test that rate limit resets
    console.log('3. Testing after reset (should allow requests again)');
    try {
        const response = await fetch(`${BASE_URL}/api/config`);
        if (response.ok) {
            console.log('   ✓ PASS: Rate limit window reset successfully!\n');
        } else {
            console.log(`   ✗ FAIL: Got status ${response.status} after reset\n`);
        }
    } catch (e) {
        console.error('   ✗ FAIL:', e.message);
    }
}

// Check if server is running
async function checkServer() {
    try {
        const response = await fetch(`${BASE_URL}/api/config`);
        return response.ok || response.status === 429;
    } catch (e) {
        return false;
    }
}

// Main
(async () => {
    console.log('Checking if server is running...');
    const serverRunning = await checkServer();

    if (!serverRunning) {
        console.error('✗ Server is not running at', BASE_URL);
        console.error('  Please start the server with: node server.js');
        process.exit(1);
    }

    console.log('✓ Server is running\n');
    await testRateLimit();
})();
