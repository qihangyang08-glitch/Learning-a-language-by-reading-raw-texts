# Codex 多 Agent 协作与环境对齐说明

本文用于约定 JaReader 后续迭代的协作方式。目标是让多个 Codex agent 可以相对自主地完成任务，同时把上下文、环境、验收标准和人工实机测试边界说清楚。

## 1. 基本原则

- 业务代码主工作尽可能由 VS Code / Codex agent 完成。
- Android Studio 主要作为原生环境、Gradle 同步、真机构建和最终手动验证工具。
- 每个 agent 完成自己任务后，应在能力范围内完成静态检查、局部验证和变更说明。
- 最终实机体验验证由项目维护者在 Android Studio 或真机环境中统一完成。
- 仓库已有 `AGENTS.md` 约束：写 Expo / React Native 代码前必须先阅读 Expo v57.0.0 对应文档。

## 2. 环境对齐清单

开始任何代码任务前，主 agent 应先确认以下信息：

- 当前目录：项目根目录 `C:\Users\a\Desktop\learn-jaReading-by-novel`。
- Node 版本：Expo SDK 57 要求 Node.js 22.13.x 或兼容更高版本。
- 依赖状态：`node_modules` 存在时优先使用本地依赖；缺失时运行 `npm install`。
- Expo 版本：以 `package.json` 中 `expo ~57.0.8` 为准。
- Android 原生工程：仓库已提交 `android/`，Android Studio 打开 `android` 目录即可。
- Android SDK：compileSdk / targetSdk 应与 Expo SDK 57 预期保持一致，目前项目为 SDK 36。
- 当前 git 状态：开始任务前运行 `git status --short`，不要回滚用户已有改动。

建议每个任务开工前运行：

```powershell
git status --short
npx tsc --noEmit
```

如果任务涉及 Android 构建，再按需要运行：

```powershell
cd android
.\gradlew.bat assembleDebug
```

## 3. Codex 的“目标”和多 Agent 的关系

“目标”不是多 agent 开关。目标更适合表达一个需要持续推进的长期 objective，例如“完成 JaReader 下一阶段 P0 迭代”。它可以帮助主 agent 在上下文压缩或长任务中保持方向，但不会自动把任务拆给多个 agent。

多 agent 协作应由主 agent 显式发起：先把任务拆成互不冲突的子任务，再把独立子任务交给子 agent。子 agent 的产物需要由主 agent 汇总、审查、整合和验证。

建议使用方式：

- 如果只是一个小任务：不要开启目标，也不要多 agent。
- 如果是一个明确的大阶段：可以开启一个目标，用来持续追踪总任务。
- 如果存在多个相互独立的模块：由主 agent 拆分后并行委派给子 agent。
- 如果任务会修改同一文件，例如 `app/reader/[bookId].tsx` 或 `SettingsOverlay.tsx`：不要让多个 agent 同时改同一文件，先分顺序。

在当前协作中，推荐让主 agent 作为“集成者”，子 agent 作为“专题研究/实现者”。

## 4. 上下文过长怎么办

上下文过长不是致命问题。Codex 会在需要时压缩上下文，但压缩后可能丢失细节。因此大型任务需要把关键状态写入仓库文档，而不是只留在聊天里。

推荐做法：

- 每个阶段开始前写清楚任务边界和验收标准。
- 每个阶段完成后更新对应文档或任务清单。
- 关键设计决策写入 `docs/`，不要只存在聊天上下文里。
- 新开对话时，把当前阶段文档和相关文件路径交给新 agent 即可继续。
- 如果遇到上下文切换，主 agent 先重读当前阶段文档、`AGENTS.md`、`package.json` 和相关源码，再继续。

建议后续新增：

- `docs/iteration-plan.md`：阶段计划和任务状态。
- `docs/tts-setup.md`：Google TTS、Azure TTS、Google Cloud TTS 配置说明。
- `docs/testing-checklist.md`：每个模块的自动检查和实机测试清单。

## 5. 云 TTS Key 未申请时的开发策略

Azure TTS 和 Google Cloud TTS 暂时没有 API Key，因此不能把真实服务调用作为第一验收条件。实现时应先完成模块边界，让后续拿到 Key 后只需要填配置验证。

TTS 模块建议拆成：

