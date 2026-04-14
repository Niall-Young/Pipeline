// AI Chat Anchor - Content Script
// 功能：提取单个对话中每一轮 QA，显示在右侧作为导航目录

(function() {
  'use strict';

  const isEmbeddedFrame = window !== window.top;
  const GENERIC_MESSAGE_SELECTOR = [
    '[data-message-author-role]',
    '[data-message-author]',
    '[data-role]',
    '[data-testid="chat-item"]',
    '[data-testid^="conversation-turn"]',
    '[data-testid*="message"]',
    '[class*="conversation-item"]',
    '[class*="message-item"]',
    '[class*="message"]',
    '[class*="question"]',
    '[class*="answer"]',
    'article',
    '[role="listitem"]',
    'user-query',
    'model-response'
  ].join(', ');
  const COMMON_NOISE_SELECTOR = [
    'script',
    'style',
    'svg',
    'path',
    'img',
    'video',
    'audio',
    'button',
    '[role="button"]',
    'input',
    'textarea',
    'select',
    'option',
    'nav',
    'footer',
    'header'
  ].join(', ');

  // 平台配置 - 针对各平台的消息结构 + 输入注入配置
  const PLATFORMS = {
    claude: {
      hostname: /claude\.ai/,
      displayName: 'Claude',
      launchUrl: 'https://claude.ai/new',
      historyItemSelector: 'nav a[href*="/chat/"], aside a[href*="/chat/"], [role="navigation"] a[href*="/chat/"]',
      isHistoryUrl: (url) => /\/chat\//.test(url.pathname),
      userMessageSelector: '[data-testid="message-user"], [data-message-author-role="user"], [role="user-message"]',
      aiMessageSelector: '[data-testid="message-assistant"], [data-message-author-role="assistant"], [role="assistant-message"]',
      containerSelector: '[data-testid="conversation-turns"], main, [role="main"]',
      getMessageText: (el) => {
        const text = el.textContent.trim().replace(/\s+/g, ' ');
        return text.replace(/^(User|You|人类|用户|You said:)/i, '').trim();
      },
      inputSelector: '.ProseMirror[contenteditable="true"], [contenteditable="true"][data-placeholder]',
      sendSelector: 'button[aria-label="Send Message"], button[aria-label="发送消息"], button[type="button"][aria-label*="Send"]',
      inputType: 'contenteditable',
    },
    chatgpt: {
      hostname: /chatgpt\.com/,
      displayName: 'ChatGPT',
      launchUrl: 'https://chatgpt.com/',
      historyItemSelector: 'nav a[href^="/c/"], aside a[href^="/c/"], [role="navigation"] a[href^="/c/"]',
      isHistoryUrl: (url) => /\/c\/[^/]+/.test(url.pathname),
      userMessageSelector: '[data-message-author-role="user"], [data-testid="message-user"]',
      aiMessageSelector: '[data-message-author-role="assistant"], [data-testid="message-assistant"]',
      messageSelector: '[data-message-author-role], [data-testid^="conversation-turn"], article',
      containerSelector: '[data-id="conversation-turns"], main',
      getMessageText: (el) => {
        const text = el.textContent.trim().replace(/\s+/g, ' ');
        return text.replace(/^(User|You|You said:)/i, '').trim();
      },
      inputSelector: '#prompt-textarea, div[contenteditable="true"][data-id="root"]',
      sendSelector: 'button[data-testid="send-button"], button[aria-label="Send prompt"]',
      inputType: 'contenteditable',
    },
    gemini: {
      hostname: /gemini\.google\.com/,
      displayName: 'Gemini',
      launchUrl: 'https://gemini.google.com/',
      historyItemSelector: 'nav a[href*="/app/"], aside a[href*="/app/"], [role="navigation"] a[href*="/app/"]',
      isHistoryUrl: (url) => /\/app\//.test(url.pathname),
      userMessageSelector: 'user-query, [role="user-message"], [data-message-author="user"], [data-role="user"], [class*="user-query"]',
      aiMessageSelector: 'model-response, [role="model-message"], [data-message-author="model"], [data-role="model"], [class*="model-response"], [class*="response-content"]',
      messageSelector: 'user-query, model-response, [role="listitem"], [class*="conversation-item"], [class*="message"]',
      containerSelector: '[role="feed"], [role="log"], main, [role="main"]',
      getMessageText: (el) => extractGeminiMessageText(el),
      inputSelector: '.ql-editor[contenteditable="true"], rich-textarea [contenteditable="true"], [contenteditable="true"]',
      sendSelector: 'button[aria-label*="Send"], button.send-button, mat-icon-button[aria-label*="Send"]',
      inputType: 'contenteditable',
    },
    doubao: {
      hostname: /doubao\.com/,
      displayName: '豆包',
      launchUrl: 'https://www.doubao.com/chat/',
      historyItemSelector: 'nav a[href*="/chat/"], aside a[href*="/chat/"], [role="navigation"] a[href*="/chat/"]',
      isHistoryUrl: (url) => /\/chat\//.test(url.pathname),
      userMessageSelector: '[data-message-author="user"], [role="user-message"], [data-role="user"], .conversation-item[data-role="user"], [class*="user-message"], [class*="question-item"], [class*="query-item"]',
      aiMessageSelector: '[data-message-author="assistant"], [role="assistant-message"], [data-role="assistant"], .conversation-item[data-role="assistant"], [class*="assistant-message"], [class*="answer-item"], [class*="bot-message"]',
      messageSelector: '[data-message-author], [data-role], [role="user-message"], [role="assistant-message"], [data-testid="chat-item"], [class*="user-message"], [class*="assistant-message"], [class*="question-item"], [class*="answer-item"], [class*="query-item"], [class*="bot-message"]',
      containerSelector: '.messages-container, .conversation-content, [class*="message-list"], main, [role="main"]',
      getMessageText: (el) => extractStructuredText(el, {
        preferredSelectors: [
          '[data-testid*="message-content"]',
          '[class*="message-content"]',
          '[class*="content-inner"]',
          '[class*="answer-content"]',
          '[class*="question-content"]',
          '[class*="rich-text"]',
          '[class*="markdown"]',
          '[class*="paragraph"]',
          'article',
          'p'
        ],
        excludeSelectors: [
          '[class*="toolbar"]',
          '[class*="action"]',
          '[class*="operate"]',
          '[class*="footer"]',
          '[class*="suggest"]',
          '[class*="recommend"]',
          '[class*="follow"]',
          '[class*="shortcut"]',
          '[class*="feedback"]',
          '[class*="quote-action"]',
          '[class*="message-action"]'
        ],
        maxLength: 100
      }),
      inputSelector: '[contenteditable="true"], textarea',
      sendSelector: 'button[aria-label*="发送"], button[aria-label*="Send"], button[type="submit"]',
      inputType: 'contenteditable',
    },
    qianwen: {
      hostname: /qianwen\.com/,
      displayName: '千问',
      launchUrl: 'https://qianwen.com/',
      historyItemSelector: 'nav a[href*="/c/"], nav a[href*="/chat/"], aside a[href*="/c/"], aside a[href*="/chat/"], [role="navigation"] a[href*="/c/"], [role="navigation"] a[href*="/chat/"]',
      isHistoryUrl: (url) => /\/(c|chat)\//.test(url.pathname),
      userMessageSelector: '[data-role="user"], .user-message, .message-item[data-role="user"], [class*="questionItem"], [class*="question-item"], [class*="user-message"]',
      aiMessageSelector: '[data-role="assistant"], .assistant-message, .message-item[data-role="assistant"], [class*="answerItem"], [class*="answer-item"], [class*="assistant-message"]',
      messageSelector: '.message-item, .conversation-item, [class*="message-list"] > *, [class*="question"], [class*="answer"], article',
      containerSelector: '.message-list, [class*="message-list"], main, [role="main"]',
      getMessageText: (el) => {
        const text = el.textContent.trim().replace(/\s+/g, ' ');
        return text.substring(0, 100);
      },
      inputSelector: '[contenteditable="true"], textarea',
      sendSelector: 'button[aria-label*="发送"], button[aria-label*="Send"], button[type="submit"]',
      inputType: 'contenteditable',
    }
  };

  // ─── 并行提问：注入消息监听 ───────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'injectQuestion') {
      injectQuestion(message.question)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // 异步响应
    }

    if (message.action === 'getParallelState') {
      sendResponse({
        success: true,
        supported: !!detectPlatform(),
        enabled: isParallelModeOpen()
      });
      return false;
    }

    if (message.action === 'setParallelMode') {
      if (!detectPlatform()) {
        sendResponse({ success: false, error: '当前页面不支持并行模式' });
        return false;
      }

      if (message.enabled) {
        openParallelWorkspace();
        ensureSourceParallelPane();
        updateParallelPaneCount();
      } else {
        closeParallelWorkspace();
      }

      sendResponse({ success: true, enabled: isParallelModeOpen() });
      return false;
    }

    if (message.action === 'openParallelComposer') {
      if (!detectPlatform()) {
        sendResponse({ success: false, error: '当前页面不支持并行模式' });
        return false;
      }

      openParallelWorkspace();
      ensureSourceParallelPane();
      const question = typeof message.question === 'string' ? message.question.trim() : '';
      if (question) {
        addParallelPane(question);
      } else {
        updateParallelPaneCount();
      }

      setTimeout(() => {
        panelElement?.querySelector('#parallel-input')?.focus({ preventScroll: true });
      }, 50);

      sendResponse({ success: true, enabled: isParallelModeOpen() });
      return false;
    }

  });

  // 等待指定选择器的元素出现
  function waitForElement(selectors, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const selectorList = selectors.split(',').map(s => s.trim());

      const find = () => {
        for (const sel of selectorList) {
          const el = document.querySelector(sel);
          if (el) return el;
        }
        return null;
      };

      const found = find();
      if (found) return resolve(found);

      const observer = new MutationObserver(() => {
        const el = find();
        if (el) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(el);
        }
      });

      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error('输入框未找到: ' + selectors));
      }, timeout);

      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // 向输入框注入文字并提交
  async function injectQuestion(question) {
    const platform = detectPlatform();

    if (isEmbeddedFrame) {
      allowEmbeddedFrameFocus(1500);
    }

    // 确定输入框选择器
    const inputSel = platform
      ? platform.inputSelector
      : '[contenteditable="true"], textarea';

    const sendSel = platform
      ? platform.sendSelector
      : 'button[aria-label*="Send"], button[type="submit"]';

    // 等待输入框出现
    const inputEl = await waitForElement(inputSel);

    // 填入内容
    inputEl.focus();
    if (inputEl.tagName === 'TEXTAREA') {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(inputEl, question);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // contenteditable：先清空再用 execCommand 插入（兼容 React/框架）
      inputEl.innerHTML = '';
      inputEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
      document.execCommand('insertText', false, question);
    }

    // 等待框架更新（React/Vue 状态同步）
    await new Promise(r => setTimeout(r, 300));

    // 尝试点击发送按钮
    const sendSelList = sendSel.split(',').map(s => s.trim());
    let sent = false;
    for (const sel of sendSelList) {
      const btn = document.querySelector(sel);
      if (btn && !btn.disabled) {
        btn.click();
        sent = true;
        break;
      }
    }

    // 发送按钮未找到时，尝试 Enter 键
    if (!sent) {
      inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    }

    if (isEmbeddedFrame) {
      embeddedFrameInteractionUntil = 0;
      guardEmbeddedFrameAutofocus(20000);
      setTimeout(() => enforceEmbeddedFrameFocusGuard('inject-sent'), 0);
      setTimeout(() => enforceEmbeddedFrameFocusGuard('generation-start'), 400);
      setTimeout(() => enforceEmbeddedFrameFocusGuard('generation-running'), 1800);
      setTimeout(() => enforceEmbeddedFrameFocusGuard('generation-finished'), 6000);
    }
  }
  // ─────────────────────────────────────────────────────────

  let currentPlatform = null;
  let qaPairs = [];
  let isPanelVisible = false;
  let panelElement = null;
  let toggleButton = null;
  let searchInput = null;
  let currentActiveIndex = -1;
  let parallelWorkspaceElement = null;
  let parallelPanesContainer = null;
  let parallelEmptyState = null;
  let parallelPaneSeq = 0;
  let activeParallelPaneId = '';
  let parallelDragState = null;
  let isParallelPanelCollapsed = false;
  let parallelComposerArea = null;
  let parallelComposerInput = null;
  let parallelHistoryToggle = null;
  let parallelHistoryPanel = null;
  let parallelHistoryInput = null;
  let parallelHistoryList = null;
  let parallelHistoryItems = [];
  let isParallelHistoryOpen = false;
  let isParallelComposerPinned = false;
  let parallelComposerRefocusTimer = null;
  let parallelComposerLastInteractionAt = 0;
  let embeddedReportedAssistantCount = null;
  let isParallelComposerComposing = false;
  let embeddedFrameFocusGuardUntil = 0;
  let embeddedFrameInteractionUntil = 0;
  let pendingParallelAnimation = '';
  let activeIndexSyncFrame = null;
  let lastKnownHref = window.location.href;
  let lastKnownTitle = document.title;
  const PANEL_HIDE_DELAY = 140;
  const PARALLEL_PANE_AUTO_SCROLL_EDGE = 120;
  const PARALLEL_PANE_AUTO_SCROLL_MAX_STEP = 22;
  let hidePanelTimer = null;
  let isHoveringTimeline = false;
  let isHoveringPanel = false;

  // 检测当前平台
  function detectPlatform() {
    const hostname = window.location.hostname;
    for (const [name, config] of Object.entries(PLATFORMS)) {
      if (config.hostname.test(hostname)) {
        return { name, ...config };
      }
    }
    return null;
  }

  function safeQueryAll(root, selector) {
    if (!selector) return [];
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch (error) {
      console.warn('[AI Chat Anchor] 选择器无效:', selector, error);
      return [];
    }
  }

  function isElementVisible(el) {
    if (!(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isAnchorElement(el) {
    return !!(
      el instanceof Element &&
      (el.id?.startsWith('ai-chat-anchor') ||
       el.closest('#ai-chat-anchor-panel, #ai-chat-anchor-timeline, #ai-chat-anchor-parallel-workspace'))
    );
  }

  function getConversationRoot() {
    const candidates = safeQueryAll(document, [
      currentPlatform?.containerSelector,
      'main',
      '[role="main"]',
      '[role="feed"]',
      '[role="log"]'
    ].filter(Boolean).join(', ')).filter(isElementVisible);

    if (candidates.length === 0) return document.body;

    return candidates.sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      return (bRect.width * bRect.height) - (aRect.width * aRect.height);
    })[0];
  }

  function getExplicitRoleFromAttributes(el) {
    if (!el) return null;
    const signals = [
      el.getAttribute('role'),
      el.getAttribute('data-role'),
      el.getAttribute('data-message-author'),
      el.getAttribute('data-message-author-role'),
      el.getAttribute('aria-label')
    ].filter(Boolean).join(' ').toLowerCase();

    if (/(^|[\s:_-])(user|human)([\s:_-]|$)/i.test(signals)) return 'user';
    if (/(^|[\s:_-])(assistant|model|bot)([\s:_-]|$)/i.test(signals)) return 'assistant';
    return null;
  }

  function inferRoleFromLayout(el) {
    if (!el || currentPlatform?.name !== 'doubao') return null;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1;
    const widthRatio = rect.width / viewportWidth;
    const leftRatio = rect.left / viewportWidth;
    const rightRatio = rect.right / viewportWidth;
    const centerRatio = (rect.left + rect.width / 2) / viewportWidth;

    const bubbleLike = rect.width < viewportWidth * 0.62;
    if (bubbleLike && leftRatio > 0.5 && centerRatio > 0.6) return 'user';
    if (leftRatio < 0.48 && centerRatio < 0.58 && widthRatio > 0.2) return 'assistant';
    if (rightRatio < 0.82 && centerRatio < 0.56 && rect.height > 48) return 'assistant';

    return null;
  }

  function getDomOrder(a, b) {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  }

  function normalizeMessageText(text = '') {
    return text.replace(/\s+/g, ' ').trim();
  }

  function stripLeadingSpeakerLabel(text = '') {
    return normalizeMessageText(text)
      .replace(/^(You said|You|User|Prompt|提问|问题)\s*:?\s*/i, '')
      .replace(/^(Gemini said|Gemini|Answer|Response|回答)\s*:?\s*/i, '')
      .trim();
  }

  function isLowSignalMessageText(text = '') {
    const normalized = normalizeMessageText(text).toLowerCase();
    if (!normalized) return true;
    return [
      'you said',
      'you',
      'user',
      'prompt',
      'gemini',
      'answer',
      'response',
      '回答'
    ].includes(normalized);
  }

  function isSourceAttributionElement(el) {
    if (!el) return false;

    const text = normalizeMessageText(el.textContent || '');
    return /^(来源|参考来源|资料来源|引用|引文|sources?|references?|citations?)$/i.test(text);
  }

  function cleanElementText(el, excludeSelectors = []) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    const selectors = [COMMON_NOISE_SELECTOR, ...excludeSelectors].filter(Boolean).join(', ');

    if (selectors) {
      safeQueryAll(clone, selectors).forEach((node) => node.remove());
    }

    return normalizeMessageText(clone.textContent || '');
  }

  function extractStructuredText(el, {
    preferredSelectors = [],
    excludeSelectors = [],
    maxLength = 100
  } = {}) {
    if (!el) return '';

    const candidates = [];
    preferredSelectors.forEach((selector) => {
      safeQueryAll(el, selector).forEach((candidate) => {
        if (candidate instanceof Element && isElementVisible(candidate)) {
          candidates.push(candidate);
        }
      });
    });

    const uniqueCandidates = Array.from(new Set(candidates));
    const preferredText = uniqueCandidates
      .map((candidate) => cleanElementText(candidate, excludeSelectors))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0];

    const fallbackText = cleanElementText(el, excludeSelectors);
    const text = preferredText || fallbackText;
    return maxLength > 0 ? text.substring(0, maxLength) : text;
  }

  function extractGeminiMessageText(el) {
    if (!el) return '';

    const text = extractStructuredText(el, {
      preferredSelectors: [
        '[data-testid*="user-query"]',
        '[data-testid*="message-content"]',
        '[data-testid*="response-content"]',
        '[class*="query-text"]',
        '[class*="query-content"]',
        '[class*="user-query-content"]',
        '[class*="message-content"]',
        '[class*="response-content"]',
        '[class*="markdown"]',
        '[class*="model-response-text"]',
        'message-content',
        '.ql-editor',
        'article',
        'p'
      ],
      excludeSelectors: [
        '[class*="toolbar"]',
        '[class*="action"]',
        '[class*="footer"]',
        '[class*="chip"]',
        '[class*="button"]',
        '[class*="icon"]',
        '[class*="avatar"]',
        '[aria-label]',
        'mat-icon',
        'rich-textarea'
      ],
      maxLength: 0
    });

    const cleaned = stripLeadingSpeakerLabel(text);
    if (isLowSignalMessageText(cleaned)) return '';
    return cleaned.substring(0, 100);
  }

  function getMessageText(el) {
    if (!el) return '';
    const text = currentPlatform?.getMessageText
      ? currentPlatform.getMessageText(el)
      : el.textContent;
    return normalizeMessageText(text || '');
  }

  function isLikelyMessageElement(el) {
    if (!isElementVisible(el) || isAnchorElement(el)) return false;
    if (el.closest('nav, aside, form, footer, header, button, [role="button"]')) return false;
    if (['BUTTON', 'INPUT', 'TEXTAREA', 'SVG', 'PATH'].includes(el.tagName)) return false;
    if (isSourceAttributionElement(el)) return false;
    return getMessageText(el).length >= 2;
  }

  function collectMessagesBySelectors() {
    if (!currentPlatform) return [];

    const userElements = safeQueryAll(document, currentPlatform.userMessageSelector)
      .filter((el) => isLikelyMessageElement(el) && (inferRoleFromLayout(el) || 'user') === 'user');
    const aiElements = safeQueryAll(document, currentPlatform.aiMessageSelector)
      .filter((el) => isLikelyMessageElement(el) && (inferRoleFromLayout(el) || 'assistant') === 'assistant');

    const messageMap = new Map();

    userElements.forEach((el) => {
      messageMap.set(el, {
        role: 'user',
        element: el,
        text: getMessageText(el)
      });
    });

    aiElements.forEach((el) => {
      messageMap.set(el, {
        role: 'assistant',
        element: el,
        text: getMessageText(el)
      });
    });

    return Array.from(messageMap.values())
      .filter((item) => item.text.length > 0)
      .sort((a, b) => getDomOrder(a.element, b.element));
  }

  function inferRoleFromElement(el) {
    if (!el) return null;

    const explicitRole = getExplicitRoleFromAttributes(el);
    if (explicitRole) return explicitRole;

    const layoutRole = inferRoleFromLayout(el);
    if (layoutRole) return layoutRole;

    if (currentPlatform?.userMessageSelector && el.matches(currentPlatform.userMessageSelector)) return 'user';
    if (currentPlatform?.aiMessageSelector && el.matches(currentPlatform.aiMessageSelector)) return 'assistant';

    const roleSignals = [
      el.tagName,
      el.getAttribute('role'),
      el.getAttribute('data-role'),
      el.getAttribute('data-message-author'),
      el.getAttribute('data-message-author-role'),
      el.getAttribute('aria-label'),
      el.className,
      el.id
    ].filter(Boolean).join(' ').toLowerCase();

    const userHit = /(user|human|question|query|prompt|ask)/i.test(roleSignals);
    const assistantHit = /(assistant|model|answer|response|reply|bot)/i.test(roleSignals);

    if (userHit && !assistantHit) return 'user';
    if (assistantHit && !userHit) return 'assistant';

    const marker = el.querySelector?.('[data-role], [data-message-author], [data-message-author-role], [role]');
    if (marker && marker !== el) {
      return inferRoleFromElement(marker);
    }

    const rect = el.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    if (rect.width > 0 && rect.width < window.innerWidth * 0.92) {
      if (center >= window.innerWidth * 0.58) return 'user';
      if (center <= window.innerWidth * 0.42) return 'assistant';
    }

    return null;
  }

  function collectMessagesWithHeuristics() {
    const root = getConversationRoot();
    const selectors = [
      currentPlatform?.messageSelector,
      currentPlatform?.userMessageSelector,
      currentPlatform?.aiMessageSelector,
      GENERIC_MESSAGE_SELECTOR
    ].filter(Boolean).join(', ');

    const rawCandidates = safeQueryAll(root, selectors).filter((el) => {
      return isLikelyMessageElement(el);
    });

    const candidates = rawCandidates.filter((el) => {
      const role = inferRoleFromElement(el);
      if (!role) return false;
      return !rawCandidates.some((other) =>
        other !== el &&
        other.contains(el) &&
        inferRoleFromElement(other) === role
      );
    });

    return candidates
      .map((el) => ({
        role: inferRoleFromElement(el),
        element: el,
        text: getMessageText(el)
      }))
      .filter((item) => item.role && item.text.length > 0)
      .sort((a, b) => getDomOrder(a.element, b.element));
  }

  function getRoleConfidence(message) {
    if (!message?.element) return 0;
    if (getExplicitRoleFromAttributes(message.element)) return 3;
    if (inferRoleFromLayout(message.element)) return 2;
    return 1;
  }

  function getElementArea(el) {
    const rect = el?.getBoundingClientRect?.();
    if (!rect) return 0;
    return rect.width * rect.height;
  }

  function hasVisibleBubbleStyle(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    const bg = style.backgroundColor || '';
    const channels = bg.match(/\d+(\.\d+)?/g);
    const alpha = channels && channels.length >= 4 ? Number(channels[3]) : (channels ? 1 : 0);
    const radiusValues = [
      style.borderRadius,
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomLeftRadius,
      style.borderBottomRightRadius
    ].join(' ');
    const radiusNumbers = radiusValues.match(/\d+(\.\d+)?/g)?.map(Number) || [];
    const maxRadius = radiusNumbers.length > 0 ? Math.max(...radiusNumbers) : 0;
    return alpha > 0.08 || maxRadius >= 10;
  }

  function mergeMessages(...messageLists) {
    const merged = messageLists
      .flat()
      .filter((message) => message?.role && message?.text && message?.element)
      .sort((a, b) => getDomOrder(a.element, b.element));

    const deduped = [];

    merged.forEach((message) => {
      const prev = deduped[deduped.length - 1];
      if (!prev) {
        deduped.push(message);
        return;
      }

      const sameRole = prev.role === message.role;
      const sameText = prev.text === message.text;
      const relatedNode = prev.element === message.element ||
        prev.element.contains(message.element) ||
        message.element.contains(prev.element);

      if (sameRole && (sameText || relatedNode)) {
        if (getRoleConfidence(message) >= getRoleConfidence(prev)) {
          deduped[deduped.length - 1] = message;
        }
        return;
      }

      deduped.push(message);
    });

    return deduped;
  }

  function chooseBetterDoubaoMessage(prev, next) {
    if (!prev) return next;
    if (!next) return prev;

    const role = next.role || prev.role;
    const prevRect = prev.element.getBoundingClientRect();
    const nextRect = next.element.getBoundingClientRect();

    if (role === 'user') {
      const prevScore = getRoleConfidence(prev) * 100000 + prevRect.left - getElementArea(prev.element) / 1000 + prev.text.length;
      const nextScore = getRoleConfidence(next) * 100000 + nextRect.left - getElementArea(next.element) / 1000 + next.text.length;
      return nextScore >= prevScore ? next : prev;
    }

    const prevScore = getRoleConfidence(prev) * 100000 + getElementArea(prev.element) / 1000 + prev.text.length;
    const nextScore = getRoleConfidence(next) * 100000 + getElementArea(next.element) / 1000 + next.text.length;
    return nextScore >= prevScore ? next : prev;
  }

  function isDoubaoUserMessageCandidate(el) {
    if (!isLikelyMessageElement(el)) return false;
    if (el.closest([
      '[class*="suggest"]',
      '[class*="recommend"]',
      '[class*="shortcut"]',
      '[class*="starter"]',
      '[class*="welcome"]',
      '[class*="empty"]',
      '[class*="guide"]'
    ].join(', '))) {
      return false;
    }

    const explicitRole = getExplicitRoleFromAttributes(el);
    if (explicitRole === 'assistant') return false;
    if (explicitRole === 'user') return true;

    const layoutRole = inferRoleFromLayout(el);
    if (layoutRole === 'assistant') return false;

    const rect = el.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1;
    const widthRatio = rect.width / viewportWidth;
    const leftRatio = rect.left / viewportWidth;
    const centerRatio = (rect.left + rect.width / 2) / viewportWidth;

    const rightLean = leftRatio > 0.5 || centerRatio > 0.64;
    const bubbleLike = widthRatio < 0.58 && rect.height < window.innerHeight * 0.45;
    if (!rightLean || !bubbleLike) return false;

    if (layoutRole === 'user') return true;
    return hasVisibleBubbleStyle(el);
  }

  function collectDoubaoUserMessages() {
    const root = getConversationRoot();
    const selectors = [
      currentPlatform?.userMessageSelector,
      '[class*="bubble"]',
      '[class*="message"]',
      '[class*="item"]',
      '[class*="query"]',
      '[class*="question"]',
      'article',
      'section',
      'div',
      'p',
      'li'
    ].filter(Boolean).join(', ');

    const rawCandidates = safeQueryAll(root, selectors).filter((el) => {
      if (el === root) return false;
      if (el.childElementCount > 24) return false;
      const rect = el.getBoundingClientRect();
      if (rect.height < 18 || rect.width < 36) return false;
      return isDoubaoUserMessageCandidate(el);
    });

    const messages = rawCandidates
      .map((el) => ({
        role: 'user',
        element: el,
        text: getMessageText(el)
      }))
      .filter((message) => message.text.length > 0)
      .sort((a, b) => getDomOrder(a.element, b.element));

    const deduped = [];

    messages.forEach((message) => {
      const prev = deduped[deduped.length - 1];
      if (!prev) {
        deduped.push(message);
        return;
      }

      const relatedNode = prev.element === message.element ||
        prev.element.contains(message.element) ||
        message.element.contains(prev.element);

      if (prev.role === message.role && relatedNode) {
        deduped[deduped.length - 1] = chooseBetterDoubaoMessage(prev, message);
        return;
      }

      deduped.push(message);
    });

    return deduped;
  }

  function isDoubaoEmptyConversationState() {
    const pathname = window.location.pathname || '';
    if (!/^\/chat\/?$/.test(pathname)) {
      return false;
    }

    const pageText = normalizeMessageText(document.body?.innerText || '');
    const hasWelcomeText = /(有什么我能帮你的吗|新对话|内容由豆包AI生成)/.test(pageText);
    const hasChatHeader = safeQueryAll(document, 'h1, h2, h3, [class*="title"], [class*="header"]')
      .some((el) => isElementVisible(el) && /(新对话|有什么我能帮你的吗)/.test(normalizeMessageText(el.textContent || '')));
    const suggestionChipCount = safeQueryAll(document, 'button, [role="button"], [class*="chip"], [class*="card"]')
      .filter((el) => {
        if (!isElementVisible(el)) return false;
        const text = normalizeMessageText(el.textContent || '');
        return text.length >= 6 && text.length <= 40;
      }).length;
    const suggestionSelectors = [
      '[class*="suggest"]',
      '[class*="recommend"]',
      '[class*="shortcut"]',
      '[class*="starter"]',
      '[class*="welcome"]'
    ].join(', ');
    const suggestionBlocks = safeQueryAll(document, suggestionSelectors)
      .filter((el) => isElementVisible(el) && normalizeMessageText(el.textContent || '').length > 0);

    const explicitConversationSignals = safeQueryAll(document, [
      '[data-message-author]',
      '[data-role]',
      '[role="user-message"]',
      '[role="assistant-message"]',
      '.conversation-item[data-role="user"]',
      '.conversation-item[data-role="assistant"]',
      '[class*="assistant-message"]',
      '[class*="answer-item"]',
      '[class*="bot-message"]',
      '[class*="user-message"]',
      '[class*="query-item"]',
      '[class*="question-item"]'
    ].join(', ')).filter(isLikelyMessageElement);

    return explicitConversationSignals.length === 0 && (
      hasWelcomeText ||
      hasChatHeader ||
      suggestionChipCount >= 4 ||
      (suggestionBlocks.length > 0 && hasWelcomeText)
    );
  }

  function extractDoubaoQAPairs() {
    if (isDoubaoEmptyConversationState()) {
      return [];
    }

    const userMessages = collectDoubaoUserMessages();

    return userMessages.map((userMessage, index) => ({
        id: `qa-doubao-${index}`,
        userElement: userMessage.element,
        userText: userMessage.text,
        aiElement: null,
        aiText: ''
      }))
      .filter((qa) => qa.userText.length > 0);
  }

  function buildQAPairs(messages) {
    const results = [];
    let currentQA = null;

    messages.forEach((message, index) => {
      if (message.role === 'user') {
        currentQA = {
          id: `qa-${index}`,
          userElement: message.element,
          userText: message.text,
          aiElement: null,
          aiText: ''
        };
      } else if (message.role === 'assistant' && currentQA && !currentQA.aiElement) {
        currentQA.aiElement = message.element;
        currentQA.aiText = message.text;
      }

      if (currentQA && currentQA.aiElement) {
        results.push(currentQA);
        currentQA = null;
      }
    });

    if (currentQA && currentQA.userText) {
      results.push(currentQA);
    }

    return results;
  }

  function hasChatGPTConversationSignals() {
    return !!document.querySelector([
      '[data-message-author-role]',
      '[data-testid="message-user"]',
      '[data-testid="message-assistant"]',
      '[data-testid^="conversation-turn"]',
      '[data-id="conversation-turns"]',
      '[data-testid="conversation-turns"]'
    ].join(', '));
  }

  function getLucideIcon(name) {
    const attrs = 'viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const icons = {
      search: `<svg ${attrs}><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>`,
      history: `<svg ${attrs}><path d="M12 8v5l3 2"></path><path d="M3.05 11a9 9 0 1 1 .5 4"></path><path d="M3 4v7h7"></path></svg>`,
      externalLink: `<svg ${attrs}><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>`,
      x: `<svg ${attrs}><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`,
      chevronsLeft: `<svg ${attrs}><path d="m11 17-5-5 5-5"></path><path d="m18 17-5-5 5-5"></path></svg>`,
      chevronsRight: `<svg ${attrs}><path d="m6 17 5-5-5-5"></path><path d="m13 17 5-5-5-5"></path></svg>`,
      panels: `<svg ${attrs}><rect x="3" y="4" width="7" height="16" rx="1.5"></rect><rect x="14" y="4" width="7" height="16" rx="1.5"></rect></svg>`,
      grip: `<svg ${attrs}><path d="M9 6h.01"></path><path d="M15 6h.01"></path><path d="M9 12h.01"></path><path d="M15 12h.01"></path><path d="M9 18h.01"></path><path d="M15 18h.01"></path></svg>`,
      target: `<svg ${attrs}><circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="1.5"></circle><path d="M12 5V3"></path><path d="M12 21v-2"></path><path d="M19 12h2"></path><path d="M3 12h2"></path></svg>`,
      trash: `<svg ${attrs}><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>`
    };
    return icons[name] || '';
  }

  // 提取 QA 对
  function extractQAPairs() {
    if (!currentPlatform) return [];

    if (currentPlatform.name === 'doubao') {
      return extractDoubaoQAPairs();
    }

    if (currentPlatform.name === 'chatgpt' && !hasChatGPTConversationSignals()) {
      return [];
    }

    const directMessages = collectMessagesBySelectors();
    const directPairs = buildQAPairs(directMessages);
    if (directPairs.length > 0) {
      return directPairs;
    }

    const heuristicMessages = collectMessagesWithHeuristics();
    const heuristicPairs = buildQAPairs(heuristicMessages);
    return heuristicPairs;
  }

  // 创建侧边面板
  function createPanel() {
    if (panelElement) return;

    panelElement = document.createElement('div');
    panelElement.id = 'ai-chat-anchor-panel';
    panelElement.className = 'ai-chat-anchor-panel';
    if (isEmbeddedFrame) {
      panelElement.classList.add('embedded-frame');
    }

    // 搜索框
    const searchContainer = document.createElement('div');
    searchContainer.className = 'ai-chat-anchor-search';
    searchContainer.innerHTML = `
      <input type="text" placeholder="搜索对话消息" id="ai-chat-anchor-input">
      <span class="search-icon search-icon-static">${getLucideIcon('search')}</span>
      <button class="search-clear" title="清除">${getLucideIcon('x')}</button>
    `;

    const list = document.createElement('div');
    list.className = 'ai-chat-anchor-list';
    list.id = 'ai-chat-anchor-list';

    const parallelSheetHeader = document.createElement('div');
    parallelSheetHeader.className = 'parallel-sheet-header';
    parallelSheetHeader.innerHTML = `
      <span class="parallel-sheet-title">并行对话</span>
      <button class="parallel-panel-toggle parallel-panel-toggle-inline" id="parallel-panel-toggle" type="button" title="收起右侧面板" aria-label="收起右侧面板">
        ${getLucideIcon('chevronsRight')}
      </button>
    `;

    // 并行模式输入区（默认隐藏）
    const parallelArea = document.createElement('div');
    parallelArea.className = 'ai-chat-anchor-parallel';
    parallelArea.id = 'ai-chat-anchor-parallel';
    parallelArea.innerHTML = `
      <div class="parallel-area-header">
        <span class="parallel-area-title">新建对话</span>
        <button class="parallel-history-toggle" id="parallel-history-toggle" type="button" title="搜索历史对话" aria-expanded="false">
          ${getLucideIcon('history')}
          <span>历史对话</span>
        </button>
      </div>
      <textarea class="parallel-area-input" id="parallel-input" placeholder="问你想问的问题" rows="4"></textarea>
      <div class="parallel-area-mode-row">
        <span class="parallel-area-mode-label">并行模式</span>
        <button class="parallel-toggle parallel-toggle-inline" id="parallel-inline-toggle" title="并行模式" aria-pressed="true" type="button">
          <span class="toggle-indicator" aria-hidden="true"></span>
        </button>
      </div>
      <div class="parallel-area-actions">
        <span class="parallel-area-count" id="parallel-count"></span>
        <button class="parallel-area-send" id="parallel-send" disabled>新建对话</button>
      </div>
    `;

    const footer = document.createElement('div');
    footer.className = 'ai-chat-anchor-footer';
    footer.innerHTML = `
      <span class="footer-count">并行模式</span>
      <button class="parallel-toggle" id="parallel-toggle" title="并行模式" aria-pressed="false">
        <span class="toggle-indicator" aria-hidden="true"></span>
      </button>
    `;

    panelElement.appendChild(searchContainer);
    panelElement.appendChild(parallelSheetHeader);
    panelElement.appendChild(list);
    panelElement.appendChild(parallelArea);
    panelElement.appendChild(footer);
    document.body.appendChild(panelElement);

    parallelHistoryPanel = document.createElement('div');
    parallelHistoryPanel.className = 'parallel-history-dialog';
    parallelHistoryPanel.id = 'parallel-history-panel';
    parallelHistoryPanel.hidden = true;
    parallelHistoryPanel.innerHTML = `
      <div class="parallel-history-dialog-backdrop" data-role="history-backdrop"></div>
      <div class="parallel-history-dialog-card" role="dialog" aria-modal="true" aria-labelledby="parallel-history-dialog-title">
        <div class="parallel-history-dialog-header">
          <div class="parallel-history-dialog-title" id="parallel-history-dialog-title">搜索历史对话</div>
          <button class="parallel-history-dialog-close" id="parallel-history-close" type="button" title="关闭">
            ${getLucideIcon('x')}
          </button>
        </div>
        <div class="parallel-history-search">
          <span class="parallel-history-search-icon">${getLucideIcon('search')}</span>
          <input class="parallel-history-input" id="parallel-history-input" type="text" placeholder="搜索以前的对话标题">
        </div>
        <div class="parallel-history-list" id="parallel-history-list"></div>
      </div>
    `;
    document.body.appendChild(parallelHistoryPanel);

    panelElement.addEventListener('mouseenter', () => {
      isHoveringPanel = true;
      clearHidePanelTimer();
      showPanel();
    });

    panelElement.addEventListener('mouseleave', (e) => {
      isHoveringPanel = false;
      if (toggleButton && toggleButton.contains(e.relatedTarget)) return;
      scheduleHidePanel();
    });

    panelElement.addEventListener('focusin', () => {
      clearHidePanelTimer();
      showPanel();
    });

    panelElement.addEventListener('focusout', () => {
      setTimeout(() => {
        if (!shouldKeepPanelOpen()) {
          hidePanel();
        }
      }, 0);
    });

    // 绑定搜索事件
    searchInput = searchContainer.querySelector('#ai-chat-anchor-input');
    const clearBtn = searchContainer.querySelector('.search-clear');

    searchInput.addEventListener('input', debounce((e) => {
      const hasValue = e.target.value.length > 0;
      filterList(e.target.value);
      clearBtn.classList.toggle('visible', hasValue);
      searchContainer.classList.toggle('has-value', hasValue);
    }, 150));

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      filterList('');
      clearBtn.classList.remove('visible');
      searchContainer.classList.remove('has-value');
      searchInput.focus();
    });

    // 并行模式 toggle
    const toggleBtn = footer.querySelector('#parallel-toggle');
    const inlineToggleBtn = panelElement.querySelector('#parallel-inline-toggle');
    const collapsePanelBtn = panelElement.querySelector('#parallel-panel-toggle');
    const parallelInputArea = panelElement.querySelector('#ai-chat-anchor-parallel');
    parallelComposerArea = parallelInputArea;

    if (!isEmbeddedFrame) {
      const handleParallelToggleClick = () => {
        if (isParallelModeOpen()) {
          closeParallelWorkspace();
        } else {
          openParallelWorkspace();
          ensureSourceParallelPane();
          updateParallelPaneCount();
          setTimeout(() => panelElement.querySelector('#parallel-input')?.focus(), 50);
        }
      };

      toggleBtn.addEventListener('click', handleParallelToggleClick);
      inlineToggleBtn?.addEventListener('click', handleParallelToggleClick);
      collapsePanelBtn?.addEventListener('click', () => {
        setParallelPanelCollapsed(!isParallelPanelCollapsed);
      });
    }

    // 并行发送 - 在当前标签页内追加并行窗格
    const parallelSendBtn = panelElement.querySelector('#parallel-send');
    const parallelInput = panelElement.querySelector('#parallel-input');
    parallelHistoryToggle = panelElement.querySelector('#parallel-history-toggle');
    parallelHistoryInput = parallelHistoryPanel.querySelector('#parallel-history-input');
    parallelHistoryList = parallelHistoryPanel.querySelector('#parallel-history-list');
    const parallelHistoryCloseBtn = parallelHistoryPanel.querySelector('#parallel-history-close');
    parallelComposerInput = parallelInput;
    const syncParallelComposer = () => {
      parallelSendBtn.disabled = parallelInput.value.trim().length === 0;
    };

    const sendParallelQuestion = () => {
      const question = parallelInput.value.trim();
      if (!question) return;

      addParallelPane(question);
      parallelInput.value = '';
      syncParallelComposer();
      markParallelComposerInteraction();
      parallelInput.focus();
    };

    syncParallelComposer();
    updateParallelPaneCount();
    renderParallelHistoryList();

    if (!isEmbeddedFrame) {
      parallelHistoryToggle?.addEventListener('click', () => {
        toggleParallelHistoryPanel();
      });
      parallelHistoryCloseBtn?.addEventListener('click', () => {
        closeParallelHistoryPanel();
        parallelInput.focus({ preventScroll: true });
      });
      parallelHistoryPanel?.addEventListener('click', (e) => {
        if (e.target instanceof Element && e.target.getAttribute('data-role') === 'history-backdrop') {
          closeParallelHistoryPanel();
          parallelInput.focus({ preventScroll: true });
        }
      });
      parallelHistoryInput?.addEventListener('input', () => {
        renderParallelHistoryList(parallelHistoryInput.value);
      });
      parallelHistoryInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeParallelHistoryPanel();
          parallelInput.focus({ preventScroll: true });
        }
      });
      parallelInput.addEventListener('input', () => {
        markParallelComposerInteraction();
        syncParallelComposer();
      });
      parallelInput.addEventListener('focus', () => {
        isParallelComposerPinned = true;
        markParallelComposerInteraction();
        clearParallelComposerRefocusTimer();
      });
      parallelInput.addEventListener('blur', () => {
        scheduleParallelComposerRefocus();
      });
      parallelInput.addEventListener('compositionstart', () => {
        isParallelComposerComposing = true;
        markParallelComposerInteraction();
      });
      parallelInput.addEventListener('compositionupdate', () => {
        markParallelComposerInteraction();
      });
      parallelInput.addEventListener('compositionend', () => {
        isParallelComposerComposing = false;
        markParallelComposerInteraction();
      });
      parallelSendBtn.addEventListener('click', sendParallelQuestion);

      // Enter 发送，Shift+Enter 换行
      parallelInput.addEventListener('keydown', (e) => {
        markParallelComposerInteraction();
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendParallelQuestion();
        }
      });
    }
  }

  // 防抖函数
  function debounce(fn, delay) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function clearParallelComposerRefocusTimer() {
    if (parallelComposerRefocusTimer) {
      clearTimeout(parallelComposerRefocusTimer);
      parallelComposerRefocusTimer = null;
    }
  }

  function markParallelComposerInteraction() {
    parallelComposerLastInteractionAt = Date.now();
  }

  function stopParallelComposerFocusLock() {
    isParallelComposerPinned = false;
    isParallelComposerComposing = false;
    clearParallelComposerRefocusTimer();
  }

  function shouldRestoreParallelComposerFocus() {
    if (isEmbeddedFrame || !isParallelComposerPinned || !parallelComposerInput) return false;
    if (document.visibilityState !== 'visible') return false;
    if (document.activeElement === parallelComposerInput) return false;
    if (parallelComposerArea && parallelComposerArea.contains(document.activeElement)) return false;
    const idleMs = Date.now() - parallelComposerLastInteractionAt;
    if (!isParallelComposerComposing && idleMs > 1500) return false;
    return true;
  }

  function scheduleParallelComposerRefocus(delay = 80) {
    clearParallelComposerRefocusTimer();
    parallelComposerRefocusTimer = setTimeout(() => {
      if (!shouldRestoreParallelComposerFocus()) return;
      parallelComposerInput.focus({ preventScroll: true });
    }, delay);
  }

  function notifyParentToRestoreParallelComposerFocus(reason = 'embedded-frame-focus') {
    if (!isEmbeddedFrame) return;
    try {
      window.top?.postMessage({ type: 'AI_ANCHOR_RESTORE_PARALLEL_FOCUS', reason }, '*');
    } catch (err) {
      console.warn('[AI Chat Anchor] 通知父页面恢复焦点失败:', err);
    }
  }

  function allowEmbeddedFrameFocus(duration = 6000) {
    embeddedFrameInteractionUntil = Date.now() + duration;
  }

  function guardEmbeddedFrameAutofocus(duration = 15000) {
    embeddedFrameFocusGuardUntil = Date.now() + duration;
  }

  function isEditableElement(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.matches('textarea, input, select, [contenteditable="true"], [role="textbox"]')) return true;
    return !!target.closest('textarea, input, select, [contenteditable="true"], [role="textbox"]');
  }

  function shouldBlockEmbeddedFrameFocus(target = document.activeElement) {
    if (!isEmbeddedFrame) return false;
    if (Date.now() > embeddedFrameFocusGuardUntil) return false;
    if (Date.now() < embeddedFrameInteractionUntil) return false;
    if (!(target instanceof HTMLElement)) return false;
    if (target.closest('#ai-chat-anchor-panel, #ai-chat-anchor-timeline, #ai-chat-anchor-parallel-workspace')) return false;
    return isEditableElement(target);
  }

  function blurEmbeddedFrameActiveElement() {
    const activeEl = document.activeElement;
    if (!(activeEl instanceof HTMLElement)) return false;
    activeEl.blur();
    return true;
  }

  function enforceEmbeddedFrameFocusGuard(reason = 'embedded-frame-focus') {
    if (!shouldBlockEmbeddedFrameFocus()) return false;
    const blurred = blurEmbeddedFrameActiveElement();
    if (blurred) {
      notifyParentToRestoreParallelComposerFocus(reason);
    }
    return blurred;
  }

  function playParallelToggleAnimation(isOpening) {
    const className = isOpening ? 'animating-on' : 'animating-off';
    const toggleButtons = panelElement?.querySelectorAll('.parallel-toggle') || [];
    toggleButtons.forEach((toggleBtn) => {
      toggleBtn.classList.remove('animating-on', 'animating-off');
      void toggleBtn.offsetWidth;
      toggleBtn.classList.add(className);

      clearTimeout(toggleBtn.__anchorToggleTimer);
      toggleBtn.__anchorToggleTimer = setTimeout(() => {
        toggleBtn.classList.remove(className);
      }, 380);
    });
  }

  // 创建刻度尺风格导航
  function createToggleButton() {
    if (toggleButton) return;

    // 创建刻度条容器
    toggleButton = document.createElement('div');
    toggleButton.id = 'ai-chat-anchor-timeline';
    toggleButton.className = 'ai-chat-anchor-timeline';
    toggleButton.title = '问答目录';
    toggleButton.tabIndex = 0;
    toggleButton.setAttribute('role', 'button');
    toggleButton.setAttribute('aria-label', '打开问答目录');

    // 竖线背景
    const track = document.createElement('div');
    track.className = 'ai-chat-anchor-timeline-track';
    toggleButton.appendChild(track);

    document.body.appendChild(toggleButton);

    toggleButton.addEventListener('mouseenter', () => {
      isHoveringTimeline = true;
      clearHidePanelTimer();
      showPanel();
    });

    toggleButton.addEventListener('mouseleave', (e) => {
      isHoveringTimeline = false;
      if (panelElement && panelElement.contains(e.relatedTarget)) return;
      scheduleHidePanel();
    });

    toggleButton.addEventListener('focus', () => {
      clearHidePanelTimer();
      showPanel();
    });

    toggleButton.addEventListener('blur', () => {
      scheduleHidePanel();
    });

    // 点击刻度条也可展开面板，兼容非悬停操作
    toggleButton.addEventListener('click', (e) => {
      e.stopPropagation();
      showPanel();
    });

    toggleButton.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showPanel();
      } else if (e.key === 'Escape') {
        hidePanel();
      }
    });
  }

  function ensureParallelWorkspace() {
    if (parallelWorkspaceElement) return;

    parallelWorkspaceElement = document.createElement('div');
    parallelWorkspaceElement.id = 'ai-chat-anchor-parallel-workspace';
    parallelWorkspaceElement.className = 'ai-chat-anchor-parallel-workspace';
    parallelWorkspaceElement.innerHTML = `
      <div class="parallel-workspace-shell">
        <button class="parallel-workspace-close" title="关闭并行区">${getLucideIcon('x')}</button>
        <button class="parallel-panel-toggle parallel-panel-toggle-floating" id="parallel-floating-panel-toggle" title="收起右侧面板" aria-label="收起右侧面板">
          ${getLucideIcon('chevronsRight')}
        </button>
        <div class="parallel-workspace-stage">
          <div class="parallel-workspace-panes" id="ai-chat-anchor-parallel-panes">
            <div class="parallel-workspace-empty" id="ai-chat-anchor-parallel-empty">
              <div class="parallel-workspace-empty-icon">∥</div>
              <p>从右侧输入问题后，这里会在当前标签页内并排打开回答。</p>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(parallelWorkspaceElement);
    parallelPanesContainer = parallelWorkspaceElement.querySelector('#ai-chat-anchor-parallel-panes');
    parallelEmptyState = parallelWorkspaceElement.querySelector('#ai-chat-anchor-parallel-empty');
    applyPlatformIdentity();

    parallelWorkspaceElement
      .querySelector('.parallel-workspace-close')
      .addEventListener('click', closeParallelWorkspace);

    parallelWorkspaceElement
      .querySelector('#parallel-floating-panel-toggle')
      .addEventListener('click', () => {
        setParallelPanelCollapsed(!isParallelPanelCollapsed);
      });

    parallelWorkspaceElement.addEventListener('click', (e) => {
      if (e.target === parallelWorkspaceElement) {
        closeParallelWorkspace();
      }
    });
  }

  function isParallelModeOpen() {
    return !isEmbeddedFrame && !!parallelWorkspaceElement?.classList.contains('visible');
  }

  function syncParallelPanelToggle() {
    const collapsed = !!isParallelPanelCollapsed && isParallelModeOpen();
    const toggles = document.querySelectorAll('.parallel-panel-toggle');
    toggles.forEach((toggle) => {
      toggle.innerHTML = collapsed ? getLucideIcon('chevronsLeft') : getLucideIcon('chevronsRight');
      toggle.title = collapsed ? '展开右侧面板' : '收起右侧面板';
      toggle.setAttribute('aria-label', collapsed ? '展开右侧面板' : '收起右侧面板');
      toggle.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
    });
  }

  function setParallelPanelCollapsed(collapsed) {
    if (isEmbeddedFrame) return;

    isParallelPanelCollapsed = !!collapsed;
    document.body.classList.toggle('anchor-parallel-panel-collapsed', isParallelPanelCollapsed && isParallelModeOpen());
    syncParallelPanelToggle();

    if (isParallelPanelCollapsed) {
      stopParallelComposerFocusLock();
    } else if (isParallelModeOpen()) {
      setTimeout(() => panelElement?.querySelector('#parallel-input')?.focus({ preventScroll: true }), 60);
    }
  }

  function syncPanelMode() {
    if (!panelElement || isEmbeddedFrame) return;

    const searchEl = panelElement.querySelector('.ai-chat-anchor-search');
    const listEl = panelElement.querySelector('#ai-chat-anchor-list');
    const parallelEl = panelElement.querySelector('#ai-chat-anchor-parallel');
    const toggleButtons = panelElement.querySelectorAll('.parallel-toggle');

    if (isParallelModeOpen()) {
      panelElement.classList.add('parallel-mode', 'visible');
      isPanelVisible = true;
      panelElement.style.top = '';
      panelElement.style.right = '';
      if (searchEl) searchEl.style.display = 'none';
      if (parallelEl) parallelEl.classList.add('visible');
      toggleButtons.forEach((toggleBtn) => {
        toggleBtn.classList.add('active');
        toggleBtn.setAttribute('aria-pressed', 'true');
      });
      renderParallelPaneList();
    } else {
      panelElement.classList.remove('parallel-mode');
      if (searchEl) searchEl.style.display = '';
      if (parallelEl) parallelEl.classList.remove('visible');
      toggleButtons.forEach((toggleBtn) => {
        toggleBtn.classList.remove('active');
        toggleBtn.setAttribute('aria-pressed', 'false');
      });
      refreshList(searchInput ? searchInput.value : '');
      if (isPanelVisible) {
        positionPanel();
      }
    }

    document.body.classList.toggle('anchor-parallel-panel-collapsed', isParallelPanelCollapsed && isParallelModeOpen());
    syncParallelPanelToggle();

    if (pendingParallelAnimation) {
      playParallelToggleAnimation(pendingParallelAnimation === 'opening');
      pendingParallelAnimation = '';
    }

    if (listEl && isParallelModeOpen() && listEl.innerHTML.trim() === '') {
      renderParallelPaneList();
    }
  }

  function openParallelWorkspace() {
    const wasOpen = isParallelModeOpen();
    ensureParallelWorkspace();
    document.documentElement.classList.add('anchor-parallel-open');
    document.body.classList.add('anchor-parallel-open');
    parallelWorkspaceElement.classList.add('visible');
    if (!wasOpen) pendingParallelAnimation = 'opening';
    applyTheme();
    syncPanelMode();
    refreshParallelHistoryItems();
    updateParallelPaneCount();
  }

  function closeParallelWorkspace() {
    if (!parallelWorkspaceElement) return;
    const wasOpen = isParallelModeOpen();

    stopParallelComposerFocusLock();
    document.documentElement.classList.remove('anchor-parallel-open');
    document.body.classList.remove('anchor-parallel-open');
    finishParallelPaneDrag({ cancel: true });
    parallelPanesContainer
      ?.querySelectorAll('.ai-chat-anchor-parallel-pane')
      ?.forEach((pane) => pane.remove());

    parallelWorkspaceElement.classList.remove('visible');
    if (wasOpen) pendingParallelAnimation = 'closing';
    parallelPaneSeq = 0;
    activeParallelPaneId = '';
    isParallelPanelCollapsed = false;
    closeParallelHistoryPanel();
    if (parallelEmptyState) parallelEmptyState.style.display = '';
    syncPanelMode();
    if (isPanelVisible) {
      requestAnimationFrame(() => {
        positionPanel();
      });
    }
    updateParallelPaneCount();
  }

  function updateParallelPaneCount() {
    const paneCount = parallelPanesContainer
      ? parallelPanesContainer.querySelectorAll('.ai-chat-anchor-parallel-pane:not(.parallel-pane-placeholder)').length
      : 0;

    const sideCountEl = panelElement?.querySelector('#parallel-count');
    if (sideCountEl) {
      sideCountEl.innerHTML = paneCount > 0
        ? `当前 <b>${paneCount}</b> 个对话窗格`
        : '将在当前页内新增并排对话';
    }

    if (isParallelModeOpen()) {
      renderParallelPaneList();
    }
  }

  function getParallelPaneOrder(pane) {
    return Number(pane?.dataset?.paneOrder || 0);
  }

  function getSortedParallelPanes({ includePlaceholder = false } = {}) {
    const selector = includePlaceholder
      ? '.ai-chat-anchor-parallel-pane'
      : '.ai-chat-anchor-parallel-pane:not(.parallel-pane-placeholder)';

    return Array.from(parallelPanesContainer?.querySelectorAll(selector) || [])
      .sort((a, b) => getParallelPaneOrder(a) - getParallelPaneOrder(b));
  }

  function normalizeParallelPaneOrders() {
    const panes = getSortedParallelPanes({ includePlaceholder: true });
    panes.forEach((pane, index) => {
      const nextOrder = String(index + 1);
      pane.dataset.paneOrder = nextOrder;
      pane.style.order = nextOrder;
    });
  }

  function clearParallelPaneDraggingState() {
    if (!parallelDragState) return;

    const { pane, placeholder, handle } = parallelDragState;
    stopParallelPaneAutoScroll();
    handle?.classList.remove('is-visible');
    pane?.classList.remove('is-dragging', 'show-drag-handle');
    pane?.removeAttribute('style');
    placeholder?.remove();
    parallelDragState = null;
  }

  function stopParallelPaneAutoScroll() {
    if (!parallelDragState) return;

    if (parallelDragState.autoScrollFrame) {
      cancelAnimationFrame(parallelDragState.autoScrollFrame);
      parallelDragState.autoScrollFrame = null;
    }
    parallelDragState.autoScrollVelocity = 0;
  }

  function getParallelPaneAutoScrollVelocity(clientX) {
    if (!parallelPanesContainer) return 0;

    const rect = parallelPanesContainer.getBoundingClientRect();
    const maxScrollLeft = parallelPanesContainer.scrollWidth - parallelPanesContainer.clientWidth;
    if (maxScrollLeft <= 0) return 0;

    if (clientX <= rect.left + PARALLEL_PANE_AUTO_SCROLL_EDGE) {
      const ratio = Math.min(1, (rect.left + PARALLEL_PANE_AUTO_SCROLL_EDGE - clientX) / PARALLEL_PANE_AUTO_SCROLL_EDGE);
      return -Math.max(6, Math.round(PARALLEL_PANE_AUTO_SCROLL_MAX_STEP * ratio));
    }

    if (clientX >= rect.right - PARALLEL_PANE_AUTO_SCROLL_EDGE) {
      const ratio = Math.min(1, (clientX - (rect.right - PARALLEL_PANE_AUTO_SCROLL_EDGE)) / PARALLEL_PANE_AUTO_SCROLL_EDGE);
      return Math.max(6, Math.round(PARALLEL_PANE_AUTO_SCROLL_MAX_STEP * ratio));
    }

    return 0;
  }

  function stepParallelPaneAutoScroll() {
    if (!parallelDragState || !parallelPanesContainer) return;

    const velocity = parallelDragState.autoScrollVelocity || 0;
    if (!velocity) {
      parallelDragState.autoScrollFrame = null;
      return;
    }

    const previousScrollLeft = parallelPanesContainer.scrollLeft;
    parallelPanesContainer.scrollLeft += velocity;
    const didScroll = parallelPanesContainer.scrollLeft !== previousScrollLeft;
    if (!didScroll) {
      parallelDragState.autoScrollFrame = null;
      return;
    }

    parallelDragState.autoScrollFrame = requestAnimationFrame(stepParallelPaneAutoScroll);

    if (didScroll) {
      updateParallelPaneDrag(
        parallelDragState.lastClientX,
        parallelDragState.lastClientY,
        { syncAutoScroll: false }
      );
    }
  }

  function syncParallelPaneAutoScroll(clientX) {
    if (!parallelDragState) return;

    const nextVelocity = getParallelPaneAutoScrollVelocity(clientX);
    parallelDragState.autoScrollVelocity = nextVelocity;

    if (!nextVelocity) {
      if (parallelDragState.autoScrollFrame) {
        cancelAnimationFrame(parallelDragState.autoScrollFrame);
        parallelDragState.autoScrollFrame = null;
      }
      return;
    }

    if (!parallelDragState.autoScrollFrame) {
      parallelDragState.autoScrollFrame = requestAnimationFrame(stepParallelPaneAutoScroll);
    }
  }

  function reorderParallelPlaceholder(dragCenterX) {
    if (!parallelDragState?.placeholder || !parallelPanesContainer) return;

    const { placeholder, pane: draggingPane } = parallelDragState;
    const siblings = getSortedParallelPanes().filter((candidate) => candidate !== draggingPane);
    let nextOrder = siblings.length + 1;

    for (const candidate of siblings) {
      const rect = candidate.getBoundingClientRect();
      const midpoint = rect.left + (rect.width / 2);
      if (dragCenterX < midpoint) {
        nextOrder = getParallelPaneOrder(candidate);
        break;
      }
    }

    if (getParallelPaneOrder(placeholder) !== nextOrder) {
      getSortedParallelPanes({ includePlaceholder: true })
        .filter((candidate) => candidate !== placeholder)
        .forEach((candidate) => {
          const candidateOrder = getParallelPaneOrder(candidate);
          if (candidateOrder >= nextOrder) {
            const bumpedOrder = String(candidateOrder + 1);
            candidate.dataset.paneOrder = bumpedOrder;
            candidate.style.order = bumpedOrder;
          }
        });

      placeholder.dataset.paneOrder = String(nextOrder);
      placeholder.style.order = String(nextOrder);
      normalizeParallelPaneOrders();
      renderParallelPaneList();
    }
  }

  function updateParallelPaneDrag(clientX, clientY, { syncAutoScroll = true } = {}) {
    if (!parallelDragState?.pane) return;

    const { pane, offsetX, offsetY } = parallelDragState;
    const dragLeft = clientX - offsetX;
    const dragCenterX = dragLeft + (pane.offsetWidth / 2);
    parallelDragState.lastClientX = clientX;
    parallelDragState.lastClientY = clientY;
    pane.style.left = `${dragLeft}px`;
    pane.style.top = `${clientY - offsetY}px`;
    reorderParallelPlaceholder(dragCenterX);
    if (syncAutoScroll) syncParallelPaneAutoScroll(clientX);
  }

  function finishParallelPaneDrag({ cancel = false } = {}) {
    if (!parallelDragState) return;

    const { pane, placeholder, handle, cleanup, pointerId, originalOrder } = parallelDragState;
    cleanup?.();
    stopParallelPaneAutoScroll();

    if (handle && pointerId != null && handle.hasPointerCapture?.(pointerId)) {
      handle.releasePointerCapture(pointerId);
    }

    pane.classList.remove('is-dragging');
    pane.removeAttribute('style');

    if (cancel) {
      pane.dataset.paneOrder = String(originalOrder);
      pane.style.order = String(originalOrder);
    } else if (placeholder) {
      const nextOrder = placeholder.dataset.paneOrder || String(originalOrder);
      pane.dataset.paneOrder = nextOrder;
      pane.style.order = nextOrder;
    }

    placeholder?.remove();
    normalizeParallelPaneOrders();

    pane.classList.remove('show-drag-handle');
    handle?.classList.remove('is-visible');

    parallelDragState = null;
    renderParallelPaneList();
  }

  function startParallelPaneDrag(event, pane, handle) {
    if (!parallelPanesContainer || parallelDragState) return;

    const rect = pane.getBoundingClientRect();
    const originalOrder = getParallelPaneOrder(pane);
    const placeholder = document.createElement('div');
    placeholder.className = 'ai-chat-anchor-parallel-pane parallel-pane-placeholder';
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.minWidth = `${rect.width}px`;
    placeholder.style.flex = `0 0 ${rect.width}px`;
    placeholder.style.height = `${rect.height}px`;
    placeholder.dataset.paneOrder = String(originalOrder);
    placeholder.style.order = String(originalOrder);

    parallelPanesContainer.appendChild(placeholder);

    pane.classList.add('is-dragging', 'show-drag-handle');
    handle.classList.add('is-visible');
    pane.style.position = 'fixed';
    pane.style.left = `${rect.left}px`;
    pane.style.top = `${rect.top}px`;
    pane.style.width = `${rect.width}px`;
    pane.style.minWidth = `${rect.width}px`;
    pane.style.height = `${rect.height}px`;
    pane.style.margin = '0';
    pane.style.zIndex = '2147483646';
    pane.style.pointerEvents = 'none';

    parallelDragState = {
      pane,
      handle,
      placeholder,
      pointerId: event.pointerId,
      originalOrder,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      autoScrollVelocity: 0,
      autoScrollFrame: null,
      cleanup: null
    };

    const handlePointerMove = (moveEvent) => {
      if (!parallelDragState || moveEvent.pointerId !== event.pointerId) return;
      updateParallelPaneDrag(moveEvent.clientX, moveEvent.clientY);
    };

    const handlePointerUp = (upEvent) => {
      if (!parallelDragState || upEvent.pointerId !== event.pointerId) return;
      finishParallelPaneDrag();
    };

    const handlePointerCancel = (cancelEvent) => {
      if (!parallelDragState || cancelEvent.pointerId !== event.pointerId) return;
      finishParallelPaneDrag({ cancel: true });
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerCancel, true);
    };

    parallelDragState.cleanup = cleanup;

    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerCancel, true);

    handle.setPointerCapture?.(event.pointerId);
    updateParallelPaneDrag(event.clientX, event.clientY);
  }

  function removeParallelPane(pane) {
    if (!pane) return;

    const panes = getSortedParallelPanes();
    const currentIndex = panes.findIndex((candidate) => candidate === pane);
    const siblingToActivate = panes[currentIndex - 1] || panes[currentIndex + 1] || null;
    const wasActivePane = pane.id && pane.id === activeParallelPaneId;
    pane.remove();
    normalizeParallelPaneOrders();
    const hasPaneLeft = !!parallelPanesContainer?.querySelector('.ai-chat-anchor-parallel-pane:not(.parallel-pane-placeholder)');
    if (!hasPaneLeft) {
      closeParallelWorkspace();
      return;
    }

    if (wasActivePane) {
      setActiveParallelPane(siblingToActivate instanceof HTMLElement ? siblingToActivate : null, {
        triggerRipple: false
      });
    }

    updateParallelPaneCount();
  }

  function clearParallelPaneUnread(pane) {
    if (!pane) return;
    delete pane.dataset.hasUnread;
  }

  function markParallelPaneUnread(pane) {
    if (!pane) return;
    if (pane.id && pane.id === activeParallelPaneId) return;
    pane.dataset.hasUnread = 'true';
  }

  function setActiveParallelPane(pane, { triggerRipple = true } = {}) {
    const panes = getSortedParallelPanes();
    const nextActiveId = pane?.id || '';

    panes.forEach((candidate) => {
      const isActive = !!nextActiveId && candidate.id === nextActiveId;
      candidate.classList.toggle('is-active', isActive);
      if (!isActive) {
        candidate.classList.remove('is-rippling');
      }
    });

    activeParallelPaneId = nextActiveId;
    if (pane) {
      clearParallelPaneUnread(pane);
    }

    if (pane && triggerRipple) {
      pane.classList.remove('is-rippling');
      void pane.offsetWidth;
      pane.classList.add('is-rippling');
    }

    if (panelElement && isParallelModeOpen()) {
      const listItems = panelElement.querySelectorAll('.parallel-pane-item');
      listItems.forEach((item) => {
        const isActive = item.dataset.paneId === activeParallelPaneId;
        item.classList.toggle('is-active', isActive);
        if (isActive) {
          item.classList.remove('has-unread');
        }
      });
    }
  }

  function createParallelPane({
    title,
    subtitle,
    tooltip = subtitle,
    src,
    kind = 'parallel',
    injectQuestion = ''
  }) {
    parallelPaneSeq += 1;
    const seq = parallelPaneSeq;
    const pane = document.createElement('div');
    pane.className = 'ai-chat-anchor-parallel-pane';
    pane.id = `ai-chat-anchor-parallel-pane-${seq}`;
    pane.dataset.paneKind = kind;
    pane.dataset.paneTitle = title;
    pane.dataset.paneSubtitle = subtitle;
    pane.dataset.paneTooltip = tooltip;
    pane.dataset.paneOrder = String(seq);
    pane.style.order = String(seq);

    pane.innerHTML = `
      <div class="parallel-pane-handle-zone" aria-hidden="true"></div>
      <button class="parallel-pane-drag-handle" type="button" title="拖拽调整窗格顺序" aria-label="拖拽调整窗格顺序">
        ${getLucideIcon('grip')}
      </button>
      <div class="parallel-pane-body">
        <div class="parallel-pane-header">
          <div class="parallel-pane-meta">
            <span class="parallel-pane-title">${escapeHtml(title)} · 窗格 ${seq}</span>
            <span class="parallel-pane-question" title="${escapeAttr(tooltip)}">${escapeHtml(subtitle)}</span>
          </div>
          <button class="parallel-pane-close" title="关闭窗格">×</button>
        </div>
      </div>
    `;

    const iframe = document.createElement('iframe');
    iframe.className = 'parallel-pane-frame';
    iframe.src = src;
    iframe.title = `${title} 窗格 ${seq}`;
    iframe.setAttribute('allow', 'clipboard-read; clipboard-write');

    if (injectQuestion) {
      iframe.addEventListener('load', () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.postMessage({ type: 'AI_ANCHOR_INJECT', question: injectQuestion }, '*');
          } catch (err) {
            console.warn(`[AI Chat Anchor] 并行窗格 ${seq} 注入失败:`, err);
          }
        }, 1800);
      });
    }

    pane.addEventListener('pointerdown', () => {
      setActiveParallelPane(pane);
    }, true);

    iframe.addEventListener('focus', () => {
      setActiveParallelPane(pane);
    });

    pane.querySelector('.parallel-pane-close').addEventListener('click', () => {
      removeParallelPane(pane);
    });

    const handleZone = pane.querySelector('.parallel-pane-handle-zone');
    const dragHandle = pane.querySelector('.parallel-pane-drag-handle');
    handleZone?.addEventListener('pointerenter', () => {
      if (parallelDragState?.pane === pane) return;
      pane.classList.add('show-drag-handle');
      dragHandle?.classList.add('is-visible');
    });
    pane.addEventListener('pointerleave', () => {
      if (parallelDragState?.pane === pane) return;
      pane.classList.remove('show-drag-handle');
      dragHandle?.classList.remove('is-visible');
    });
    dragHandle?.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      setActiveParallelPane(pane, { triggerRipple: false });
      startParallelPaneDrag(event, pane, dragHandle);
    });

    pane.querySelector('.parallel-pane-body')?.appendChild(iframe);
    parallelPanesContainer?.appendChild(pane);
    setActiveParallelPane(pane, { triggerRipple: kind !== 'source' });
    return pane;
  }

  function normalizeHistoryTitle(text = '') {
    return normalizeMessageText(text)
      .replace(/^(打开侧边栏|打开历史记录|聊天记录|对话历史)\s*/i, '')
      .trim();
  }

  function resolveHistoryUrl(href = '') {
    if (!href || href.startsWith('javascript:') || href.startsWith('#')) return '';
    try {
      return new URL(href, window.location.origin).href;
    } catch (_) {
      return '';
    }
  }

  function isLikelyHistoryAnchor(anchor, url) {
    if (!(anchor instanceof HTMLAnchorElement) || !url) return false;

    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.origin !== window.location.origin) return false;
      if (currentPlatform?.isHistoryUrl) {
        return currentPlatform.isHistoryUrl(parsedUrl);
      }
      return /\/(c|chat|conversation|app)\//.test(parsedUrl.pathname);
    } catch (_) {
      return false;
    }
  }

  function getScrollableHistoryContainer() {
    const selector = [
      currentPlatform?.historyItemSelector,
      'nav a[href]',
      'aside a[href]',
      '[role="navigation"] a[href]'
    ].filter(Boolean).join(', ');

    const anchors = safeQueryAll(document, selector).filter((anchor) => {
      if (!(anchor instanceof HTMLAnchorElement)) return false;
      const href = resolveHistoryUrl(anchor.getAttribute('href') || '');
      return isLikelyHistoryAnchor(anchor, href);
    });

    const visited = new Set();
    for (const anchor of anchors) {
      let node = anchor.parentElement;
      while (node && node !== document.body) {
        if (visited.has(node)) {
          node = node.parentElement;
          continue;
        }
        visited.add(node);

        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY || '';
        const isScrollable = /(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight + 80;
        if (isScrollable) {
          return node;
        }
        node = node.parentElement;
      }
    }

    return null;
  }

  function mergeHistoryItems(existingItems = [], nextItems = []) {
    const merged = new Map();
    existingItems.forEach((item) => {
      if (item?.url && item?.title) merged.set(item.url, item);
    });
    nextItems.forEach((item) => {
      if (item?.url && item?.title) merged.set(item.url, item);
    });
    return Array.from(merged.values());
  }

  function getHistoryLoadMoreControls() {
    const selectors = [
      'button',
      '[role="button"]',
      'a',
      '[data-testid*="more"]',
      '[aria-label]'
    ].join(', ');

    return safeQueryAll(document, selectors).filter((el) => {
      if (!(el instanceof HTMLElement) || !isElementVisible(el) || isAnchorElement(el)) return false;
      const text = normalizeMessageText(
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.textContent ||
        ''
      ).toLowerCase();

      if (!text) return false;
      return /(show more|load more|see more|expand|more conversations|更多|显示更多|加载更多|展开)/i.test(text);
    });
  }

  function pokeHistoryScroller(scroller, amount) {
    if (!(scroller instanceof HTMLElement)) return;

    scroller.focus?.({ preventScroll: true });
    scroller.dispatchEvent(new WheelEvent('wheel', {
      deltaY: amount,
      bubbles: true,
      cancelable: true
    }));
    scroller.scrollTop = Math.max(0, Math.min(scroller.scrollTop + amount, scroller.scrollHeight));
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
  }

  function collectParallelHistoryItems() {
    if (!currentPlatform) return [];

    const selector = [
      currentPlatform.historyItemSelector,
      'nav a[href]',
      'aside a[href]',
      '[role="navigation"] a[href]'
    ].filter(Boolean).join(', ');

    const items = [];
    const seen = new Set();

    safeQueryAll(document, selector).forEach((anchor) => {
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const href = resolveHistoryUrl(anchor.getAttribute('href') || '');
      if (!isLikelyHistoryAnchor(anchor, href)) return;

      const title = normalizeHistoryTitle(
        anchor.getAttribute('aria-label') ||
        anchor.getAttribute('title') ||
        anchor.textContent ||
        ''
      );

      if (!title || title.length < 2 || seen.has(href)) return;

      seen.add(href);
      items.push({ url: href, title });
    });

    return items;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function collectParallelHistoryItemsExhaustively() {
    const initialItems = collectParallelHistoryItems();
    const scroller = getScrollableHistoryContainer();
    if (!scroller) return initialItems;

    const originalScrollTop = scroller.scrollTop;
    const maxPasses = 18;
    const settledThreshold = 2;
    let stagnantPasses = 0;
    let accumulatedItems = [...initialItems];
    let lastCount = accumulatedItems.length;

    try {
      scroller.scrollTop = 0;
      await wait(80);
      accumulatedItems = mergeHistoryItems(accumulatedItems, collectParallelHistoryItems());

      for (let pass = 0; pass < maxPasses; pass += 1) {
        getHistoryLoadMoreControls().forEach((control) => {
          control.click?.();
        });

        pokeHistoryScroller(scroller, Math.max(scroller.clientHeight * 0.85, 240));
        await wait(160);

        accumulatedItems = mergeHistoryItems(accumulatedItems, collectParallelHistoryItems());
        const nextCount = accumulatedItems.length;
        const reachedBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 6;

        if (nextCount <= lastCount) {
          stagnantPasses += 1;
        } else {
          stagnantPasses = 0;
          lastCount = nextCount;
        }

        if (reachedBottom && stagnantPasses >= settledThreshold) break;
      }
    } finally {
      scroller.scrollTop = originalScrollTop;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    }

    return accumulatedItems;
  }

  function renderParallelHistoryList(query = '') {
    if (!parallelHistoryList) return;

    const normalizedQuery = normalizeHistoryTitle(query).toLowerCase();
    const filteredItems = normalizedQuery
      ? parallelHistoryItems.filter((item) => item.title.toLowerCase().includes(normalizedQuery))
      : parallelHistoryItems;

    if (parallelHistoryItems.length === 0) {
      parallelHistoryList.innerHTML = '<div class="parallel-history-empty">没有读到历史对话，先展开平台左侧历史列表试试</div>';
      return;
    }

    if (filteredItems.length === 0) {
      parallelHistoryList.innerHTML = '<div class="parallel-history-empty">没有匹配到相关历史对话</div>';
      return;
    }

    parallelHistoryList.innerHTML = '';
    filteredItems.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'parallel-history-item';
      button.title = item.title;
      button.innerHTML = `<span class="parallel-history-item-text">${escapeHtml(item.title)}</span>`;
      button.addEventListener('click', () => {
        closeParallelHistoryPanel();
        openParallelHistoryPane(item);
      });
      parallelHistoryList.appendChild(button);
    });
  }

  async function refreshParallelHistoryItems({ exhaustive = false } = {}) {
    parallelHistoryItems = exhaustive
      ? await collectParallelHistoryItemsExhaustively()
      : collectParallelHistoryItems();
    renderParallelHistoryList(parallelHistoryInput?.value || '');
  }

  function openParallelHistoryPane(item) {
    if (!item?.url) return;

    openParallelWorkspace();
    ensureSourceParallelPane();

    const platformLabel = currentPlatform?.displayName || currentPlatform?.name || '当前平台';
    const subtitle = item.title.length > 48 ? `${item.title.substring(0, 48)}…` : item.title;
    createParallelPane({
      title: `${platformLabel} · 历史对话`,
      subtitle,
      tooltip: item.title,
      src: item.url,
      kind: 'history'
    });
    updateParallelPaneCount();
  }

  async function openParallelHistoryPanel() {
    if (!parallelHistoryPanel) return;

    parallelHistoryItems = [];
    renderParallelHistoryList();
    isParallelHistoryOpen = true;
    parallelHistoryPanel.hidden = false;
    document.body.classList.add('anchor-history-dialog-open');
    parallelHistoryToggle?.setAttribute('aria-expanded', 'true');

    setTimeout(() => {
      parallelHistoryInput?.focus({ preventScroll: true });
      parallelHistoryInput?.select?.();
    }, 0);

    await refreshParallelHistoryItems({ exhaustive: true });
  }

  function closeParallelHistoryPanel() {
    if (!parallelHistoryPanel) return;

    isParallelHistoryOpen = false;
    parallelHistoryPanel.hidden = true;
    document.body.classList.remove('anchor-history-dialog-open');
    parallelHistoryToggle?.setAttribute('aria-expanded', 'false');
  }

  function toggleParallelHistoryPanel() {
    if (isParallelHistoryOpen) {
      closeParallelHistoryPanel();
    } else {
      openParallelHistoryPanel();
    }
  }

  function renderParallelPaneList() {
    if (!panelElement || !isParallelModeOpen()) return;

    const list = panelElement.querySelector('#ai-chat-anchor-list');
    const countEl = panelElement.querySelector('#qa-count');
    if (!list) return;

    const panes = getSortedParallelPanes();
    if (countEl) countEl.textContent = String(panes.length);

    list.innerHTML = '';
    if (panes.length === 0) {
      list.innerHTML = '<div class="ai-chat-anchor-empty">还没有对话窗格</div>';
      return;
    }

    panes.forEach((pane, index) => {
      const item = document.createElement('div');
      item.className = 'ai-chat-anchor-item parallel-pane-item';
      item.dataset.paneId = pane.id;
      if (pane.dataset.paneKind === 'source') {
        item.classList.add('is-source');
      }
      if (pane.id === activeParallelPaneId) {
        item.classList.add('is-active');
      }
      if (pane.dataset.hasUnread === 'true') {
        item.classList.add('has-unread');
      }

      const subtitle = pane.dataset.paneSubtitle || `窗格 ${index + 1}`;
      const tooltip = pane.dataset.paneTooltip || subtitle;

      item.innerHTML = `
        <span class="qa-number">
          ${index + 1}
          <span class="parallel-pane-badge" aria-hidden="true"></span>
        </span>
        <span class="qa-text">${escapeHtml(subtitle)}</span>
        <div class="parallel-pane-actions">
          <button class="parallel-pane-focus" type="button" title="定位到这个窗格" aria-label="定位到这个窗格">
            ${getLucideIcon('target')}
          </button>
          <button class="parallel-pane-delete" type="button" title="删除这个窗格" aria-label="删除这个窗格">
            ${getLucideIcon('trash')}
          </button>
        </div>
      `;
      item.title = tooltip;

      const focusBtn = item.querySelector('.parallel-pane-focus');
      const deleteBtn = item.querySelector('.parallel-pane-delete');
      focusBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        setActiveParallelPane(pane);
        pane.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        const frame = pane.querySelector('.parallel-pane-frame');
        if (frame instanceof HTMLElement) {
          frame.focus({ preventScroll: true });
        }
      });
      deleteBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        removeParallelPane(pane);
      });

      item.addEventListener('click', () => {
        setActiveParallelPane(pane);
        pane.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        const frame = pane.querySelector('.parallel-pane-frame');
        if (frame instanceof HTMLElement) {
          frame.focus({ preventScroll: true });
        }
      });

      list.appendChild(item);
    });
  }

  function ensureSourceParallelPane() {
    const existingSourcePane = parallelPanesContainer?.querySelector('[data-pane-kind="source"]');
    if (existingSourcePane) return;

    const platformLabel = currentPlatform?.displayName || currentPlatform?.name || '当前平台';
    const currentConversationLabel = document.title?.trim() || '当前对话';

    if (parallelEmptyState) {
      parallelEmptyState.style.display = 'none';
    }

    createParallelPane({
      title: `${platformLabel} · 当前对话`,
      subtitle: currentConversationLabel,
      src: window.location.href,
      kind: 'source'
    });
  }

  function addParallelPane(question) {
    if (!currentPlatform?.launchUrl) return;

    openParallelWorkspace();
    ensureSourceParallelPane();

    if (parallelEmptyState) {
      parallelEmptyState.style.display = 'none';
    }

    const platformLabel = currentPlatform.displayName || currentPlatform.name;
    const shortQuestion = question.length > 48 ? `${question.substring(0, 48)}…` : question;
    createParallelPane({
      title: `${platformLabel} · 新对话`,
      subtitle: shortQuestion,
      tooltip: question,
      src: currentPlatform.launchUrl,
      kind: 'parallel',
      injectQuestion: question
    });
    updateParallelPaneCount();
  }

  // 更新刻度点
  function updateTimeline() {
    if (!toggleButton) return;

    // 保留竖线，移除旧的点
    const existingDots = toggleButton.querySelectorAll('.ai-chat-anchor-timeline-dot');
    existingDots.forEach(dot => dot.remove());
    toggleButton.classList.toggle('is-empty', qaPairs.length === 0);
    toggleButton.classList.toggle('has-items', qaPairs.length > 0);

    if (qaPairs.length === 0) return;

    qaPairs.forEach((qa, index) => {
      const dot = document.createElement('div');
      dot.className = 'ai-chat-anchor-timeline-dot';
      dot.title = qa.userText.substring(0, 30) + '...';

      // 点击跳转到对应 QA
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        scrollToQA(qa);
      });

      toggleButton.appendChild(dot);
    });

    // 更新高亮
    updateTimelineHighlight();
  }

  // 更新刻度点高亮
  function updateTimelineHighlight() {
    if (!toggleButton) return;

    const dots = toggleButton.querySelectorAll('.ai-chat-anchor-timeline-dot');
    dots.forEach((dot, index) => {
      dot.classList.toggle('active', index === currentActiveIndex);
    });
  }

  function clearHidePanelTimer() {
    if (hidePanelTimer) {
      clearTimeout(hidePanelTimer);
      hidePanelTimer = null;
    }
  }

  function hasPanelFocus() {
    return !!(panelElement && panelElement.contains(document.activeElement));
  }

  function shouldKeepPanelOpen() {
    return isHoveringTimeline || isHoveringPanel || hasPanelFocus();
  }

  function positionPanel() {
    if (!panelElement || !toggleButton || isParallelModeOpen()) return;

    const timelineRect = toggleButton.getBoundingClientRect();
    const panelWidth = panelElement.offsetWidth || 320;
    const panelHeight = panelElement.offsetHeight || 640;
    const gap = 12;
    const margin = 12;
    const desiredRight = window.innerWidth - timelineRect.left + gap;
    const maxRight = Math.max(margin, window.innerWidth - panelWidth - margin);
    const right = Math.min(desiredRight, maxRight);
    const centeredTop = timelineRect.top + (timelineRect.height / 2) - (panelHeight / 2);
    const maxTop = Math.max(margin, window.innerHeight - panelHeight - margin);
    const top = Math.min(Math.max(margin, centeredTop), maxTop);

    panelElement.style.right = `${right}px`;
    panelElement.style.top = `${top}px`;
  }

  function scheduleHidePanel(delay = PANEL_HIDE_DELAY) {
    clearHidePanelTimer();
    hidePanelTimer = setTimeout(() => {
      if (!shouldKeepPanelOpen()) {
        hidePanel();
      }
    }, delay);
  }

  function showPanel() {
    clearHidePanelTimer();
    if (isPanelVisible) return;
    isPanelVisible = true;

    if (panelElement) {
      panelElement.classList.add('visible');
      positionPanel();
      syncPanelMode();
      refreshList();
      setTimeout(updateActiveOnScroll, 100);
    }
  }

  function hidePanel() {
    if (isParallelModeOpen()) return;
    clearHidePanelTimer();
    if (!isPanelVisible) return;
    isPanelVisible = false;
    isHoveringTimeline = false;
    isHoveringPanel = false;

    if (hasPanelFocus() && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (panelElement) panelElement.classList.remove('visible');
  }

  // 刷新目录列表
  function refreshList(filterText = '') {
    if (!panelElement) return;

    if (isParallelModeOpen()) {
      renderParallelPaneList();
      return;
    }

    qaPairs = extractQAPairs();
    if (qaPairs.length === 0) {
      setActiveIndex(-1);
    }

    if (isPanelVisible) {
      const countEl = panelElement.querySelector('#qa-count');
      if (countEl) countEl.textContent = qaPairs.length;
      renderList(filterText);
    } else {
      updateTimeline();
    }

    if (qaPairs.length > 0) {
      if (activeIndexSyncFrame) {
        cancelAnimationFrame(activeIndexSyncFrame);
      }
      activeIndexSyncFrame = requestAnimationFrame(() => {
        activeIndexSyncFrame = null;
        updateActiveOnScroll();
      });
    }

    if (isEmbeddedFrame) {
      reportEmbeddedParallelActivity(qaPairs);
    }
  }

  function getAssistantReplyCount(pairs = qaPairs) {
    return pairs.filter((qa) => qa.aiElement).length;
  }

  function reportEmbeddedParallelActivity(pairs = qaPairs) {
    if (!isEmbeddedFrame) return;

    const assistantReplyCount = getAssistantReplyCount(pairs);
    if (embeddedReportedAssistantCount === null) {
      embeddedReportedAssistantCount = assistantReplyCount;
      return;
    }

    if (assistantReplyCount < embeddedReportedAssistantCount) {
      embeddedReportedAssistantCount = assistantReplyCount;
      return;
    }

    if (assistantReplyCount <= embeddedReportedAssistantCount) return;

    embeddedReportedAssistantCount = assistantReplyCount;
    window.top?.postMessage({
      type: 'AI_ANCHOR_PARALLEL_ACTIVITY',
      assistantReplyCount
    }, '*');
  }

  function nodeContainsObservedMessage(node, observedSelectors) {
    if (!(node instanceof Element) || isAnchorElement(node)) return false;
    if (node.matches?.(observedSelectors)) return true;
    return !!node.querySelector?.(observedSelectors);
  }

  function handleConversationContextChange() {
    const hrefChanged = window.location.href !== lastKnownHref;
    const titleChanged = document.title !== lastKnownTitle;

    if (!hrefChanged && !titleChanged) return;

    lastKnownHref = window.location.href;
    lastKnownTitle = document.title;
    currentActiveIndex = -1;

    if (isParallelModeOpen()) {
      refreshParallelHistoryItems();
      updateParallelPaneCount();
      return;
    }

    refreshList(searchInput ? searchInput.value : '');
  }

  // 渲染列表（带过滤）
  function renderList(filterText = '') {
    const list = panelElement.querySelector('#ai-chat-anchor-list');
    if (!list) return;

    list.innerHTML = '';

    const filteredPairs = filterText
      ? qaPairs.filter(qa =>
          qa.userText.toLowerCase().includes(filterText.toLowerCase())
        )
      : qaPairs;

    if (filteredPairs.length === 0) {
      list.innerHTML = filterText
        ? '<div class="ai-chat-anchor-empty">未找到匹配的问答</div>'
        : '<div class="ai-chat-anchor-empty">未检测到问答对</div>';
      return;
    }

    filteredPairs.forEach((qa, index) => {
      const item = document.createElement('div');
      item.className = 'ai-chat-anchor-item';

      const title = qa.userText.length > 50
        ? qa.userText.substring(0, 50) + '...'
        : qa.userText;

      item.innerHTML = `
        <span class="qa-text">${escapeHtml(title)}</span>
      `;

      item.dataset.originalIndex = qaPairs.indexOf(qa);

      item.addEventListener('click', () => {
        scrollToQA(qa);
      });

      list.appendChild(item);
    });

    // 更新刻度条
    updateTimeline();
  }

  // 过滤列表
  function filterList(text) {
    renderList(text);
  }

  // HTML 转义
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeAttr(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getQABounds(qa) {
    const userRect = qa.userElement?.getBoundingClientRect();
    if (!userRect) return null;

    let top = userRect.top;
    let bottom = userRect.bottom;
    let left = userRect.left;
    let right = userRect.right;

    if (qa.aiElement) {
      const aiRect = qa.aiElement.getBoundingClientRect();
      top = Math.min(top, aiRect.top);
      bottom = Math.max(bottom, aiRect.bottom);
      left = Math.min(left, aiRect.left);
      right = Math.max(right, aiRect.right);
    }

    return { top, bottom, left, right };
  }

  function setActiveIndex(index) {
    currentActiveIndex = index;

    if (isPanelVisible) {
      const items = document.querySelectorAll('.ai-chat-anchor-item');
      items.forEach((item) => {
        const originalIndex = parseInt(item.dataset.originalIndex);
        item.classList.toggle('active', originalIndex === index && index !== -1);
      });
    }

    updateTimelineHighlight();
  }

  // 滚动到指定 QA
  function scrollToQA(qa, behavior = 'smooth') {
    if (!qa.userElement) return;

    const index = qaPairs.indexOf(qa);
    setActiveIndex(index);

    qa.userElement.scrollIntoView({
      behavior,
      block: 'center'
    });
  }

  // 监听 DOM 变化
  function setupObserver() {
    const observedSelectors = [
      currentPlatform?.messageSelector,
      currentPlatform?.userMessageSelector,
      currentPlatform?.aiMessageSelector,
      GENERIC_MESSAGE_SELECTOR
    ].filter(Boolean).join(', ');

    const observer = new MutationObserver((mutations) => {
      let shouldRefresh = false;
      let shouldCheckContextChange = false;

      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          shouldCheckContextChange = true;
        }

        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (nodeContainsObservedMessage(node, observedSelectors)) {
              shouldRefresh = true;
            }
          });
        }

        if (mutation.removedNodes.length > 0) {
          mutation.removedNodes.forEach(node => {
            if (nodeContainsObservedMessage(node, observedSelectors)) {
              shouldRefresh = true;
            }
          });
        }
      });

      if (shouldCheckContextChange) {
        clearTimeout(window._anchorContextTimer);
        window._anchorContextTimer = setTimeout(handleConversationContextChange, 80);
      }

      if (shouldRefresh) {
        clearTimeout(window._anchorRefreshTimer);
        window._anchorRefreshTimer = setTimeout(() => {
          const currentFilter = searchInput ? searchInput.value : '';
          refreshList(currentFilter);
        }, 500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 滚动监听 - 同时监听 window 和容器
    let ticking = false;

    function handleScroll() {
      if (qaPairs.length === 0) return;

      if (!ticking) {
        window.requestAnimationFrame(() => {
          updateActiveOnScroll();
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });

    // 监听可能的内容区域滚动容器
    setTimeout(() => {
      const scrollContainers = document.querySelectorAll('main, [role="main"], [class*="scroll"], [class*="message"]');
      scrollContainers.forEach(container => {
        container.addEventListener('scroll', handleScroll, { passive: true });
      });
    }, 2000);
  }

  function setupNavigationObserver() {
    const scheduleContextCheck = () => {
      clearTimeout(window._anchorNavTimer);
      window._anchorNavTimer = setTimeout(handleConversationContextChange, 80);
    };

    const wrapHistoryMethod = (methodName) => {
      const original = history[methodName];
      if (typeof original !== 'function' || original.__aiAnchorWrapped) return;

      const wrapped = function(...args) {
        const result = original.apply(this, args);
        scheduleContextCheck();
        return result;
      };

      wrapped.__aiAnchorWrapped = true;
      history[methodName] = wrapped;
    };

    wrapHistoryMethod('pushState');
    wrapHistoryMethod('replaceState');

    window.addEventListener('popstate', scheduleContextCheck);
    window.addEventListener('hashchange', scheduleContextCheck);
    setInterval(handleConversationContextChange, 1000);
  }

  // 根据滚动位置更新选中项
  function updateActiveOnScroll() {
    if (!qaPairs || qaPairs.length === 0) return;

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const viewportCenterX = viewportWidth / 2;
    const viewportCenterY = viewportHeight / 2;

    // 找到视口中心点所在的 QA
    let activeIndex = -1;
    let minDistance = Infinity;

    qaPairs.forEach((qa, index) => {
      if (!qa.userElement) return;

      const bounds = getQABounds(qa);
      if (!bounds) return;
      const { top: qaTop, bottom: qaBottom, left: qaLeft, right: qaRight } = bounds;

      // 如果元素不在视口内，跳过
      if (qaRight < 0 || qaLeft > viewportWidth ||
          qaBottom < 0 || qaTop > viewportHeight) {
        return;
      }

      const inXRange = viewportCenterX >= qaLeft && viewportCenterX <= qaRight;
      const inYRange = viewportCenterY >= qaTop && viewportCenterY <= qaBottom;

      if (inXRange && inYRange) {
        // 精确匹配
        activeIndex = index;
        minDistance = 0;
      } else if (inXRange) {
        // 只在 X 轴上有交集，计算 Y 轴距离
        const distance = Math.min(
          Math.abs(qaTop - viewportCenterY),
          Math.abs(qaBottom - viewportCenterY)
        );
        if (distance < minDistance) {
          minDistance = distance;
          activeIndex = index;
        }
      }
    });

    // 如果没有找到精确匹配，找最近的
    if (activeIndex === -1) {
      qaPairs.forEach((qa, index) => {
        const bounds = getQABounds(qa);
        if (!bounds) return;
        const { top: qaTop, bottom: qaBottom } = bounds;

        const centerY = (qaTop + qaBottom) / 2;
        const distance = Math.abs(centerY - viewportCenterY);

        if (distance < minDistance) {
          minDistance = distance;
          activeIndex = index;
        }
      });
    }
    setActiveIndex(activeIndex);
  }

  // ─── 主题融合 ────────────────────────────────────────────

  function detectDarkMode() {
    const html = document.documentElement;
    const body = document.body;
    const themeElements = [html, body, getConversationRoot()].filter(Boolean);

    const getThemeSignals = (el) => [
      typeof el.className === 'string' ? el.className : '',
      el.getAttribute('data-theme'),
      el.getAttribute('data-color-scheme'),
      el.getAttribute('color-scheme'),
      el.getAttribute('data-color-mode')
    ].filter(Boolean).join(' ').toLowerCase();

    for (const el of themeElements) {
      const signals = getThemeSignals(el);
      if (!signals) continue;
      if (/(^|[\s:_-])(light|day)([\s:_-]|$)/i.test(signals)) return false;
      if (/(^|[\s:_-])(dark|night|black)([\s:_-]|$)/i.test(signals)) return true;
    }

    const getOpaqueBackground = (el) => {
      let node = el;
      while (node && node !== document.documentElement.parentElement) {
        const bg = getComputedStyle(node).backgroundColor;
        const channels = bg.match(/\d+(\.\d+)?/g);
        if (channels && channels.length >= 3) {
          const alpha = channels.length >= 4 ? Number(channels[3]) : 1;
          if (alpha > 0) return channels.slice(0, 3).map(Number);
        }
        node = node.parentElement;
      }
      return null;
    };

    const rgb = themeElements.map(getOpaqueBackground).find(Boolean);
    if (rgb) {
      const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
      return lum < 0.5;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function buildPalette() {
    const isDark = detectDarkMode();
    if (isDark) {
      return {
        '--anchor-bg':            '#101012',
        '--anchor-bg-2':          '#121215',
        '--anchor-bg-3':          'rgba(255,255,255,0.08)',
        '--anchor-text':          '#f5f5f5',
        '--anchor-text-2':        '#a1a1aa',
        '--anchor-border':        '#2a2a2f',
        '--anchor-shadow':        'rgba(0,0,0,0.4)',
        '--anchor-dot-inactive':  'rgba(255,255,255,0.32)',
        '--anchor-dot-active':    '#f5f5f5',
        '--anchor-accent':        '#f5f5f5',
        '--anchor-accent-text':   '#111113',
        '--anchor-accent-num-bg': 'rgba(0,0,0,0.18)',
        '--anchor-panel-border-soft': '#2a2a2f',
        '--anchor-panel-shadow-strong': 'rgba(0,0,0,0.36)',
        '--anchor-panel-shadow-soft': 'rgba(0,0,0,0.28)',
        '--anchor-input-text':    '#f5f5f5',
        '--anchor-body-text':     '#d4d4d8',
        '--anchor-muted-icon':    '#8f8f96',
        '--anchor-muted-icon-strong': '#c5c5cb',
        '--anchor-item-text':     '#b0b0b7',
        '--anchor-item-hover':    'rgba(255,255,255,0.06)',
        '--anchor-workspace-bg':  '#0b0b0d',
        '--anchor-floating-bg':   '#18181b',
        '--anchor-floating-text': '#b7b7bd',
        '--anchor-floating-text-strong': '#ffffff',
        '--anchor-pane-border':   'rgba(245,245,245,0.12)',
        '--anchor-pane-bg':       '#141417',
        '--anchor-pane-shadow':   '0 0 0 1px rgba(255,255,255,0.04), 0 16px 34px rgba(0,0,0,0.36)',
        '--anchor-pane-handle-bg': 'rgba(24,24,27,0.96)',
        '--anchor-pane-handle-text': 'rgba(245,245,245,0.56)',
        '--anchor-pane-handle-shadow': '0 12px 28px rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.06)',
        '--anchor-pane-handle-text-hover': 'rgba(255,255,255,0.9)',
        '--anchor-pane-handle-shadow-hover': '0 14px 30px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)',
        '--anchor-pane-active-border': 'rgba(245,245,245,0.92)',
        '--anchor-pane-active-ring': 'rgba(245,245,245,0.14)',
        '--anchor-pane-active-glow': 'rgba(245,245,245,0.06)',
        '--anchor-pane-active-shadow': 'rgba(0,0,0,0.34)',
        '--anchor-pane-drag-shadow': 'rgba(0,0,0,0.48)',
        '--anchor-pane-placeholder-border': 'rgba(245,245,245,0.16)',
        '--anchor-pane-placeholder-bg': 'linear-gradient(180deg, rgba(30,30,34,0.92), rgba(18,18,21,0.96))',
        '--anchor-pane-placeholder-inset': 'rgba(255,255,255,0.05)',
        '--anchor-pane-placeholder-highlight': 'rgba(245,245,245,0.1)',
        '--anchor-toggle-track': '#3a3a40',
        '--anchor-toggle-thumb': '#ffffff',
        '--anchor-toggle-thumb-active': '#111113',
        '--anchor-toggle-active': '#f5f5f5',
        '--anchor-workspace-icon': '#c5c5cb',
      };
    } else {
      return {
        '--anchor-bg':            '#ffffff',
        '--anchor-bg-2':          '#ffffff',
        '--anchor-bg-3':          'rgba(0,0,0,0.04)',
        '--anchor-text':          '#09090b',
        '--anchor-text-2':        '#71717a',
        '--anchor-border':        '#e4e4e7',
        '--anchor-shadow':        'rgba(0,0,0,0.08)',
        '--anchor-dot-inactive':  '#cccccc',
        '--anchor-dot-active':    '#3a3a3a',
        '--anchor-accent':        '#18181b',
        '--anchor-accent-text':   '#fafafa',
        '--anchor-accent-num-bg': 'rgba(255,255,255,0.2)',
        '--anchor-panel-border-soft': '#ebebeb',
        '--anchor-panel-shadow-strong': 'rgba(0,0,0,0.1)',
        '--anchor-panel-shadow-soft': 'rgba(0,0,0,0.06)',
        '--anchor-input-text':    '#000000',
        '--anchor-body-text':     '#3d3d3d',
        '--anchor-muted-icon':    '#a3a3a3',
        '--anchor-muted-icon-strong': '#666666',
        '--anchor-item-text':     '#666666',
        '--anchor-item-hover':    'rgba(0,0,0,0.04)',
        '--anchor-workspace-bg':  '#f5f5f5',
        '--anchor-floating-bg':   '#ffffff',
        '--anchor-floating-text': '#4b4b4b',
        '--anchor-floating-text-strong': '#111111',
        '--anchor-pane-border':   'rgba(24,24,27,0.14)',
        '--anchor-pane-bg':       '#ffffff',
        '--anchor-pane-shadow':   '0 0 0 1px rgba(255,255,255,0.88), 0 10px 26px rgba(15,23,42,0.06)',
        '--anchor-pane-handle-bg': 'rgba(255,255,255,0.96)',
        '--anchor-pane-handle-text': 'rgba(24,24,27,0.54)',
        '--anchor-pane-handle-shadow': '0 10px 24px rgba(15,23,42,0.08), 0 0 0 1px rgba(255,255,255,0.82)',
        '--anchor-pane-handle-text-hover': 'rgba(24,24,27,0.82)',
        '--anchor-pane-handle-shadow-hover': '0 12px 26px rgba(15,23,42,0.11), 0 0 0 1px rgba(255,255,255,0.9)',
        '--anchor-pane-active-border': 'rgba(24,24,27,0.92)',
        '--anchor-pane-active-ring': 'rgba(24,24,27,0.16)',
        '--anchor-pane-active-glow': 'rgba(24,24,27,0.08)',
        '--anchor-pane-active-shadow': 'rgba(15,23,42,0.14)',
        '--anchor-pane-drag-shadow': 'rgba(15,23,42,0.24)',
        '--anchor-pane-placeholder-border': 'rgba(24,24,27,0.18)',
        '--anchor-pane-placeholder-bg': 'linear-gradient(180deg, rgba(255,255,255,0.82), rgba(245,245,245,0.92))',
        '--anchor-pane-placeholder-inset': 'rgba(255,255,255,0.86)',
        '--anchor-pane-placeholder-highlight': 'rgba(24,24,27,0.08)',
        '--anchor-toggle-track': '#d9d9de',
        '--anchor-toggle-thumb': '#ffffff',
        '--anchor-toggle-thumb-active': '#ffffff',
        '--anchor-toggle-active': '#3a3a3a',
        '--anchor-workspace-icon': '#4b4b4b',
      };
    }
  }

  function applyTheme() {
    const palette = buildPalette();
    const font = getComputedStyle(document.body).fontFamily;
    if (font) palette['--anchor-font'] = font;
    [panelElement, toggleButton, parallelWorkspaceElement, parallelHistoryPanel].filter(Boolean).forEach(el => {
      Object.entries(palette).forEach(([k, v]) => el.style.setProperty(k, v));
    });
  }

  function applyPlatformIdentity() {
    const platformName = currentPlatform?.name || '';
    [panelElement, toggleButton, parallelWorkspaceElement, parallelHistoryPanel].filter(Boolean).forEach((el) => {
      if (!el) return;
      if (platformName) {
        el.dataset.anchorPlatform = platformName;
      } else {
        delete el.dataset.anchorPlatform;
      }
    });
  }

  function setupThemeObserver() {
    const observer = new MutationObserver(debounce(applyTheme, 200));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'style']
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  }

  // ─────────────────────────────────────────────────────────

  // 初始化
  function init() {
    currentPlatform = detectPlatform();

    // 如果在 iframe 中运行（并行模式嵌入），只注册 postMessage 注入监听，不创建面板 UI
    if (isEmbeddedFrame) {
      if (currentPlatform) {
        document.body.classList.add('anchor-embedded-frame');
        window.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'AI_ANCHOR_INJECT') {
            injectQuestion(event.data.question).catch(err => {
              console.warn('[AI Chat Anchor] iframe 注入失败:', err);
            });
          }
        });
        document.addEventListener('pointerdown', () => {
          allowEmbeddedFrameFocus();
        }, true);
        document.addEventListener('keydown', () => {
          allowEmbeddedFrameFocus();
        }, true);
        document.addEventListener('focusin', () => {
          setTimeout(() => {
            enforceEmbeddedFrameFocusGuard('embedded-focusin');
          }, 0);
        }, true);
        window.addEventListener('focus', () => {
          setTimeout(() => {
            enforceEmbeddedFrameFocusGuard('embedded-window-focus');
          }, 0);
        });

        createPanel();
        createToggleButton();
        applyPlatformIdentity();
        applyTheme();
        setupThemeObserver();
        setupObserver();
        setupNavigationObserver();
        setTimeout(() => { refreshList(); applyTheme(); }, 2000);
      }
      return;
    }

    console.log('[AI Chat Anchor] 初始化，hostname:', window.location.hostname);

    if (!currentPlatform) {
      console.log('[AI Chat Anchor] 不支持的平台');
      return;
    }

    console.log('[AI Chat Anchor] 检测到平台:', currentPlatform.name);

    // 立即创建 UI
    createPanel();
    createToggleButton();
    applyPlatformIdentity();

    // 应用主题
    applyTheme();
    setupThemeObserver();

    // 点击面板外部关闭
    document.addEventListener('click', (e) => {
      if (isParallelModeOpen()) return;
      if (isPanelVisible && panelElement &&
          !panelElement.contains(e.target) &&
          toggleButton && !toggleButton.contains(e.target)) {
        hidePanel();
      }
    }, true);

    document.addEventListener('pointerdown', (e) => {
      if (!isParallelComposerPinned) return;
      if (parallelComposerArea?.contains(e.target)) return;
      stopParallelComposerFocusLock();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        stopParallelComposerFocusLock();
        if (parallelWorkspaceElement?.classList.contains('visible')) {
          closeParallelWorkspace();
        } else if (isPanelVisible) {
          hidePanel();
        }
      }
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type !== 'AI_ANCHOR_RESTORE_PARALLEL_FOCUS') return;
      scheduleParallelComposerRefocus(0);
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type !== 'AI_ANCHOR_PARALLEL_ACTIVITY') return;

      const sourceWindow = event.source;
      if (!sourceWindow || !parallelPanesContainer) return;

      const matchingFrame = Array.from(
        parallelPanesContainer.querySelectorAll('.parallel-pane-frame')
      ).find((frame) => frame.contentWindow === sourceWindow);

      const pane = matchingFrame?.closest('.ai-chat-anchor-parallel-pane');
      if (!(pane instanceof HTMLElement)) return;

      markParallelPaneUnread(pane);
      if (isParallelModeOpen()) {
        renderParallelPaneList();
      }
    });

    window.addEventListener('resize', () => {
      if (isPanelVisible) positionPanel();
    }, { passive: true });

    setupObserver();
    setupNavigationObserver();

    // 延迟扫描 QA 对，等待页面加载
    setTimeout(() => { refreshList(); applyTheme(); }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
