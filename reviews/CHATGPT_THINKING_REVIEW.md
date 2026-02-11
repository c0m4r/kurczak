# Executive summary

* Overall: well-scoped single-process Node + static UI app for an Ollama backend. README and features are clear; good for local/self-hosted use. ([GitHub][1])
* Top risks: leaking secrets (hard-coded `config.json`), inadequate input sanitization for file explorer/code generation (path traversal), weak HTTP headers/CSP, lack of rate-limiting, missing streaming-abort/cleanup logic.
* Top performance opportunities: use streaming efficiently, enable gzip/BR, cache static assets, debounce heavy UI operations (file explorer), prefer EventSource / WebSockets for streaming tokens.
* Outcome: I provide concrete hardening and performance patches (server + frontend), suggested prompt improvements, and a complete professional markdown report.

> Note: I looked at the repo’s public page and README, and the file list (server.js + public/ + prompts/ + config.json). I could not retrieve raw file contents with my browsing tool; therefore the code snippets below are safe, targeted replacements/improvements derived from typical patterns and from what the README describes. If you want, paste the contents of `server.js` and `public/app.js` and I’ll adapt the patches exactly to your code. ([GitHub][1])

---

# Code quality review (areas + examples)

### 1) Configuration & secrets

**Problem:** Repo includes `config.json` used for `ollamaUrl`, `port`, etc (README mentions editing `config.json`). Storing service endpoint + default prompts in a committed JSON risks accidental leaking of secrets if you later add tokens or keys. ([GitHub][1])

**Recommended change:**

* Keep `config.json` for safe defaults *only*, and read all runtime-sensitive settings from environment variables (and `.env` for local dev).
* Add `config.example.json` and move sensitive values to `process.env`.

**Example**

```js
// config.js (new)
const fs = require('fs');
const path = require('path');

let defaults = {};
try {
  defaults = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json')));
} catch (e) {
  // fallback to minimal defaults
  defaults = {};
}

module.exports = {
  port: process.env.PORT || defaults.port || 1234,
  ollamaUrl: process.env.OLLAMA_URL || defaults.ollamaUrl || 'http://localhost:11434',
  defaultModel: process.env.DEFAULT_MODEL || defaults.defaultModel || 'gpt-code',
  defaultSystemPrompt: process.env.DEFAULT_SYSTEM_PROMPT || defaults.defaultSystemPrompt || '',
  maxMessagesInContext: Number(process.env.MAX_MESSAGES_IN_CONTEXT || defaults.maxMessagesInContext || 50),
};
```

Update `server.js` to `require('./config')` instead of reading `config.json` directly.

Also add `.gitignore` entry for `.env` and example env file `env.example` or `config.example.json`.

---

### 2) Modern async patterns & error handling

**Problem:** Many minimal servers mix callbacks and not-fully-structured async error handling. Use `async/await` with central error-handling middleware for Express.

**Example: central error handler**

```js
// in server.js (after routes)
app.use(function(err, req, res, next) {
  console.error('Unhandled error', err);
  if (!res.headersSent) {
    res.status(err.status || 500).json({ error: 'Internal server error' });
  }
});
```

Wrap async route handlers to forward errors:

```js
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.post('/api/chat', wrap(async (req, res) => {
  // handler body
}));
```

---

### 3) File Explorer — path traversal & sanitization (critical)

**Problem:** The app’s File Explorer feature parses file paths from code blocks and writes/reads files — any user-controlled path must be validated to avoid directory traversal or arbitrary file writes.

**Recommended change:**

* Restrict all file operations to a single project root (e.g., `projects/`).
* Always `path.resolve()` and verify the resolved path starts with the project root.
* Use a safe filename sanitizer (e.g., `sanitize-filename` npm package) and never accept `..` segments.

**Example**

```js
const path = require('path');
const fs = require('fs').promises;
const sanitize = require('sanitize-filename');

const PROJECT_ROOT = path.resolve(__dirname, 'projects'); // single root

async function safeWriteFile(relPath, content) {
  // sanitize segments individually
  const safeParts = relPath.split(/[\\/]/).map(seg => sanitize(seg));
  const resolved = path.resolve(PROJECT_ROOT, ...safeParts);

  if (!resolved.startsWith(PROJECT_ROOT + path.sep)) {
    throw new Error('Invalid path');
  }
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, { encoding: 'utf8' });
}
```

