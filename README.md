# JaReader - 日语小说阅读器

JaReader 是面向中文使用者的 Android 阅读训练工具。用户可以手动导入日语原文小说，将文本自动解析、分章、分句后逐句阅读，以降低长句阅读门槛，并在阅读中积累日语词汇和句型。

## 当前特性

- 按句阅读：导入后按语义句段阅读，而不是传统分页铺满整屏。
- TXT / EPUB 导入：支持纯文本和 EPUB，EPUB 会解析章节文本与插图。
- 本地书架：书籍、句段、章节图片、阅读进度、书签和翻译缓存写入本机 SQLite。
- 离线词典：构建好的词典 JSON 随包分发，首次启动导入 SQLite FTS 索引。
- 点按查词：使用轻量分词与最长匹配查询，支持单词和短语查词。
- 整句翻译：用户在设置中填入 DeepSeek API Key 后可翻译当前句段，结果会缓存。
- TTS 朗读：优先使用可配置 Edge TTS 服务，失败时回退到系统日语 TTS。
- 单手阅读：支持双手、左手、右手模式和手动横竖屏切换。

## 技术栈

| 层级 | 选型 |
| --- | --- |
| App 框架 | Expo SDK 57 + React Native 0.86 |
| React | 19.2.3 |
| 路由 | expo-router |
| 状态管理 | Zustand |
| 本地数据库 | expo-sqlite |
| 文件导入 | expo-document-picker + expo-file-system/legacy |
| 音频/TTS | expo-audio + expo-speech |
| 分词 | tiny-segmenter + 自定义规则 |
| Android | 已提交 `android/` 原生工程，可直接用 Android Studio 打开 |

> Expo SDK 57 要求 Node.js 22.13.x 起，Android compileSdk/targetSdk 为 36。版本信息以 Expo v57 文档为准。

## 开发环境

1. 安装 Node.js 22.13.x 或更高的兼容版本。
2. 安装 Android Studio，并安装 Android SDK 36。
3. 安装项目依赖：

```bash
npm install
```

## Expo 开发

```bash
npm run start
```

或直接运行 Android：

```bash
npm run android
```

## Android Studio 开发

仓库已经包含 Expo prebuild 生成的 `android/` 工程。

1. 用 Android Studio 打开项目根目录下的 `android` 文件夹。
2. 等待 Gradle Sync 完成。
3. 选择 `app` 配置运行或调试。

不要提交以下本地文件：

- `android/local.properties`
- `android/.gradle/`
- `android/build/`
- `android/app/build/`
- `.expo/`
- `node_modules/`

这些内容已经被 `.gitignore` 忽略。

因为 `android/` 已作为源码提交，`app.json` 中的原生配置不会自动同步到 Android 工程。修改包名、图标、启动页、权限等原生配置时，需要同步检查 `android/` 下的对应文件。

## 词典

运行时词典成品位于：

- `assets/dictionary/dict-data.json`
- `assets/dictionary/jareader.db`

`src/services/dictionary-plugin.js` 会在 prebuild 时把 `dict-data.json` 复制到 Android assets。当前仓库也提交了 `android/app/src/main/assets/dictionary/dict-data.json`，方便 Android Studio 直接构建。

词典原始源文件、转换临时目录、示例 EPUB 不进入版本库。

## 翻译与 TTS

- 翻译：应用直接请求 DeepSeek API，API Key 由用户在设置页输入，并保存到 SecureStore。
- TTS：可选配置本地 `edge-tts-server/`，也可以直接使用系统日语 TTS 兜底。

启动本地 Edge TTS 服务：

```powershell
cd edge-tts-server
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 8787
```

真机 USB 调试时可使用：

```powershell
adb reverse tcp:8787 tcp:8787
```

然后在应用设置中填入：

```text
http://127.0.0.1:8787
```

## 构建

本地 Debug APK：

```bash
cd android
./gradlew assembleDebug
```

本地 Release APK：

```bash
cd android
./gradlew assembleRelease
```

Windows PowerShell 可使用：

```powershell
cd android
.\gradlew.bat assembleDebug
```

## 项目整理规则

仓库保留：

- App 源码
- Android 原生工程源码
- 必需图片资源
- 运行时词典成品
- 词典构建脚本与 Edge TTS 服务源码
- 下一轮迭代规划文档

仓库不保留：

- APK / ZIP 发布包
- Gradle、Expo、Metro、Node 缓存
- 手动导入的小说原文
- 词典原始源目录和转换临时目录
- 本机 IDE 配置和 SDK 路径

## 许可证

本项目采用 [MIT](LICENSE) 协议。
