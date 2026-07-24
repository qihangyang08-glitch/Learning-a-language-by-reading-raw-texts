# JaReader 下一阶段迭代计划

更新时间：2026-07-24

## 当前阶段边界

本阶段优先处理用户体验最明显、且彼此可相对独立推进的三项 P0/P1 工作：

1. TTS 主线重构：系统 Google TTS 离线优先，Edge TTS 降为隐藏开发入口，并为云 TTS 预留 provider 边界。
2. 翻译交互三态：区分 hidden / current / stale，翻页后保留旧译文卡片，但翻译按钮准确反映当前句状态。
3. 查词与滑动选择修缮：提升触摸命中、字符位置映射、最长匹配和跨行选择精度。

罗马音注音与 TTS 智能断句暂缓到基础 TTS、翻译和查词体验稳定后再接入。

## 多 Agent 分工

### Agent A：TTS 架构

状态：进行中

写入范围：

- `src/services/tts.ts`
- 必要时小幅调整设置相关文件

验收：

- `expo-speech` 系统 TTS 是默认方案。
- Edge TTS 默认不探测、不优先展示，只作为开发者入口保留。
- Azure / Google Cloud TTS provider、配置 key、错误处理和用量估算边界清楚。
- 没有真实云 Key 时不要求云端真实合成成功。

### Agent B：翻译交互

状态：进行中

写入范围：

- `app/reader/[bookId].tsx`
- `src/store/readerStore.ts`
- `src/components/reader/NotebookCard.tsx`

验收：

- 翻译显示状态包含 hidden / current / stale。
- 翻页后旧译文卡片可保留为 stale。
- 翻译按钮状态以当前句是否已有可显示译文为准。
- 点击翻译优先读取本地缓存，无缓存才请求 DeepSeek。

### Agent C：查词与滑动选择

状态：进行中

写入范围：

- `src/components/reader/TextCard.tsx`
- `src/services/dictionary.ts`
- `src/services/tokenizer.ts`

验收：

- 单击命中尽量根据点击字符位置而不是只按 token 粗略命中。
- 点击查询使用覆盖点击点的候选片段并做词典最长匹配。
- 滑动选择支持 Y 轴行判定，跨行选择更稳定。

## 暂缓任务

### Agent D：罗马音注音

状态：暂缓

原因：依赖翻译 / LLM 配置稳定。第一版建议只做句级注音缓存和稳定展示，不追求逐字符 ruby 排版。

### Agent E：TTS 智能断句

状态：暂缓

原因：应在 TTS provider 边界稳定后再接入统一分块层，避免和 TTS 架构重构同时改同一文件。

## 自动验证

每轮集成后至少运行：

```powershell
npx tsc --noEmit
```

涉及 Android 原生配置或最终出包时再运行：

```powershell
cd android
.\gradlew.bat assembleDebug
```

## 手动实机验证边界

最终体验验证由项目维护者在 Android Studio 或 Android 真机环境完成，重点覆盖：

- TXT / EPUB 导入。
- 翻页、目录跳转、书签。
- 翻译按钮三态行为。
- 点按查词和滑动选词。
- 系统 Google TTS 日语朗读。
- 横屏和单手模式布局。
