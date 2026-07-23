#!/bin/bash
# Download sherpa-onnx AAR for Android TTS integration.
# Places the AAR in src/services/tts/android/libs/

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LIBS_DIR="$PROJECT_DIR/src/services/tts/android/libs"

# Latest known working version — check https://huggingface.co/csukuangfj/sherpa-onnx-libs for newer
AAR_VERSION="${SHERPA_ONNX_VERSION:-1.12.21}"
AAR_FILENAME="sherpa-onnx-static-link-onnxruntime-${AAR_VERSION}.aar"
AAR_URL="https://huggingface.co/csukuangfj/sherpa-onnx-libs/resolve/main/android/aar/${AAR_VERSION}/${AAR_FILENAME}"

echo "Downloading sherpa-onnx AAR v${AAR_VERSION}..."
echo "  URL: $AAR_URL"
echo "  Dest: $LIBS_DIR/sherpa-onnx.aar"

mkdir -p "$LIBS_DIR"

# Download with progress
if command -v curl &> /dev/null; then
    curl -L -o "$LIBS_DIR/sherpa-onnx.aar" "$AAR_URL" --progress-bar
elif command -v wget &> /dev/null; then
    wget -O "$LIBS_DIR/sherpa-onnx.aar" "$AAR_URL" --show-progress
else
    echo "ERROR: Neither curl nor wget found."
    exit 1
fi

# Verify
if [ -f "$LIBS_DIR/sherpa-onnx.aar" ]; then
    SIZE=$(stat -c%s "$LIBS_DIR/sherpa-onnx.aar" 2>/dev/null || stat -f%z "$LIBS_DIR/sherpa-onnx.aar" 2>/dev/null)
    echo "Done! sherpa-onnx.aar downloaded ($SIZE bytes)"
    echo ""
    echo "Next steps:"
    echo "  1. Add the Expo plugin to app.json:"
    echo '     "plugins": ["./src/services/tts/plugin"]'
    echo "  2. Run: npx expo prebuild --clean"
    echo "  3. Build APK and test"
else
    echo "ERROR: Download failed."
    exit 1
fi
