/**
 * Japanese text utility functions.
 */

/** Sentence-ending punctuation in Japanese */
const SENTENCE_END = /[。！？!?…]/;

/** Quotation close brackets that may precede sentence-ending punctuation */
const QUOTE_CLOSE = /[」』】》）]/;

/** Verb-like endings that indicate a quote continues the sentence */
const QUOTE_CONTINUE = /(?:言|思|考|叫|聞|尋|訊|問|答|述|語|書|読|唱|呟|願|祈|怒|笑|泣|驚|嘆|感|叫)[いうかこつぶやねがおこなのわらな]|です|ます|だっ|する/;

/**
 * Check if a character is a Japanese sentence-ending punctuation.
 */
export function isSentenceEnd(char: string): boolean {
  return SENTENCE_END.test(char);
}

/**
 * Check if a character is a Japanese quotation close bracket.
 */
export function isQuoteClose(char: string): boolean {
  return QUOTE_CLOSE.test(char);
}

/**
 * Check if text after a quote close suggests the sentence continues.
 * e.g., 「何だ！」と思った。→ don't split before と
 */
export function shouldContinueAfterQuote(nextText: string): boolean {
  // Take first ~4 chars to check
  const sample = nextText.trimStart().slice(0, 6);
  return QUOTE_CONTINUE.test(sample);
}

/**
 * Detect if a text excerpt contains vertical writing mode CSS.
 */
export function isVerticalText(cssOrStyle: string): boolean {
  return /writing-mode\s*:\s*vertical-rl/.test(cssOrStyle);
}

/**
 * Convert vertical Japanese punctuation to horizontal equivalents.
 */
export function verticalToHorizontalPunctuation(text: string): string {
  return text
    .replace(/﹒/g, '。')
    .replace(/､/g, '、')
    .replace(/¢/g, '！')
    .replace(/ﾂ?/g, '？');
}

/**
 * Strip HTML tags and decode entities from a string.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&nbsp;/g, ' ');
}