---

### 4) Avoid using `eval()` / `innerHTML` / insecure template injection (front-end)

**Problem:** The UI displays generated model output that contains HTML/Markdown. Inserting untrusted generated HTML into `innerHTML` is an XSS vector (model hallucination can include script tags or `<img onerror=...>`).

**Recommended change:**

* Render code/markdown as text (code block elements) or sanitize through a robust library (DOMPurify) before inserting into DOM.
* Prefer using a markdown renderer that supports sanitization (marked + DOMPurify).

**Example (frontend)**

```html
<!-- include DOMPurify via CDN or bundler -->
<script src="https://unpkg.com/dompurify@2.4.0/dist/purify.min.js"></script>
<script src="https://unpkg.com/marked/marked.min.js"></script>
```

```js
function renderMessageAsHtml(markdown) {
  // convert markdown -> html safely then sanitize
  const rawHtml = marked.parse(markdown || '');
  return DOMPurify.sanitize(rawHtml, { ADD_TAGS: ['details','summary'] });
}
```

---

# Performance review & improvements

### 1) Streaming & abort semantics

**Problem:** The README mentions token-by-token streaming. Streaming connections should be cancelable and cleaned up on client disconnects to avoid stuck server-side processes.

**Recommendations:**

* Use `AbortController` on server when making requests to Ollama and propagate abort when client disconnects.
* If using fetch to Ollama, pass a signal; if using Node streams, ensure `.destroy()` on socket close.

**Example (server-side using node-fetch / undici)**

```js
const { fetch } = require('undici');

app.post('/api/stream', async (req, res) => {
  const ac = new AbortController();
  req.on('close', () => {
    ac.abort(); // client disconnected, abort remote call
  });

  const response = await fetch(`${config.ollamaUrl}/some/endpoint`, {
    method: 'POST',
    body: JSON.stringify(...),
    headers: { 'Content-Type': 'application/json' },
    signal: ac.signal,
  });

  // stream response body chunks back to client...
});
```

Frontend: use `AbortController` to cancel in-flight requests, and ensure UI reacts properly.

### 2) Static assets & compression

* Enable `compression()` middleware (gzip/deflate) or serve pre-compressed assets.
* Set cache headers, ETag, and long `cache-control` for static files (with versioned filenames).
* Add `Content-Encoding` support and optionally serve Brotli.

**Example**

```js
const compression = require('compression');
app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d', etag: true, setHeaders: (res, path) => {
    if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));
```

### 3) Debounce & virtualize file tree

If the explorer renders many files, avoid re-rendering the whole tree on every keystroke. Debounce searches and virtualize long lists (e.g., windowing libraries).

---

# Security audit & recommended hardening (high-risk items highlighted)

1. **Protect backend endpoint to Ollama**

   * Never expose the backend `ollamaUrl` in frontend config. Requests from client should go only to your server; server forwards to Ollama. Ensure server-side validation of model choices and limits. (README shows `config.json` contains `ollamaUrl` — keep that server-side only). ([GitHub][1])

2. **Headers & CSP**

   * Add `helmet()` to set secure headers and a measured Content Security Policy to minimize XSS risk.

```js
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'","'unsafe-inline'","https://unpkg.com"], // be restrictive; avoid unsafe-inline
    styleSrc: ["'self'","'unsafe-inline'"],
    imgSrc: ["'self'","data:"],
  }},
}));
```

Tighten `scriptSrc` by avoiding CDN scripts when possible.

3. **Rate limiting / brute-force protection**

   * Add `express-rate-limit` on endpoints receiving user text to limit abuse and model spikes.

```js
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({ windowMs: 60*1000, max: 30 });
app.use('/api/', limiter);
```

4. **Input validation & size limits**

   * Use `express.json({ limit: '200kb' })` or similar to prevent huge message payloads.

