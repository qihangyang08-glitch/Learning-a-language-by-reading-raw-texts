# Android Studio 入口

本项目是 Android 优先的 Expo / React Native 项目，仓库中已经提交 `android/` 原生工程。

开发者拉取后推荐流程：

1. 在仓库根目录运行 `npm install`。
2. 用 Android Studio 打开仓库下的 `android/` 文件夹。
3. 等待 Gradle Sync 完成。
4. 选择 `app` 配置运行或调试。

VS Code 可以继续作为 JS/TS 编辑器使用，但不要让 VS Code 接管 Java / Gradle 导入。本仓库的 `.vscode/settings.json` 已关闭相关自动导入。

## 常用命令

在仓库根目录：

```powershell
npm run typecheck
npm run assets:android
npm run android:debug
```

或直接在 `android/` 目录：

```powershell
.\gradlew.bat :app:assembleDebug
```

## 图标和启动页

当前应用图标和启动页资源以原生 Android 资源为准。修改 `assets/android-icon-background.png` 后运行：

```powershell
npm run assets:android
```

然后提交 `assets/` 和 `android/app/src/main/res/` 下对应变更。

如果覆盖安装后桌面图标仍然显示旧图，先卸载旧应用再安装新 APK，避免 Android 启动器缓存误导。
