import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, '.tmp', 'verify-llm-error-message');

if (!outDir.startsWith(resolve(root, '.tmp'))) {
  throw new Error(`Unexpected output directory: ${outDir}`);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

execFileSync(
  'npx',
  [
    'tsc',
    '--ignoreConfig',
    'src/services/translator.ts',
    '--outDir',
    outDir,
    '--module',
    'commonjs',
    '--target',
    'es2020',
    '--strict',
    '--skipLibCheck',
  ],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
);

const require = createRequire(import.meta.url);
const { DEEPSEEK_BUSY_MESSAGE, formatDeepSeekRequestError } = require(
  resolve(outDir, 'translator.js'),
);

const cases = [
  {
    name: 'service too busy',
    actual: formatDeepSeekRequestError('翻译', 400, { error: { message: 'service too busy' } }),
    expected: `翻译请求失败：${DEEPSEEK_BUSY_MESSAGE}`,
  },
  {
    name: '429 rate limit',
    actual: formatDeepSeekRequestError('罗马音', 429, { error: { message: 'Rate limit reached' } }),
    expected: `罗马音请求失败：${DEEPSEEK_BUSY_MESSAGE}`,
  },
  {
    name: '503 overloaded',
    actual: formatDeepSeekRequestError('翻译', 503, { error: { message: 'model overloaded' } }),
    expected: `翻译请求失败：${DEEPSEEK_BUSY_MESSAGE}`,
  },
  {
    name: '401 auth',
    actual: formatDeepSeekRequestError('罗马音', 401, { error: { message: 'invalid api key' } }),
    expected: '罗马音请求失败：API Key 无效或无权限，请检查 Key 是否填写正确。',
  },
  {
    name: 'plain upstream',
    actual: formatDeepSeekRequestError('翻译', 400, { error: { message: 'bad request' } }),
    expected: '翻译请求失败：bad request',
  },
];

for (const item of cases) {
  if (item.actual !== item.expected) {
    throw new Error(`${item.name}: expected "${item.expected}", got "${item.actual}"`);
  }
}

console.log(`LLM error message checks passed (${cases.length} cases).`);
rmSync(outDir, { recursive: true, force: true });
