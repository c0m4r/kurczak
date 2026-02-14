(function () {
  const messagesEl = document.getElementById('messages');
  const userInput = document.getElementById('userInput');
  const systemPrompt = document.getElementById('systemPrompt');
  const modelSelect = document.getElementById('modelSelect');
  const modelStatus = document.getElementById('modelStatus');
  const btnSend = document.getElementById('btnSend');
  const btnNewChat = document.getElementById('btnNewChat');
  const btnSystemPrompt = document.getElementById('btnSystemPrompt');
  const btnSetDefault = document.getElementById('btnSetDefault');
  const btnStop = document.getElementById('btnStop');
  const systemPromptRow = document.getElementById('systemPromptRow');
  const historyList = document.getElementById('historyList');

  const toast = document.getElementById('toast');
  const btnTheme = document.getElementById('btnTheme');
  const fileExplorer = document.getElementById('fileExplorer');
  const explorerResizer = document.getElementById('explorerResizer');
  const fileTree = document.getElementById('fileTree');
  const btnDownloadZip = document.getElementById('btnDownloadZip');
  const btnCloseExplorer = document.getElementById('btnCloseExplorer');
  const btnToggleExplorer = document.getElementById('btnToggleExplorer');
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

  function deleteMessage(msgId) {
    if (!confirm('Are you sure you want to delete this message?')) return;
    const idx = state.messages.findIndex(m => m.id === msgId);
    if (idx !== -1) {
      state.messages.splice(idx, 1);
      saveConversation();
      renderMessages();
    }
  }

  let state = {
    currentId: null,
    model: '',
    messages: [],
    streaming: false,
    abortController: null,
    activeStream: null,
    systemPromptPreset: 'default',
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
    const sanitized = DOMPurify.sanitize(raw);
    const div = document.createElement('div');
    div.className = 'content';
    div.innerHTML = sanitized;
    div.querySelectorAll('pre code').forEach((block) => {
      try {
        hljs.highlightElement(block);
      } catch (_) { }
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

    // Parse file paths from kurczak::file:: tags

    function isProbablyExtensionlessSpecial(name) {
      const specials = new Set([
        'LICENSE', 'LICENSE.txt', 'Makefile', 'Dockerfile', '.gitignore', '.env',
      ]);
      return specials.has(name);
    }

    function dedupeFilePathAndSet(path, content) {
      const p = String(path || '').trim();
      if (!p) return;

      const parts = p.split('/');
      const filename = parts[parts.length - 1] || '';
      const dir = parts.slice(0, -1).join('/');

      const hasDot = filename.includes('.');
      const base = hasDot ? filename.slice(0, filename.indexOf('.')) : filename;
      const baseKey = dir ? `${dir}/${base}` : base;

      if (!hasDot && !isProbablyExtensionlessSpecial(filename)) {
        for (const k of generatedFiles.keys()) {
          if (k === baseKey) continue;
          const kParts = k.split('/');
          const kFile = kParts[kParts.length - 1] || '';
          const kDir = kParts.slice(0, -1).join('/');
          if (kDir !== dir) continue;
          if (kFile.startsWith(base + '.') && kFile.length > base.length + 1) {
            return;
          }
        }
      }

      if (hasDot && generatedFiles.has(baseKey) && !isProbablyExtensionlessSpecial(base)) {
        generatedFiles.delete(baseKey);
      }

      generatedFiles.set(p, content);
    }

    div.querySelectorAll('.code-block-wrap').forEach((wrap) => {
      let prev = wrap.previousSibling;
      let filePath = null;
      let tagNode = null;

      // Walk backwards skipping empty text nodes/whitespace
      while (prev && (prev.nodeType === 3 && !prev.textContent.trim())) {
        prev = prev.previousSibling;
      }

      if (prev) {
        if (prev.nodeType === 1) { // Element
          const text = prev.textContent || '';
          const match = text.match(/kurczak::file::([^\s]+)/);
          if (match) {
            filePath = match[1];
            tagNode = prev;
          }
        } else if (prev.nodeType === 3) { // Text
          const text = prev.textContent || '';
          const match = text.match(/kurczak::file::([^\s]+)/);
          if (match) {
            filePath = match[1];
            tagNode = prev;
          }
        }
      }

      // Fallback: Check inside the code block
      if (!filePath) {
        const codeBlock = wrap.querySelector('code');
        if (codeBlock) {
          const text = codeBlock.textContent;
          const patterns = [
            /^\/\/ File:\s*(.+)$/m,
            /^# File:\s*(.+)$/m,
            /^<!-- File:\s*(.+?) -->$/m,
            /^\/\* File:\s*(.+?) \*\/$/m,
            /^-- File:\s*(.+)$/m,
            /^' File:\s*(.+)$/m,
            /^\*\* File:\s*(.+)$/m,
          ];
          for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
              filePath = match[1];
              break;
            }
          }
        }
      }

      if (filePath) {
        if (tagNode) {
          if (tagNode.nodeType === 1) tagNode.style.display = 'none';
          else if (tagNode.nodeType === 3) tagNode.textContent = '';
        }

        const codeBlock = wrap.querySelector('code');
        let content = codeBlock ? codeBlock.textContent : '';

        if (!tagNode) {
          const patterns = [
            /^\/\/ File:\s*(.+)$/m,
            /^# File:\s*(.+)$/m,
            /^<!-- File:\s*(.+?) -->$/m,
            /^\/\* File:\s*(.+?) \*\/$/m,
            /^-- File:\s*(.+)$/m,
            /^' File:\s*(.+)$/m,
            /^\*\* File:\s*(.+)$/m,
          ];
          patterns.forEach(pattern => {
            content = content.replace(pattern, '');
          });
          content = content.trim();
        }

        dedupeFilePathAndSet(filePath, content);

        if (!wrap.querySelector('.file-path-label')) {
          const fileLabel = document.createElement('div');
          fileLabel.className = 'file-path-label';
          fileLabel.style.cssText = `
                background: var(--accent);
                color: white;
                padding: 4px 8px;
                font-size: 12px;
                border-radius: 4px 4px 0 0;
                margin-bottom: -1px;
                font-family: var(--font);
                cursor: pointer;
              `;
          fileLabel.textContent = `📁 ${filePath}`;
          fileLabel.title = `Click to open ${filePath}`;
          fileLabel.addEventListener('click', () => {
            openFileModal(filePath, content);
          });
          wrap.insertBefore(fileLabel, wrap.firstChild);
          if (codeBlock) codeBlock.style.borderRadius = '0 0 4px 4px';
        }
      }
    });

    // Update file explorer after parsing
    if (generatedFiles.size > 0) {
      if (fileExplorer) {
        const isHidden = localStorage.getItem('kurczak_explorerHidden') === 'true';
        if (isHidden) {
          fileExplorer.classList.add('hidden');
          if (explorerResizer) explorerResizer.classList.add('hidden');
        } else {
          fileExplorer.classList.remove('hidden');
          if (explorerResizer) explorerResizer.classList.remove('hidden');
        }
      }
      if (btnToggleExplorer) btnToggleExplorer.classList.remove('hidden');
      directoryTree = buildTreeFromFiles(generatedFiles);
      fileTree.innerHTML = '';
      renderFileTree(directoryTree, fileTree);
    }

    return div;
  }

  function buildAssistantMessage(content, isStreaming, meta) {
    const parts = extractThink(content || '');
    const wrap = document.createElement('div');
    wrap.className = 'message assistant' + (isStreaming ? ' streaming' : '');
    if (content && content.includes('kurczak::status::done')) {
      wrap.classList.add('finished');
    }
    if (meta && meta.msgId) wrap.dataset.msgId = meta.msgId;
    const metaRow = document.createElement('div');
    metaRow.className = 'message-meta-row';
    const metaEl = document.createElement('span');
    metaEl.className = 'message-meta';
    metaEl.textContent = formatAssistantMeta(meta);
    const rawBtn = document.createElement('button');
    rawBtn.type = 'button';
    rawBtn.className = 'btn btn-ghost btn-sm';
    rawBtn.textContent = 'Switch to raw';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-ghost btn-sm btn-copy-msg';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      const body = wrap.querySelector('.message-body');
      const rawEl = body ? body.querySelector('.raw-content') : null;
      const textToCopy = rawEl ? rawEl.textContent : (content || '');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(textToCopy).then(() => showToast('Copied!'));
      } else {
        const ta = document.createElement('textarea');
        ta.value = textToCopy;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Copied!');
      }
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-ghost btn-sm btn-del';
    delBtn.textContent = '🗑️';
    delBtn.title = 'Delete message';
    delBtn.addEventListener('click', () => deleteMessage(meta.msgId));

    metaRow.appendChild(metaEl);
    metaRow.appendChild(rawBtn);
    metaRow.appendChild(copyBtn);
    metaRow.appendChild(delBtn);
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
    const setCopiedUI = () => {
      btn.classList.add('copied');
      showToast('Copied!');
      setTimeout(() => btn.classList.remove('copied'), 2000);
    };

    const fallbackCopy = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) throw new Error('Copy not supported');
    };

    Promise.resolve()
      .then(() => {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          return navigator.clipboard.writeText(text);
        }
        return fallbackCopy();
      })
      .then(() => setCopiedUI())
      .catch(() => {
        try {
          fallbackCopy();
          setCopiedUI();
        } catch (_) {
          showToast('Copy failed');
        }
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
      const metaRow = document.createElement('div');
      metaRow.className = 'message-meta-row';

      const metaEl = document.createElement('span');
      metaEl.className = 'message-meta';
      metaEl.textContent = formatMessageDate(meta.createdAt);
      metaRow.appendChild(metaEl);

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn btn-ghost btn-sm btn-copy-msg user-copy';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(content).then(() => showToast('Copied!'));
        } else {
          const ta = document.createElement('textarea');
          ta.value = content;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          showToast('Copied!');
        }
      });
      metaRow.appendChild(copyBtn);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-ghost btn-sm btn-del user-del';
      delBtn.textContent = '🗑️';
      delBtn.title = 'Delete message';
      delBtn.addEventListener('click', () => deleteMessage(meta.msgId));
      metaRow.appendChild(delBtn);

      div.appendChild(metaRow);
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
    const body = div.querySelector('.message-body');
    const contentEl = body ? body.querySelector('.content') : div.querySelector('.content');
    const rawEl = body ? body.querySelector('.raw-content') : null;
    const thinkingDetails = body ? body.querySelector('.thinking-details') : null;
    const thinkingPre = thinkingDetails ? thinkingDetails.querySelector('.thinking-content') : null;
    const thinkingPreview = thinkingDetails ? thinkingDetails.querySelector('.thinking-preview') : null;
    if (!contentEl) return;

    div.classList.remove('status');

    let processedContent = content;
    // Check for done status
    if (processedContent.includes('kurczak::status::done')) {
      div.classList.add('finished');
    }

    const parts = extractThink(processedContent);

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

    if (!updateStreamingMessage._throttledContext) {
      updateStreamingMessage._throttledContext = throttle(() => updateContextUsage(), 2000);
    }
    updateStreamingMessage._throttledContext();
    maybeAutoScroll(wasNearBottom);
  }

  function throttle(func, limit) {
    let inThrottle;
    return function () {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    }
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
    const model = modelSelect.value;
    if (!model) return;

    const sys = systemPrompt.value.trim();
    let recent = state.messages;
    if (configMaxMessagesInContext > 0) recent = state.messages.slice(-configMaxMessagesInContext);
    const estimated = estimateTokens(recent, sys);

    fetchModelContext(model).then((contextLength) => {
      let text = '';
      if (contextLength != null) {
        text = 'Context: ~' + estimated + ' / ' + contextLength.toLocaleString() + ' tokens';
      } else {
        text = 'Context: ~' + estimated + ' tokens';
      }

      let usageEl = messagesEl.querySelector('.context-usage-footer');
      if (!usageEl) {
        usageEl = document.createElement('div');
        usageEl.className = 'context-usage-footer';
        messagesEl.appendChild(usageEl);
      }
      usageEl.textContent = text;
      // Ensure it stays at the bottom if we are already at bottom
      if (isNearBottom()) scrollToBottom();
    });
  }

  let configDefaultModel = '';
  let configMaxMessagesInContext = 0;
  let configDefaultSystemPrompt = '';
  let configCodingSystemPrompt = '';
  let configCodingSystemPromptSimple = '';
  function loadConfig() {
    return fetch('/api/config')
      .then((r) => r.json())
      .then((c) => {
        configDefaultSystemPrompt = c.defaultSystemPrompt || '';
        configCodingSystemPrompt = c.codingSystemPrompt || '';
        configCodingSystemPromptSimple = c.codingSystemPromptSimple || '';

        // Init preset selector
        const promptButtons = document.getElementById('systemPromptButtons');
        if (promptButtons) {
          const btns = promptButtons.querySelectorAll('.btn');

          // Expose setActive for external use
          window.setSystemPromptPreset = setActive;

          function setActive(val, updateValue = true) {
            state.systemPromptPreset = val;
            btns.forEach(b => {
              if (b.dataset.value === val) {
                b.classList.add('active');
                if (updateValue) {
                  if (val === 'default') systemPrompt.value = configDefaultSystemPrompt;
                  else if (val === 'coding-simple') systemPrompt.value = configCodingSystemPromptSimple;
                  else if (val === 'coding-complex') systemPrompt.value = configCodingSystemPrompt;
                  else if (val === 'none') systemPrompt.value = '';
                }
              } else {
                b.classList.remove('active');
              }
            });
            updateContextUsage();
          }

          // Set initial to default
          setActive('default');

          btns.forEach(b => {
            b.addEventListener('click', () => {
              setActive(b.dataset.value);
            });
          });
        }

        systemPrompt.addEventListener('input', () => {
          updateContextUsage();
        });

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
        modelSelect.classList.remove('hidden');
        modelStatus.classList.add('hidden');
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
        modelSelect.classList.add('hidden');
        modelStatus.classList.remove('hidden');
      });
  }

  // Poll for models every 5 seconds
  setInterval(loadModels, 5000);

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
            if (confirm('Are you sure you want to delete this chat history?')) {
              deleteHistory(item.id);
            }
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

  function resetExplorer() {
    generatedFiles.clear();
    directoryTree = [];
    if (fileExplorer) fileExplorer.classList.add('hidden');
    if (explorerResizer) explorerResizer.classList.add('hidden');
    if (btnToggleExplorer) btnToggleExplorer.classList.add('hidden');
    fileTree.innerHTML = '<div class="empty-state">No files generated yet</div>';
  }

  function loadConversation(id) {
    resetExplorer();
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
        if (data.systemPromptPreset && window.setSystemPromptPreset) {
          // Don't overwrite the value if we have a custom one in history that matches the preset, 
          // OR if we just want to set the button state.
          // Actually, the simple logic is: set the button state, but maybe don't force-overwrite the text if it was modified?
          // But `setActive` logic above overwrites text.
          // Let's pass `false` to `updateValue` if we are loading a specific system prompt text from history that might differ slightly,
          // OR just rely on the user's saved prompt text.

          // If we restore the preset, we probably want to sync the button. 
          // The systemPrompt.value is already set from data.systemPrompt above.
          window.setSystemPromptPreset(data.systemPromptPreset, false);
        } else {
          // If no preset saved, maybe try to guess or just default?
          // For now, if no preset is in data, we might leave it as is or default to coding.
          // Let's leave it as is (which is 'coding' from init, or whatever)
        }

        loadHistory();
      });
  }

  function newChat() {
    resetExplorer();
    state.currentId = null;
    state.messages = [];
    if (window.setSystemPromptPreset) window.setSystemPromptPreset('default');
    renderMessages();
    loadHistory();
  }

  function saveConversation() {
    const payload = {
      model: state.model || modelSelect.value,
      systemPrompt: systemPrompt.value.trim(),
      systemPromptPreset: state.systemPromptPreset,
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
        try { state.abortController.abort(); } catch (_) { }
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
                  } catch (_) { }
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
                } catch (_) { }
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

  function toggleExplorer() {
    if (!fileExplorer) return;
    const isHidden = fileExplorer.classList.toggle('hidden');
    if (explorerResizer) explorerResizer.classList.toggle('hidden', isHidden);
    localStorage.setItem('kurczak_explorerHidden', isHidden);
  }

  if (btnCloseExplorer) btnCloseExplorer.addEventListener('click', toggleExplorer);
  if (btnToggleExplorer) btnToggleExplorer.addEventListener('click', toggleExplorer);

  // File Explorer functionality
  const btnClearExplorer = document.getElementById('btnClearExplorer');
  const sidebarResizer = document.getElementById('sidebarResizer');
  const sidebarEl = document.querySelector('.sidebar');

  let generatedFiles = new Map(); // path -> content
  let directoryTree = null;

  function clearExplorer() {
    generatedFiles.clear();
    directoryTree = null;
    fileTree.innerHTML = '<div class="empty-state">No files generated yet</div>';
  }

  function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
      'js': '📜',
      'jsx': '⚛️',
      'ts': '📘',
      'tsx': '⚛️',
      'html': '🌐',
      'css': '🎨',
      'scss': '🎨',
      'json': '📋',
      'md': '📝',
      'py': '🐍',
      'java': '☕',
      'cpp': '⚙️',
      'c': '⚙️',
      'go': '🐹',
      'rs': '🦀',
      'php': '🐘',
      'rb': '💎',
      'sql': '🗃️',
      'yml': '📄',
      'yaml': '📄',
      'xml': '📄',
      'txt': '📄',
      'gitignore': '🚫',
      'env': '🔧',
      'dockerfile': '🐳'
    };
    return iconMap[ext] || '📄';
  }

  function buildTreeFromFiles(files) {
    const tree = {};
    if (files.size === 0) return tree;

    // Detect common prefix
    let commonPrefix = null;
    let paths = Array.from(files.keys());

    // Simple common prefix detection
    if (paths.length > 0) {
      const parts0 = paths[0].split('/');
      if (parts0.length > 1) {
        const root = parts0[0] + '/';
        let allMatch = true;
        for (const p of paths) {
          if (!p.startsWith(root)) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) commonPrefix = root;
      }
    }

    const wrap = !commonPrefix;

    files.forEach((content, path) => {
      // If we are wrapping, prepend 'Project/'
      // If we found a commonPrefix, we keep it as is (it will be the top folder)
      const fullPath = wrap ? 'Project/' + path : path;
      const parts = fullPath.split('/').filter(p => p);

      let current = tree;

      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          // It's a file (leaf)
          // Use 'path' (original) or 'fullPath'? 
          // usage of .path in renderFileTree is mainly for openFileModal(path, content)
          // If we click the file in the wrapped tree, we want to open the file.
          // generatedFiles uses original map keys.
          // So we should probably store the ORIGINAL path in the leaf node, 
          // loop logic uses fullPath for structure.
          current[part] = { type: 'file', content, path: path };
        } else {
          // It's a directory
          if (!current[part]) {
            current[part] = { type: 'folder', children: {} };
          } else if (current[part].type === 'file') {
            // Conflict: file became folder? handle gracefully
            current[part] = { type: 'folder', children: {} };
          }
          current = current[part].children;
        }
      });
    });

    return tree;
  }

  function renderFileTree(tree, container, level = 0) {
    const ul = document.createElement('ul');

    Object.entries(tree).sort(([a], [b]) => {
      // Folders first, then files, both alphabetically
      const aIsFolder = tree[a].type === 'folder';
      const bIsFolder = tree[b].type === 'folder';
      if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
      return a.localeCompare(b);
    }).forEach(([name, node]) => {
      const li = document.createElement('li');

      if (node.type === 'folder') {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'folder-item';
        folderDiv.innerHTML = `
          <span class="toggle-icon">▼</span>
          <span class="folder-icon">📁</span>
          <span>${name}</span>
        `;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'folder-content';
        renderFileTree(node.children, contentDiv, level + 1);

        folderDiv.addEventListener('click', () => {
          folderDiv.classList.toggle('collapsed');
          contentDiv.classList.toggle('collapsed');
        });

        li.appendChild(folderDiv);
        li.appendChild(contentDiv);
      } else {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'file-item';
        fileDiv.innerHTML = `
          <span class="file-icon">${getFileIcon(name)}</span>
          <span>${name}</span>
        `;

        fileDiv.addEventListener('click', () => {
          // Remove active class from all files
          document.querySelectorAll('.file-item.active').forEach(item => {
            item.classList.remove('active');
          });
          fileDiv.classList.add('active');

          // Open file in modal or new tab
          openFileModal(node.path, node.content);
        });

        li.appendChild(fileDiv);
      }

      ul.appendChild(li);
    });

    container.appendChild(ul);
  }

  function openFileModal(filePath, content) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      width: 90%;
      height: 80%;
      max-width: 1200px;
      display: flex;
      flex-direction: column;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid var(--border);
      gap: 16px;
    `;

    // Title
    const title = document.createElement('h3');
    title.style.cssText = 'margin: 0; color: var(--text); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    title.textContent = filePath;

    // Actions
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.alignItems = 'center';

    const btnCopy = document.createElement('button');
    btnCopy.className = 'btn btn-ghost btn-sm';
    btnCopy.textContent = 'Copy';
    btnCopy.onclick = () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(content).then(() => showToast('Copied!'));
      } else {
        const ta = document.createElement('textarea');
        ta.value = content;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Copied!');
      }
    };

    const btnDownload = document.createElement('button');
    btnDownload.className = 'btn btn-ghost btn-sm';
    btnDownload.textContent = 'Download';
    btnDownload.onclick = () => {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const btnClose = document.createElement('button');
    btnClose.style.cssText = 'background: none; border: none; color: var(--text); font-size: 20px; cursor: pointer; padding: 0 8px;';
    btnClose.textContent = '✕';
    btnClose.onclick = () => document.body.removeChild(modal);

    actions.appendChild(btnCopy);
    actions.appendChild(btnDownload);
    actions.appendChild(btnClose);

    header.appendChild(title);
    header.appendChild(actions);

    const contentArea = document.createElement('pre');
    contentArea.style.cssText = `
      flex: 1;
      padding: 16px;
      overflow: auto;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      font-size: 13px;
      line-height: 1.4;
      margin: 0;
      white-space: pre-wrap;
    `;
    const code = document.createElement('code');
    code.textContent = content;

    // Extension detection
    const ext = filePath.split('.').pop();
    if (ext) code.className = `language-${ext}`;

    contentArea.appendChild(code);

    modalContent.appendChild(header);
    modalContent.appendChild(contentArea);
    modal.appendChild(modalContent);

    document.body.appendChild(modal);

    modal.onclick = (e) => {
      if (e.target === modal) document.body.removeChild(modal);
    };

    try {
      hljs.highlightElement(code);
    } catch (_) { }
  }

  function downloadZip() {
    if (generatedFiles.size === 0) {
      showToast('No files to download. Generate some code first!');
      return;
    }

    showToast('Creating ZIP file...');

    // Create a new JSZip instance
    const zip = new JSZip();

    // Add files to the zip
    let commonPrefix = null;
    let fileCount = 0;

    // First pass: detecting common prefix
    for (const [path] of generatedFiles) {
      fileCount++;
      const parts = path.split('/');
      if (parts.length > 1) {
        const root = parts[0] + '/';
        if (commonPrefix === null) commonPrefix = root;
        else if (commonPrefix !== root) {
          commonPrefix = ''; // Mixed roots
          break;
        }
      } else {
        commonPrefix = ''; // Root file found
        break;
      }
    }

    // Define wrap folder if no common root
    const wrapFolder = commonPrefix ? '' : 'project/';

    for (const [path, content] of generatedFiles) {
      zip.file(wrapFolder + path, content);
    }


    // Filename: CommonPrefix (minus slash) or "Project"
    let zipFilename = 'project-files.zip';
    if (commonPrefix) {
      // e.g. "MyProject/" -> "MyProject.zip"
      zipFilename = commonPrefix.slice(0, -1) + '.zip';
    } else {
      zipFilename = 'Project.zip';
    }

    // Generate the zip file
    zip.generateAsync({ type: 'blob' })
      .then(function (blob) {
        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`Downloaded ${generatedFiles.size} files as ZIP`);
      })
      .catch(function (error) {
        console.error('Error creating ZIP:', error);
        showToast('Error creating ZIP file');
      });
  }

  // Parse code blocks from messages and extract file paths
  function parseCodeBlocks() {
    const messages = document.querySelectorAll('.message.assistant');

    messages.forEach(message => {
      const codeBlocks = message.querySelectorAll('pre code');
      codeBlocks.forEach(block => {
        const text = block.textContent;

        // Try different comment styles for file path detection
        const patterns = [
          /^\/\/ File:\s*(.+)$/m,           // JavaScript/TypeScript/C++
          /^# File:\s*(.+)$/m,              // Python/Shell/YAML
          /^<!-- File:\s*(.+?) -->$/m,      // HTML
          /^\/\* File:\s*(.+?) \*\/$/m,     // CSS/JS (multi-line)
          /^-- File:\s*(.+)$/m,             // SQL
          /^' File:\s*(.+)$/m,              // Visual Basic
          /^\*\* File:\s*(.+)$/m,           // Markdown
        ];

        let filePath = null;
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            filePath = match[1];
            break;
          }
        }

        if (filePath) {
          // Remove the file path comment from content
          let content = text;
          patterns.forEach(pattern => {
            content = content.replace(pattern, '');
          });
          content = content.trim();

          generatedFiles.set(filePath, content);

          // Update the code block to show the file path
          const fileLabel = document.createElement('div');
          fileLabel.className = 'file-path-label';
          fileLabel.style.cssText = `
            background: var(--accent);
            color: white;
            padding: 4px 8px;
            font-size: 12px;
            border-radius: 4px 4px 0 0;
            margin-bottom: -1px;
            font-family: var(--font);
            cursor: pointer;
          `;
          fileLabel.textContent = `📁 ${filePath}`;
          fileLabel.title = `Click to open ${filePath}`;

          // Add click handler to open file
          fileLabel.addEventListener('click', () => {
            openFileModal(filePath, content);
          });

          block.parentNode.insertBefore(fileLabel, block);

          // Add some styling to the code block
          block.style.borderRadius = '0 0 4px 4px';
        }
      });
    });

    // Update file explorer
    if (generatedFiles.size > 0) {
      directoryTree = buildTreeFromFiles(generatedFiles);
      fileTree.innerHTML = '';
      renderFileTree(directoryTree, fileTree);
    }
  }

  // Event listeners for file explorer
  if (btnDownloadZip) {
    btnDownloadZip.addEventListener('click', downloadZip);
  }



  // Panel resizing (sidebar + explorer)
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function setCssVar(name, valuePx) {
    document.documentElement.style.setProperty(name, `${valuePx}px`);
  }

  function getStoredPx(key) {
    const v = localStorage.getItem(key);
    const n = v != null ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  }

  function initPanelSizes() {
    const storedSidebar = getStoredPx('kurczak_sidebar_w');
    const storedExplorer = getStoredPx('kurczak_explorer_w');
    if (storedSidebar != null) setCssVar('--sidebar-w', storedSidebar);
    if (storedExplorer != null) setCssVar('--explorer-w', storedExplorer);
  }

  function startResize(e, which) {
    if (e.button !== 0) return;
    e.preventDefault();

    const startX = e.clientX;
    const startSidebarW = sidebarEl ? sidebarEl.getBoundingClientRect().width : 0;
    const startExplorerW = fileExplorer ? fileExplorer.getBoundingClientRect().width : 0;

    function onMove(ev) {
      const dx = ev.clientX - startX;

      if (which === 'sidebar') {
        const next = clamp(startSidebarW + dx, 220, 520);
        setCssVar('--sidebar-w', next);
        localStorage.setItem('kurczak_sidebar_w', String(Math.round(next)));
      }

      if (which === 'explorer') {
        const next = clamp(startExplorerW - dx, 260, 900);
        setCssVar('--explorer-w', next);
        localStorage.setItem('kurczak_explorer_w', String(Math.round(next)));
      }
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    }

    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  initPanelSizes();
  if (sidebarResizer) sidebarResizer.addEventListener('mousedown', (e) => startResize(e, 'sidebar'));
  if (explorerResizer) explorerResizer.addEventListener('mousedown', (e) => startResize(e, 'explorer'));

  // Manual trigger for parsing (for testing)
  window.parseFiles = function () {
    // Re-render all messages to trigger parsing
    renderMessages();
  };

  // Test function to add sample files
  window.addTestFiles = function () {
    generatedFiles.set('package.json', '{\n  "name": "test-project",\n  "version": "1.0.0"\n}');
    generatedFiles.set('src/index.js', 'console.log("Hello World");');
    generatedFiles.set('README.md', '# Test Project\nThis is a test project.');

    // Update file explorer
    directoryTree = buildTreeFromFiles(generatedFiles);
    fileTree.innerHTML = '';
    renderFileTree(directoryTree, fileTree);

    showToast('Added test files for download testing');
  };

  // Debug function to check code blocks
  window.debugCodeBlocks = function () {
    const messages = document.querySelectorAll('.message.assistant');
    console.log('Found assistant messages:', messages.length);
    console.log('Generated files:', generatedFiles.size);

    messages.forEach((message, index) => {
      const codeBlocks = message.querySelectorAll('pre code');
      console.log(`Message ${index + 1} has ${codeBlocks.length} code blocks`);

      codeBlocks.forEach((block, blockIndex) => {
        const text = block.textContent;
        console.log(`Block ${blockIndex + 1} content:`, text.substring(0, 200) + '...');

        // Check for file patterns
        const hasFilePattern = /^\/\/ File:\s*(.+)$/m.test(text);
        console.log(`Has file pattern:`, hasFilePattern);
      });
    });
  };

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
