# Kurczak 🐣

Minimal Ollama chat UI — no login, no heavy features. Pick a model and chat. Built for coding with markdown and syntax highlighting.

<img width="906" height="436" alt="image" src="https://github.com/user-attachments/assets/6c634167-8e6c-4a1a-9996-05f35747a2b2" />

## 🎁 Features

- **File Explorer** — Full project generation system with real-time tracking and tree view (requires capable models)
- **Project Export** — Download complete generated projects as ZIP archives
- **Model switcher** — Lists models from your Ollama instance
- **Streaming** — Responses appear token-by-token
- **Streaming continuity** — Switch threads mid-generation without losing progress
- **Markdown & syntax highlighting** — Code blocks with language tags
- **Copy button** — Quick code copying from any block
- **Thinking view** — Collapsible sections for model reasoning
- **Stop generation** — Abort in-progress responses
- **Message metadata** — Timestamp, model name, and generation duration
- **Context estimate** — Visual badge with token count
- **History** — Disk-based JSON storage for conversations
- **Config** — Customizable Ollama URL, port, and prompts

## ⚙️ Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Edit `config.json` if needed:
   - `ollamaUrl`: your Ollama API URL (default `http://localhost:11434`)
   - `port`: server port (default `1234`)
   - `defaultModel`: model name to select by default
   - `defaultSystemPrompt`: pre-filled system prompt (e.g. for coding)

3. Run:
   ```bash
   npm start
   ```
   Dev with auto-restart: `npm run dev`

4. Open `http://localhost:1234`.

## 📂 Project layout

```
kurczak/
  config.json             # App settings
  server.js               # Express server & API
  prompts/                # System prompt templates
  data/history/           # Conversation storage
  public/
    index.html            # UI structure
    style.css             # UI styling
    app.js                # Frontend logic & Explorer system
```

History is saved automatically. No DB or login required.

## 📁 File Explorer System

Kurczak 3.0.0 introduces a powerful File Explorer for structured code generation.

> [!IMPORTANT]
> This feature relies heavily on system prompts. Smaller models might struggle to follow guidelines correctly, so your mileage may vary. For best results, use larger or specialized coding models.

### How it works
1. **System Prompt**: Use the provided coding prompts in the `prompts/` directory to guide the AI.
2. **Detection**: The system automatically parses file paths from code blocks (e.g., `// File: src/App.js`).
3. **Visualization**: A real-time tree view appears in the sidebar, organizing files into folders.
4. **Preview**: Click any file in the explorer to view its content in a modal.
5. **Export**: Use the "📦 Download" button to save the entire project as a ZIP archive.


## 💡 Model switching and context

**Can you switch models in the middle of a conversation?** Yes. Change the model in the sidebar and send the next message; that message (and all previous ones) are sent to the newly selected model.

**Does the next model see the earlier conversation?** Yes. The app sends the conversation history with every request so the model has context. Each message is stored with an optional date and model name so you can see who (which model) said what.

### Avoiding context length limits

Ollama (and the model) have a finite context window (e.g. 4k–128k tokens depending on model and `num_ctx`). Sending the whole conversation every time can hit that limit.

**Is sending the whole conversation the only way?** With Ollama’s stateless API, the only way to give the model “memory” is to send messages in the request. You can reduce how much we send:

- **`maxMessagesInContext`** in `config.json`: set to a positive number (e.g. `20` or `50`). Only the **last N messages** of the current chat are sent to the model (system prompt is always included). The full thread is still stored in history and in the UI; only the API request is trimmed. Use this to avoid exhausting the context window on long chats.

The context badge is an estimate meant for quick feedback. It starts at `~0` for a brand-new thread, and begins counting the system prompt once you’ve sent at least one message in that thread.

**What happens when the model hits the context limit?** Ollama may return an error (e.g. in the response body or as an NDJSON line with `error`). The app:

- On non-OK HTTP: reads the error body from the server and shows it in the chat (so you see Ollama’s message, e.g. context-related).
- During streaming: if a chunk contains `error`, it is shown as “Error from model: …” and the stream stops.

So you get a visible error in the chat when the backend reports a problem (including context limit). If you see that, try starting a new chat or setting `maxMessagesInContext` so the next request sends fewer messages.
