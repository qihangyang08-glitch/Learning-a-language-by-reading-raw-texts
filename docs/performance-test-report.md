# JaReader 发布前性能与稳定性报告

更新时间：2026-07-24

负责范围：Agent C，稳定性与性能测试工具。

## Expo SDK 57 文档确认

写代码前已确认并只参考以下精确版本页面：

- `https://docs.expo.dev/versions/v57.0.0/sdk/filesystem.md`
- `https://docs.expo.dev/versions/v57.0.0/sdk/sqlite.md`
- `https://docs.expo.dev/versions/v57.0.0/sdk/document-picker.md`

与本轮测试相关的结论：

- `expo-file-system` v57 主推 `File` / `Directory` / `Paths`，旧 `FileSystem.*Async` API 需要从 `expo-file-system/legacy` 导入；本轮未改业务代码，只在报告中标注真机采样关注点。
- `expo-sqlite` v57 支持 `openDatabaseAsync`、`runAsync`、`getAllAsync`、`getFirstAsync` 等异步 API，也保留同步 API；文档建议启用 WAL 改善 SQLite 性能，重任务同步查询可能阻塞 JS 线程。
- `expo-document-picker` v57 的 `copyToCacheDirectory` 默认 `true`，可保证 `expo-file-system` 立即读取，但大文件拷贝会影响性能；真机导入测试要单独观察选中文件后的缓存拷贝阶段。

## Node 可重复基准入口

新增脚本：

```powershell
node scripts\release-performance-smoke.mjs
```

可选参数：

```powershell
node scripts\release-performance-smoke.mjs --iterations 5 --windows 500 --cache-ranges 500
node scripts\release-performance-smoke.mjs --skip-dictionary-import
node scripts\release-performance-smoke.mjs --json
```

脚本覆盖：

- 根目录 `.txt` 测试小说读取、章节拆分、句子切分。
- 根目录 `.epub` 测试小说读取、ZIP/OPF/spine 解析、HTML 文本抽取、图片引用计数、句子切分。
- SQLite 书架表的 Node 模拟：分块写入句子、`loadSentenceWindow` 范围读取。
- 翻译缓存批量读取模拟：按固定 stride 写入 mock 翻译，再测 `getCachedTranslations` 范围读取。
- 词典初始化可观测流程：检查 bundled DB、读取/解析 `assets/dictionary/dict-data.json`、映射并批量导入内存 SQLite。

限制：

- 脚本不导入 React Native / Expo 运行时模块，避免 Node 环境调用 `expo-file-system`、`expo-sqlite` 失败。
- Node 使用 `sql.js` 做 SQLite 模拟；当前 `sql.js` wasm 不含 FTS5，因此词典 FTS 构建必须在 Expo/Android 真机采样。
- Node 内存采样是脚本进程 RSS，不等同 Android app RSS。

## 首次基准结果

运行环境：

- 日期：2026-07-24
- 命令：`node scripts\release-performance-smoke.mjs`
- Node：`v22.19.0 win32/x64`
- 样本：`iterations=3`，窗口读取 `250` 次/轮，翻译缓存范围读取 `250` 次/轮。

### TXT 导入链路

输入：`败犬女主太多了_第9卷_日文版.txt`，389.3 KB。

- 章节数：242
- 句子数：4456
- parse：5.96 / 7.02 / 7.32 ms
- segment：12.85 / 13.41 / 7.82 ms
- SQLite 分块写入：44.25 / 28.18 / 26.85 ms
- `loadSentenceWindow`：p50 约 0.07-0.10 ms，p95 约 0.16-0.20 ms，p99 约 0.24-0.35 ms
- `getCachedTranslations`：p50 约 0.03-0.08 ms，p95 约 0.08-0.18 ms，p99 约 0.14-0.38 ms

### EPUB 导入链路

输入：`败犬女主太多了 第9卷 日文版.epub`，12.5 MB。

- 章节数：57
- 图片引用数：31
- 句子数：4497
- parse：97.25 / 75.15 / 62.91 ms
- segment：8.38 / 8.91 / 9.40 ms
- SQLite 分块写入：23.75 / 24.63 / 24.32 ms
- `loadSentenceWindow`：p50 约 0.08 ms，p95 约 0.14-0.16 ms，p99 约 0.18-0.32 ms
- `getCachedTranslations`：p50 约 0.04-0.05 ms，p95 约 0.08-0.17 ms，p99 约 0.21-0.46 ms

