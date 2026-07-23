@echo off
REM Download Kokoro TTS model and place in assets/models/kokoro/
REM The model (~128MB) will be bundled into the APK.

setlocal
set MODEL_DIR=%~dp0..\assets\models\kokoro
set MODEL_URL=https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2

echo === Downloading Kokoro TTS model ===
echo URL: %MODEL_URL%
echo Dest: %MODEL_DIR%

mkdir "%MODEL_DIR%" 2>nul

REM Download the tar.bz2
curl -L -o "%TEMP%\kokoro-model.tar.bz2" "%MODEL_URL%"

REM Extract with 7zip or tar
echo Extracting...
tar -xf "%TEMP%\kokoro-model.tar.bz2" -C "%TEMP%\kokoro-extract"

REM Find model files
for /r "%TEMP%\kokoro-extract" %%f in (model.int8.onnx tokens.txt) do (
    echo Found: %%f
    copy "%%f" "%MODEL_DIR%\" >nul
)

REM Verify
if exist "%MODEL_DIR%\model.int8.onnx" (
    echo.
    echo === Done ===
    echo model.int8.onnx: %~z1 bytes
    echo tokens.txt: %~z2 bytes
    echo.
    echo Now run: npx expo prebuild --clean
) else (
    echo.
    echo ERROR: Model files not found after extraction.
    echo Check the download and try again.
)

del "%TEMP%\kokoro-model.tar.bz2" 2>nul
rmdir /s /q "%TEMP%\kokoro-extract" 2>nul
endlocal