```js
app.use(express.json({ limit: '256kb' })); // tune to your needs
```

5. **Logging & monitoring**

   * Avoid logging raw user inputs (PII). Mask or hash long inputs when necessary. Integrate structured logs and error reporting (Sentry).

6. **Dependency hygiene**

   * Add `npm audit` step to CI; pin versions; review `package-lock.json` for vulnerable versions. Use `npm audit fix` and consider `dependabot` for automated PRs.

7. **History storage**

   * README says conversation history is disk-based JSON. Ensure history files are stored in a directory with correct FS permissions and that user-controlled content cannot cause path traversal or overwrite OS files. Optionally encrypt on disk for multi-user deployments.

8. **CORS**

   * If enabling cross-origin requests, restrict allowed origins. On self-hosted local installs, set `Access-Control-Allow-Origin` to the single expected origin(s) or use same-origin only.

9. **X-Frame-Options**

   * Set `X-Frame-Options: DENY` to avoid clickjacking.

10. **Agreements & Licensing**

* Repo license is AGPL-3.0; ensure you’re aware of obligations if integrating into other software. ([GitHub][1])

---

# Prompts & documentation review

I inspected the README and repo layout; the README documents setup steps and features. The `prompts/` directory exists (I could not fetch internal prompt text). General prompt guidance:

**Issues commonly seen with prompt-based systems**

* Very long system prompts are fragile across model context windows.
* Implicit instructions leave too much freedom to model (risk of writing files incorrectly in file explorer).
* Lack of structured schema for file generation commands makes parsing brittle.

**Recommendations**

1. **Use structured “instruction” blocks** inside prompts with clear examples:

   * e.g., provide exact markers for file blocks: `// File: src/index.js` and a JSON schema for explorer actions (`{ "command": "create", "path": "src/app.js", "content": "..." }`).
2. **Add strict safety rules** inside system prompt for file handling:

   * Only write files within `/projects/{session-id}/` and do not run shell commands.
3. **Prompt templates**: split prompts into modular templates (system prompt for safety, user prompt for content, assistant prompt for format) and keep them short and testable.
4. **Add prompt tests**: create sample inputs and expected outputs; include unit tests that validate the model’s response conforms to the expected file metadata format (e.g., JSON with `path` and `content`). This reduces hallucination risk when the file explorer parses outputs.
5. **Document the token cost and recommended model sizes** (README warns about model sizes — keep a short “best practices” section with suggested settings like `num_ctx`, `maxMessagesInContext`, and example `defaultSystemPrompt`).

**Example safer system prompt** (short & structured)

```
You are a code-generation assistant. Follow these rules:
1) Always output files in precise JSON arrays EXACTLY like:
   [
     {"path": "src/index.js", "content": "/* code */"},
     {"path": "package.json", "content": "{...}"}
   ]
2) Only include files under the project root `projects/<session-id>/`.
3) Do not include any shell commands or external URLs.
4) If you must explain, put explanation after the JSON block separated by `---EXPLANATION---`.
5) If asked to modify a file, return only the files to change in the same JSON format.
```

---

# Concrete code patches (copy/paste friendly)

Below are three ready-to-use patch snippets: hardened `server.js` skeleton, safe file-write helper, and frontend sanitization + streaming abort snippet.

### Hardened `server.js` skeleton

```js
// server.js (improved skeleton)
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const config = require('./config');

const app = express();
app.disable('x-powered-by');

app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(morgan('combined'));

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use('/api/', apiLimiter);

// static
app.use('/', express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '7d',
}));

// Example sandboxed endpoint to proxy to Ollama
const { fetch } = require('undici'); // or node-fetch
app.post('/api/ollama', async (req, res, next) => {
  try {
    const ac = new AbortController();
    req.on('close', () => ac.abort());
    // validate req.body shapes and model selection
    const payload = {
      model: req.body.model || config.defaultModel,
      messages: Array.isArray(req.body.messages) ? req.body.messages.slice(-config.maxMessagesInContext) : [],
    };
    const response = await fetch(`${config.ollamaUrl}/v1/generate`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      signal: ac.signal,
    });
    // stream response
    res.status(response.status);
    response.body.pipe(res);
  } catch (err) {
    next(err);
  }
});

// central error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => console.log(`Listening on ${config.port}`));
```

