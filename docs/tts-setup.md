# JaReader TTS 配置说明

更新时间：2026-07-24

## 推荐主线：系统 Google TTS

JaReader 发布前公开主线只推荐 Android 系统 TTS / Google 文字转语音。应用通过 Expo SDK 57 `expo-speech` 调用系统能力，`getAvailableVoicesAsync()` 可以返回设备可用声线，`SpeechOptions.voice` 只接受系统提供的 voice identifier。

为了获得稳定的日语朗读体验，建议用户在手机上安装或启用 Google 文字转语音，并下载日语（日本）语音数据。JaReader 不承诺可以替用户安装语音包，也不保证能在应用内切换到某个系统声线；实际可用声线取决于手机系统、TTS 引擎和已安装语音数据。

推荐检查路径因 Android 厂商而异，通常在：

- 系统设置
- 语言和输入法
- 文字转语音输出
- 首选引擎选择 Google 文字转语音
- 语音数据中下载日语
- 在同一设置页试听不同日语声线

## 日语声线建议

不同日语声线效果差异明显。部分系统默认声线在低语速下可能出现颤音、拖音或不自然的抖动；如果用户觉得朗读发抖，建议在系统 TTS 设置中试听男性声线或其他日语声线，再回到 JaReader 使用。

设置页可以展示 `expo-speech.getAvailableVoicesAsync()` 检测到的日语声线，用来提醒用户系统是否已准备好日语 TTS。由于不同 Android 设备和厂商 ROM 对声线枚举支持不一致，发布版不要承诺 JaReader 一定能列出完整声线列表，也不要把“切换系统语音包”描述成应用内保证完成的能力。

Expo SDK 57 还说明 Android 不支持 `Speech.pause()` / `Speech.resume()`。JaReader 的 Android 暂停/恢复体验应按平台限制降级，不作为声线配置问题处理。

## 隐藏 provider 边界

Edge TTS 服务保留在 `edge-tts-server/`，Azure TTS 与 Google Cloud TTS 保留 provider 和 SecureStore 配置边界，用于后续开发或维护者调试。它们不进入本轮普通设置页，也不是发布验收主线。

默认策略：

- 普通设置页不显示 Azure / Google Cloud / Edge TTS 配置入口。
- 不自动探测 Edge 服务。
- 不把任何在线 TTS 作为普通用户首选方案。
- 未配置真实 Key 或未由开发者显式启用 provider 时，不发起在线 TTS 请求。

常见调试方式：

```powershell
adb reverse tcp:8787 tcp:8787
```

或在同一局域网下使用：

```text
http://电脑IP:8787
```

## 本地用量估算

本地用量只统计 JaReader 发起过的朗读或合成字符数。普通用户界面展示时应以系统 TTS 主线为准，不把本地估算包装成云服务账单或余额。

建议展示文案：

```text
本地估算用量仅统计本机请求，不等同于在线服务账单。
```
