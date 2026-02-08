(function () {
  const messagesEl = document.getElementById('messages');
  const userInput = document.getElementById('userInput');
  const systemPrompt = document.getElementById('systemPrompt');
  const modelSelect = document.getElementById('modelSelect');
  const btnSend = document.getElementById('btnSend');
  const btnNewChat = document.getElementById('btnNewChat');
  const btnSystemPrompt = document.getElementById('btnSystemPrompt');
  const btnSetDefault = document.getElementById('btnSetDefault');
  const btnStop = document.getElementById('btnStop');
  const systemPromptRow = document.getElementById('systemPromptRow');
  const historyList = document.getElementById('historyList');
  const contextUsageEl = document.getElementById('contextUsage');
  const toast = document.getElementById('toast');
  const btnTheme = document.getElementById('btnTheme');
  const modelContextCache = {};
  const highlightStyleLink = document.getElementById('highlightStyle');

  const HIGHLIGHT_STYLES = {
    dark: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css',
    light: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css',
  };

  function getTheme() {
    return localStorage.getItem('kurczak_theme') || 'dark';
  }

  function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    if (highlightStyleLink) highlightStyleLink.href = HIGHLIGHT_STYLES[theme] || HIGHLIGHT_STYLES.dark;
    localStorage.setItem('kurczak_theme', theme);
    if (btnTheme) btnTheme.textContent = theme === 'dark' ? '☀️ Switch to light' : '🌙 Switch to dark';
  }

  function toggleTheme() {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }

  let state = {
    currentId: null,
    model: '',
    messages: [],
    streaming: false,
    abortController: null,
    activeStream: null,
  };

  marked.setOptions({ breaks: true });

  function autoResizeTextarea(el, maxLines) {
    if (!el) return;
    const cs = window.getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const paddingTop = parseFloat(cs.paddingTop) || 0;
    const paddingBottom = parseFloat(cs.paddingBottom) || 0;
    const maxHeight = Math.round(lineHeight * maxLines + paddingTop + paddingBottom);
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = next + 'px';
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  function isNearBottom() {
    const threshold = 80;
    return (messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight) < threshold;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  let autoScrollEnabled = true;
  messagesEl.addEventListener('scroll', () => {
    autoScrollEnabled = isNearBottom();
  });

  function maybeAutoScroll(wasNearBottom) {
    if (wasNearBottom || autoScrollEnabled) scrollToBottom();
  }

  function extractThink(text) {
    const s = String(text || '');
    const match = s.match(/<think>([\s\S]*?)<\/think>/i);
    if (!match) return { visible: s, thinking: '' };
    const thinking = (match[1] || '').trim();
    const visible = s.replace(match[0], '').trim();
    return { visible, thinking };
  }

  function lastLines(text, count) {
    const s = String(text || '');
    if (!s) return '';
    const lines = s.replace(/\r\n?/g, '\n').split('\n');
    const tail = lines.slice(Math.max(0, lines.length - count));
    return tail.join('\n').trim();
  }

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
    const parts = extractThink(content || '');
    const wrap = document.createElement('div');
    wrap.className = 'message assistant' + (isStreaming ? ' streaming' : '');
    if (meta && meta.msgId) wrap.dataset.msgId = meta.msgId;
    const metaRow = document.createElement('div');
    metaRow.className = 'message-meta-row';
    const metaEl = document.createElement('span');
    metaEl.className = 'message-meta';
    metaEl.textContent = formatAssistantMeta(meta);
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
    const thinkingDetails = document.createElement('details');
    thinkingDetails.className = 'thinking-details hidden';
    const thinkingSummary = document.createElement('summary');
    const thinkingLabel = document.createElement('span');
    thinkingLabel.className = 'thinking-label';
    thinkingLabel.textContent = 'Thinking';
    const thinkingPreview = document.createElement('span');
    thinkingPreview.className = 'thinking-preview';
    thinkingSummary.appendChild(thinkingLabel);
    thinkingSummary.appendChild(thinkingPreview);
    const thinkingPre = document.createElement('pre');
    thinkingPre.className = 'thinking-content';
    thinkingDetails.appendChild(thinkingSummary);
    thinkingDetails.appendChild(thinkingPre);
    const rawEl = document.createElement('pre');
    rawEl.className = 'raw-content hidden';
    rawEl.setAttribute('aria-label', 'Raw response');
    if (content) {
      contentEl.appendChild(renderMarkdown(parts.visible));
      rawEl.textContent = content;
      if (parts.thinking) {
        thinkingPre.textContent = parts.thinking;
        thinkingPreview.textContent = lastLines(parts.thinking, 5);
        thinkingDetails.classList.remove('hidden');
      }
    }

    thinkingDetails.addEventListener('toggle', () => {
      thinkingPreview.classList.toggle('hidden', thinkingDetails.open);
    });
    rawBtn.addEventListener('click', () => {
      contentEl.classList.toggle('hidden');
      rawEl.classList.toggle('hidden');
      rawBtn.textContent = rawEl.classList.contains('hidden') ? 'Switch to raw' : 'Switch to rendered';
    });
    body.appendChild(thinkingDetails);
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

  function formatDurationSeconds(sec) {
    const s = Number(sec);
    if (!Number.isFinite(s) || s <= 0) return '';
    return `${s.toFixed(1)}s`;
  }

  function formatAssistantMeta(meta) {
    if (!meta) return '';
    const dateStr = formatMessageDate(meta.createdAt);
    const durStr = formatDurationSeconds(meta.genSeconds);
    return [dateStr, meta.model, durStr].filter(Boolean).join(' · ');
  }

  function newMsgId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function getRenderedMessageElById(msgId) {
    if (!msgId) return null;
    return messagesEl.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`);
  }

  function appendMessage(role, content, isStreaming = false, meta = null) {
    const wasNearBottom = isNearBottom();
    if (role === 'assistant') {
      const div = buildAssistantMessage(content || '', isStreaming, meta);
      messagesEl.appendChild(div);
      maybeAutoScroll(wasNearBottom);
      return div;
    }
    const div = document.createElement('div');
    div.className = `message ${role}`;
    if (meta && meta.msgId) div.dataset.msgId = meta.msgId;
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
    maybeAutoScroll(wasNearBottom);
    return div;
  }

  function updateStreamingMessage(div, content) {
    const wasNearBottom = isNearBottom();
    const parts = extractThink(content);
    const body = div.querySelector('.message-body');
    const contentEl = body ? body.querySelector('.content') : div.querySelector('.content');
    const rawEl = body ? body.querySelector('.raw-content') : null;
    const thinkingDetails = body ? body.querySelector('.thinking-details') : null;
    const thinkingPre = thinkingDetails ? thinkingDetails.querySelector('.thinking-content') : null;
    const thinkingPreview = thinkingDetails ? thinkingDetails.querySelector('.thinking-preview') : null;
    if (!contentEl) return;
    div.classList.remove('status');
    contentEl.innerHTML = '';
    contentEl.appendChild(renderMarkdown(parts.visible));
    if (rawEl) {
      rawEl.textContent = content;
      rawEl.classList.add('hidden');
      contentEl.classList.remove('hidden');
    }
    if (thinkingDetails && thinkingPre) {
      if (parts.thinking) {
        thinkingPre.textContent = parts.thinking;
        if (thinkingPreview) thinkingPreview.textContent = lastLines(parts.thinking, 5);
        thinkingDetails.classList.remove('hidden');
        if (thinkingPreview) thinkingPreview.classList.toggle('hidden', thinkingDetails.open);
      } else {
        thinkingDetails.classList.add('hidden');
        thinkingPre.textContent = '';
        if (thinkingPreview) thinkingPreview.textContent = '';
      }
    }
    maybeAutoScroll(wasNearBottom);
  }

  function setStreamingStatus(div, statusText) {
    const wasNearBottom = isNearBottom();
    const contentEl = div.querySelector('.message-body .content') || div.querySelector('.content');
    if (!contentEl) return;
    div.classList.add('status');
    contentEl.innerHTML = '';
    const textSpan = document.createElement('span');
    textSpan.textContent = statusText;
    const dots = document.createElement('span');
    dots.className = 'stage-dots';
    dots.innerHTML = '<span>.</span><span>.</span><span>.</span>';
    contentEl.appendChild(textSpan);
    contentEl.appendChild(dots);
    maybeAutoScroll(wasNearBottom);
  }

  function renderMessages() {
    messagesEl.innerHTML = '';
    if (state.messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'messages-empty';
      empty.textContent = 'Start a conversation or pick one from history.';
      messagesEl.appendChild(empty);
      updateContextUsage();
      return;
    }
    state.messages.forEach((m) => {
      const meta = { createdAt: m.createdAt, model: m.model, genSeconds: m.genSeconds, msgId: m.id };
      if (m.role === 'assistant') {
        messagesEl.appendChild(buildAssistantMessage(m.content, Boolean(m.partial), meta));
      } else {
        appendMessage('user', m.content, false, meta);
      }
    });
    scrollToBottom();
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
    if (!state.messages || state.messages.length === 0) {
      fetchModelContext(model).then((contextLength) => {
        if (!contextUsageEl) return;
        if (contextLength != null) {
          contextUsageEl.textContent = 'Context: ~0 / ' + contextLength.toLocaleString() + ' tokens';
        } else {
          contextUsageEl.textContent = 'Context: ~0 tokens';
        }
        contextUsageEl.classList.add('visible');
      });
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
        if (state.activeStream && state.activeStream.chatId === data.id) {
          state.model = state.activeStream.model || data.model || '';
          state.messages = state.activeStream.messagesRef;
          systemPrompt.value = state.activeStream.systemPrompt != null ? state.activeStream.systemPrompt : (data.systemPrompt || '');
        } else {
          state.model = data.model || '';
          state.messages = data.messages || [];
          if (data.systemPrompt) systemPrompt.value = data.systemPrompt;
        }
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

  function saveConversationWithId(id, model, sysPrompt, messages) {
    const payload = {
      id,
      model,
      systemPrompt: sysPrompt,
      messages,
    };
    const url = id ? `/api/history/${id}` : '/api/history';
    const method = id ? 'PUT' : 'POST';
    const body = id ? payload : { ...payload, id: undefined };
    return fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!id && data.id) return data.id;
        return id;
      });
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
    const userMsg = { id: newMsgId(), role: 'user', content: text, createdAt: new Date().toISOString() };
    if (state.messages.length === 0) {
      state.messages = [userMsg];
    } else {
      state.messages.push(userMsg);
    }

    const messagesRef = state.messages;
    const sysRef = sys;
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
    if (btnStop) btnStop.classList.remove('hidden');
    let streamDiv = null;
    let full = '';
    let fullThinking = '';
    let startedAtMs = null;
    let chatIdForStream = state.currentId;

    function joinFull() {
      const t = String(fullThinking || '').trim();
      if (!t) return full;
      return `<think>${t}</think>\n\n${full}`;
    }

    const assistantDraft = {
      id: newMsgId(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      model: model,
      partial: true,
    };
    messagesRef.push(assistantDraft);
    const assistantDraftIndex = messagesRef.length - 1;

    state.activeStream = {
      chatId: state.currentId,
      messagesRef,
      assistantMsgId: assistantDraft.id,
      model,
      systemPrompt: sysRef,
    };

    function getStreamDiv() {
      if (state.currentId !== chatIdForStream) return null;
      if (streamDiv && streamDiv.isConnected) return streamDiv;
      streamDiv = getRenderedMessageElById(assistantDraft.id);
      return streamDiv;
    }

    renderMessages();
    streamDiv = getStreamDiv();
    if (streamDiv) setStreamingStatus(streamDiv, 'Sending…');

    let saveTimer = null;
    function scheduleStreamingSave() {
      if (saveTimer) return;
      saveTimer = setTimeout(() => {
        saveTimer = null;
        if (chatIdForStream) {
          saveConversationWithId(chatIdForStream, model, sysRef, messagesRef).then(() => loadHistory()).catch(() => loadHistory());
        }
      }, 900);
    }

    function finishStreamingUI() {
      state.streaming = false;
      btnSend.disabled = false;
      if (btnStop) btnStop.classList.add('hidden');
      if (btnStop) btnStop.onclick = null;
      state.abortController = null;
      const d = getStreamDiv();
      if (d) d.classList.remove('streaming');

      if (state.activeStream && state.activeStream.assistantMsgId === assistantDraft.id) {
        state.activeStream = null;
      }
    }

    function stopStream(reasonText) {
      if (!state.streaming) return;
      if (state.abortController) {
        try { state.abortController.abort(); } catch (_) {}
      }
      const combined = joinFull();
      messagesRef[assistantDraftIndex].content = combined || '';
      if (startedAtMs != null) messagesRef[assistantDraftIndex].genSeconds = (Date.now() - startedAtMs) / 1000;
      messagesRef[assistantDraftIndex].partial = false;
      if (reasonText) {
        const d = getStreamDiv();
        if (d) updateStreamingMessage(d, (combined ? (combined + `\n\n_${reasonText}_`) : `_${reasonText}_`));
      } else {
        const d = getStreamDiv();
        if (d) updateStreamingMessage(d, combined);
      }
      finishStreamingUI();

      {
        const d = getStreamDiv();
        const existingMeta = d ? d.querySelector('.message-meta') : null;
        if (existingMeta) {
          existingMeta.textContent = formatAssistantMeta({
            createdAt: messagesRef[assistantDraftIndex].createdAt,
            model,
            genSeconds: messagesRef[assistantDraftIndex].genSeconds,
          });
        }
      }

      if (chatIdForStream) {
        saveConversationWithId(chatIdForStream, model, sysRef, messagesRef).then(() => loadHistory()).catch(() => loadHistory());
      }
    }

    function startStream() {
      const controller = new AbortController();
      state.abortController = controller;
      startedAtMs = Date.now();
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: messagesForApi,
          stream: true,
        }),
        signal: controller.signal,
      })
        .then((r) => {
          if (!r.ok) {
            if (r.status === 500) {
              throw new Error('Ollama returned 500 (Internal Server Error). It likely crashed (e.g. CUDA error). Restart Ollama (e.g. `ollama serve` or `systemctl restart ollama`) and try again.');
            }
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
          function getParts(obj) {
            const content = (obj && obj.message && typeof obj.message.content === 'string')
              ? obj.message.content
              : (typeof obj?.response === 'string' ? obj.response : '');
            const thinking = (obj && obj.message && typeof obj.message.thinking === 'string')
              ? obj.message.thinking
              : (typeof obj?.thinking === 'string' ? obj.thinking : (typeof obj?.reasoning === 'string' ? obj.reasoning : ''));
            return { content, thinking };
          }

          function read() {
            return reader.read().then(({ done, value }) => {
              if (done) {
                if (buffer.trim()) {
                  try {
                    const obj = JSON.parse(buffer);
                    if (obj.error) {
                      const errMsg = 'Error from model: ' + obj.error;
                      messagesRef[assistantDraftIndex] = {
                        role: 'assistant',
                        content: errMsg,
                        createdAt: new Date().toISOString(),
                        model: model,
                        partial: false,
                        genSeconds: startedAtMs != null ? (Date.now() - startedAtMs) / 1000 : undefined,
                      };
                      state.streaming = false;
                      btnSend.disabled = false;
                      streamDiv.classList.remove('streaming');
                      const existingMeta = streamDiv.querySelector('.message-meta');
                      if (existingMeta) existingMeta.textContent = [formatMessageDate(new Date().toISOString()), model].filter(Boolean).join(' · ');
                      updateStreamingMessage(streamDiv, errMsg);
                      if (chatIdForStream) {
                        saveConversationWithId(chatIdForStream, model, sysRef, messagesRef).then(() => loadHistory()).catch(() => loadHistory());
                      }
                      return;
                    }
                    const p = getParts(obj);
                    if (p.thinking) fullThinking += p.thinking;
                    if (p.content) full += p.content;
                  } catch (_) {}
                }
                const assistantMsg = {
                  role: 'assistant',
                  content: joinFull(),
                  createdAt: new Date().toISOString(),
                  model: model,
                  genSeconds: startedAtMs != null ? (Date.now() - startedAtMs) / 1000 : undefined,
                };
                messagesRef[assistantDraftIndex] = { ...assistantMsg, partial: false };
                finishStreamingUI();
                {
                  const d = getStreamDiv();
                  const existingMeta = d ? d.querySelector('.message-meta') : null;
                  if (existingMeta) existingMeta.textContent = formatAssistantMeta(assistantMsg);
                  if (d) updateStreamingMessage(d, assistantMsg.content);
                }
                if (chatIdForStream) {
                  saveConversationWithId(chatIdForStream, model, sysRef, messagesRef).then(() => loadHistory()).catch(() => loadHistory());
                }
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
                    messagesRef[assistantDraftIndex] = {
                      role: 'assistant',
                      content: errMsg,
                      createdAt: new Date().toISOString(),
                      model: model,
                      partial: false,
                      genSeconds: startedAtMs != null ? (Date.now() - startedAtMs) / 1000 : undefined,
                    };
                    state.streaming = false;
                    btnSend.disabled = false;
                    streamDiv.classList.remove('streaming');
                    const existingMeta = streamDiv.querySelector('.message-meta');
                    if (existingMeta) existingMeta.textContent = [formatMessageDate(new Date().toISOString()), model].filter(Boolean).join(' · ');
                    updateStreamingMessage(streamDiv, errMsg);
                    if (chatIdForStream) {
                      saveConversationWithId(chatIdForStream, model, sysRef, messagesRef).then(() => loadHistory()).catch(() => loadHistory());
                    }
                    return;
                  }
                  const p = getParts(obj);
                  if (p.thinking) fullThinking += p.thinking;
                  if (p.content) full += p.content;
                } catch (_) {}
              }
              const combined = joinFull();
              if (combined) {
                messagesRef[assistantDraftIndex].content = combined;
                messagesRef[assistantDraftIndex].partial = true;
                scheduleStreamingSave();
                const d = getStreamDiv();
                if (d) updateStreamingMessage(d, combined);
              } else if (receivedChunks) {
                const d = getStreamDiv();
                if (d) setStreamingStatus(d, 'Thinking…');
              }
              return read();
            });
          }
          return read();
        })
        .catch((err) => {
          if (err && (err.name === 'AbortError' || String(err.message || '').toLowerCase().includes('aborted'))) {
            stopStream('Stopped');
            return;
          }
          messagesRef[assistantDraftIndex].partial = false;
          finishStreamingUI();
          const d = getStreamDiv();
          if (d) updateStreamingMessage(d, `Error: ${err.message}`);
        });
    }
    if (!state.currentId) {
      saveConversationWithId(null, model, sysRef, messagesRef)
        .then((newId) => {
          chatIdForStream = newId;
          if (!state.currentId && state.messages === messagesRef) state.currentId = newId;
          if (state.activeStream && state.activeStream.assistantMsgId === assistantDraft.id) {
            state.activeStream.chatId = newId;
          }
          loadHistory();
          startStream();
        })
        .catch(() => startStream());
    } else {
      chatIdForStream = state.currentId;
      startStream();
    }

    if (btnStop) {
      btnStop.onclick = () => stopStream('Stopped');
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

  userInput.addEventListener('input', () => autoResizeTextarea(userInput, 10));
  if (btnTheme) btnTheme.addEventListener('click', toggleTheme);

  function init() {
    setTheme(getTheme());
    autoResizeTextarea(userInput, 10);
    loadConfig()
      .then(loadModels)
      .then(loadHistory)
      .then(renderMessages);
  }
  init();
})();
