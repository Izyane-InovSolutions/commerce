/**
 * Most distinct terms one search is split into; the rest are ignored. Every
 * term adds its own OR-of-joins to the query, so an unbounded count would let
 * one request build an arbitrarily expensive plan.
 */
export const MAX_SEARCH_TERMS = 8;

/**
 * Longest a single term may be; longer ones are cut to this. Nothing
 * legitimate in a product name, SKU or seller name needs more, and it keeps
 * a pasted paragraph from becoming one huge ILIKE pattern.
 */
export const MAX_SEARCH_TERM_LENGTH = 64;

// Punctuation hugging a word ("shoes," or "(red)") would otherwise have to
// match literally. Only the ends are trimmed, so "t-shirt", "H&M" and SKUs
// like "AB-12" keep their inner characters.
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * Splits free-text search into the terms that must each match somewhere on a
 * product. Whitespace separates terms; duplicates (ignoring case) collapse to
 * the first occurrence, and a term made only of punctuation is dropped. An
 * empty result means "no text filter".
 *
 * Short terms are kept even though pg_trgm cannot narrow on fewer than three
 * characters — dropping them would silently change what "iphone 5" means.
 */
export function searchTerms(query: string | undefined): string[] {
  if (!query) return [];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of query.split(/\s+/)) {
    const term = raw
      .replace(EDGE_PUNCTUATION, '')
      .slice(0, MAX_SEARCH_TERM_LENGTH);
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length === MAX_SEARCH_TERMS) break;
  }
  return terms;
}