- `TtsProvider` 接口：统一 `speak`、`stop`、`getStatus`、`estimateUsage` 等能力。
- `SystemTtsProvider`：主线本地方案，依赖系统 TTS，设置页指导安装 Google 文字转语音和日语语音包。
- `AzureTtsProvider`：云端可选方案，先实现请求封装、配置存储、错误处理和用量估算。
- `GoogleCloudTtsProvider`：云端可选方案，同样先实现封装和配置，不强依赖真实 Key。
- `EdgeDevTtsProvider`：保留开发者隐藏入口，默认不探测、不展示、不启动。
- `TtsUsageTracker`：本地记录每月已合成字符数，用于估算用量。

设置页不应承诺显示真实余额。真实余额和账单一般需要云账号级权限，不适合移动端用普通 API Key 查询。设置页可显示“本地估算用量”，并提供官方控制台或项目文档链接。

## 6. 推荐任务拆分

### Agent A：TTS 架构

范围：

- 重构 `src/services/tts.ts`。
- 新增 TTS provider 抽象。
- 默认关闭 Edge TTS 探测。
- 增加本地 Google TTS 指引。
- 为 Azure / Google Cloud 预留模块和 SecureStore key。

避免：

- 不要在没有 Key 的情况下强行做真实云端验收。
- 不要删除 Edge 服务端目录，先隐藏和降级即可。

### Agent B：翻译交互

范围：

- 重构 reader 翻译状态机。
- 实现 hidden / current / stale 三态。
- 翻页时保留旧卡片，但按钮状态反映当前句是否已显示。
- 点击翻译按钮时优先读取本地缓存，无缓存再请求大模型。

重点文件：

- `app/reader/[bookId].tsx`
- `src/store/readerStore.ts`
- `src/components/reader/NotebookCard.tsx`

### Agent C：查词与滑动选择

范围：

- 改善 `TextCard` 的触摸定位。
- 从 token 命中逐步过渡到字符 index 命中。
- 点击查询采用“覆盖点击点的候选片段 + 词典最长匹配”。
- 滑动选择加入 Y 轴行判定，提升手动选择精度。

重点文件：

- `src/components/reader/TextCard.tsx`
- `src/services/dictionary.ts`
- `src/services/tokenizer.ts`

### Agent D：罗马音注音

范围：

- 新增注音按钮和缓存表。
- 设计 LLM JSON 输出格式。
- 解析罗马音并在原文上方展示。
- 第一版以稳定可用为主，不追求完美逐字符 ruby 排版。

依赖：

- 翻译/LLM 配置稳定后再做。

### Agent E：TTS 智能断句

范围：

- 新增日语朗读前分块工具。
- 长句拆成 2-4 个短块。
- TTS 播放队列中间插入短暂停顿。
- 对所有 provider 复用同一分句层。

## 7. 每个 Agent 的交付格式

每个 agent 完成任务后，应提交以下信息给主 agent：

- 修改了哪些文件。
- 实现了哪些行为。
- 哪些地方是 mock、预留或等待真实 API Key 验证。
- 运行了哪些检查命令。
- 还需要实机验证哪些点。
- 是否发现和其他模块冲突。

## 8. 验收分层

自动验证：

- `npx tsc --noEmit`
- 纯函数逻辑可用小脚本或临时测试验证。
- Android 构建可选运行 `.\gradlew.bat assembleDebug`。

手动实机验证：

- 导入 TXT / EPUB。
- 翻页、纲目跳转、书签。
- 点按查词、滑动选词。
- 翻译按钮三态行为。
- 系统 Google TTS 朗读。
- 云 TTS 在拿到 Key 后验证。
- 罗马音注音布局。
- 横屏、单手模式、长句 TTS 断句。

## 9. 推荐开工顺序

1. 环境确认和文档补齐。
2. TTS 主线重构：Google TTS 离线优先，Edge 隐藏。
3. 翻译交互三态重构。
4. 查词和滑动选择修缮。
5. Azure / Google Cloud TTS 模块化接入。
6. TTS 智能断句。
7. 罗马音注音。
8. Android Studio 同步构建和实机总测。

这个顺序的原因是：TTS 和翻译是当前用户体验最明显的问题；查词交互改动风险较高，适合单独推进；云 TTS 和罗马音依赖外部服务，适合在基础体验稳定后接入。