### 词典初始化模拟

输入：`assets/dictionary/dict-data.json`，22.6 MB。

- JSON 条目：159388
- bundled SQLite DB：8.0 KB；Node 检查未发现 `dict_meta` 表
- JSON 读取：188.23 ms
- JSON 解析：110.07 ms
- 条目映射：7.38 ms
- 内存 SQLite 插入：502.80 ms
- 插入 chunk：p50 13.89 ms，p95 25.11 ms，p99 30.74 ms
- 总可观测耗时：809.35 ms，不含 Expo/Android FTS5 构建

失败点 / 待确认：

- `assets/dictionary/jareader.db` 当前看起来像空 DB 或占位 DB，未检出 `dict_meta`；如果发布路径依赖 bundled DB，需要由字典构建 Agent 或维护者确认。
- Node `sql.js` 不含 FTS5，不能替代 `expo-sqlite` 的 FTS 构建采样。

### Node 内存样本

- start：RSS 38.6 MB，heap 6.4 MB
- after txt：RSS 68.8 MB，heap 16.7 MB
- after epub：RSS 79.0 MB，heap 8.7 MB
- after dictionary：RSS 160.9 MB，heap 70.8 MB

结论：Node 侧没有发现 TXT/EPUB 解析、窗口读取、翻译缓存批读的明显异常峰值；字典 JSON 全量导入是最大内存阶段，需要 Android 真机确认首次导入是否造成 UI 卡顿或 RSS 膨胀。

## Android 真机采样流程

准备：

```powershell
npx expo run:android
adb devices
adb shell pidof com.jareader.app
```

内存采样建议：

```powershell
adb shell dumpsys meminfo com.jareader.app > meminfo-before-import.txt
adb shell dumpsys meminfo com.jareader.app > meminfo-during-dictionary-import.txt
adb shell dumpsys meminfo com.jareader.app > meminfo-after-dictionary-import.txt
adb shell dumpsys meminfo com.jareader.app > meminfo-after-txt-import.txt
adb shell dumpsys meminfo com.jareader.app > meminfo-after-epub-import.txt
```

采样点：

- 冷启动后、词典初始化前。
- 首次词典导入中，每 2-3 秒采一次，直到进度完成。
- 词典完成并静置 10 秒后。
- 导入 TXT 前后。
- 导入 EPUB 前后，特别观察 DocumentPicker 拷贝缓存后的 RSS 变化。
- 阅读页随机翻页 50 次后。
- 打开翻译缓存命中句、目录、书签后。

Android Studio Profiler：

1. 打开 Android Studio，选择正在运行的 `com.jareader.app` 进程。
2. 在 Profiler 中启用 Memory 和 CPU。
3. 冷启动 app，记录词典初始化阶段 CPU 主线程占用、GC 频率、Java/Kotlin/Native/Graphics 内存变化。
4. 导入 TXT 和 EPUB，各记录一次从选择文件到进入阅读页的 timeline。
5. 阅读页连续翻页、目录跳转、查词、翻译缓存命中，观察 JS thread / main thread 是否有长任务。
6. 若出现明显卡顿，按阶段归因到：DocumentPicker 缓存拷贝、文件读取、EPUB ZIP 解压、句子切分、SQLite 写入、词典 JSON 解析/导入、FTS 构建、窗口读取。

## 发布前性能验收建议

- TXT / EPUB 导入都能完成，句子数接近 Node 基准。
- `loadSentenceWindow` 真机 p95 保持交互级响应；若明显超过 50 ms，需要检查 SQLite 索引或同步读取阻塞。
- `getCachedTranslations` 真机 p95 保持交互级响应；若明显超过 50 ms，需要检查范围查询和缓存表索引。
- 首次词典初始化期间 UI 不应长时间无响应；若 FTS 构建卡顿，考虑继续延后 FTS 构建或拆分进度。
- DocumentPicker 大文件缓存拷贝期间若出现明显等待，需要在 UI 中显示明确导入进度或避免重复拷贝。
