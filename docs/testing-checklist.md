# JaReader 测试清单

更新时间：2026-07-24

## 自动检查

每次集成后运行：

```powershell
npx tsc --noEmit
```

涉及 Android 原生工程、Expo 配置或最终出包时运行：

```powershell
cd android
.\gradlew.bat assembleDebug
```

## 分阶段要求

每个模块完成后，至少要有一次局部验证说明：

- `git status --short`
- `npx tsc --noEmit`
- 新增纯函数脚本级验证，或明确说明为何不需要
- mock / 预留 / 等待真机验证的范围
- 与其他模块的冲突风险

整体交付前，主 agent 还要补一次总验收：

- 汇总各 Agent 结果
- `npx tsc --noEmit`
- `git diff --check`
- 必要时 `cd android; .\gradlew.bat assembleDebug`
- 更新测试清单和性能 / 精准度报告

## 阅读基础流程

- 导入 `.txt` 文件。
- 导入 `.epub` 文件。
- 翻到上一句 / 下一句。
- 打开目录并跳转。
- 添加和取消书签。
- 退出阅读页后重新进入，进度正确恢复。

## 稳定性与性能

- 运行 Node 基准：`node scripts\release-performance-smoke.mjs`。
- 记录 TXT / EPUB parse、segment、SQLite 写入耗时和句子数量。
- 记录 `loadSentenceWindow` p50 / p95 / p99。
- 记录 `getCachedTranslations` p50 / p95 / p99。
- 记录词典 JSON 读取、解析、批量导入耗时；FTS5 构建在 Android 真机采样。
- 参考 `docs/performance-test-report.md` 执行 `adb shell dumpsys meminfo com.jareader.app` 导入前 / 导入中 / 导入后采样。
- 用 Android Studio Profiler 观察首次词典初始化、TXT 导入、EPUB 导入、连续翻页期间是否有明显 UI 卡顿。

## 翻译

- 未配置 DeepSeek API Key 时，点击翻译不影响查词、TTS 和翻页。
- 当前句首次点击翻译时显示加载状态。
- 当前句有缓存时优先显示缓存，不重复请求。
- 翻页后旧翻译卡片保留为 stale。
- 翻译按钮状态反映当前句是否显示译文。
- 网络失败时展示可理解的错误文本。

## 查词与选择

- 点按假名、汉字、片假名都能查询。
- 未收录词显示明确提示。
- 发布前运行 `node scripts/dictionary-benchmark.mjs --samples 500 --manual 100 --write-report`，确认固定种子样本、命中率、p50 / p95 / p99 耗时和查询次数分布已更新。
- 人工标注 `docs/dictionary-benchmark-report.md` 中至少 100 条 JSONL 样本，统计 `useful` / `not_useful` / `missing` / `wrong_hit`。
- Android 真机随机点按测试 TXT，查词响应 p95 目标先按 50ms 内验收；若超出，记录设备、样本、命中词和 exact / prefix 查询次数。
- 滑动选择单行词组。
- 滑动选择跨行词组。
- 纵向滚动不会误触发选词。

## TTS

- 未配置 Edge 服务时默认走系统 TTS。
- 系统 Google TTS 能朗读日语句子。
- 朗读中点击停止后状态回到 idle。
- Android 上暂停 / 恢复不可用时 UI 不崩溃。
- 设置页能提示日语声线选择和低速颤音风险。
- 同一词不应因 ruby 残留被重复朗读。
- 云 TTS 未配置 Key 时不发起真实请求。

## 罗马音注音

- 当前句点击注音后进入 loading。
- 有缓存时优先读取缓存。
- 非 JSON、漏字段、空数组输出不会崩溃。
- 翻页后旧注音保留为 stale，不误挂当前句。
- 长句注音不会遮挡正文、译文或查词卡片。

## 布局

- 竖屏双手模式。
- 竖屏左手 / 右手模式。
- 横屏双手模式。
- 横屏左手 / 右手模式。
- 长句正文、长译文、长释义不会互相遮挡。
