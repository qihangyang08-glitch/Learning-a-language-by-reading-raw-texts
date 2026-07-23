#!/usr/bin/env python3
"""
Extract DreyeJC Japanese-Chinese EPWING dictionary to dict-data.json.

The dictionary is in EPWING/EBzip format with JIS X 0208 encoding.
Entries have structure:
  [reading] [kanji_headword] 【POS】 [chinese_definition]
"""

import zlib
import json
import sys
import os
import re

def decode_epwing_block(raw_bytes):
    """Decode an EPWING text block from JIS X 0208 to Unicode via EUC-JP."""
    # Remove EPWING control sequences (0x1f XX), replace 0x1f 0x0a with newline
    stripped = bytearray()
    i = 0
    while i < len(raw_bytes):
        b = raw_bytes[i]
        if b == 0x1f:
            if i + 1 < len(raw_bytes):
                tag = raw_bytes[i + 1]
                if tag == 0x0a:
                    stripped.append(0x0a)  # real newline
                # Other tags (0x05, 0x04, 0x09, 0x41, 0x61) are formatting
                i += 2
                continue
        stripped.append(b)
        i += 1

    # Convert JIS bytes to EUC-JP bytes
    euc = bytearray()
    j = 0
    db = bytes(stripped)
    while j < len(db):
        b = db[j]
        if b == 0x0a:
            euc.append(0x0a)
            j += 1
        elif 0x21 <= b <= 0x7e and j + 1 < len(db) and 0x21 <= db[j+1] <= 0x7e:
            # JIS X 0208 → EUC-JP: add 0x80 to both bytes
            euc.append(b + 0x80)
            euc.append(db[j+1] + 0x80)
            j += 2
        elif 0x20 <= b <= 0x7e:
            # ASCII
            euc.append(b)
            j += 1
        else:
            j += 1

    return bytes(euc).decode('euc-jp', errors='replace')


def parse_entries(text):
    """Parse decoded text into dictionary entries.

    Each entry is preceded by a garbled binary marker (� chars on a line).
    Entry structure after marker:
      Line N:   [reading]           ← hiragana/katakana
      Line N+1: [number]            ← 0-3 digit number (sometimes merged with reading)
      Line N+2: [kanji_headword]    ← kanji compound
      Line N+3: 【POS】             ← optional part-of-speech tag
      Line N+4: [chinese_definition] ← Chinese gloss
    """
    entries = []
    lines = text.split('\n')

    # First, merge the reading+number when they're on the same line
    # Pattern: hiragana + space + digits (unusual but happens in dictionary)
    # We process each "segment" between garbled-marker lines

    # Find entry marker lines (lines with replacement chars)
    markers = []
    for i, line in enumerate(lines):
        clean = line.replace(' ', '').replace('　', '')
        if '�' in clean and len(clean.replace('�', '')) <= 3:
            markers.append(i)

    # Process segments between markers
    for idx in range(len(markers)):
        start = markers[idx] + 1
        end = markers[idx + 1] if idx + 1 < len(markers) else len(lines)

        segment = lines[start:end]
        if len(segment) < 3:
            continue

        # Collect clean lines
        clean_lines = []
        for sline in segment:
            stripped = sline.strip()
            if stripped:
                clean_lines.append(stripped)

        if len(clean_lines) < 2:
            continue

        reading = ''
        headword = ''
        pos = ''
        definition = ''
        line_idx = 0

        # Line 0: Should be reading (hiragana/katakana)
        if line_idx < len(clean_lines):
            line0 = clean_lines[line_idx]
            # Check if reading+number merged: "がいか２"
            merged = re.match(r'^([ぁ-んァ-ンー]+?)(\d+)$', line0)
            if merged:
                reading = merged.group(1)
                line_idx += 1
            elif re.match(r'^[ぁ-んァ-ンー]+$', line0):
                reading = line0
                line_idx += 1
            elif re.match(r'^[ぁ-んァ-ンー]+\s+\d+', line0):
                # "がいか ２" format
                parts = line0.split()
                reading = parts[0]
                line_idx += 1

        # If no reading yet, skip this segment
        if not reading:
            continue

        # Next line(s): skip number line, find kanji headword
        while line_idx < len(clean_lines):
            l = clean_lines[line_idx]

            # Skip pure-number lines
            if re.match(r'^[\d\s]+$', l):
                line_idx += 1
                continue

            # Skip garbled lines
            if '�' in l:
                line_idx += 1
                continue

            # POS line — extract POS and look for definition
            pm = re.search(r'【(.+?)】', l)
            if pm:
                pos = pm.group(1).strip()
                after_pos = l[pm.end():].strip()
                if after_pos and len(after_pos) > 1:
                    definition = after_pos
                else:
                    # Definition on next line
                    line_idx += 1
                    if line_idx < len(clean_lines):
                        definition = clean_lines[line_idx].strip()
                line_idx += 1
                break

            # If it has Chinese/Kanji chars: this is the headword
            has_cjk = bool(re.search(r'[一-鿿]', l))
            has_kana = bool(re.search(r'[ぁ-んァ-ン]', l))
            if has_cjk:
                headword = re.sub(r'[\s　]+', '', l).strip()
                line_idx += 1
                # Next check POS
                if line_idx < len(clean_lines):
                    nl = clean_lines[line_idx]
                    pm2 = re.search(r'【(.+?)】', nl)
                    if pm2:
                        pos = pm2.group(1).strip()
                        after2 = nl[pm2.end():].strip()
                        if after2:
                            definition = after2
                        else:
                            line_idx += 1
                            if line_idx < len(clean_lines):
                                definition = clean_lines[line_idx].strip()
                    elif nl and not re.search(r'^[\d\s]+$', nl):
                        definition = nl
                line_idx += 1
                break

            # If kana and not number: might be part of headword (kana-only word)
            if has_kana and not re.match(r'^[\d\s]+$', l):
                headword = l.strip()
                line_idx += 1
                if line_idx < len(clean_lines):
                    pm2 = re.search(r'【(.+?)】', clean_lines[line_idx])
                    if pm2:
                        pos = pm2.group(1).strip()
                        after2 = clean_lines[line_idx][pm2.end():].strip()
                        if after2:
                            definition = after2
                        else:
                            line_idx += 1
                            if line_idx < len(clean_lines):
                                definition = clean_lines[line_idx].strip()
                break

            line_idx += 1

        # Clean up
        definition = re.sub(r'[\s　]+', ' ', definition).strip()
        definition = definition.replace('□', '')  # Remove placeholder chars

        if reading and headword:
            entries.append({
                'w': headword,
                'r': reading,
                'p': pos,
                'g': definition,
            })

    return entries


