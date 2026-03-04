import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server.js';

test('Application API Tests', async (t) => {
    let server;
    let baseUrl;

    await t.test('start server', async () => {
        // Start on random port
        await new Promise((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
        assert.ok(server !== undefined, 'Server should be started');
    });

    await t.test('GET /api/config', async () => {
        const res = await fetch(`${baseUrl}/api/config`);
        assert.equal(res.status, 200, 'Endpoint should return 200 OK');
        const data = await res.json();
        assert.ok('ollamaUrl' in data, 'Ollama URL should be present in config');
        assert.ok('defaultSystemPrompt' in data, 'Default System Prompt should be present');
    });

    await t.test('GET /api/history', async () => {
        const res = await fetch(`${baseUrl}/api/history`);
        assert.equal(res.status, 200, 'Endpoint should return 200 OK');
        const data = await res.json();
        assert.ok(Array.isArray(data), 'History should be an array');
    });

    await t.test('POST /api/history - invalid ID', async () => {
        const res = await fetch(`${baseUrl}/api/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: '../invalid-id', messages: [] })
        });
        assert.equal(res.status, 400, 'Should reject invalid IDs');
    });

    let createdId;
    await t.test('POST /api/history - save chat', async () => {
        const res = await fetch(`${baseUrl}/api/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'test msg' }] })
        });
        assert.equal(res.status, 200, 'Should save history successfully');
        const data = await res.json();
        assert.ok(data.id, 'Should return the generated id');
        createdId = data.id;
    });

    await t.test('GET /api/history/:id - read back', async () => {
        const res = await fetch(`${baseUrl}/api/history/${createdId}`);
        assert.equal(res.status, 200, 'Should read history successfully');
        const data = await res.json();
        assert.equal(data.id, createdId);
        assert.equal(data.messages[0].content, 'test msg');
    });

    await t.test('DELETE /api/history/:id', async () => {
        const res = await fetch(`${baseUrl}/api/history/${createdId}`, { method: 'DELETE' });
        assert.equal(res.status, 200, 'Should delete history successfully');

        const checkRes = await fetch(`${baseUrl}/api/history/${createdId}`);
        assert.equal(checkRes.status, 404, 'History should no longer exist');
    });

    await t.test('teardown', () => {
        server.close();
    });
});
