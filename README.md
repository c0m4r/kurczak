# Kurczak 🐣

Minimal Ollama chat UI — no login, no heavy features. Pick a model and chat. Built for coding with markdown, syntax highlighting, and code copy.

<img width="952" height="406" alt="image" src="https://github.com/user-attachments/assets/3bddb2bf-d809-4734-8157-2245148276fd" />

## 🎁 Features

- **Model switcher** — Lists models from your Ollama instance
- **Streaming** — Responses appear token-by-token
- **Markdown & syntax highlighting** — Code blocks with language tags (e.g. ` ```javascript `)
- **Copy button** — On every code block; shows "Copied!" on green background
- **System prompt** — Optional (default in config), great for "you are a coding assistant"
- **History** — Stored as JSON files under `data/history/`; list, open, delete (no database)
- **Config** — Set Ollama URL and default system prompt in `config.json`

## ⚙️ Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Edit `config.json` if needed:
   - `ollamaUrl`: your Ollama API URL (default `http://localhost:11434`)
   - `port`: server port (default `3000`)
   - `defaultModel`: model name to select by default (optional)
   - `defaultSystemPrompt`: pre-filled system prompt (e.g. for coding); use "System prompt" next to Send to show/edit

3. Run:
   ```bash
   npm start
   ```
   Dev with auto-restart: `npm run dev`

4. Open `http://localhost:3000` (or your VPS host/port).

## 🔌 Requirements

- Node.js 18+
- Ollama running and reachable at the URL in `config.json`

## 📂 Project layout

```
kurczak/
  config.json     # Ollama URL, port, default system prompt
  server.js       # Express: proxy to Ollama, history API, static files
  data/history/   # One JSON file per conversation (created at runtime)
  public/
    index.html
    style.css
    app.js
```

History is saved automatically after each assistant reply. No DB or login — just files on disk.

## 💡 Model switching and context

**Can you switch models in the middle of a conversation?** Yes. Change the model in the sidebar and send the next message; that message (and all previous ones) are sent to the newly selected model.

**Does the next model see the earlier conversation?** Yes. The app sends the conversation history with every request so the model has context. Each message is stored with an optional date and model name so you can see who (which model) said what.

### Avoiding context length limits

Ollama (and the model) have a finite context window (e.g. 4k–128k tokens depending on model and `num_ctx`). Sending the whole conversation every time can hit that limit.

**Is sending the whole conversation the only way?** With Ollama’s stateless API, the only way to give the model “memory” is to send messages in the request. You can reduce how much we send:

- **`maxMessagesInContext`** in `config.json`: set to a positive number (e.g. `20` or `50`). Only the **last N messages** of the current chat are sent to the model (system prompt is always included). The full thread is still stored in history and in the UI; only the API request is trimmed. Use this to avoid exhausting the context window on long chats.

**What happens when the model hits the context limit?** Ollama may return an error (e.g. in the response body or as an NDJSON line with `error`). The app:

- On non-OK HTTP: reads the error body from the server and shows it in the chat (so you see Ollama’s message, e.g. context-related).
- During streaming: if a chunk contains `error`, it is shown as “Error from model: …” and the stream stops.

So you get a visible error in the chat when the backend reports a problem (including context limit). If you see that, try starting a new chat or setting `maxMessagesInContext` so the next request sends fewer messages.
