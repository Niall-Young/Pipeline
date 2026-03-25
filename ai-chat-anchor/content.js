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
      userMessageSelector: 'user-query, [role="user-message"], [data-message-author="user"], [data-role="user"], [class*="user-query"]',
      aiMessageSelector: 'model-response, [role="model-message"], [data-message-author="model"], [data-role="model"], [class*="model-response"], [class*="response-content"]',
      messageSelector: 'user-query, model-response, [role="listitem"], [class*="conversation-item"], [class*="message"]',
      containerSelector: '[role="feed"], [role="log"], main, [role="main"]',
      getMessageText: (el) => {
        const text = el.textContent.trim().replace(/\s+/g, ' ');
        return text.substring(0, 100);
      },
      inputSelector: '.ql-editor[contenteditable="true"], rich-textarea [contenteditable="true"], [contenteditable="true"]',
      sendSelector: 'button[aria-label*="Send"], button.send-button, mat-icon-button[aria-label*="Send"]',
      inputType: 'contenteditable',
    },
    doubao: {
      hostname: /doubao\.com/,
      displayName: '豆包',
      launchUrl: 'https://www.doubao.com/chat/',
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
  let parallelComposerArea = null;
  let parallelComposerInput = null;
  let isParallelComposerPinned = false;
  let parallelComposerRefocusTimer = null;
  let pendingParallelAnimation = '';
  let activeIndexSyncFrame = null;
  let lastKnownHref = window.location.href;
  let lastKnownTitle = document.title;
  const PANEL_HIDE_DELAY = 140;
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
    const heuristicMessages = collectMessagesWithHeuristics();
    const directPairs = buildQAPairs(directMessages);
    const heuristicPairs = buildQAPairs(heuristicMessages);

    return heuristicPairs.length > directPairs.length ? heuristicPairs : directPairs;
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

    const header = document.createElement('div');
    header.className = 'ai-chat-anchor-header';
    header.innerHTML = `
      <span>问答目录</span>
      <button class="ai-chat-anchor-close" title="收起">×</button>
    `;

    // 搜索框
    const searchContainer = document.createElement('div');
    searchContainer.className = 'ai-chat-anchor-search';
    searchContainer.innerHTML = `
      <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      <input type="text" placeholder="搜索问答..." id="ai-chat-anchor-input">
      <button class="search-clear" title="清除">×</button>
    `;

    const list = document.createElement('div');
    list.className = 'ai-chat-anchor-list';
    list.id = 'ai-chat-anchor-list';

    // 并行模式输入区（默认隐藏）
    const parallelArea = document.createElement('div');
    parallelArea.className = 'ai-chat-anchor-parallel';
    parallelArea.id = 'ai-chat-anchor-parallel';
    parallelArea.innerHTML = `
      <div class="parallel-area-header">
        <span class="parallel-area-title">新建对话</span>
        <span class="parallel-area-hint">在当前页新增并排对话，Enter 发送</span>
      </div>
      <textarea class="parallel-area-input" id="parallel-input" placeholder="输入问题，Enter 发送，Shift+Enter 换行..." rows="3"></textarea>
      <div class="parallel-area-actions">
        <span class="parallel-area-count" id="parallel-count"></span>
        <button class="parallel-area-send" id="parallel-send" disabled>新建对话</button>
      </div>
    `;

    const footer = document.createElement('div');
    footer.className = 'ai-chat-anchor-footer';
    footer.innerHTML = `
      <span class="footer-count">共 <span id="qa-count">0</span> 轮对话</span>
      <button class="parallel-toggle" id="parallel-toggle" title="并行模式" aria-pressed="false">
        <span class="parallel-toggle-main">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>
          </svg>
          <span class="parallel-toggle-label">并行模式</span>
        </span>
        <span class="toggle-indicator" aria-hidden="true"></span>
      </button>
    `;

    panelElement.appendChild(header);
    panelElement.appendChild(searchContainer);
    panelElement.appendChild(list);
    panelElement.appendChild(parallelArea);
    panelElement.appendChild(footer);
    document.body.appendChild(panelElement);

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
      filterList(e.target.value);
      clearBtn.classList.toggle('visible', e.target.value.length > 0);
    }, 150));

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      filterList('');
      clearBtn.classList.remove('visible');
      searchInput.focus();
    });

    // 绑定关闭事件
    header.querySelector('.ai-chat-anchor-close').addEventListener('click', hidePanel);

    // 并行模式 toggle
    const toggleBtn = footer.querySelector('#parallel-toggle');
    const parallelInputArea = panelElement.querySelector('#ai-chat-anchor-parallel');
    parallelComposerArea = parallelInputArea;

    if (!isEmbeddedFrame) {
      toggleBtn.addEventListener('click', () => {
        if (isParallelModeOpen()) {
          closeParallelWorkspace();
          return;
        }

        openParallelWorkspace();
        ensureSourceParallelPane();
        updateParallelPaneCount();
        setTimeout(() => panelElement.querySelector('#parallel-input')?.focus(), 50);
      });
    }

    // 并行发送 - 在当前标签页内追加并行窗格
    const parallelSendBtn = panelElement.querySelector('#parallel-send');
    const parallelInput = panelElement.querySelector('#parallel-input');
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
      parallelInput.focus();
    };

    syncParallelComposer();
    updateParallelPaneCount();

    if (!isEmbeddedFrame) {
      parallelInput.addEventListener('input', syncParallelComposer);
      parallelInput.addEventListener('focus', () => {
        isParallelComposerPinned = true;
        clearParallelComposerRefocusTimer();
      });
      parallelInput.addEventListener('blur', () => {
        scheduleParallelComposerRefocus();
      });
      parallelSendBtn.addEventListener('click', sendParallelQuestion);

      // Enter 发送，Shift+Enter 换行
      parallelInput.addEventListener('keydown', (e) => {
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

  function stopParallelComposerFocusLock() {
    isParallelComposerPinned = false;
    clearParallelComposerRefocusTimer();
  }

  function shouldRestoreParallelComposerFocus() {
    if (isEmbeddedFrame || !isParallelComposerPinned || !parallelComposerInput) return false;
    if (document.visibilityState !== 'visible') return false;
    if (document.activeElement === parallelComposerInput) return false;
    if (parallelComposerArea && parallelComposerArea.contains(document.activeElement)) return false;
    return true;
  }

  function scheduleParallelComposerRefocus(delay = 80) {
    clearParallelComposerRefocusTimer();
    parallelComposerRefocusTimer = setTimeout(() => {
      if (!shouldRestoreParallelComposerFocus()) return;
      parallelComposerInput.focus({ preventScroll: true });
    }, delay);
  }

  function playParallelToggleAnimation(isOpening) {
    const toggleBtn = panelElement?.querySelector('#parallel-toggle');
    if (!toggleBtn) return;

    const className = isOpening ? 'animating-on' : 'animating-off';
    toggleBtn.classList.remove('animating-on', 'animating-off');
    void toggleBtn.offsetWidth;
    toggleBtn.classList.add(className);

    clearTimeout(toggleBtn.__anchorToggleTimer);
    toggleBtn.__anchorToggleTimer = setTimeout(() => {
      toggleBtn.classList.remove(className);
    }, 380);
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
        <div class="parallel-workspace-toolbar">
          <div class="parallel-workspace-meta">
            <span class="parallel-workspace-title">并行回答</span>
            <span class="parallel-workspace-subtitle">左侧保留当前对话，右侧新增并行会话</span>
          </div>
          <div class="parallel-workspace-actions">
            <span class="parallel-workspace-count">未打开窗格</span>
            <button class="parallel-workspace-close" title="关闭并行区">×</button>
          </div>
        </div>
        <div class="parallel-workspace-panes" id="ai-chat-anchor-parallel-panes">
          <div class="parallel-workspace-empty" id="ai-chat-anchor-parallel-empty">
            <div class="parallel-workspace-empty-icon">∥</div>
            <p>从右侧输入问题后，这里会在当前标签页内并排打开回答。</p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(parallelWorkspaceElement);
    parallelPanesContainer = parallelWorkspaceElement.querySelector('#ai-chat-anchor-parallel-panes');
    parallelEmptyState = parallelWorkspaceElement.querySelector('#ai-chat-anchor-parallel-empty');

    parallelWorkspaceElement
      .querySelector('.parallel-workspace-close')
      .addEventListener('click', closeParallelWorkspace);

    parallelWorkspaceElement.addEventListener('click', (e) => {
      if (e.target === parallelWorkspaceElement) {
        closeParallelWorkspace();
      }
    });
  }

  function isParallelModeOpen() {
    return !isEmbeddedFrame && !!parallelWorkspaceElement?.classList.contains('visible');
  }

  function syncPanelMode() {
    if (!panelElement || isEmbeddedFrame) return;

    const titleEl = panelElement.querySelector('.ai-chat-anchor-header span');
    const searchEl = panelElement.querySelector('.ai-chat-anchor-search');
    const listEl = panelElement.querySelector('#ai-chat-anchor-list');
    const parallelEl = panelElement.querySelector('#ai-chat-anchor-parallel');
    const toggleBtn = panelElement.querySelector('#parallel-toggle');

    if (isParallelModeOpen()) {
      panelElement.classList.add('parallel-mode', 'visible');
      isPanelVisible = true;
      if (titleEl) titleEl.textContent = '并行工作台';
      if (searchEl) searchEl.style.display = 'none';
      if (parallelEl) parallelEl.classList.add('visible');
      if (toggleBtn) {
        toggleBtn.classList.add('active');
        toggleBtn.setAttribute('aria-pressed', 'true');
      }
      renderParallelPaneList();
    } else {
      panelElement.classList.remove('parallel-mode');
      if (titleEl) titleEl.textContent = '问答目录';
      if (searchEl) searchEl.style.display = '';
      if (parallelEl) parallelEl.classList.remove('visible');
      if (toggleBtn) {
        toggleBtn.classList.remove('active');
        toggleBtn.setAttribute('aria-pressed', 'false');
      }
      refreshList(searchInput ? searchInput.value : '');
    }

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
    document.body.classList.add('anchor-parallel-open');
    parallelWorkspaceElement.classList.add('visible');
    if (!wasOpen) pendingParallelAnimation = 'opening';
    applyTheme();
    syncPanelMode();
    updateParallelPaneCount();
  }

  function closeParallelWorkspace() {
    if (!parallelWorkspaceElement) return;
    const wasOpen = isParallelModeOpen();

    stopParallelComposerFocusLock();
    document.body.classList.remove('anchor-parallel-open');
    parallelPanesContainer
      ?.querySelectorAll('.ai-chat-anchor-parallel-pane')
      ?.forEach((pane) => pane.remove());

    parallelWorkspaceElement.classList.remove('visible');
    if (wasOpen) pendingParallelAnimation = 'closing';
    parallelPaneSeq = 0;
    if (parallelEmptyState) parallelEmptyState.style.display = '';
    syncPanelMode();
    updateParallelPaneCount();
  }

  function updateParallelPaneCount() {
    const paneCount = parallelPanesContainer
      ? parallelPanesContainer.querySelectorAll('.ai-chat-anchor-parallel-pane').length
      : 0;

    const sideCountEl = panelElement?.querySelector('#parallel-count');
    if (sideCountEl) {
      sideCountEl.innerHTML = paneCount > 0
        ? `当前 <b>${paneCount}</b> 个对话窗格`
        : '将在当前页内新增并排对话';
    }

    const workspaceCountEl = parallelWorkspaceElement?.querySelector('.parallel-workspace-count');
    if (workspaceCountEl) {
      workspaceCountEl.textContent = paneCount > 0 ? `${paneCount} 个窗格` : '未打开窗格';
    }

    if (isParallelModeOpen()) {
      renderParallelPaneList();
    }
  }

  function removeParallelPane(pane) {
    if (!pane) return;

    pane.remove();
    const hasPaneLeft = !!parallelPanesContainer?.querySelector('.ai-chat-anchor-parallel-pane');
    if (!hasPaneLeft) {
      closeParallelWorkspace();
      return;
    }
    updateParallelPaneCount();
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

    pane.innerHTML = `
      <div class="parallel-pane-header">
        <div class="parallel-pane-meta">
          <span class="parallel-pane-title">${escapeHtml(title)} · 窗格 ${seq}</span>
          <span class="parallel-pane-question" title="${escapeAttr(tooltip)}">${escapeHtml(subtitle)}</span>
        </div>
        <button class="parallel-pane-close" title="关闭窗格">×</button>
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

    pane.querySelector('.parallel-pane-close').addEventListener('click', () => {
      removeParallelPane(pane);
    });

    pane.appendChild(iframe);
    parallelPanesContainer?.appendChild(pane);
    return pane;
  }

  function renderParallelPaneList() {
    if (!panelElement || !isParallelModeOpen()) return;

    const list = panelElement.querySelector('#ai-chat-anchor-list');
    const countEl = panelElement.querySelector('#qa-count');
    if (!list) return;

    const panes = Array.from(parallelPanesContainer?.querySelectorAll('.ai-chat-anchor-parallel-pane') || []);
    if (countEl) countEl.textContent = String(panes.length);

    list.innerHTML = '';
    if (panes.length === 0) {
      list.innerHTML = '<div class="ai-chat-anchor-empty">还没有对话窗格</div>';
      return;
    }

    panes.forEach((pane, index) => {
      const item = document.createElement('div');
      item.className = 'ai-chat-anchor-item parallel-pane-item';

      const subtitle = pane.dataset.paneSubtitle || `窗格 ${index + 1}`;
      const tooltip = pane.dataset.paneTooltip || subtitle;

      item.innerHTML = `
        <span class="qa-number">${index + 1}</span>
        <span class="qa-text">${escapeHtml(subtitle)}</span>
        <button class="parallel-pane-delete" type="button" title="删除这个窗格" aria-label="删除这个窗格">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18"/>
            <path d="M8 6V4h8v2"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
          </svg>
        </button>
      `;
      item.title = tooltip;

      const deleteBtn = item.querySelector('.parallel-pane-delete');
      deleteBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        removeParallelPane(pane);
      });

      item.addEventListener('click', () => {
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
        <span class="qa-number">${index + 1}</span>
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
        '--anchor-bg':            '#09090b',
        '--anchor-bg-2':          '#09090b',
        '--anchor-bg-3':          'rgba(255,255,255,0.08)',
        '--anchor-text':          '#fafafa',
        '--anchor-text-2':        '#a1a1aa',
        '--anchor-border':        '#27272a',
        '--anchor-shadow':        'rgba(0,0,0,0.5)',
        '--anchor-dot-inactive':  'rgba(255,255,255,0.2)',
        '--anchor-dot-active':    '#fafafa',
        '--anchor-accent':        '#fafafa',
        '--anchor-accent-text':   '#09090b',
        '--anchor-accent-num-bg': 'rgba(0,0,0,0.2)',
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
        '--anchor-dot-inactive':  'rgba(0,0,0,0.15)',
        '--anchor-dot-active':    '#09090b',
        '--anchor-accent':        '#18181b',
        '--anchor-accent-text':   '#fafafa',
        '--anchor-accent-num-bg': 'rgba(255,255,255,0.2)',
      };
    }
  }

  function applyTheme() {
    const palette = buildPalette();
    const font = getComputedStyle(document.body).fontFamily;
    if (font) palette['--anchor-font'] = font;
    [panelElement, toggleButton, parallelWorkspaceElement].filter(Boolean).forEach(el => {
      Object.entries(palette).forEach(([k, v]) => el.style.setProperty(k, v));
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

        createPanel();
        createToggleButton();
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