def main():
    # Find the HONMON.ebz file
    import glob
    script_dir = os.path.dirname(os.path.abspath(__file__))
    matches = glob.glob(os.path.join(script_dir, '..', 'DreyeJC*', 'DreyeJC*',
                                     'DreyeJC', 'DreyeJC', 'DATA', 'HONMON.ebz'))
    if not matches:
        if len(sys.argv) > 1:
            honmon_path = sys.argv[1]
        else:
            print("Dictionary not found. Usage: python extract-dreye.py <path/to/HONMON.ebz>")
            sys.exit(1)
    else:
        honmon_path = os.path.abspath(matches[0])

    print(f'Reading: {honmon_path}')
    with open(honmon_path, 'rb') as f:
        data = f.read()
    print(f'File size: {len(data):,} bytes')

    # Find and decompress all zlib blocks
    blocks = []
    for i in range(len(data) - 1):
        if data[i] == 0x78 and data[i+1] in (0x01, 0x5e, 0x9c, 0xda, 0x20, 0x7d, 0xbb, 0xf9):
            try:
                raw = zlib.decompress(data[i:], 15)
                if len(raw) > 1000:
                    blocks.append(raw)
            except:
                pass

    print(f'Decompressed {len(blocks)} text blocks')

    # Decode and parse all blocks
    all_entries = []
    seen = set()

    for bi, block in enumerate(blocks):
        try:
            text = decode_epwing_block(block)
            entries = parse_entries(text)
            for entry in entries:
                key = f"{entry['w']}|{entry['r']}"
                if key not in seen:
                    seen.add(key)
                    all_entries.append(entry)
        except Exception as e:
            continue

        if bi % 50 == 0:
            print(f'  Processed block {bi}/{len(blocks)}, {len(all_entries)} entries so far...')

    print(f'\nTotal unique entries: {len(all_entries)}')

    # Show some samples
    print('\nSample entries:')
    for e in all_entries[:20]:
        print(f'  {e["w"]} [{e["r"]}] ({e["p"]}) = {e["g"]}')

    # Save to dict-data.json
    out_path = os.path.join(script_dir, '..', 'src', 'services', 'dict-data.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(all_entries, f, ensure_ascii=False)

    size_kb = os.path.getsize(out_path) / 1024
    print(f'\nWritten {len(all_entries)} entries to {out_path} ({size_kb:.1f} KB)')


if __name__ == '__main__':
    main()