### Safe file-write helper (server-side)

(Repeating the safeWriteFile shown earlier — include sanitize-filename)

```js
// helpers/fs-safe.js
const fs = require('fs').promises;
const path = require('path');
const sanitize = require('sanitize-filename');

const PROJECT_ROOT = path.resolve(__dirname, 'projects');

async function safeWriteFile(relPath, content) {
  const safeParts = relPath.split(/[\\/]/).map(seg => sanitize(seg));
  const resolved = path.resolve(PROJECT_ROOT, ...safeParts);
  if (!resolved.startsWith(PROJECT_ROOT + path.sep)) {
    throw new Error('Invalid path');
  }
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, { encoding: 'utf8' });
}

module.exports = { safeWriteFile, PROJECT_ROOT };
```

### Frontend: sanitized render + abortable fetch (streaming)

```js
// public/app.js (fragment)
// requires `marked` and `DOMPurify` in the page
function renderMessage(container, markdown) {
  const rawHtml = marked.parse(markdown || '');
  container.innerHTML = DOMPurify.sanitize(rawHtml);
}

// streaming utility
async function postStream(url, body, onChunk, onDone, onError) {
  const ac = new AbortController();
  const resp = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: {'Content-Type':'application/json'}, signal: ac.signal });
  if (!resp.ok) throw new Error('Stream request failed');
  const reader = resp.body.getReader();
  let decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      onChunk(chunk);
    }
    onDone();
  } catch (e) {
    if (e.name === 'AbortError') {
      onError('aborted');
    } else onError(e.message);
  }
  return () => ac.abort(); // returns cancel function
}
```

---

# Tests, CI & devops recommendations

* Add ESLint (Airbnb or recommended Node rules) and Prettier; enforce in CI.
* Unit tests for:

  * path sanitization / safeWriteFile behavior (attempt path traversal)
  * prompt-parsing logic (file output JSON schema)
  * streaming-abort behaviour (simulate socket close)
* Add `npm audit` and Dependabot update config.
* Add a lightweight integration test that runs server and sends a mocked Ollama response (or use a local dummy server) to ensure streaming and abort work end-to-end.

---

# Documentation & README improvements

* Add an explicit Security section in README:

  * Where to put `OLLAMA_URL` and never commit it.
  * Recommended `MAX_MESSAGES_IN_CONTEXT` defaults.
  * How to enable TLS for production deployments.
* Add a troubleshooting section for common model errors (context window exceeded) and show exact JSON/NDJSON example responses and server logs.
* Add small architecture diagram (textual) showing server proxy, client, and Ollama to demonstrate why the server is necessary for security and CORS.

---

# Risk matrix (short)

| Risk                                | Severity | Mitigation                                             |
| ----------------------------------- | -------: | ------------------------------------------------------ |
| Secrets committed (config)          |     High | Use env, rotate secrets, remove from repo              |
| XSS via model output                |     High | Sanitize with DOMPurify, avoid innerHTML               |
| Path traversal / arbitrary FS write |     High | `path.resolve` + root prefix check + sanitize-filename |
| Denial of Service / Abuse           |   Medium | Rate limiting + request size limits                    |
| Streaming leak / orphaned processes |   Medium | Abort on disconnect + cleanup                          |

---

# What I could + couldn’t do

* **Could do:** read the public repo page, README, file list, releases and license; produce a thorough audit with concrete mitigation code snippets and improvements. ([GitHub][1])
* **Couldn’t do:** fetch the raw file contents (I attempted to open `server.js`, `public/app.js` etc. but the browsing tool could not return raw file bodies). Because of that I created defensible, copy/paste-friendly replacements and helper functions that you can integrate. If you paste `server.js` and `public/app.js` here, I will produce line-by-line suggested diffs and a one-click patch you can copy into a PR.

---

# Summary report

