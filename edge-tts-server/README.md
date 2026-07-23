# JaReader Edge TTS Server

Small local web service for JaReader. It uses the Python `edge-tts` package to
generate Japanese MP3 audio and returns it to the Android app.

## Run

```powershell
cd edge-tts-server
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 8787
```

For USB debugging with a real Android device:

```powershell
E:\AndroidStudio_SDK\platform-tools\adb.exe reverse tcp:8787 tcp:8787
```

Then keep the app setting as:

```text
http://127.0.0.1:8787
```

For LAN use, set the app endpoint to:

```text
http://YOUR_PC_IP:8787
```

## Endpoints

- `GET /health`
- `GET /voices`
- `GET /tts?text=...&voice=ja-JP-NanamiNeural&rate=%2B0%25`
