import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { SummarizeProvider } from "../providers.js";
import { ensureSourceReferences } from "./source-refs.js";

// --- Types ---

export type CollectedArticle = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAt?: string;
};

export type ArticlesJson = {
  date: string;
  collectedAt: string;
  articleCount: number;
  articles: CollectedArticle[];
};

export type ArticleSummary = {
  articleId: string;
  title: string;
  sourceName: string;
  url: string;
  summary: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
};

export type SummariesJson = {
  date: string;
  provider: string;
  model: string;
  articleCount: number;
  summaries: ArticleSummary[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
};

// --- Article loading ---

/**
 * Find the most recent articles.json file under data/articles/.
 *
 * Scans date-named subdirectories in descending order and returns the first
 * one that contains an articles.json file.
 *
 * @returns Absolute path to the latest articles.json
 * @throws If no articles.json files are found
 */
export async function findLatestArticlesJson(): Promise<string> {
  const { readdir } = await import("node:fs/promises");
  const articlesRoot = join(process.cwd(), "data/articles");
  const dateDirs = await readdir(articlesRoot);
  const sorted = dateDirs.sort().reverse();

  for (const dateDir of sorted) {
    const filePath = join(articlesRoot, dateDir, "articles.json");
    try {
      await readFile(filePath);
      return filePath;
    } catch {
      continue;
    }
  }

  throw new Error("No articles.json files found. Run `pnpm collect` first.");
}

// --- Summary persistence ---

/**
 * Load cached per-article summaries for a given date.
 *
 * @param date - Date string in YYYY-MM-DD format
 * @returns Existing summaries and the set of already-summarized article IDs
 */
export async function loadExistingSummaries(
  date: string,
): Promise<{ summaries: ArticleSummary[]; existingIds: Set<string> }> {
  const filePath = join(
    process.cwd(),
    "data/articles",
    date,
    "summaries.json",
  );
  try {
    const raw = await readFile(filePath, "utf8");
    const data = JSON.parse(raw) as SummariesJson;
    const summaries = data.summaries;
    const existingIds = new Set(summaries.map((s) => s.articleId));
    return { summaries, existingIds };
  } catch {
    return { summaries: [], existingIds: new Set() };
  }
}

/**
 * Write per-article summaries to data/articles/{date}/summaries.json.
 *
 * @param date - Date string in YYYY-MM-DD format
 * @param summaries - Article summaries to persist
 * @param provider - The LLM provider (used for metadata)
 * @param totalPromptTokens - Cumulative prompt tokens
 * @param totalCompletionTokens - Cumulative completion tokens
 * @returns Absolute path to the written file
 */
export async function writeSummariesJson(
  date: string,
  summaries: ArticleSummary[],
  provider: SummarizeProvider,
  totalPromptTokens: number,
  totalCompletionTokens: number,
): Promise<string> {
  const payload: SummariesJson = {
    date,
    provider: provider.name,
    model: provider.model,
    articleCount: summaries.length,
    summaries,
    totalPromptTokens,
    totalCompletionTokens,
  };

  const filePath = join(
    process.cwd(),
    "data/articles",
    date,
    "summaries.json",
  );
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return filePath;
}

// --- Report prompts ---

export const REPORT_SYSTEM_PROMPT = `You write weekly WordPress trend reports for freelance and agency developers.
Rules:
- Be direct and specific, not generic.
- Every claim must be traceable to a source article.
- Write in clear, plain language — no hype, no marketing speak.
- Avoid phrases like "diving deep," "in this report we explore," "game-changing," or "unprecedented."
- If there is no real trend or implication, say so rather than inventing one.`;

/**
 * Detect whether an article title is likely to be a high-signal WordPress
 * release-planning post that should retain more summary detail in synthesis.
 *
 * @param title - Article title to classify
 * @returns True when the title contains release-planning signals
 */
export function isHighSignalReleasePlanningArticle(title: string): boolean {
  return /\b(?:roadmap|release schedule|release squad|proposal|call for testing|beta|release candidate)\b/i.test(
    title,
  ) || /\bWordPress\s+\d+\.\d+(?:\.\d+)?\b/i.test(title);
}

/**
 * Build the user prompt for cross-article synthesis.
 *
 * Produces a structured prompt containing an inventory of all article
 * summaries, with instructions to synthesize only trend and implication
 * sections. The Article Inventory section is assembled deterministically from
 * saved summaries during report assembly.
 *
 * @param summaries - Successfully summarized articles
 * @param date - Report date in YYYY-MM-DD format
 * @returns The user prompt string for the LLM
 */
export function buildReportPrompt(
  summaries: ArticleSummary[],
  date: string,
): string {
  const inventory = summaries
    .map((s, i) => {
      const highSignal = isHighSignalReleasePlanningArticle(s.title);
      const summary = highSignal ? s.summary : firstSentence(s.summary);
      const signal = highSignal ? " Signal: release planning." : "";
      return `${i + 1}. [${s.title}](${s.url}) (${s.sourceName}) —${signal} ${summary}`;
    })
    .join("\n");

  return `Week ending ${date}. ${summaries.length} articles from WordPress developer sources.

## Source Inventory

Use this inventory as source material for trend and implication synthesis. The final report's Article Inventory section is assembled separately, so do not write an Article Inventory section in your response.

${inventory}

## Weekly Summary

Write only these two sub-sections using exactly the heading levels shown. Do not include an Article Inventory section.

### Emerging Trends
Topics appearing across multiple sources — or note if there are none. Link specific article mentions where useful, without over-linking or inventing links.
Release roadmaps, release schedules, major proposals, and calls for testing need explicit attention here when present. Include concrete dates, proposed changes, and decisions under discussion.

### Developer Implications
What a freelance or agency WordPress developer should pay attention to. Be specific: name APIs, versions, deadlines, or decisions that affect real projects. Link specific article mentions where useful, without over-linking or inventing links.
For release-planning items, explain what freelance and agency developers should monitor, including compatibility risks, testing windows, proposed focus areas, and upcoming decision points.`;
}

/**
 * Build a deterministic Article Inventory section from saved article summaries.
 *
 * @param summaries - Article summaries to list in report order
 * @returns Markdown Article Inventory section with linked titles and takeaways
 */
export function buildArticleInventorySection(
  summaries: ArticleSummary[],
): string {
  const items = summaries
    .map((summary, index) => {
      const takeaway = firstSentence(summary.summary);
      return `${index + 1}. [${summary.title}](${summary.url}) (${summary.sourceName}) — ${takeaway}`;
    })
    .join("\n");

  return `### Article Inventory\n\n${items}`;
}

/**
 * Extract the first sentence-like takeaway from a summary.
 *
 * @param value - Full article summary text
 * @returns First sentence, or the trimmed summary when no sentence terminator exists
 */
function firstSentence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^.*?[.!?](?=\s|$|[A-Z])/s);
  return match ? match[0].trim() : trimmed;
}

