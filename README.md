# Pipeline

`Pipeline` 是一个面向 AI 聊天场景的 Chrome 扩展。点击浏览器工具栏中的插件图标，即可在当前页面开启并行对话工作区。

## 功能特性

- 自动识别当前 AI 平台并注入并行能力
- 点击浏览器插件栏图标直接开启并行模式
- 开启后直接显示当前对话和一个新的空白对话窗格
- 右上角加号可继续增加空白对话窗格
- 右上角列表按钮可展开或折叠窗口列表
- 支持在当前页面内新建并排对话
- 支持向新建对话自动注入问题
- 支持调整、聚焦和关闭并行窗格

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
- 当前页面内的并行工作区逻辑位于 [ai-chat-anchor/content.js](/Users/niallyoung/Desktop/Pipeline/ai-chat-anchor/content.js)
- 样式定义位于 [ai-chat-anchor/styles.css](/Users/niallyoung/Desktop/Pipeline/ai-chat-anchor/styles.css)

如果修改了扩展代码，回到扩展管理页点击“刷新”即可重新加载最新版本。

## 当前信息

- 扩展名称：`Pipeline`
- Manifest 版本：`3`
- 扩展版本：`1.7.0`
- 描述：`在 AI 聊天平台中开启并行对话工作区`

以上信息来自 [ai-chat-anchor/manifest.json](/Users/niallyoung/Desktop/Pipeline/ai-chat-anchor/manifest.json)。

## 许可证

本项目采用 [PolyForm Noncommercial 1.0.0](/Users/niallyoung/Desktop/Pipeline/LICENSE) 许可。

你可以出于非商业目的使用、学习、修改和分发本项目；如需商用，请先取得作者授权。
