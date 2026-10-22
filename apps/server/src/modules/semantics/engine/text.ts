// Token matching used by browse and resolve.
// Ported from EvoOntology runtime/runtime.py (`_tokens`, `_has_contradictory_tokens`),
// https://github.com/ruc-datalab/EvoOntology, MIT, Copyright (c) 2026 Meiduo Chong.
// Ours: French stopwords and accent folding, since Kumo's columns and users speak French.

const EN_STOPWORDS = [
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'between', 'by', 'for',
  'from', 'how', 'in', 'is', 'many', 'of', 'on', 'or', 'per', 'that',
  'the', 'to', 'was', 'were', 'what', 'when', 'where', 'which', 'who',
  'with',
];
const FR_STOPWORDS = [
  'au', 'aux', 'avec', 'ce', 'ces', 'combien', 'dans', 'de', 'des', 'du', 'en', 'entre', 'est', 'et',
  'la', 'le', 'les', 'leur', 'leurs', 'ou', 'par', 'pour', 'quel', 'quelle', 'quelles', 'quels', 'qui',
  'quoi', 'sont', 'sur', 'un', 'une',
];
const STOPWORDS = new Set([...EN_STOPWORDS, ...FR_STOPWORDS]);

/** Lower case without accents: "Décision" → "decision". */
export function fold(text: string): string {
  return String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Significant words of a text, singularized the way EvoOntology does it. */
export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  const normalized = fold(text).replace(/_/g, ' ');
  for (let token of normalized.match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (token.length <= 1 || STOPWORDS.has(token)) continue;
    if (token.length > 4 && token.endsWith('ies')) token = token.slice(0, -3) + 'y';
    else if (token.length > 3 && token.endsWith('s') && !/(ss|us|is)$/.test(token)) token = token.slice(0, -1);
    out.add(token);
  }
  return out;
}

const CONTRADICTORY: [string, string][] = [
  ['monthly', 'weekly'], ['weekly', 'monthly'],
  ['male', 'female'], ['female', 'male'],
  ['before', 'after'], ['after', 'before'],
];

/** Reject concepts whose categorical qualifier contradicts the query. */
export function hasContradictoryTokens(queryTokens: Set<string>, conceptTokens: Set<string>): boolean {
  return CONTRADICTORY.some(([q, c]) => queryTokens.has(q) && conceptTokens.has(c));
}

export function intersect(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => b.has(x)).sort();
}