/**
 * Remove any LLM-generated Article Inventory from synthesis output.
 *
 * @param synthesis - Raw LLM synthesis text
 * @returns Synthesis text without Weekly Summary or Article Inventory wrappers
 */
function stripGeneratedArticleInventory(synthesis: string): string {
  return synthesis
    .replace(/^## Weekly Summary\b\s*/m, "")
    .replace(
      /^#{2,6}\s+Article Inventory\b[^\n]*\n[\s\S]*?(?=^#{2,6}\s+|(?![\s\S]))/m,
      "",
    )
    .trim();
}

// --- Report assembly ---

/**
 * Assemble a complete Markdown report from synthesis text and metadata.
 *
 * Wraps the LLM synthesis with source articles, build notes, and placeholder
 * sections for human review. Runs source-reference enforcement to catch any
 * articles the LLM omitted.
 *
 * @param date - Report date in YYYY-MM-DD format
 * @param articles - All collected articles
 * @param synthesis - LLM-generated synthesis text
 * @param summaries - All article summaries
 * @param provider - The LLM provider (for build notes)
 * @param totalPromptTokens - Cumulative prompt tokens across all LLM calls
 * @param totalCompletionTokens - Cumulative completion tokens across all LLM calls
 * @returns Assembled Markdown report string
 */
export function assembleReport(
  date: string,
  articles: CollectedArticle[],
  synthesis: string,
  summaries: ArticleSummary[],
  provider: SummarizeProvider,
  totalPromptTokens: number,
  totalCompletionTokens: number,
): string {
  const articleInventory = buildArticleInventorySection(summaries);
  const synthesisWithoutInventory = stripGeneratedArticleInventory(synthesis);
  const weeklySummary = ensureSourceReferences(
    `## Weekly Summary\n\n${articleInventory}\n\n${synthesisWithoutInventory}`,
    articles,
  );

  const bySource = new Map<string, CollectedArticle[]>();
  for (const a of articles) {
    const existing = bySource.get(a.sourceName) ?? [];
    existing.push(a);
    bySource.set(a.sourceName, existing);
  }

  const sourceList = [...bySource.entries()]
    .map(([name, arts]) => {
      const items = arts
        .map((a) => {
          const dateStr = a.publishedAt
            ? new Date(a.publishedAt).toLocaleDateString()
            : "Unknown date";
          return `- [${a.title}](${a.url}) — ${dateStr}`;
        })
        .join("\n");
      return `### ${name}\n${items}`;
    })
    .join("\n\n");

  const sourceNames = [...bySource.keys()].join(", ");
  const cost = provider.costFor({
    text: "",
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
  });
  const costStr =
    cost === 0
      ? "$0.00 (local model)"
      : `$${cost.toFixed(4)}`;

  return `# WordPress Trend Report — ${date}

${weeklySummary}

---

## What I'm Watching
<!-- Human-authored: add your observations here -->

---

## Source Articles

${sourceList}

---

## Build Notes
- Articles analyzed: ${articles.length}
- Sources: ${sourceNames}
- Model: ${provider.name}/${provider.model}
- Tokens: ${totalPromptTokens} prompt + ${totalCompletionTokens} completion
- Estimated cost: ${costStr}
- Review time: (add after human review)
`;
}
