/**
 * Post-processing step that ensures every source article is referenced
 * in the synthesis text. Appends a compact reference section for any
 * articles the LLM omitted.
 */

/** Minimal article shape needed for reference enforcement. */
export interface ArticleRef {
  title: string;
  url: string;
}

/** Common English stop words to skip when matching titles. */
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
]);

/**
 * Check whether an article is referenced in a text body.
 *
 * Uses a multi-strategy approach:
 * 1. Exact title match
 * 2. Exact URL match
 * 3. Word-based matching — if enough significant title words appear in the text,
 *    the article is considered referenced (handles paraphrased titles).
 *
 * @param title - The article title.
 * @param url - The article URL.
 * @param text - The text body to search (e.g. the synthesis/report body).
 * @returns True if the article appears to be referenced.
 */
export function isArticleReferenced(
  title: string,
  url: string,
  text: string,
): boolean {
  // Exact matches
  if (text.includes(title)) return true;
  if (text.includes(url)) return true;

  // Word-based matching: check if significant title words appear in the text
  const significantWords = title
    .replace(/[^a-zA-Z0-9.\-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));

  if (significantWords.length === 0) return false;

  const textLower = text.toLowerCase();
  const found = significantWords.filter((w) =>
    textLower.includes(w.toLowerCase()),
  );

  // Require at least 60% of significant words to match
  return found.length / significantWords.length >= 0.6;
}

/**
 * Ensure every source article is referenced in the synthesis text.
 *
 * Checks if each article is referenced (by title, URL, or significant word
 * overlap). For any that are missing, appends a compact "Source References"
 * section listing them with inline markdown links.
 *
 * @param synthesis - The LLM-generated synthesis text.
 * @param articles - All collected source articles (need at least title and url).
 * @returns The synthesis text, with unreferenced articles appended if needed.
 */
export function ensureSourceReferences(
  synthesis: string,
  articles: ArticleRef[],
): string {
  const unreferenced = articles.filter(
    (a) => !isArticleReferenced(a.title, a.url, synthesis),
  );

  if (unreferenced.length === 0) return synthesis;

  const refs = unreferenced
    .map((a) => `- [${a.title}](${a.url})`)
    .join("\n");

  return `${synthesis}\n\n**Additional source references:**\n${refs}`;
}
