import express from 'express';
import { Readable } from 'stream';
import { readFileSync, existsSync, readdirSync, unlinkSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let config;
try {
  config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf8'));
} catch (e) {
  config = { ollamaUrl: 'http://localhost:11434', port: 3000, defaultSystemPrompt: '' };
}

const OLLAMA_URL = (config.ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
const PORT = config.port || 3000;
const DATA_DIR = join(__dirname, 'data');
const HISTORY_DIR = join(DATA_DIR, 'history');

if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'public')));

app.get('/api/config', (_, res) => {
  res.json({
    ollamaUrl: OLLAMA_URL,
    defaultSystemPrompt: config.defaultSystemPrompt || '',
    defaultModel: config.defaultModel || '',
    maxMessagesInContext: config.maxMessagesInContext != null ? config.maxMessagesInContext : 0,
  });
});

app.get('/api/models', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!r.ok) throw new Error(r.statusText);
    const data = await r.json();
    const models = (data.models || []).map((m) => ({ name: m.name, modified: m.modified_at }));
    res.json(models);
  } catch (e) {
    res.status(502).json({ error: e.message || 'Cannot reach Ollama' });
  }
});

app.get('/api/model-info', async (req, res) => {
  const model = req.query.model;
  if (!model) return res.status(400).json({ error: 'Missing model' });
  try {
    const r = await fetch(`${OLLAMA_URL}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    if (!r.ok) return res.status(r.status).json({ error: (await r.json().catch(() => ({}))).error || r.statusText });
    const data = await r.json();
    let contextLength = data.num_ctx;
    if (contextLength == null && data.parameters) {
      const p = data.parameters;
      if (typeof p === 'object' && typeof p.num_ctx === 'number') contextLength = p.num_ctx;
      else if (typeof p === 'string') { const m = p.match(/num_ctx\s+(\d+)/); if (m) contextLength = parseInt(m[1], 10); }
    }
    res.json({ contextLength: contextLength != null ? Number(contextLength) : null });
  } catch (e) {
    res.status(502).json({ error: e.message || 'Cannot reach Ollama' });
  }
});

app.post('/api/chat', async (req, res) => {
  const url = `${OLLAMA_URL}/api/chat`;
  try {
    const controller = new AbortController();
    const abortUpstream = () => {
      if (controller.signal.aborted) return;
      try { controller.abort(); } catch (_) {}
    };

    req.on('aborted', abortUpstream);
    res.on('close', () => {
      if (!res.writableEnded) abortUpstream();
    });

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req.body, stream: true }),
      signal: controller.signal,
    });
    if (!r.ok) {
      let errMsg = r.statusText;
      try {
        const errBody = await r.text();
        if (errBody) {
          const parsed = JSON.parse(errBody);
          if (parsed && typeof parsed.error === 'string') errMsg = parsed.error;
          else errMsg = errBody;
        }
      } catch (_) {}
      return res.status(r.status).json({ error: errMsg });
    }
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const upstream = Readable.fromWeb(r.body);
    upstream.on('error', () => {
      try {
        if (!res.writableEnded) res.end();
      } catch (_) {}
    });
    res.on('close', () => {
      try { upstream.destroy(); } catch (_) {}
    });
    upstream.pipe(res);
  } catch (e) {
    if (e && e.name === 'AbortError') {
      if (!res.headersSent) return res.status(499).json({ error: 'Request aborted' });
      return;
    }
    const msg = e.message || 'Cannot reach Ollama';
    if (!res.headersSent) res.status(502).json({ error: msg });
  }
});

function listHistory() {
  if (!existsSync(HISTORY_DIR)) return [];
  return readdirSync(HISTORY_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const id = f.replace(/\.json$/, '');
      const raw = readFileSync(join(HISTORY_DIR, f), 'utf8');
      let title = 'Chat';
      try {
        const d = JSON.parse(raw);
        const first = d.messages?.find((m) => m.role === 'user');
        if (first?.content) title = String(first.content).slice(0, 60).replace(/\n/g, ' ');
      } catch (_) {}
      return { id, title, path: join(HISTORY_DIR, f) };
    })
    .sort((a, b) => {
      const sa = existsSync(a.path) ? statSync(a.path).mtimeMs : 0;
      const sb = existsSync(b.path) ? statSync(b.path).mtimeMs : 0;
      return sb - sa;
    });
}

app.get('/api/history', (req, res) => {
  try {
    const list = listHistory().map(({ id, title }) => ({ id, title }));
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/history/:id', (req, res) => {
  const file = join(HISTORY_DIR, `${req.params.id}.json`);
  if (!existsSync(file)) return res.status(404).json({ error: 'Not found' });
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/history', (req, res) => {
  const id = req.body.id || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const file = join(HISTORY_DIR, `${id}.json`);
  const payload = { id, model: req.body.model, systemPrompt: req.body.systemPrompt, messages: req.body.messages || [] };
  try {
    writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    res.json({ id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/history/:id', (req, res) => {
  const file = join(HISTORY_DIR, `${req.params.id}.json`);
  if (!existsSync(file)) return res.status(404).json({ error: 'Not found' });
  try {
    const payload = { id: req.params.id, model: req.body.model, systemPrompt: req.body.systemPrompt, messages: req.body.messages || [] };
    writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/history/:id', (req, res) => {
  const file = join(HISTORY_DIR, `${req.params.id}.json`);
  if (!existsSync(file)) return res.status(404).json({ error: 'Not found' });
  try {
    unlinkSync(file);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Kurczak running at http://localhost:${PORT} (Ollama: ${OLLAMA_URL})`);
});
