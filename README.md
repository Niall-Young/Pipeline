# Pipeline

`Pipeline` 是一个面向 AI 聊天场景的 Chrome 扩展。它会在聊天页面生成对话导航目录，并提供并行提问能力，方便在多个 AI 会话之间快速切换、定位和对比回答。

## 功能特性

- 自动识别当前 AI 平台并注入页面能力
- 提取当前会话中的问答轮次，生成右侧导航目录
- 点击目录项后平滑跳转到对应消息位置
- 监听页面内容变化，新增消息后自动刷新目录
- 提供弹窗控制面板，可直接开启或关闭并行模式
- 支持在当前页面内新建并排对话
- 支持从后台为多个新会话批量注入问题
- 使用 `tabGroups` 对新建并行标签页进行分组

## 支持平台

- Claude
- ChatGPT
- Gemini
- 豆包
- 千问

## 项目结构

```text
Pipeline/
├── README.md
├── SPEC.md
└── ai-chat-anchor/
    ├── manifest.json
    ├── background.js
    ├── content.js
    ├── popup.html
    ├── popup.js
    ├── parallel.html
    ├── parallel.js
    ├── styles.css
    ├── rules.json
    ├── icons/
    └── scripts/
```

## 安装方式

目前项目无需构建，直接以解压扩展方式加载即可。

1. 打开 Chrome，进入 `chrome://extensions/`
2. 打开右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择目录 [ai-chat-anchor](/Users/niallyoung/Desktop/Pipeline/ai-chat-anchor)

## 开发说明

- 扩展基于 Chrome Extension Manifest V3
- 主要页面注入逻辑位于 [ai-chat-anchor/content.js](/Users/niallyoung/Desktop/Pipeline/ai-chat-anchor/content.js)
- 后台逻辑位于 [ai-chat-anchor/background.js](/Users/niallyoung/Desktop/Pipeline/ai-chat-anchor/background.js)
- 弹窗交互逻辑位于 [ai-chat-anchor/popup.js](/Users/niallyoung/Desktop/Pipeline/ai-chat-anchor/popup.js)
- 并行工作区逻辑位于 [ai-chat-anchor/parallel.js](/Users/niallyoung/Desktop/Pipeline/ai-chat-anchor/parallel.js)
- 样式定义位于 [ai-chat-anchor/styles.css](/Users/niallyoung/Desktop/Pipeline/ai-chat-anchor/styles.css)

如果修改了扩展代码，回到扩展管理页点击“刷新”即可重新加载最新版本。

## 当前信息

- 扩展名称：`Pipeline`
- Manifest 版本：`3`
- 扩展版本：`1.5.0`
- 描述：`在 AI 聊天平台右侧显示对话目录锚点，并支持并行多窗口提问`

以上信息来自 [ai-chat-anchor/manifest.json](/Users/niallyoung/Desktop/Pipeline/ai-chat-anchor/manifest.json)。

## 许可证

本项目采用 [PolyForm Noncommercial 1.0.0](/Users/niallyoung/Desktop/Pipeline/LICENSE) 许可。

你可以出于非商业目的使用、学习、修改和分发本项目；如需商用，请先取得作者授权。
