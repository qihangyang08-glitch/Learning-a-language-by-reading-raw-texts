#!/bin/bash
# Generate the full dictionary JSON from EPWING source.
# Requires: yomichan-import (Windows exe), Python 3
#
# Usage: bash scripts/generate-dict.sh
#
# Output: assets/dictionary/dict-data.json (71,000+ entries)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EPWING_DIR="$PROJECT_DIR/小学館中日日中統合辞書第2版 有附录/小学館中日日中統合辞書第2版 有附录"
TMP_DIR="$PROJECT_DIR/.dict-tmp"
OUTPUT="$PROJECT_DIR/assets/dictionary/dict-data.json"

echo "=== Step 1: Download yomichan-import ==="
YIM_VERSION="23.8.21.0"
YIM_URL="https://github.com/Chalkim/yomichan-import/releases/download/${YIM_VERSION}/yomichan-import_windows.zip"

mkdir -p "$TMP_DIR"
cd "$TMP_DIR"

if [ ! -f yomichan.exe ]; then
    echo "Downloading yomichan-import..."
    curl -L -o yim.zip "$YIM_URL" --progress-bar
    unzip -o yim.zip
    echo "Downloaded."
else
    echo "Already downloaded."
fi

echo ""
echo "=== Step 2: Convert EPWING → Yomichan format ==="
echo "This may take 2-5 minutes..."
./yomichan.exe -format epwing -title "小学館中日日中第2版" "$EPWING_DIR" sg_output.zip
echo "Conversion complete: sg_output.zip"

echo ""
echo "=== Step 3: Extract and convert to JaReader format ==="
python3 << 'PYEOF'
import json, os, zipfile, sys

ZIP_PATH = os.path.join(os.environ.get('TMP_DIR', '.'), 'sg_output.zip')
OUTPUT = os.environ.get('OUTPUT', 'dict-data.json')

entries = []
seen = set()

with zipfile.ZipFile(ZIP_PATH, 'r') as zf:
    for name in sorted(zf.namelist()):
        if not name.startswith('term_bank_') or not name.endswith('.json'):
            continue
        print(f"  Processing {name}...")
        with zf.open(name) as f:
            data = json.load(f)
        for entry in data:
            headword = entry[0] if len(entry) > 0 else ''
            reading = entry[1] if len(entry) > 1 else ''

            if not headword or not headword.strip():
                continue

            key = f"{headword}|{reading}"
            if key in seen:
                continue
            seen.add(key)

            defn_parts = entry[5] if len(entry) > 5 else []
            defn_text = defn_parts[0] if defn_parts else ''

            # Extract POS from 〔〕 markers
            import re
            pos_tags = []
            for m in re.finditer(r'〔([^〕]+)〕', defn_text[:200]):
                pos_tags.append(m.group(1))
            pos = ';'.join(pos_tags[:5]) if pos_tags else ''

            entries.append({
                'w': headword,
                'r': reading,
                'p': pos,
                'g': defn_text
            })

with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(entries, f, ensure_ascii=False, separators=(',', ':'))

size_mb = os.path.getsize(OUTPUT) / (1024 * 1024)
print(f"\nDone! {len(entries)} entries written to {OUTPUT} ({size_mb:.1f} MB)")
PYEOF

echo ""
echo "=== Done ==="
echo "Dictionary generated: $OUTPUT"
echo "Entries: $(python3 -c "import json; print(len(json.load(open('$OUTPUT','r',encoding='utf-8'))))")"

# Clean up temp files
rm -rf "$TMP_DIR"
echo "Temp files cleaned."
