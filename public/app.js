(function () {
  const messagesEl = document.getElementById('messages');
  const userInput = document.getElementById('userInput');
  const systemPrompt = document.getElementById('systemPrompt');
  const modelSelect = document.getElementById('modelSelect');
  const btnSend = document.getElementById('btnSend');
  const btnNewChat = document.getElementById('btnNewChat');
  const btnSystemPrompt = document.getElementById('btnSystemPrompt');
  const btnSetDefault = document.getElementById('btnSetDefault');
  const systemPromptRow = document.getElementById('systemPromptRow');
  const historyList = document.getElementById('historyList');
  const contextUsageEl = document.getElementById('contextUsage');
  const toast = document.getElementById('toast');
  const btnTheme = document.getElementById('btnTheme');
  const modelContextCache = {};
  const highlightStyleLink = document.getElementById('highlightStyle');

  const HIGHLIGHT_STYLES = {
    dark: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css',
    light: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css',
  };

  function getTheme() {
    return localStorage.getItem('kurczak_theme') || 'dark';
  }

  function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    if (highlightStyleLink) highlightStyleLink.href = HIGHLIGHT_STYLES[theme] || HIGHLIGHT_STYLES.dark;
    localStorage.setItem('kurczak_theme', theme);
    if (btnTheme) btnTheme.textContent = theme === 'dark' ? 'Switch to light' : 'Switch to dark';
  }

  function toggleTheme() {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }

  let state = {
    currentId: null,
    model: '',
    messages: [],
    streaming: false,
  };

  marked.setOptions({ breaks: true });

  function renderMarkdown(text) {
    const raw = marked.parse(text || '');
    const div = document.createElement('div');
    div.className = 'content';
    div.innerHTML = raw;
    div.querySelectorAll('pre code').forEach((block) => {
      try {
        hljs.highlightElement(block);
      } catch (_) {}
    });
    div.querySelectorAll('pre code').forEach((block) => {
      const wrap = document.createElement('div');
      wrap.className = 'code-block-wrap';
      const pre = block.closest('pre');
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.setAttribute('aria-label', 'Copy code');
      wrap.insertBefore(btn, pre);
      btn.addEventListener('click', () => copyCode(block, btn));
    });
    return div;
  }

  function buildAssistantMessage(content, isStreaming, meta) {
    const wrap = document.createElement('div');
    wrap.className = 'message assistant' + (isStreaming ? ' streaming' : '');
    const metaRow = document.createElement('div');
    metaRow.className = 'message-meta-row';
    const metaEl = document.createElement('span');
    metaEl.className = 'message-meta';
    metaEl.textContent = meta && (meta.createdAt || meta.model) ? [formatMessageDate(meta.createdAt), meta.model].filter(Boolean).join(' · ') : '';
    const rawBtn = document.createElement('button');
    rawBtn.type = 'button';
    rawBtn.className = 'btn btn-ghost btn-sm btn-raw';
    rawBtn.textContent = 'Switch to raw';
    metaRow.appendChild(metaEl);
    metaRow.appendChild(rawBtn);
    wrap.appendChild(metaRow);
    const body = document.createElement('div');
    body.className = 'message-body';
    const contentEl = document.createElement('div');
    contentEl.className = 'content';
    const rawEl = document.createElement('pre');
    rawEl.className = 'raw-content hidden';
    rawEl.setAttribute('aria-label', 'Raw response');
    if (content) {
      contentEl.appendChild(renderMarkdown(content));
      rawEl.textContent = content;
    }
    rawBtn.addEventListener('click', () => {
      contentEl.classList.toggle('hidden');
      rawEl.classList.toggle('hidden');
      rawBtn.textContent = rawEl.classList.contains('hidden') ? 'Switch to raw' : 'Switch to rendered';
    });
    body.appendChild(contentEl);
    body.appendChild(rawEl);
    wrap.appendChild(body);
    return wrap;
  }

  function copyCode(block, btn) {
    const text = block.textContent;
    navigator.clipboard.writeText(text).then(() => {
      btn.classList.add('copied');
      showToast('Copied!');
      setTimeout(() => btn.classList.remove('copied'), 2000);
    });
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 2000);
  }

  function formatMessageDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function appendMessage(role, content, isStreaming = false, meta = null) {
    if (role === 'assistant') {
      const div = buildAssistantMessage(content || '', isStreaming, meta);
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }
    const div = document.createElement('div');
    div.className = `message ${role}`;
    if (meta && meta.createdAt) {
      const metaEl = document.createElement('span');
      metaEl.className = 'message-meta';
      metaEl.textContent = formatMessageDate(meta.createdAt);
      div.appendChild(metaEl);
    }
    const inner = document.createElement('div');
    inner.className = 'content';
    inner.textContent = content || '';
    div.appendChild(inner);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function updateStreamingMessage(div, content) {
    const body = div.querySelector('.message-body');
    const contentEl = body ? body.querySelector('.content') : div.querySelector('.content');
    const rawEl = body ? body.querySelector('.raw-content') : null;
    if (!contentEl) return;
    div.classList.remove('status');
    contentEl.innerHTML = '';
    contentEl.appendChild(renderMarkdown(content));
    if (rawEl) {
      rawEl.textContent = content;
      rawEl.classList.add('hidden');
      contentEl.classList.remove('hidden');
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setStreamingStatus(div, statusText) {
    const contentEl = div.querySelector('.message-body .content') || div.querySelector('.content');
    if (!contentEl) return;
    div.classList.add('status');
    contentEl.innerHTML = '';
    contentEl.textContent = statusText;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderMessages() {
    messagesEl.innerHTML = '';
    if (state.messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'messages-empty';
      empty.textContent = 'Start a conversation or pick one from history.';
      messagesEl.appendChild(empty);
      return;
    }
    state.messages.forEach((m) => {
      const meta = { createdAt: m.createdAt, model: m.model };
      if (m.role === 'assistant') {
        messagesEl.appendChild(buildAssistantMessage(m.content, false, meta));
      } else {
        appendMessage('user', m.content, false, meta);
      }
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
    updateContextUsage();
  }

  function estimateTokens(messages, systemText) {
    let chars = (systemText || '').length;
    const recent = configMaxMessagesInContext > 0 ? messages.slice(-configMaxMessagesInContext) : messages;
    recent.forEach((m) => { chars += (m.content || '').length; });
    return Math.round(chars / 4);
  }

  function fetchModelContext(model) {
    if (modelContextCache[model] !== undefined) return Promise.resolve(modelContextCache[model]);
    return fetch('/api/model-info?model=' + encodeURIComponent(model))
      .then((r) => r.ok ? r.json() : { contextLength: null })
      .then((d) => {
        const ctx = d && d.contextLength != null ? Number(d.contextLength) : null;
        modelContextCache[model] = ctx;
        return ctx;
      })
      .catch(() => { modelContextCache[model] = null; return null; });
  }

  function updateContextUsage() {
    if (!contextUsageEl) return;
    const model = modelSelect.value;
    if (!model) {
      contextUsageEl.textContent = '';
      contextUsageEl.classList.remove('visible');
      return;
    }
    const sys = systemPrompt.value.trim();
    let recent = state.messages;
    if (configMaxMessagesInContext > 0) recent = state.messages.slice(-configMaxMessagesInContext);
    const estimated = estimateTokens(recent, sys);
    fetchModelContext(model).then((contextLength) => {
      if (!contextUsageEl) return;
      if (contextLength != null) {
        contextUsageEl.textContent = 'Context: ~' + estimated + ' / ' + contextLength.toLocaleString() + ' tokens';
      } else {
        contextUsageEl.textContent = 'Context: ~' + estimated + ' tokens';
      }
      contextUsageEl.classList.add('visible');
    });
  }

  let configDefaultModel = '';
  let configMaxMessagesInContext = 0;
  function loadConfig() {
    return fetch('/api/config')
      .then((r) => r.json())
      .then((c) => {
        if (c.defaultSystemPrompt) systemPrompt.value = c.defaultSystemPrompt;
        configDefaultModel = c.defaultModel || '';
        configMaxMessagesInContext = typeof c.maxMessagesInContext === 'number' && c.maxMessagesInContext > 0 ? c.maxMessagesInContext : 0;
      });
  }

  function loadModels() {
    return fetch('/api/models')
      .then((r) => {
        if (!r.ok) throw new Error('Could not load models');
        return r.json();
      })
      .then((models) => {
        modelSelect.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Select model…';
        modelSelect.appendChild(opt);
        (models || []).forEach((m) => {
          const o = document.createElement('option');
          o.value = m.name;
          o.textContent = m.name;
          modelSelect.appendChild(o);
        });
        const defaultModel = localStorage.getItem('kurczak_defaultModel') || configDefaultModel;
        if (state.model && models.some((m) => m.name === state.model)) {
          modelSelect.value = state.model;
        } else if (defaultModel && models.some((m) => m.name === defaultModel)) {
          modelSelect.value = defaultModel;
          state.model = defaultModel;
        }
        updateContextUsage();
      })
      .catch(() => {
        modelSelect.innerHTML = '<option value="">Ollama unreachable</option>';
      });
  }

  function loadHistory() {
    return fetch('/api/history')
      .then((r) => r.json())
      .then((list) => {
        historyList.innerHTML = '';
        list.forEach((item) => {
          const li = document.createElement('li');
          li.dataset.id = item.id;
          if (state.currentId === item.id) li.classList.add('active');
          const title = document.createElement('span');
          title.className = 'history-title';
          title.textContent = item.title || 'Chat';
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'history-delete';
          del.textContent = 'Delete';
          del.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteHistory(item.id);
          });
          li.appendChild(title);
          li.appendChild(del);
          li.addEventListener('click', () => loadConversation(item.id));
          historyList.appendChild(li);
        });
      });
  }

  function deleteHistory(id) {
    fetch(`/api/history/${id}`, { method: 'DELETE' })
      .then((r) => {
        if (r.ok && state.currentId === id) {
          state.currentId = null;
          state.messages = [];
          renderMessages();
        }
        loadHistory();
      });
  }

  function loadConversation(id) {
    fetch(`/api/history/${id}`)
      .then((r) => r.json())
      .then((data) => {
        state.currentId = data.id;
        state.model = data.model || '';
        state.messages = data.messages || [];
        if (data.systemPrompt) systemPrompt.value = data.systemPrompt;
        modelSelect.value = state.model;
        renderMessages();
        loadHistory();
      });
  }

  function newChat() {
    state.currentId = null;
    state.messages = [];
    renderMessages();
    loadHistory();
  }

  function saveConversation() {
    const payload = {
      model: state.model || modelSelect.value,
      systemPrompt: systemPrompt.value.trim(),
      messages: state.messages,
    };
    const url = state.currentId ? `/api/history/${state.currentId}` : '/api/history';
    const method = state.currentId ? 'PUT' : 'POST';
    const body = state.currentId ? payload : { ...payload, id: state.currentId || undefined };
    return fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.id) state.currentId = data.id;
        loadHistory();
      })
      .catch(() => loadHistory());
  }

  function sendMessage() {
    const text = userInput.value.trim();
    if (!text || state.streaming) return;
    const model = modelSelect.value;
    if (!model) {
      showToast('Select a model first');
      return;
    }
    state.model = model;
    const sys = systemPrompt.value.trim();
    const userMsg = { role: 'user', content: text, createdAt: new Date().toISOString() };
    if (state.messages.length === 0) {
      state.messages = [userMsg];
    } else {
      state.messages.push(userMsg);
    }
    let recent = state.messages;
    if (configMaxMessagesInContext > 0) {
      recent = state.messages.slice(-configMaxMessagesInContext);
    }
    const forApi = recent.map((m) => ({ role: m.role, content: m.content }));
    const messagesForApi = sys
      ? [{ role: 'system', content: sys }, ...forApi]
      : forApi;
    userInput.value = '';
    renderMessages();
    state.streaming = true;
    btnSend.disabled = true;
    const streamDiv = appendMessage('assistant', '', true);
    setStreamingStatus(streamDiv, 'Sending…');
    let full = '';
    function startStream() {
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: messagesForApi,
          stream: true,
        }),
      })
        .then((r) => {
          if (!r.ok) {
            return r.json()
              .then((d) => { throw new Error(d && d.error ? d.error : r.statusText || 'Request failed'); })
              .catch(() => { throw new Error(r.statusText || 'Request failed'); });
          }
          return r.body.getReader();
        })
        .then((reader) => {
          setStreamingStatus(streamDiv, 'Waiting for response…');
          const decoder = new TextDecoder();
          let buffer = '';
          let receivedChunks = false;
          function getContent(obj) {
            if (obj.message && typeof obj.message.content === 'string') return obj.message.content;
            if (typeof obj.response === 'string') return obj.response;
            return '';
          }
          function read() {
            return reader.read().then(({ done, value }) => {
              if (done) {
                if (buffer.trim()) {
                  try {
                    const obj = JSON.parse(buffer);
                    if (obj.error) {
                      const errMsg = 'Error from model: ' + obj.error;
                      state.messages.push({ role: 'assistant', content: errMsg, createdAt: new Date().toISOString(), model: model });
                      state.streaming = false;
                      btnSend.disabled = false;
                      streamDiv.classList.remove('streaming');
                      const existingMeta = streamDiv.querySelector('.message-meta');
                      if (existingMeta) existingMeta.textContent = [formatMessageDate(new Date().toISOString()), model].filter(Boolean).join(' · ');
                      updateStreamingMessage(streamDiv, errMsg);
                      saveConversation();
                      return;
                    }
                    full += getContent(obj);
                  } catch (_) {}
                }
                const assistantMsg = {
                  role: 'assistant',
                  content: full,
                  createdAt: new Date().toISOString(),
                  model: model,
                };
                state.messages.push(assistantMsg);
                state.streaming = false;
                btnSend.disabled = false;
                streamDiv.classList.remove('streaming');
                const existingMeta = streamDiv.querySelector('.message-meta');
                if (existingMeta) existingMeta.textContent = [formatMessageDate(assistantMsg.createdAt), model].filter(Boolean).join(' · ');
                updateStreamingMessage(streamDiv, full);
                saveConversation();
                return;
              }
              receivedChunks = true;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const obj = JSON.parse(line);
                  if (obj.error) {
                    const errMsg = 'Error from model: ' + obj.error;
                    state.messages.push({ role: 'assistant', content: errMsg, createdAt: new Date().toISOString(), model: model });
                    state.streaming = false;
                    btnSend.disabled = false;
                    streamDiv.classList.remove('streaming');
                    const existingMeta = streamDiv.querySelector('.message-meta');
                    if (existingMeta) existingMeta.textContent = [formatMessageDate(new Date().toISOString()), model].filter(Boolean).join(' · ');
                    updateStreamingMessage(streamDiv, errMsg);
                    saveConversation();
                    return;
                  }
                  full += getContent(obj);
                } catch (_) {}
              }
              if (full) {
                updateStreamingMessage(streamDiv, full);
              } else if (receivedChunks) {
                setStreamingStatus(streamDiv, 'Thinking…');
              }
              return read();
            });
          }
          return read();
        })
        .catch((err) => {
          state.streaming = false;
          btnSend.disabled = false;
          streamDiv.classList.remove('streaming');
          updateStreamingMessage(streamDiv, `Error: ${err.message}`);
        });
    }
    if (!state.currentId) {
      saveConversation().then(startStream);
    } else {
      startStream();
    }
  }

  btnSend.addEventListener('click', sendMessage);
  btnNewChat.addEventListener('click', newChat);
  document.getElementById('logoLink').addEventListener('click', (e) => {
    e.preventDefault();
    newChat();
  });
  btnSystemPrompt.addEventListener('click', () => {
    systemPromptRow.classList.toggle('hidden');
  });
  modelSelect.addEventListener('change', () => { state.model = modelSelect.value; updateContextUsage(); });
  btnSetDefault.addEventListener('click', () => {
    const model = modelSelect.value;
    if (model) {
      localStorage.setItem('kurczak_defaultModel', model);
      showToast('Default model set');
    } else {
      showToast('Select a model first');
    }
  });
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  if (btnTheme) btnTheme.addEventListener('click', toggleTheme);

  function init() {
    setTheme(getTheme());
    loadConfig()
      .then(loadModels)
      .then(loadHistory)
      .then(renderMessages);
  }
  init();
})();
