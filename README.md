# JaReader

JaReader 是面向中文使用者的 Android 日语小说阅读训练工具。用户可以手动导入日语原文 TXT 或 EPUB，应用会解析章节、分句并按句展示，帮助读者降低长句和生肉阅读门槛。

## 功能

- TXT / EPUB 手动导入，EPUB 支持章节文本和插图解析。
- 按语义句段逐句阅读，而不是整页铺满文本。
- 点按查词和短语查词，使用本地 SQLite 词典与最长匹配策略。
- 整句翻译，用户自行配置 DeepSeek API Key，结果本地缓存。
- 罗马音标注，支持整句标注和逐词对应两种显示模式。
- TTS 朗读，优先使用系统日语 TTS，也可配置本地 Edge TTS 服务。
- 本地书架、阅读进度、书签、翻译缓存和罗马音缓存。
- 双手、左手、右手操作模式，以及横竖屏切换。

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
| 原生工程 | 已提交 Android 工程，可直接用 Android Studio 打开 |

Expo SDK 57 要求 Node.js 22.13.x 或更高兼容版本，Android compileSdk/targetSdk 为 36。涉及 Expo API 时以 `https://docs.expo.dev/versions/v57.0.0/` 为准。

## 开发环境

1. 安装 Node.js 22.13.x 或更高兼容版本。
2. 安装 Android Studio 和 Android SDK 36。
3. 安装依赖：

```bash
npm install
```

启动 Expo：

```bash
npm run start
```

直接运行 Android：

```bash
npm run android
```

类型检查：

```bash
npm run typecheck
```

## Android Studio

仓库包含 Expo prebuild 生成的 `android/` 工程。

1. 用 Android Studio 打开项目根目录下的 `android` 文件夹。
2. 等待 Gradle Sync 完成。
3. 选择 `app` 配置运行或调试。

因为 `android/` 已作为源码提交，`app.json` 中的原生配置不会自动同步到 Android 工程。修改包名、图标、启动页、权限等原生配置时，需要同步检查 `android/` 下的对应文件。

## 构建

Debug APK：

```bash
cd android
./gradlew assembleDebug
```

Release APK：

```bash
cd android
./gradlew assembleRelease
```

Windows PowerShell：

```powershell
cd android
.\gradlew.bat assembleDebug
```

## 词典

运行时词典成品位于：

- `assets/dictionary/dict-data.json`
- `android/app/src/main/assets/dictionary/dict-data.json`

`src/services/dictionary-plugin.js` 会在 prebuild 时把 `dict-data.json` 复制到 Android assets。当前仓库也提交了 Android assets 中的词典 JSON，方便 Android Studio 直接构建。预构建 SQLite 词典 DB 属于可选构建产物，不进入版本库。

词典原始源文件可能受原始来源授权约束；本项目的 MIT 许可证只覆盖项目代码和本仓库中明确可授权的项目文件，不自动覆盖第三方词典数据或外部服务。

## 翻译与 TTS

- 翻译：应用直接请求 DeepSeek API，API Key 由用户在设置页输入，并保存到 SecureStore。
- TTS：默认使用系统 TTS。开发调试时可选配置本地 `edge-tts-server/`。

启动本地 Edge TTS 服务：

```powershell
cd edge-tts-server
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 8787
```

真机 USB 调试：

```powershell
adb reverse tcp:8787 tcp:8787
```

然后在应用设置中填入：

```text
http://127.0.0.1:8787
```

## 仓库边界

仓库保留：

- App 源码与配置。
- Android 原生工程源码。
- 必需的应用图标、启动页等资源。
- 运行时必需的词典成品。
- 构建、验证、词典处理脚本。
- 可选开发服务源码，例如 `edge-tts-server/` 和 `proxy/`。

仓库不保留：

- Gradle、Expo、Metro、Node 缓存。
- 手动导入的小说原文和测试 EPUB/TXT。
- 词典原始材料、转换临时目录和本地大模型/TTS 模型。
- 过程文档、迭代报告、临时测试报告。
- 本机 IDE 配置、AI 助手配置和 SDK 路径。

相关忽略规则维护在 `.gitignore` 中。已从 Git 索引移出的本地文档或资源仍可留在工作目录，不影响构建。

## 许可证

项目代码采用 [MIT](LICENSE) 协议。第三方依赖、词典数据、系统 TTS、DeepSeek API、Edge TTS 等外部组件和服务遵循各自许可证或服务条款。
