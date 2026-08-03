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
  const promptButtons = document.getElementById('systemPromptButtons');
  const btnCloseSystemPrompt = document.getElementById('btnCloseSystemPrompt');
  const customPromptToggle = document.getElementById('customPromptToggle');
  const customPromptEditor = document.getElementById('customPromptEditor');
  const btnResetPrompt = document.getElementById('btnResetPrompt');
  const promptEditStatus = document.getElementById('promptEditStatus');
  const promptCharCount = document.getElementById('promptCharCount');
  const behaviorSummaryIcon = document.getElementById('behaviorSummaryIcon');
  const behaviorSummaryTitle = document.getElementById('behaviorSummaryTitle');
  const behaviorSummaryDescription = document.getElementById('behaviorSummaryDescription');
  const behaviorFitBadge = document.getElementById('behaviorFitBadge');
  const behaviorExplorerBadge = document.getElementById('behaviorExplorerBadge');
  const behaviorButtonLabel = document.getElementById('behaviorButtonLabel');
  const behaviorCustomIndicator = document.getElementById('behaviorCustomIndicator');
  const historyList = document.getElementById('historyList');
  const historySearch = document.getElementById('historySearch');
  const historyCount = document.getElementById('historyCount');
  const chatTitle = document.getElementById('chatTitle');
  const chatSubtitle = document.getElementById('chatSubtitle');
  const contextUsage = document.getElementById('contextUsage');
  const connectionState = document.getElementById('connectionState');
  const sidebar = document.getElementById('sidebar');
  const messagesArea = document.getElementById('messagesArea');
  const btnOpenSidebar = document.getElementById('btnOpenSidebar');
  const btnCloseSidebar = document.getElementById('btnCloseSidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  const toast = document.getElementById('toast');
  const btnTheme = document.getElementById('btnTheme');
  const themeLabel = document.getElementById('themeLabel');
  const fileExplorer = document.getElementById('fileExplorer');
  const explorerResizer = document.getElementById('explorerResizer');
  const fileTree = document.getElementById('fileTree');
  const generatedFileCount = document.getElementById('generatedFileCount');
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
    const savedTheme = localStorage.getItem('kurczak_theme');
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    if (highlightStyleLink) highlightStyleLink.href = HIGHLIGHT_STYLES[theme] || HIGHLIGHT_STYLES.dark;
    localStorage.setItem('kurczak_theme', theme);
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    if (themeLabel) themeLabel.textContent = `${nextTheme[0].toUpperCase()}${nextTheme.slice(1)} mode`;
    if (btnTheme) {
      btnTheme.title = `Switch to ${nextTheme} mode`;
      btnTheme.setAttribute('aria-label', `Switch to ${nextTheme} mode`);
    }
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

  let historyItems = [];
  let loadedHistoryTitle = '';
  let promptDrafts = {};

  const BEHAVIOR_MODES = {
    default: {
      index: 0,
      label: 'General',
      icon: '✦',
      title: 'General assistant',
      description: 'Balanced instructions for questions, writing, and everyday help.',
      fit: 'Any model',
      explorer: 'Normal chat',
      explorerEnabled: false,
    },
    'coding-simple': {
      index: 1,
      label: 'Simple coder',
      icon: '</>',
      title: 'Simple coder',
      description: 'Short, low-ambiguity coding instructions with normal code snippets.',
      fit: 'Small-model friendly',
      explorer: 'Snippets only',
      explorerEnabled: false,
    },
    'coding-complex': {
      index: 2,
      label: 'Project builder',
      icon: '▦',
      title: 'Project builder',
      description: 'Structured complete-file output that Kurczak can capture as a project.',
      fit: 'For capable models',
      explorer: 'File explorer enabled',
      explorerEnabled: true,
    },
  };

  function closeSidebar() {
    document.body.classList.remove('sidebar-visible');
    if (btnOpenSidebar) btnOpenSidebar.setAttribute('aria-expanded', 'false');
  }

  function openSidebar() {
    document.body.classList.add('sidebar-visible');
    if (btnOpenSidebar) btnOpenSidebar.setAttribute('aria-expanded', 'true');
    window.setTimeout(() => {
      if (btnCloseSidebar) btnCloseSidebar.focus();
    }, 220);
  }

  function getConversationTitle() {
    if (loadedHistoryTitle) return loadedHistoryTitle;
    const firstUserMessage = state.messages.find((message) => message.role === 'user' && message.content);
    if (!firstUserMessage) return 'New conversation';
    const singleLine = String(firstUserMessage.content).replace(/\s+/g, ' ').trim();
    return singleLine.length > 58 ? `${singleLine.slice(0, 57)}…` : singleLine;
  }

  function updateConversationHeading() {
    if (chatTitle) chatTitle.textContent = getConversationTitle();
    if (!chatSubtitle) return;

    const model = modelSelect.value || state.model;
    if (state.streaming) {
      chatSubtitle.textContent = model ? `${model} is responding` : 'Generating a response';
    } else if (model) {
      const messageCount = state.messages.length;
      chatSubtitle.textContent = messageCount
        ? `${model} · ${messageCount} ${messageCount === 1 ? 'message' : 'messages'}`
        : `${model} · Ready`;
    } else {
      chatSubtitle.textContent = 'Choose a model and start a conversation';
    }
  }

  function getPresetPrompt(preset) {
    if (preset === 'coding-simple') return configCodingSystemPromptSimple;
    if (preset === 'coding-complex') return configCodingSystemPrompt;
    return configDefaultSystemPrompt;
  }

  function promptsMatch(a, b) {
    return String(a || '').trim() === String(b || '').trim();
  }

  function inferPresetFromPrompt(prompt) {
    if (promptsMatch(prompt, configCodingSystemPromptSimple)) return 'coding-simple';
    if (promptsMatch(prompt, configCodingSystemPrompt)) return 'coding-complex';
    return 'default';
  }

  function updatePromptCustomizationState() {
    const basePrompt = getPresetPrompt(state.systemPromptPreset);
    const customized = !promptsMatch(systemPrompt.value, basePrompt);
    if (promptEditStatus) {
      promptEditStatus.textContent = customized ? 'Customized' : 'Mode default';
      promptEditStatus.classList.toggle('customized', customized);
    }
    if (promptCharCount) {
      const count = systemPrompt.value.length;
      promptCharCount.textContent = `${count.toLocaleString()} ${count === 1 ? 'character' : 'characters'}`;
    }
    if (btnResetPrompt) btnResetPrompt.disabled = !customized;
    if (behaviorCustomIndicator) behaviorCustomIndicator.classList.toggle('hidden', !customized);
  }

  function updateBehaviorUI() {
    const mode = BEHAVIOR_MODES[state.systemPromptPreset] || BEHAVIOR_MODES.default;
    if (promptButtons) {
      promptButtons.style.setProperty('--active-index', String(mode.index));
      promptButtons.querySelectorAll('.behavior-option').forEach((button) => {
        const active = button.dataset.value === state.systemPromptPreset;
        button.classList.toggle('active', active);
        button.setAttribute('aria-checked', String(active));
        button.tabIndex = active ? 0 : -1;
      });
    }
    if (behaviorSummaryIcon) behaviorSummaryIcon.textContent = mode.icon;
    if (behaviorSummaryTitle) behaviorSummaryTitle.textContent = mode.title;
    if (behaviorSummaryDescription) behaviorSummaryDescription.textContent = mode.description;
    if (behaviorFitBadge) behaviorFitBadge.textContent = mode.fit;
    if (behaviorExplorerBadge) {
      behaviorExplorerBadge.textContent = mode.explorer;
      behaviorExplorerBadge.classList.toggle('explorer-enabled', mode.explorerEnabled);
    }
    if (behaviorButtonLabel) behaviorButtonLabel.textContent = mode.label;
    if (btnSystemPrompt) btnSystemPrompt.title = `Model behavior: ${mode.label}`;
    updatePromptCustomizationState();
  }

  function setSystemPromptPreset(value, updateValue = true, rememberCurrent = true) {
    const nextPreset = BEHAVIOR_MODES[value] ? value : 'default';
    const previousPreset = BEHAVIOR_MODES[state.systemPromptPreset] ? state.systemPromptPreset : 'default';

    if (updateValue && rememberCurrent) {
      promptDrafts[previousPreset] = systemPrompt.value;
    }

    state.systemPromptPreset = nextPreset;
    if (updateValue) {
      systemPrompt.value = Object.prototype.hasOwnProperty.call(promptDrafts, nextPreset)
        ? promptDrafts[nextPreset]
        : getPresetPrompt(nextPreset);
    } else {
      promptDrafts[nextPreset] = systemPrompt.value;
    }

    updateBehaviorUI();
    updateContextUsage();
  }

  function setPromptEditorOpen(open, focusEditor = false) {
    if (customPromptToggle) customPromptToggle.checked = open;
    if (customPromptEditor) customPromptEditor.classList.toggle('hidden', !open);
    localStorage.setItem('kurczak_promptEditorOpen', String(open));
    if (open && focusEditor) {
      window.setTimeout(() => {
        systemPrompt.focus();
        systemPrompt.setSelectionRange(0, 0);
        systemPrompt.scrollTop = 0;
      }, 0);
    }
  }

  function setBehaviorPanelOpen(open, returnFocus = false) {
    systemPromptRow.classList.toggle('hidden', !open);
    btnSystemPrompt.setAttribute('aria-expanded', String(open));
    if (open) {
      window.setTimeout(() => {
        const activeOption = promptButtons && promptButtons.querySelector('.behavior-option.active');
        if (activeOption) activeOption.focus();
      }, 0);
    } else if (returnFocus) {
      btnSystemPrompt.focus();
    }
  }

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

  // Backward compat: older chats were saved while the model was instructed to
  // append a "kurczak::status::done" completion marker. That mechanism is gone,
  // but legacy histories still contain it — strip it from the rendered view so
  // it doesn't show as stray text. New responses no longer contain it.
  function stripLegacyDoneMarker(text) {
    return String(text || '').replace(/\s*kurczak::status::done\s*$/m, '').trim();
  }

  function lastLines(text, count) {
    const s = String(text || '');
    if (!s) return '';
    const lines = s.replace(/\r\n?/g, '\n').split('\n');
    const tail = lines.slice(Math.max(0, lines.length - count));
    return tail.join('\n').trim();
  }

  let updateFileTreeTimer = null;
  function updateGeneratedFileCount() {
    const count = generatedFiles.size;
    if (generatedFileCount) generatedFileCount.textContent = `${count} ${count === 1 ? 'file' : 'files'}`;
    if (btnToggleExplorer) {
      btnToggleExplorer.title = count ? `Open ${count} generated ${count === 1 ? 'file' : 'files'}` : 'Toggle file explorer';
    }
  }

  function scheduleUpdateFileTree() {
    if (generatedFiles.size > 0) {
      updateGeneratedFileCount();
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

      if (!updateFileTreeTimer) {
        updateFileTreeTimer = setTimeout(() => {
          updateFileTreeTimer = null;
          if (typeof buildTreeFromFiles === 'function') {
            directoryTree = buildTreeFromFiles(generatedFiles);
            if (fileTree) {
              fileTree.innerHTML = '';
              renderFileTree(directoryTree, fileTree);
            }
          }
        }, 500);
      }
    }
  }

  function normalizeGeneratedPath(rawPath) {
    let path = String(rawPath || '').trim();
    path = path.replace(/^[`'"\s]+|[`'"\s]+$/g, '').replace(/\\/g, '/');
    while (path.startsWith('./')) path = path.slice(2);

    if (!path || path.length > 240 || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return null;
    if (/[\u0000-\u001f<>:"|?*]/.test(path)) return null;

    const parts = path.split('/');
    if (parts.length > 24 || parts.some((part) => !part || part === '.' || part === '..' || part.length > 100)) return null;
    return parts.join('/');
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
      const p = normalizeGeneratedPath(path);
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
          const text = (prev.textContent || '').trim();
          const match = text.match(/^kurczak::file::(.+)$/);
          if (match) {
            filePath = normalizeGeneratedPath(match[1]);
            tagNode = prev;
          }
        } else if (prev.nodeType === 3) { // Text
          const text = (prev.textContent || '').trim();
          const match = text.match(/^kurczak::file::(.+)$/);
          if (match) {
            filePath = normalizeGeneratedPath(match[1]);
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
              filePath = normalizeGeneratedPath(match[1]);
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
          const fileLabel = document.createElement('button');
          fileLabel.type = 'button';
          fileLabel.className = 'file-path-label';
          fileLabel.textContent = filePath;
          fileLabel.title = `Click to open ${filePath}`;
          fileLabel.addEventListener('click', () => openFileModal(filePath, content));
          wrap.insertBefore(fileLabel, wrap.firstChild);
          if (codeBlock) codeBlock.style.borderRadius = '0 0 4px 4px';
        }
      }
    });

    // Update file explorer after parsing
    if (generatedFiles.size > 0) {
      scheduleUpdateFileTree();
    }

    return div;
  }

  function buildAssistantMessage(content, isStreaming, meta) {
    const parts = extractThink(content || '');
    const wrap = document.createElement('div');
    wrap.className = 'message assistant' + (isStreaming ? ' streaming' : '');
    wrap.setAttribute('aria-label', 'Kurczak response');
    if (meta && meta.msgId) wrap.dataset.msgId = meta.msgId;
    const metaRow = document.createElement('div');
    metaRow.className = 'message-meta-row';
    const metaEl = document.createElement('span');
    metaEl.className = 'message-meta';
    metaEl.textContent = formatAssistantMeta(meta);

    // Live "Generating…" indicator — shown only while the message has the
    // `streaming` class (toggled off in finishStreamingUI / on error / on stop).
    const streamingIndicator = document.createElement('span');
    streamingIndicator.className = 'streaming-indicator';
    streamingIndicator.setAttribute('aria-live', 'polite');
    const spinner = document.createElement('span');
    spinner.className = 'streaming-spinner';
    const streamingLabel = document.createElement('span');
    streamingLabel.className = 'streaming-label';
    streamingLabel.textContent = 'Generating…';
    streamingIndicator.appendChild(spinner);
    streamingIndicator.appendChild(streamingLabel);
    const rawBtn = document.createElement('button');
    rawBtn.type = 'button';
    rawBtn.className = 'btn btn-ghost btn-sm btn-raw';
    rawBtn.textContent = 'Switch to raw';
    rawBtn.title = 'View the unformatted response';
    rawBtn.setAttribute('aria-pressed', 'false');

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-ghost btn-sm btn-copy-msg';
    copyBtn.textContent = 'Copy';
    copyBtn.title = 'Copy response';
    copyBtn.setAttribute('aria-label', 'Copy response');
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
    delBtn.setAttribute('aria-label', 'Delete response');
    delBtn.addEventListener('click', () => deleteMessage(meta.msgId));

    metaRow.appendChild(metaEl);
    metaRow.appendChild(streamingIndicator);
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
      contentEl.appendChild(renderMarkdown(stripLegacyDoneMarker(parts.visible)));
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
      const showingRaw = !rawEl.classList.contains('hidden');
      rawBtn.textContent = showingRaw ? 'Switch to rendered' : 'Switch to raw';
      rawBtn.setAttribute('aria-pressed', String(showingRaw));
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
    div.setAttribute('aria-label', role === 'user' ? 'Your message' : `${role} message`);
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
      copyBtn.title = 'Copy message';
      copyBtn.setAttribute('aria-label', 'Copy your message');
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
      delBtn.setAttribute('aria-label', 'Delete your message');
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

    const parts = extractThink(content);
    const isRawVisible = rawEl && !rawEl.classList.contains('hidden');

    contentEl.innerHTML = '';
    contentEl.appendChild(renderMarkdown(stripLegacyDoneMarker(parts.visible)));

    if (rawEl) {
      rawEl.textContent = content;
      if (isRawVisible) {
        rawEl.classList.remove('hidden');
        contentEl.classList.add('hidden');
      } else {
        rawEl.classList.add('hidden');
        contentEl.classList.remove('hidden');
      }
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
      const content = document.createElement('div');
      content.className = 'empty-content';
      content.innerHTML = `
        <div class="empty-mark" aria-hidden="true">🐣</div>
        <h2>What are we working on?</h2>
        <p>Think through an idea, solve a technical problem, or build something new with a model running on your machine.</p>
        <div class="starter-grid" aria-label="Conversation starters"></div>
      `;

      const starters = [
        { icon: '✦', title: 'Explore an idea', description: 'Help me think through a new idea', prompt: 'Help me think through a new idea. Start by asking what I am trying to achieve.' },
        { icon: '</>', title: 'Build something', description: 'Plan and build a small project', prompt: 'Help me plan and build a small project. Ask me about the goal and constraints first.' },
        { icon: '⌁', title: 'Debug a problem', description: 'Find the cause, then explain the fix', prompt: 'Help me debug a problem. Ask for the relevant error and context, then guide me to the root cause.' },
        { icon: '↗', title: 'Improve my work', description: 'Review and sharpen what I have', prompt: 'Review something I am working on and help me improve it. Ask me to share it first.' },
      ];
      const starterGrid = content.querySelector('.starter-grid');
      starters.forEach((starter) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'starter-card';
        button.innerHTML = `<span class="starter-icon" aria-hidden="true"></span><strong></strong><span></span>`;
        button.querySelector('.starter-icon').textContent = starter.icon;
        button.querySelector('strong').textContent = starter.title;
        button.querySelector('span:last-child').textContent = starter.description;
        button.addEventListener('click', () => {
          userInput.value = starter.prompt;
          autoResizeTextarea(userInput, 10);
          userInput.focus();
          userInput.setSelectionRange(userInput.value.length, userInput.value.length);
        });
        starterGrid.appendChild(button);
      });

      empty.appendChild(content);
      messagesEl.appendChild(empty);
      updateConversationHeading();
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
    updateConversationHeading();
    updateContextUsage();
  }

  function estimateTokens(messages, systemText) {
    let chars = (systemText || '').length;
    const recent = configMaxMessagesInContext > 0 ? messages.slice(-configMaxMessagesInContext) : messages;
    recent.forEach((m) => { chars += (m.content || '').length; });
    return Math.round(chars / 4);
  }

  function fetchModelContext(model) {
    if (modelContextCache[model] !== undefined) {
      // Using cached context
      return Promise.resolve(modelContextCache[model]);
    }
    // Fetching fresh context info
    return fetch('/api/model-info?model=' + encodeURIComponent(model))
      .then((r) => r.ok ? r.json() : { contextLength: null, contextLengthType: 'maximum' })
      .then((d) => {
        const result = {
          contextLength: d && d.contextLength != null ? Number(d.contextLength) : null,
          contextLengthType: d.contextLengthType || 'maximum'
        };
        // Caching context
        modelContextCache[model] = result;
        return result;
      })
      .catch(() => {
        // Failed to fetch context
        modelContextCache[model] = { contextLength: null, contextLengthType: 'maximum' };
        return { contextLength: null, contextLengthType: 'maximum' };
      });
  }

  function updateContextUsage() {
    const model = modelSelect.value;
    if (!model) {
      if (contextUsage) {
        contextUsage.textContent = '';
        contextUsage.className = 'context-usage-header';
      }
      return;
    }

    const sys = systemPrompt.value.trim();
    let recent = state.messages;
    if (configMaxMessagesInContext > 0) recent = state.messages.slice(-configMaxMessagesInContext);
    const estimated = estimateTokens(recent, sys);

    fetchModelContext(model).then((result) => {
      let text = '';
      let accessibleText = '';
      let isExceeded = false;

      if (result.contextLength != null) {
        const contextTypeLabel = result.contextLengthType === 'actual' ? 'actual' : 'max';
        text = '~' + estimated.toLocaleString() + ' / ' + result.contextLength.toLocaleString() + ' tokens';
        accessibleText = 'Estimated context: ' + estimated.toLocaleString() + ' of ' + result.contextLength.toLocaleString() + ' ' + contextTypeLabel + ' tokens';
        isExceeded = estimated > result.contextLength;
        if (isExceeded) {
          text += ' · Exceeded';
          accessibleText += '. Context window exceeded.';
        }
      } else {
        text = '~' + estimated.toLocaleString() + ' tokens';
        accessibleText = 'Estimated context: ' + estimated.toLocaleString() + ' tokens';
      }

      const usageEl = contextUsage;
      if (!usageEl) return;
      usageEl.textContent = text;
      usageEl.title = accessibleText;
      usageEl.classList.add('visible');

      // Add warning class when exceeded
      if (isExceeded) {
        usageEl.classList.add('context-exceeded');
      } else {
        usageEl.classList.remove('context-exceeded');
      }

      // Add class to indicate actual vs maximum context
      usageEl.classList.toggle('context-actual', result.contextLengthType === 'actual');
      usageEl.classList.toggle('context-maximum', result.contextLengthType === 'maximum');
    });
  }

  let configDefaultModel = '';
  let configMaxMessagesInContext = 0;
  let configDefaultSystemPrompt = '';
  let configCodingSystemPrompt = '';
  let configCodingSystemPromptSimple = '';
  let knownModelsSignature = null;
  function loadConfig() {
    return fetch('/api/config')
      .then((r) => r.json())
      .then((c) => {
        configDefaultSystemPrompt = c.defaultSystemPrompt || '';
        configCodingSystemPrompt = c.codingSystemPrompt || '';
        configCodingSystemPromptSimple = c.codingSystemPromptSimple || '';
        configDefaultModel = c.defaultModel || '';
        configMaxMessagesInContext = typeof c.maxMessagesInContext === 'number' && c.maxMessagesInContext > 0 ? c.maxMessagesInContext : 0;

        promptDrafts = {};
        window.setSystemPromptPreset = setSystemPromptPreset;
        setSystemPromptPreset('default', true, false);
        setPromptEditorOpen(localStorage.getItem('kurczak_promptEditorOpen') === 'true');

        if (promptButtons) {
          const options = Array.from(promptButtons.querySelectorAll('.behavior-option'));
          options.forEach((button) => {
            button.addEventListener('click', () => setSystemPromptPreset(button.dataset.value));
            button.addEventListener('keydown', (event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const currentIndex = options.indexOf(button);
              let nextIndex = currentIndex;
              if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + options.length) % options.length;
              if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % options.length;
              if (event.key === 'Home') nextIndex = 0;
              if (event.key === 'End') nextIndex = options.length - 1;
              const nextButton = options[nextIndex];
              setSystemPromptPreset(nextButton.dataset.value);
              nextButton.focus();
            });
          });
        }

        systemPrompt.addEventListener('input', () => {
          promptDrafts[state.systemPromptPreset] = systemPrompt.value;
          updatePromptCustomizationState();
          updateContextUsage();
        });
        if (customPromptToggle) {
          customPromptToggle.addEventListener('change', () => setPromptEditorOpen(customPromptToggle.checked, customPromptToggle.checked));
        }
        if (btnResetPrompt) {
          btnResetPrompt.addEventListener('click', () => {
            delete promptDrafts[state.systemPromptPreset];
            systemPrompt.value = getPresetPrompt(state.systemPromptPreset);
            updatePromptCustomizationState();
            updateContextUsage();
            showToast('Prompt reset to the mode default');
          });
        }
      });
  }

  function loadModels() {
    return fetch('/api/models')
      .then((r) => {
        if (!r.ok) throw new Error('Could not load models');
        return r.json();
      })
      .then((models) => {
        models = Array.isArray(models) ? models : [];
        modelSelect.classList.remove('hidden');
        modelStatus.classList.add('hidden');
        modelSelect.disabled = models.length === 0;
        if (connectionState) {
          connectionState.classList.remove('offline');
          connectionState.lastChild.textContent = 'Local';
        }

        const signature = models.map((model) => model.name).join('\n');
        if (signature !== knownModelsSignature) {
          const selectedBeforeRefresh = modelSelect.value || state.model;
          modelSelect.innerHTML = '';
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = models.length ? 'Select a model…' : 'No models available';
          modelSelect.appendChild(opt);
          models.forEach((m) => {
            const o = document.createElement('option');
            o.value = m.name;
            o.textContent = m.name;
            modelSelect.appendChild(o);
          });
          if (selectedBeforeRefresh && models.some((model) => model.name === selectedBeforeRefresh)) {
            modelSelect.value = selectedBeforeRefresh;
          }
          knownModelsSignature = signature;
        }

        const defaultModel = localStorage.getItem('kurczak_defaultModel') || configDefaultModel;
        if (state.model && models.some((m) => m.name === state.model)) {
          modelSelect.value = state.model;
        } else if (defaultModel && models.some((m) => m.name === defaultModel)) {
          modelSelect.value = defaultModel;
          state.model = defaultModel;
        }
        if (btnSetDefault) {
          const isDefault = Boolean(modelSelect.value && modelSelect.value === defaultModel);
          btnSetDefault.classList.toggle('is-default', isDefault);
          btnSetDefault.setAttribute('aria-pressed', String(isDefault));
          btnSetDefault.title = isDefault
            ? 'This model is used for new conversations'
            : 'Use selected model for new conversations';
        }
        updateConversationHeading();
        updateContextUsage();
      })
      .catch(() => {
        modelSelect.classList.add('hidden');
        modelStatus.classList.remove('hidden');
        if (connectionState) {
          connectionState.classList.add('offline');
          connectionState.lastChild.textContent = 'Offline';
        }
        updateConversationHeading();
      });
  }

  // Poll for models every 5 seconds
  setInterval(loadModels, 5000);

  function renderHistoryItems() {
    const query = historySearch ? historySearch.value.trim().toLocaleLowerCase() : '';
    const filteredItems = query
      ? historyItems.filter((item) => String(item.title || 'Chat').toLocaleLowerCase().includes(query))
      : historyItems;

    historyList.innerHTML = '';
    if (historyCount) historyCount.textContent = historyItems.length ? String(historyItems.length) : '';

    if (filteredItems.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'history-empty';
      empty.textContent = query ? 'No conversations match your search.' : 'Your conversations will appear here.';
      historyList.appendChild(empty);
      return;
    }

    filteredItems.forEach((item) => {
      const itemTitle = item.title || 'Untitled conversation';
      const li = document.createElement('li');
      li.dataset.id = item.id;
      if (state.currentId === item.id) {
        li.classList.add('active');
      }

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'history-open';
      openButton.setAttribute('aria-label', `Open ${itemTitle}`);
      if (state.currentId === item.id) openButton.setAttribute('aria-current', 'true');
      const title = document.createElement('span');
      title.className = 'history-title';
      title.textContent = itemTitle;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'history-delete';
      del.textContent = 'Delete';
      del.title = `Delete ${itemTitle}`;
      del.setAttribute('aria-label', `Delete ${itemTitle}`);
      del.addEventListener('click', (event) => {
        event.stopPropagation();
        if (confirm(`Delete “${itemTitle}”? This cannot be undone.`)) {
          deleteHistory(item.id);
        }
      });

      const openItem = () => {
        loadConversation(item.id);
        closeSidebar();
      };
      openButton.appendChild(title);
      li.appendChild(openButton);
      li.appendChild(del);
      openButton.addEventListener('click', openItem);
      historyList.appendChild(li);
    });
  }

  function loadHistory() {
    return fetch('/api/history')
      .then((r) => r.json())
      .then((list) => {
        historyItems = Array.isArray(list) ? list : [];
        const activeItem = historyItems.find((item) => item.id === state.currentId);
        if (activeItem && activeItem.title) loadedHistoryTitle = activeItem.title;
        renderHistoryItems();
        updateConversationHeading();
      });
  }

  function deleteHistory(id) {
    fetch(`/api/history/${id}`, { method: 'DELETE' })
      .then((r) => {
        if (r.ok && state.currentId === id) {
          state.currentId = null;
          state.messages = [];
          loadedHistoryTitle = '';
          renderMessages();
        }
        loadHistory();
      });
  }

  function resetExplorer() {
    generatedFiles.clear();
    directoryTree = [];
    updateGeneratedFileCount();
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
        const historyItem = historyItems.find((item) => item.id === data.id);
        loadedHistoryTitle = data.title || (historyItem && historyItem.title) || '';
        let conversationPreset = data.systemPromptPreset;
        promptDrafts = {};
        if (state.activeStream && state.activeStream.chatId === data.id) {
          state.model = state.activeStream.model || data.model || '';
          state.messages = state.activeStream.messagesRef;
          systemPrompt.value = state.activeStream.systemPrompt != null ? state.activeStream.systemPrompt : (data.systemPrompt || '');
          conversationPreset = state.activeStream.systemPromptPreset || conversationPreset;
        } else {
          state.model = data.model || '';
          state.messages = data.messages || [];
          systemPrompt.value = data.systemPrompt != null ? data.systemPrompt : configDefaultSystemPrompt;
        }
        conversationPreset = BEHAVIOR_MODES[conversationPreset]
          ? conversationPreset
          : inferPresetFromPrompt(systemPrompt.value);
        setSystemPromptPreset(conversationPreset, false, false);
        modelSelect.value = state.model;
        renderMessages();

        loadHistory();
      })
      .catch(() => showToast('Could not open that conversation'));
  }

  function newChat() {
    resetExplorer();
    state.currentId = null;
    state.messages = [];
    loadedHistoryTitle = '';
    promptDrafts = {};
    if (window.setSystemPromptPreset) window.setSystemPromptPreset('default', true, false);
    renderMessages();
    loadHistory();
    closeSidebar();
    window.setTimeout(() => userInput.focus(), 0);
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

  function saveConversationWithId(id, model, sysPrompt, systemPromptPreset, messages) {
    const payload = {
      id,
      model,
      systemPrompt: sysPrompt,
      systemPromptPreset,
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
    // Close system prompt modal when sending
    if (systemPromptRow && !systemPromptRow.classList.contains('hidden')) {
      setBehaviorPanelOpen(false);
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
    const presetRef = state.systemPromptPreset;
    let recent = state.messages;
    if (configMaxMessagesInContext > 0) {
      recent = state.messages.slice(-configMaxMessagesInContext);
    }
    const forApi = recent.map((m) => ({ role: m.role, content: m.content }));
    const messagesForApi = sys
      ? [{ role: 'system', content: sys }, ...forApi]
      : forApi;
    userInput.value = '';
    autoResizeTextarea(userInput, 10);
    renderMessages();
    state.streaming = true;
    updateConversationHeading();
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
      systemPromptPreset: presetRef,
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
          saveConversationWithId(chatIdForStream, model, sysRef, presetRef, messagesRef).then(() => loadHistory()).catch(() => loadHistory());
        }
      }, 900);
    }

    function finishStreamingUI() {
      state.streaming = false;
      updateConversationHeading();
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
        saveConversationWithId(chatIdForStream, model, sysRef, presetRef, messagesRef).then(() => loadHistory()).catch(() => loadHistory());
      }
    }

    function startStream() {
      const controller = new AbortController();
      state.abortController = controller;
      startedAtMs = Date.now();

      // Clear context cache to force fresh check when model loads
      console.log(`🚀 Starting stream with model: ${model}`);
      Object.keys(modelContextCache).forEach(key => delete modelContextCache[key]);

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

          async function readStream() {
            while (true) {
              const { done, value } = await reader.read();
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
                      updateConversationHeading();
                      btnSend.disabled = false;
                      streamDiv.classList.remove('streaming');
                      const existingMeta = streamDiv.querySelector('.message-meta');
                      if (existingMeta) existingMeta.textContent = [formatMessageDate(new Date().toISOString()), model].filter(Boolean).join(' · ');
                      updateStreamingMessage(streamDiv, errMsg);
                      if (chatIdForStream) {
                        saveConversationWithId(chatIdForStream, model, sysRef, presetRef, messagesRef).then(() => loadHistory()).catch(() => loadHistory());
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
                  saveConversationWithId(chatIdForStream, model, sysRef, presetRef, messagesRef).then(() => loadHistory()).catch(() => loadHistory());
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
                    updateConversationHeading();
                    btnSend.disabled = false;
                    streamDiv.classList.remove('streaming');
                    const existingMeta = streamDiv.querySelector('.message-meta');
                    if (existingMeta) existingMeta.textContent = [formatMessageDate(new Date().toISOString()), model].filter(Boolean).join(' · ');
                    updateStreamingMessage(streamDiv, errMsg);
                    if (chatIdForStream) {
                      saveConversationWithId(chatIdForStream, model, sysRef, presetRef, messagesRef).then(() => loadHistory()).catch(() => loadHistory());
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
                // Update context usage on first content chunk (model is definitely loaded now)
                if (!receivedChunks) {
                  receivedChunks = true;
                  updateContextUsage();
                }

                messagesRef[assistantDraftIndex].content = combined;
                messagesRef[assistantDraftIndex].partial = true;
                scheduleStreamingSave();
                const d = getStreamDiv();
                if (d) updateStreamingMessage(d, combined);
              } else if (receivedChunks) {
                const d = getStreamDiv();
                if (d) setStreamingStatus(d, 'Thinking…');
              }
            }
          }
          return readStream();
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
      saveConversationWithId(null, model, sysRef, presetRef, messagesRef)
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
    const willOpen = systemPromptRow.classList.contains('hidden');
    setBehaviorPanelOpen(willOpen);
  });
  if (btnCloseSystemPrompt) btnCloseSystemPrompt.addEventListener('click', () => setBehaviorPanelOpen(false, true));
  modelSelect.addEventListener('change', () => {
    const newModel = modelSelect.value;
    // Clear all context cache when model changes to force fresh check
    Object.keys(modelContextCache).forEach(key => delete modelContextCache[key]);
    state.model = newModel;
    const defaultModel = localStorage.getItem('kurczak_defaultModel') || configDefaultModel;
    if (btnSetDefault) {
      const isDefault = Boolean(newModel && newModel === defaultModel);
      btnSetDefault.classList.toggle('is-default', isDefault);
      btnSetDefault.setAttribute('aria-pressed', String(isDefault));
    }
    updateConversationHeading();
    updateContextUsage();
  });
  btnSetDefault.addEventListener('click', () => {
    const model = modelSelect.value;
    if (model) {
      localStorage.setItem('kurczak_defaultModel', model);
      btnSetDefault.classList.add('is-default');
      btnSetDefault.setAttribute('aria-pressed', 'true');
      btnSetDefault.title = 'This model is used for new conversations';
      showToast(`${model} is now your default model`);
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
  if (historySearch) historySearch.addEventListener('input', renderHistoryItems);
  if (btnOpenSidebar) {
    btnOpenSidebar.setAttribute('aria-controls', 'sidebar');
    btnOpenSidebar.setAttribute('aria-expanded', 'false');
    btnOpenSidebar.addEventListener('click', openSidebar);
  }
  if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', closeSidebar);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
      event.preventDefault();
      newChat();
      return;
    }

    if (event.key === '/' && !isTyping && historySearch) {
      event.preventDefault();
      if (window.matchMedia('(max-width: 860px)').matches) openSidebar();
      window.setTimeout(() => historySearch.focus(), window.matchMedia('(max-width: 860px)').matches ? 220 : 0);
      return;
    }

    if (event.key === 'Escape') {
      if (!systemPromptRow.classList.contains('hidden')) {
        setBehaviorPanelOpen(false, true);
      } else {
        closeSidebar();
      }
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 860) closeSidebar();
    autoResizeTextarea(userInput, 10);
  });

  function toggleExplorer() {
    if (!fileExplorer) return;
    const isHidden = fileExplorer.classList.toggle('hidden');
    if (explorerResizer) explorerResizer.classList.toggle('hidden', isHidden);
    if (btnToggleExplorer) btnToggleExplorer.setAttribute('aria-expanded', String(!isHidden));
    localStorage.setItem('kurczak_explorerHidden', isHidden);
  }

  if (btnCloseExplorer) btnCloseExplorer.addEventListener('click', toggleExplorer);
  if (btnToggleExplorer) btnToggleExplorer.addEventListener('click', toggleExplorer);

  // File Explorer functionality
  const sidebarResizer = document.getElementById('sidebarResizer');
  const sidebarEl = document.querySelector('.sidebar');

  let generatedFiles = new Map(); // path -> content
  let directoryTree = null;

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

    files.forEach((content, path) => {
      const parts = path.split('/').filter(Boolean);

      let current = tree;

      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          current[part] = { type: 'file', content, path };
        } else {
          if (!current[part]) {
            current[part] = { type: 'folder', children: {} };
          } else if (current[part].type === 'file') {
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
        const folderDiv = document.createElement('button');
        folderDiv.type = 'button';
        folderDiv.className = 'folder-item';
        folderDiv.setAttribute('aria-expanded', 'true');
        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'toggle-icon';
        toggleIcon.textContent = '▼';
        const folderIcon = document.createElement('span');
        folderIcon.className = 'folder-icon';
        folderIcon.textContent = '📁';
        const folderName = document.createElement('span');
        folderName.textContent = name;
        folderDiv.append(toggleIcon, folderIcon, folderName);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'folder-content';
        renderFileTree(node.children, contentDiv, level + 1);

        folderDiv.addEventListener('click', () => {
          const collapsed = folderDiv.classList.toggle('collapsed');
          contentDiv.classList.toggle('collapsed', collapsed);
          folderDiv.setAttribute('aria-expanded', String(!collapsed));
        });

        li.appendChild(folderDiv);
        li.appendChild(contentDiv);
      } else {
        const fileDiv = document.createElement('button');
        fileDiv.type = 'button';
        fileDiv.className = 'file-item';
        fileDiv.title = node.path;
        const fileIcon = document.createElement('span');
        fileIcon.className = 'file-icon';
        fileIcon.textContent = getFileIcon(name);
        const fileName = document.createElement('span');
        fileName.textContent = name;
        fileDiv.append(fileIcon, fileName);

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
    const previouslyFocused = document.activeElement;
    const modal = document.createElement('div');
    modal.className = 'file-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'fileModalTitle');

    const modalContent = document.createElement('div');
    modalContent.className = 'file-modal-dialog';

    const header = document.createElement('div');
    header.className = 'file-modal-header';

    const title = document.createElement('h3');
    title.id = 'fileModalTitle';
    title.textContent = filePath;

    const actions = document.createElement('div');
    actions.className = 'file-modal-actions';

    const btnCopy = document.createElement('button');
    btnCopy.type = 'button';
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
    btnDownload.type = 'button';
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
    btnClose.type = 'button';
    btnClose.className = 'btn btn-icon';
    btnClose.textContent = '×';
    btnClose.title = 'Close preview';
    btnClose.setAttribute('aria-label', 'Close file preview');

    function closeModal() {
      document.removeEventListener('keydown', onModalKeydown);
      modal.remove();
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    }

    function onModalKeydown(event) {
      if (event.key === 'Escape') closeModal();
    }

    btnClose.addEventListener('click', closeModal);

    actions.appendChild(btnCopy);
    actions.appendChild(btnDownload);
    actions.appendChild(btnClose);

    header.appendChild(title);
    header.appendChild(actions);

    const contentArea = document.createElement('pre');
    contentArea.className = 'file-modal-content';
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

    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', onModalKeydown);
    btnClose.focus();

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

    const projectSlug = getConversationTitle()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'kurczak-project';
    const zipFilename = `${projectSlug}.zip`;

    // Keep the project together when the archive is extracted.
    const zip = new JSZip();
    const projectFolder = zip.folder(projectSlug);

    for (const [path, content] of generatedFiles) {
      projectFolder.file(path, content);
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

  // Event listeners for file explorer
  if (btnDownloadZip) {
    btnDownloadZip.addEventListener('click', downloadZip);
  }



  // Panel resizing (sidebar + explorer)
  // Keep these in sync with the responsive split-pane limits in style.css.
  const EXPLORER_MIN_WIDTH = 260;
  const EXPLORER_MAX_WIDTH = 640;
  const EXPLORER_MAX_SHARE = 0.48;
  const CHAT_MIN_WIDTH = 520;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function getExplorerMaxWidth() {
    const areaWidth = messagesArea ? messagesArea.getBoundingClientRect().width : window.innerWidth;
    const resizerWidth = explorerResizer ? explorerResizer.getBoundingClientRect().width : 0;
    const responsiveMax = Math.min(
      EXPLORER_MAX_WIDTH,
      areaWidth * EXPLORER_MAX_SHARE,
      areaWidth - CHAT_MIN_WIDTH - resizerWidth
    );

    return Math.max(EXPLORER_MIN_WIDTH, responsiveMax);
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

  function resetPanelSize(which) {
    const panel = which === 'sidebar'
      ? { cssVar: '--sidebar-w', storageKey: 'kurczak_sidebar_w' }
      : { cssVar: '--explorer-w', storageKey: 'kurczak_explorer_w' };

    document.documentElement.style.removeProperty(panel.cssVar);
    localStorage.removeItem(panel.storageKey);
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
        const next = clamp(startExplorerW - dx, EXPLORER_MIN_WIDTH, getExplorerMaxWidth());
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
  if (sidebarResizer) sidebarResizer.addEventListener('dblclick', () => resetPanelSize('sidebar'));
  if (explorerResizer) explorerResizer.addEventListener('dblclick', () => resetPanelSize('explorer'));

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
    renderMessages();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => autoResizeTextarea(userInput, 10));
    });
    loadConfig()
      .then(loadModels)
      .then(loadHistory)
      .then(renderMessages)
      .catch(() => showToast('Kurczak could not finish loading'));
  }
  init();
})();
