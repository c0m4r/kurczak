import express from 'express';
import { Readable } from 'stream';
import { readFileSync, existsSync, readdirSync, unlinkSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let config;
try {
  config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf8'));
} catch (e) {
  config = { ollamaUrl: 'http://localhost:11434', port: 3000, defaultSystemPrompt: '' };
}

// Security: Validate OLLAMA_URL
let OLLAMA_URL = (config.ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
try {
  const url = new URL(OLLAMA_URL);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    console.error('Invalid OLLAMA_URL protocol. Defaulting to http://localhost:11434');
    OLLAMA_URL = 'http://localhost:11434';
  }
} catch (e) {
  console.error('Invalid OLLAMA_URL. Defaulting to http://localhost:11434');
  OLLAMA_URL = 'http://localhost:11434';
}

const PORT = config.port || 1234;
const DATA_DIR = join(__dirname, 'data');
const HISTORY_DIR = join(DATA_DIR, 'history');

// Security: stricter permissions (700)
if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true, mode: 0o700 });

const app = express();
// Security: limit body size to 1mb
app.use(express.json({ limit: '1mb' }));
app.use(express.static(join(__dirname, 'public')));

// Security: Simple in-memory rate limiter
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 50; // 50 requests per minute

const rateLimiter = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
  } else {
    const data = rateLimitMap.get(ip);
    if (now > data.resetTime) {
      data.count = 1;
      data.resetTime = now + RATE_LIMIT_WINDOW;
    } else {
      data.count++;
      if (data.count > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many requests, please try again later.' });
      }
    }
  }
  next();
};

app.use(rateLimiter);

// Security: Stricter rate limiter for file system operations
const createRateLimiter = (maxRequests, windowMs) => {
  const limitMap = new Map();
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!limitMap.has(ip)) {
      limitMap.set(ip, { count: 1, resetTime: now + windowMs });
    } else {
      const data = limitMap.get(ip);
      if (now > data.resetTime) {
        data.count = 1;
        data.resetTime = now + windowMs;
      } else {
        data.count++;
        if (data.count > maxRequests) {
          return res.status(429).json({ error: 'Too many requests, please try again later.' });
        }
      }
    }
    next();
  };
};

// File system operations get stricter rate limiting (10 req/min)
const fileSystemRateLimiter = createRateLimiter(10, 60 * 1000);

app.get('/api/config', fileSystemRateLimiter, (_, res) => {
  res.json({
    ollamaUrl: OLLAMA_URL,
    defaultSystemPrompt: config.defaultSystemPrompt || '',
    codingSystemPrompt: existsSync(join(__dirname, 'prompts', 'coding-complex.md')) ? readFileSync(join(__dirname, 'prompts', 'coding-complex.md'), 'utf8') : '',
    codingSystemPromptSimple: existsSync(join(__dirname, 'prompts', 'coding-simple.md')) ? readFileSync(join(__dirname, 'prompts', 'coding-simple.md'), 'utf8') : '',
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
  // Security: input validation
  if (!model || typeof model !== 'string' || model.length > 200) return res.status(400).json({ error: 'Invalid model' });

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
      try { controller.abort(); } catch (_) { }
    };

    req.once('aborted', abortUpstream);
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
      } catch (_) { }
      return res.status(r.status).json({ error: errMsg });
    }
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const upstream = Readable.fromWeb(r.body);
    upstream.on('error', () => {
      try {
        if (!res.writableEnded) res.end();
      } catch (_) { }
    });
    res.on('close', () => {
      try { upstream.destroy(); } catch (_) { }
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

function isValidId(id) {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

function getSafeHistoryPath(id) {
  if (!isValidId(id)) return null;
  const targetPath = join(HISTORY_DIR, `${id}.json`);
  const resolvedPath = resolve(targetPath);
  const resolvedHistoryDir = resolve(HISTORY_DIR);
  if (!resolvedPath.startsWith(resolvedHistoryDir)) return null;
  return targetPath;
}

function listHistory() {
  if (!existsSync(HISTORY_DIR)) return [];
  return readdirSync(HISTORY_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const id = f.replace(/\.json$/, '');
      if (!isValidId(id)) return null;

      const path = join(HISTORY_DIR, f);
      // Double check path safety just in case
      const resolvedPath = resolve(path);
      const resolvedHistoryDir = resolve(HISTORY_DIR);
      if (!resolvedPath.startsWith(resolvedHistoryDir)) return null;

      const raw = readFileSync(path, 'utf8');
      let title = 'Chat';
      try {
        const d = JSON.parse(raw);
        const first = d.messages?.find((m) => m.role === 'user');
        if (first?.content) title = String(first.content).slice(0, 60).replace(/\n/g, ' ');
      } catch (_) { }
      return { id, title, path };
    })
    .filter(Boolean)
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

app.get('/api/history/:id', fileSystemRateLimiter, (req, res) => {
  const file = getSafeHistoryPath(req.params.id);
  if (!file || !existsSync(file)) return res.status(404).json({ error: 'Not found' });
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/history', fileSystemRateLimiter, (req, res) => {
  let id = req.body.id;
  if (!id) {
    id = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  } else if (!isValidId(id)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  const file = getSafeHistoryPath(id);
  if (!file) return res.status(400).json({ error: 'Invalid ID' });

  const payload = { id, model: req.body.model, systemPrompt: req.body.systemPrompt, messages: req.body.messages || [] };
  try {
    // Security: write with 600 permissions
    writeFileSync(file, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
    res.json({ id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/history/:id', fileSystemRateLimiter, (req, res) => {
  const file = getSafeHistoryPath(req.params.id);
  if (!file || !existsSync(file)) return res.status(404).json({ error: 'Not found' });
  try {
    const payload = { id: req.params.id, model: req.body.model, systemPrompt: req.body.systemPrompt, messages: req.body.messages || [] };
    // Security: write with 600 permissions
    writeFileSync(file, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/history/:id', fileSystemRateLimiter, (req, res) => {
  const file = getSafeHistoryPath(req.params.id);
  if (!file || !existsSync(file)) return res.status(404).json({ error: 'Not found' });
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
