const KANJI_CHARS = '\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff々〆ヶ';
const HIRAGANA_CHARS = '\\u3041-\\u3096\\u309d-\\u309f';
const KATAKANA_CHARS = '\\u30a1-\\u30fa\\u30fd-\\u30ff\\u31f0-\\u31ff\\uff66-\\uff9d';
const KANA_MARKS = 'ーｰ';
const RUBY_BASE_CHARS = `${KANJI_CHARS}${HIRAGANA_CHARS}${KATAKANA_CHARS}${KANA_MARKS}`;
const RUBY_READING_CHARS = `${HIRAGANA_CHARS}${KATAKANA_CHARS}${KANA_MARKS}`;
const RUBY_READING_SEPARATORS = '\\s\\u3000・･=＝\\-';

const MARKED_AOZORA_RUBY_RE = new RegExp(
  `｜([^《》\\r\\n]{1,48})《([${RUBY_READING_CHARS}${RUBY_READING_SEPARATORS}]{1,80})》`,
  'g',
);
const ANGLE_RUBY_RE = new RegExp(
  `([${RUBY_BASE_CHARS}]{1,48})《([${RUBY_READING_CHARS}${RUBY_READING_SEPARATORS}]{1,80})》`,
  'g',
);
const PAREN_RUBY_RE = new RegExp(
  `([${RUBY_BASE_CHARS}]{1,48})[（(]([${RUBY_READING_CHARS}${RUBY_READING_SEPARATORS}]{1,80})[）)]`,
  'g',
);
const HAS_KANJI_RE = new RegExp(`[${KANJI_CHARS}]`);
const HAS_KANA_RE = new RegExp(`[${RUBY_READING_CHARS}]`);
const ONLY_READING_RE = new RegExp(`^[${RUBY_READING_CHARS}${RUBY_READING_SEPARATORS}]+$`);
const FLATTENED_RUBY_CANDIDATE_RE = new RegExp(
  `([${KANJI_CHARS}]{2,8})([${HIRAGANA_CHARS}]{3,16})(?=$|[\\s\\u3000。、！？!?」』）)\\]\\}])`,
  'g',
);

export interface FlattenedRubyCandidate {
  text: string;
  base: string;
  reading: string;
  index: number;
}

export function normalizeTextForSpeech(text: string): string {
  if (!text) return text;

  return text
    .replace(MARKED_AOZORA_RUBY_RE, (match, base: string, reading: string) =>
      isHighConfidenceRuby(base, reading) ? base : match,
    )
    .replace(ANGLE_RUBY_RE, (match, base: string, reading: string) =>
      isHighConfidenceRuby(base, reading) ? base : match,
    )
    .replace(PAREN_RUBY_RE, (match, base: string, reading: string) =>
      isHighConfidenceRuby(base, reading) ? base : match,
    );
}

export function findFlattenedRubyCandidates(text: string): FlattenedRubyCandidate[] {
  const candidates: FlattenedRubyCandidate[] = [];
  let match: RegExpExecArray | null;
  FLATTENED_RUBY_CANDIDATE_RE.lastIndex = 0;

  while ((match = FLATTENED_RUBY_CANDIDATE_RE.exec(text)) !== null) {
    candidates.push({
      text: match[0],
      base: match[1],
      reading: match[2],
      index: match.index,
    });
  }

  return candidates;
}

function isHighConfidenceRuby(base: string, reading: string): boolean {
  return HAS_KANJI_RE.test(base) && HAS_KANA_RE.test(reading) && ONLY_READING_RE.test(reading);
}