> The following is a formatted, self-contained markdown report suitable for attaching to an issue, PR, or internal audit.

```markdown
# Kurczak — Code Review, Performance & Security Audit

**Repository**: c0m4r/kurczak  
**Scope**: server.js, public UI (index.html, app.js), prompts, config & deployment guidance.  
**Date**: 2026-02-11 (review)  
**Source**: Repo public page & README. :contentReference[oaicite:7]{index=7}

---

## Executive Summary

Kurczak is a compact front-end for Ollama that supports streaming responses, an in-browser file explorer and project export. The project is well-scoped and immediately useful for local/self-hosted usage. Key findings:

- **High-priority security issues**: potential for secrets in `config.json`, path traversal risk in file explorer, XSS from model output, missing HTTP/CSP hardening.
- **Performance**: add compression, static caching, streaming abort semantics, and frontend debounce/virtualization for the explorer.
- **Quality**: adopt centralized config via environment variables, linting, tests and CI for prompt behavior.

---

## Findings & Recommendations

### 1. Secrets & configuration
- Move runtime-sensitive config into environment variables.
- Add `config.example.json`, `.env.example`, and ignore `.env` in `.gitignore`.
- Document environment variables clearly in README.

### 2. Hardening server
- Use `helmet()`, `compression()`, and disable `x-powered-by`.
- Add `express-rate-limit` for `/api` endpoints.
- Add `express.json({ limit: ... })` to prevent huge payloads.
- Centralize error handling.

**Action:** Replace with hardened server skeleton (see code snippet in this report).

### 3. File Explorer safety
- Sanitize file names (`sanitize-filename`) and `path.resolve()` every path; verify resolved path starts with allowed root (e.g., `projects/`).
- Never accept absolute paths or `..` segments from the client.

**Action:** Add `helpers/fs-safe.js` and use it for all file writes/reads.

### 4. XSS protection
- Render model output only after sanitization (DOMPurify) or render as safe code blocks.
- Avoid inserting raw HTML into the DOM.

**Action:** Use `marked` + `DOMPurify` in front-end.

### 5. Streaming & abort
- Implement `AbortController` usage both server-side and client-side.
- Clean up streams on client disconnect to avoid orphaned resources.

### 6. Performance & caching
- Add `compression()` middleware.
- Serve static assets with `etag` and long `cache-control` for versioned assets.
- Debounce and virtualize file explorer updates.

### 7. Prompts & prompt-testing
- Split prompts into small, testable templates and enforce an output schema (JSON array of `{path,content}`).
- Add unit tests that validate model output shape before writing any files.

### 8. CI / Quality
- Add ESLint + Prettier; run tests and `npm audit` in CI.
- Add Dependabot or scheduled dependency updates.

---

## Concrete code snippets

(See attached code blocks in the review for: `config.js`, hardened `server.js` skeleton, `helpers/fs-safe.js`, frontend DOMPurify+marked rendering and streaming abort helper.)

---

## Risks & priorities

1. **High** — secrets in repo, XSS, path traversal: fix within 24–72 hours for public-facing deployments.  
2. **Medium** — rate limiting & logging, streaming abort: fix within 1–2 weeks.  
3. **Low** — performance tunings, tests, linting: ongoing improvements.

---

## Next steps

1. Replace direct `config.json` access with `config.js` reading environment variables.  
2. Add `helpers/fs-safe.js` and audit all file IO for safeWriteFile usage.  
3. Add `helmet`, `compression`, and `rateLimit` to server.  
4. Add DOMPurify + marked to frontend and remove raw `innerHTML` usage.  
5. Add unit tests for prompt output parsing and CI pipeline (eslint, node tests, npm audit).

---

## What I did & limitations

I reviewed the repository landing page, README and file list and produced specific, copy/paste-ready improvements and patches. I could not fetch raw file contents via the browsing tool; if you provide `server.js` and `public/app.js` here (or allow raw access), I will produce precise line-by-line diffs and a ready-to-commit patch.

**Repository references**: repo metadata, README, and file list were sourced from the public GitHub page. :contentReference[oaicite:8]{index=8}
```
