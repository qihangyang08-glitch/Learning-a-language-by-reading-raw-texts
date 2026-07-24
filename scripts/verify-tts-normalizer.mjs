import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const sourcePath = new URL('../src/services/tts-normalizer.ts', import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`;
const { normalizeTextForSpeech, findFlattenedRubyCandidates } = await import(moduleUrl);

const rubyCases = [
  ['｜漢字《かんじ》を読む。', '漢字を読む。'],
  ['漢字《かんじ》を読む。', '漢字を読む。'],
  ['異世界《いせかい》へ行く。', '異世界へ行く。'],
  ['食べる《たべる》時間だ。', '食べる時間だ。'],
  ['取り戻す《とりもどす》力。', '取り戻す力。'],
  ['漢字（かんじ）を読む。', '漢字を読む。'],
  ['言葉(ことば)を選ぶ。', '言葉を選ぶ。'],
  ['山田太郎（やまだたろう）が来た。', '山田太郎が来た。'],
  ['｜一番星《いちばんぼし》を見た。', '一番星を見た。'],
  ['今日《きょう》は晴れ。', '今日は晴れ。'],
  ['東京《とうきょう》駅に着いた。', '東京駅に着いた。'],
  ['生命（せいめい）の話。', '生命の話。'],
];

const okuriganaCases = [
  '食べる',
  '思った',
  '読んだ',
  '取り戻す',
  '走り出した',
  '見つけた',
  '飛び込んだ',
  '受け取った',
  '書き換える',
  '立ち上がる',
  '持っていく',
  '彼女は笑った（そう思った）。',
];

let failures = 0;

for (const [input, expected] of rubyCases) {
  const actual = normalizeTextForSpeech(input);
  if (actual !== expected) {
    failures += 1;
    console.error('[ruby] failed');
    console.error(`  input:    ${input}`);
    console.error(`  expected: ${expected}`);
    console.error(`  actual:   ${actual}`);
  }
}

for (const input of okuriganaCases) {
  const actual = normalizeTextForSpeech(input);
  if (actual !== input) {
    failures += 1;
    console.error('[okurigana] failed');
    console.error(`  input:  ${input}`);
    console.error(`  actual: ${actual}`);
  }
}

const flattened = findFlattenedRubyCandidates('これは漢字かんじ。食べる。東京とうきょう、行く。');
const flattenedTexts = flattened.map((item) => item.text);
if (normalizeTextForSpeech('漢字かんじ') !== '漢字かんじ') {
  failures += 1;
  console.error('[flattened] normalizer must not delete unmarked ruby-like text');
}
if (!flattenedTexts.includes('漢字かんじ') || !flattenedTexts.includes('東京とうきょう')) {
  failures += 1;
  console.error('[flattened] candidate sampling failed');
  console.error(`  actual: ${JSON.stringify(flattenedTexts)}`);
}

if (failures > 0) {
  console.error(`TTS normalizer verification failed: ${failures}`);
  process.exit(1);
}

console.log(`TTS normalizer verification passed: ${rubyCases.length} ruby cases, ${okuriganaCases.length} okurigana cases.`);
console.log(`Flattened ruby candidates sampled without deletion: ${flattenedTexts.join(', ')}`);
