# Android Studio 开发约定

本仓库已经提交 `android/` 原生工程。开发者拉取后可以直接用 Android Studio 打开：

1. 在仓库根目录运行 `npm install`。
2. 用 Android Studio 打开仓库下的 `android/` 文件夹。
3. 等待 Gradle Sync 完成。
4. 选择 `app` 配置运行或调试。

不要提交这些本机文件：

- `android/local.properties`
- `android/.gradle/`
- `android/.idea/`
- `android/build/`
- `android/app/build/`
- `.expo/`
- `node_modules/`
- APK / ZIP 发布包

## VS Code 与 Android Studio 分工

- VS Code 只负责编辑 JS/TS、文档和脚本。
- Android Studio 负责 Gradle Sync、原生 Android 构建和真机调试。
- VS Code 已关闭 Java/Gradle 自动导入，避免和 Android Studio 抢工程配置。
- 仓库使用 `.gitattributes` 和 `.editorconfig` 固定 UTF-8 与换行规则，减少跨编辑器改动噪音。

## Expo 配置与原生工程

当前项目保留了 `android/` 目录。修改 `app.json` 里的包名、图标、启动页、权限等原生配置后，还要同步检查并提交 `android/` 下对应文件。

图标和启动页资源使用：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\generate-app-assets.ps1
```

然后运行：

```powershell
npx.cmd tsc --noEmit
cd android
.\gradlew.bat :app:assembleDebug
```

如果手机桌面图标仍显示旧图，先卸载旧应用再安装新 APK，避免启动器图标缓存误导。
