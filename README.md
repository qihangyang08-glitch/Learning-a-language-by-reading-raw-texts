# JaReader — 日语小说阅读器

JaReader 是一款专为日语学习者设计的手机阅读器，旨在通过优化日语原著（生肉）的阅读体验，帮助用户在阅读中自然提升日语能力。轻量、免费且开源。

## 📱 应用截图

*(此处预留应用截图位置，建议插入：主界面、阅读界面、字典查询、翻译效果)*

---

## ✨ 应用特性

- **按句阅读** — 创新性的阅读模式，将每一“页”拆分为语义完整的句子，降低长句阅读压力。
- **即点即查** — 点击任何单词即可调出离线词典（基于 JMdict），支持形态分析。
- **TTS 语音朗读** — 集成系统级与云端语音引擎，支持自动回退切换。
- **智能翻译** — 可选的 AI 辅助翻译，通过安全代理连接 DeepSeek 等模型，助你攻克难句。
- **单手操作优化** — 提供左右手布局切换，支持大屏单手顺畅阅读。
- **大纲与搜索** — 类似圣经风格的章节索引，支持快速搜索与跳转。
- **书签系统** — 收藏难句或精彩段落，便于后续复习。
- **全系统暗黑模式** — 完美适配白天与黑夜阅读场景。
- **跨平台支持** — 基于 React Native + Expo 开发，支持 Android 和 iOS。

## 📂 支持格式

- **当前支持**: `.txt`, `.epub` (原生高效解析)
- **计划中**: `.mobi`, `.pdf`

## 🛠️ 技术栈

| 层级 | 技术选型 |
|-------|--------|
| 框架 | React Native + Expo SDK 57 |
| 路由 | expo-router |
| 状态管理 | Zustand |
| 数据库 | expo-sqlite (同步 API) |
| 分词器 | kuromoji.js |
| 词典 | JMdict (转换为 SQLite FTS5) |
| 翻译 | Cloudflare Worker 代理 → DeepSeek API |

---

## 🚀 快速开始

### 1. 环境准备

确保你的开发环境已安装：
- [Node.js](https://nodejs.org/) (建议 LTS 版本)
- [Git](https://git-scm.com/)

### 2. 安装与启动

```bash
# 克隆项目 (如果你还没克隆)
# git clone https://github.com/your-repo/learn-jaReading-by-novel.git
# cd learn-jaReading-by-novel

# 安装依赖
npm install

# 启动开发服务器
npx expo start
```

使用手机下载 **Expo Go** 应用，扫描终端生成的二维码即可进行实时调试。

---

## 📦 打包与发布

### 环境配置

如果是本地打包，你需要安装：
- **Android**: Android Studio 及配置好的 Android SDK。
- **iOS**: macOS + Xcode (仅限 iOS 打包)。

### 方案 A：使用 EAS Build (推荐，云端打包)

这是最简单的方法，无需配置复杂的本地 Android/iOS 环境。

1. 安装 EAS CLI: `npm install -g eas-cli`
2. 登录 Expo 账号: `npx eas login`
3. 执行打包命令：
   - **Android APK**: `npx eas build --platform android --profile preview`
   - **iOS**: `npx eas build --platform ios --profile production`

### 方案 B：本地离线打包

1. 生成原生工程：
   ```bash
   npx expo prebuild --platform android
   ```
2. 进入原生目录编译：
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
   生成的 APK 位于：`android/app/build/outputs/apk/release/app-release.apk`

---

## 📖 词典与翻译设置

- **词典**: 首次启动时会下载 JMdict 数据（约 25MB）并自动构建离线索引，过程需保持网络畅通。
- **翻译**: 默认使用公共代理。你也可以在 `proxy/` 目录下找到代码并部署自己的 Cloudflare Worker 代理以获得更稳定的体验。

## 📄 开源协议

本项目采用 [MIT](LICENSE) 协议开源。
词典数据来源于 JMdict (CC-BY-SA 协议)。
