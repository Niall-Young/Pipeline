# AI Chat Anchor - Chrome 插件规范

## 1. 项目概述

- **项目名称**: AI Chat Anchor
- **类型**: Chrome 扩展程序
- **核心功能**: 在主流 AI 聊天平台右侧显示对话目录锚点，支持快速跳转
- **目标用户**: 频繁使用 AI 聊天工具的用户

## 2. 功能规范

### 2.1 支持的 AI 平台

| 平台 | 域名 | 对话选择器 |
|------|------|------------|
| Claude | claude.ai | `.conversation-list-item`, `[data-testid="conversation-item"]` |
| ChatGPT | chatgpt.com | `li[data-testid^="conversation-turn"]`, `.group` |
| Gemini | gemini.google.com | `[role="listitem"]`, `.conversation-item` |
| 豆包 | doubao.com | `.conversation-item`, `[data-testid="chat-item"]` |
| 千问 | qianwen.com | `.message-item`, `.conversation-item` |

### 2.2 核心功能

1. **对话目录提取**
   - 自动扫描页面中的对话列表
   - 提取对话标题或首条消息内容作为目录项
   - 实时监听页面变化，动态更新目录

2. **侧边锚点面板**
   - 固定在页面右侧
   - 显示所有对话项的列表
   - 点击任意项平滑滚动到对应位置
   - 可展开/收起

3. **智能识别**
   - 自动检测当前所在平台
   - 根据不同平台使用对应的选择器
   - 支持新对话和历史对话

### 2.3 UI/UX 规范

**面板样式**
- 宽度: 280px
- 背景: `#1a1a2e` (深蓝黑色)
- 边框: `1px solid #16213e`
- 圆角: 8px
- 位置: 固定右侧，距顶部 80px

**目录项样式**
- 高度: 自适应，最小 40px
- 内边距: 12px 16px
- 悬停背景: `#0f3460`
- 选中背景: `#e94560`
- 文字颜色: `#eaeaea`
- 字号: 13px
- 超出省略: ellipsis

**按钮样式**
- 触发按钮: 圆形，直径 40px
- 背景: `#e94560`
- 图标: 白色目录图标
- 悬停: 放大 1.1 倍

**动画**
- 面板展开/收起: 300ms ease
- 滚动跳转: 500ms smooth
- 悬停效果: 150ms

## 3. 技术实现

### 3.1 文件结构
```
ai-chat-anchor/
├── manifest.json
├── popup.html
├── popup.js
├── content.js
├── background.js
├── styles.css
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### 3.2 核心逻辑

**content.js**
- 使用 MutationObserver 监听 DOM 变化
- 根据域名匹配对应的选择器
- 构建对话目录数据结构
- 注入侧边面板 DOM
- 绑定点击事件实现平滑滚动

**popup.js**
- 插件开关控制
- 面板显示/隐藏切换
- 设置同步

**background.js**
- 跨页面通信
- 存储用户设置

## 4. 验收标准

- [ ] 插件成功安装并显示图标
- [ ] 在 Claude 页面正确显示对话目录
- [ ] 在 ChatGPT 页面正确显示对话目录
- [ ] 在 Gemini 页面正确显示对话目录
- [ ] 在豆包页面正确显示对话目录
- [ ] 在千问页面正确显示对话目录
- [ ] 点击目录项能平滑滚动到对应位置
- [ ] 新增对话时目录自动更新
- [ ] 面板可以展开/收起
- [ ] 样式美观，与深色主题协调
