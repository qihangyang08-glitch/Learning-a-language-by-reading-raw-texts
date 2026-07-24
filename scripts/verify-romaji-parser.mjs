function parseRomajiJson(raw) {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return { items: [] };

  try {
    const parsed = JSON.parse(jsonText);
    const sourceItems = Array.isArray(parsed?.items) ? parsed.items : [];
    const items = [];

    for (const item of sourceItems) {
      const text = typeof item?.text === 'string' ? item.text.trim() : '';
      const romaji = typeof item?.romaji === 'string' ? item.romaji.trim() : '';
      if (text && romaji) items.push({ text, romaji });
    }

    return { items };
  } catch {
    return { items: [] };
  }
}

function parsePlainRomaji(raw) {
  const romaji = raw
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```(?:text|txt)?|```/gi, ''))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/^["'「『]|["'」』]$/g, '')
    .trim();

  return romaji ? { items: [], romaji } : { items: [] };
}

function extractJsonObject(raw) {
  const text = raw.trim();
  if (!text) return null;
  if (text.startsWith('{') && text.endsWith('}')) return text;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith('{') && inner.endsWith('}')) return inner;
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

const cases = [
  {
    name: 'valid json',
    input: '{"items":[{"text":"彼女","romaji":"kanojo"},{"text":"は","romaji":"wa"}]}',
    count: 2,
  },
  {
    name: 'empty items',
    input: '{"items":[]}',
    count: 0,
  },
  {
    name: 'missing fields',
    input: '{"items":[{"text":"彼女"},{"romaji":"wa"},{"text":"猫","romaji":"neko"}]}',
    count: 1,
  },
  {
    name: 'non json',
    input: '彼女 / kanojo',
    count: 0,
  },
  {
    name: 'fenced json',
    input: '```json\n{"items":[{"text":"読む","romaji":"yomu"}]}\n```',
    count: 1,
  },
  {
    name: 'json with prose',
    input: 'result: {"items":[{"text":"行く","romaji":"iku"}]} done',
    count: 1,
  },
];

for (const test of cases) {
  const result = parseRomajiJson(test.input);
  if (result.items.length !== test.count) {
    throw new Error(`${test.name}: expected ${test.count}, got ${result.items.length}`);
  }
}

const plainCases = [
  { input: 'kanojo wa hashitta.', expected: 'kanojo wa hashitta.' },
  { input: '```text\nkanojo wa hashitta.\n```', expected: 'kanojo wa hashitta.' },
  { input: '\n  kare wa iku\n', expected: 'kare wa iku' },
];

for (const test of plainCases) {
  const result = parsePlainRomaji(test.input);
  if (result.romaji !== test.expected) {
    throw new Error(`plain: expected "${test.expected}", got "${result.romaji}"`);
  }
}

console.log(`passed: ${cases.length} json cases, ${plainCases.length} plain romaji cases`);
