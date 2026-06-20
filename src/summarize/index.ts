import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { loadEnvFile, parsePositiveIntegerEnv } from "../env.js";
import { createProvider, type SummarizeResult } from "../providers.js";
import { fetchArticleContent } from "./content.js";
import { generateHtmlReport, generateIndexPage } from "./html.js";
import { ensureSourceReferences } from "./source-refs.js";

// --- Types ---

type CollectedArticle = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAt?: string;
};

type ArticlesJson = {
  date: string;
  collectedAt: string;
  articleCount: number;
  articles: CollectedArticle[];
};

type ArticleSummary = {
  articleId: string;
  title: string;
  sourceName: string;
  url: string;
  summary: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
};

type SummariesJson = {
  date: string;
  provider: string;
  model: string;
  articleCount: number;
  summaries: ArticleSummary[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
};

// --- Article loading ---

async function findLatestArticlesJson(): Promise<string> {
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

// --- Per-article summarization ---

const ARTICLE_SYSTEM_PROMPT = `You summarize WordPress technical articles for busy freelance and agency developers.
Rules:
- 2-3 sentences maximum.
- Include the key technical takeaway if there is one.
- Be specific, not generic.
- Do not use marketing phrases like "dive deep into" or "in this article we explore."
- Do not evaluate or review the article — just summarize what it says.
- Respond with the summary only. No prefixes like "Here is the summary" or "Summary:".`;

function buildArticlePrompt(article: CollectedArticle, content: string): string {
  return `Title: ${article.title}
Source: ${article.sourceName}
URL: ${article.url}

${content.slice(0, 4000)}`;
}

async function summarizeArticle(
  article: CollectedArticle,
  provider: ReturnType<typeof createProvider>,
): Promise<ArticleSummary> {
  process.stdout.write(`  Fetching: ${article.title.slice(0, 60)}... `);

  let content: string;
  try {
    content = await fetchArticleContent(article.url);
    process.stdout.write(`(${content.length} chars) `);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(`SKIP (${message})\n`);
    return {
      articleId: article.id,
      title: article.title,
      sourceName: article.sourceName,
      url: article.url,
      summary: `[Content unavailable: ${message}]`,
      model: provider.model,
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  process.stdout.write("summarizing... ");
  const result = await provider.summarize(
    ARTICLE_SYSTEM_PROMPT,
    buildArticlePrompt(article, content),
  );
  process.stdout.write("done\n");

  return {
    articleId: article.id,
    title: article.title,
    sourceName: article.sourceName,
    url: article.url,
    summary: result.text.trim(),
    model: provider.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  };
}

// --- Concurrency ---

const DEFAULT_CONCURRENCY = 3;

async function summarizeArticleBatch(
  articles: CollectedArticle[],
  provider: ReturnType<typeof createProvider>,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<ArticleSummary[]> {
  const results: ArticleSummary[] = new Array(articles.length);
  const queue = articles.map((article, index) => ({ article, index }));

  let completed = 0;
  const total = articles.length;

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()!;
      results[item.index] = await summarizeArticle(item.article, provider);
      completed++;
      if (completed < total) {
        process.stdout.write(`  [${completed}/${total}] `);
      }
    }
  }

  const workerCount = Math.min(concurrency, articles.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  process.stdout.write(`  [${completed}/${total}]\n`);
  return results;
}

const REPORT_SYSTEM_PROMPT = `You write weekly WordPress trend reports for freelance and agency developers.
Rules:
- Be direct and specific, not generic.
- Every claim must be traceable to a source article.
- Write in clear, plain language — no hype, no marketing speak.
- Avoid phrases like "diving deep," "in this report we explore," "game-changing," or "unprecedented."
- If there is no real trend or implication, say so rather than inventing one.`;

function buildReportPrompt(
  summaries: ArticleSummary[],
  date: string,
): string {
  // Distill each summary to its first key sentence for the inventory
  const inventory = summaries
    .map((s, i) => {
      const firstSentence = s.summary.split(". ")[0] + ".";
      return `${i + 1}. **${s.title}** (${s.sourceName})\n   ${firstSentence}`;
    })
    .join("\n\n");

  return `Week ending ${date}. ${summaries.length} articles from WordPress developer sources.

## Article Inventory

Every item below must appear in the Weekly Summary. If an item has no developer relevance, note that explicitly — do not silently skip it.

${inventory}

## Weekly Summary

Include these three sub-sections using exactly the heading levels shown:

### Article Inventory
List every article from the inventory above with its number. Reference articles by title and source.

### Emerging Trends
Topics appearing across multiple sources — or note if there are none.

### Developer Implications
What a freelance or agency WordPress developer should pay attention to. Be specific: name APIs, versions, deadlines, or decisions that affect real projects.`;
}

// --- Report assembly ---

function assembleReport(
  date: string,
  articles: CollectedArticle[],
  synthesis: string,
  summaries: ArticleSummary[],
  provider: ReturnType<typeof createProvider>,
  totalPromptTokens: number,
  totalCompletionTokens: number,
): string {
  const ensuredSynthesis = ensureSourceReferences(synthesis, articles);

  // Group articles by source for the source listing
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

${ensuredSynthesis}

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

// --- Summaries persistence ---

async function writeSummariesJson(
  date: string,
  summaries: ArticleSummary[],
  provider: ReturnType<typeof createProvider>,
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

// --- Summary caching ---

async function loadExistingSummaries(
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

// --- Main ---

async function main(): Promise<void> {
  loadEnvFile();

  console.log("WP Trend Watcher — summarize\n");

  const provider = createProvider();
  const concurrency = parsePositiveIntegerEnv(
    "WP_TREND_CONCURRENCY",
    DEFAULT_CONCURRENCY,
  );
  console.log(`Provider: ${provider.name}/${provider.model}\n`);

  // 1. Load articles
  const inputPath = await findLatestArticlesJson();
  console.log(`Articles: ${inputPath}`);
  const raw = await readFile(inputPath, "utf8");
  const articlesData = JSON.parse(raw) as ArticlesJson;
  console.log(`  ${articlesData.articleCount} articles from ${new Set(articlesData.articles.map((a) => a.sourceName)).size} sources\n`);

  // 2. Load cached summaries, determine what's new
  const { summaries: cachedSummaries, existingIds } =
    await loadExistingSummaries(articlesData.date);
  const newArticles = articlesData.articles.filter(
    (a) => !existingIds.has(a.id),
  );
  const skippedCount = articlesData.articleCount - newArticles.length;

  if (skippedCount > 0) {
    console.log(
      `  ${skippedCount} article${skippedCount > 1 ? "s" : ""} already summarized (cached)\n`,
    );
  }

  // 3. Per-article summarization (parallel, max 3 concurrent)
  let newSummaries: ArticleSummary[] = [];
  if (newArticles.length > 0) {
    console.log(
      `Summarizing ${newArticles.length} new article${newArticles.length > 1 ? "s" : ""}:\n`,
    );
    newSummaries = await summarizeArticleBatch(newArticles, provider, concurrency);
  }

  const summaries = [...cachedSummaries, ...newSummaries];

  const successfulSummaries = summaries.filter((s) => s.promptTokens > 0);
  const totalPromptTokens = summaries.reduce(
    (sum, s) => sum + s.promptTokens,
    0,
  );
  const totalCompletionTokens = summaries.reduce(
    (sum, s) => sum + s.completionTokens,
    0,
  );

  console.log(
    `\n${successfulSummaries.length}/${summaries.length} articles summarized successfully`,
  );

  // 3. Save per-article summaries
  const summariesPath = await writeSummariesJson(
    articlesData.date,
    summaries,
    provider,
    totalPromptTokens,
    totalCompletionTokens,
  );
  console.log(`\nSummaries saved: ${summariesPath}`);

  // 4. Cross-article synthesis
  const synthesisResult: SummarizeResult = await provider.summarize(
    REPORT_SYSTEM_PROMPT,
    buildReportPrompt(successfulSummaries, articlesData.date),
  );
  const synthesisPromptTokens = synthesisResult.promptTokens;
  const synthesisCompletionTokens = synthesisResult.completionTokens;

  // 5. Assemble and write report
  const report = assembleReport(
    articlesData.date,
    articlesData.articles,
    synthesisResult.text.trim(),
    summaries,
    provider,
    totalPromptTokens + synthesisPromptTokens,
    totalCompletionTokens + synthesisCompletionTokens,
  );

  const outputPath = join(process.cwd(), "reports", `${articlesData.date}.md`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report, "utf8");

  console.log(`Report written: ${outputPath}`);

  // 6. Generate HTML report (non-blocking — warn on failure)
  try {
    const htmlPath = await generateHtmlReport(outputPath);
    console.log(`HTML report written: ${htmlPath}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: HTML report generation failed: ${message}`);
  }

  // 7. Regenerate index page (non-blocking)
  try {
    const reportsDir = join(process.cwd(), "reports");
    const indexPath = await generateIndexPage(reportsDir);
    console.log(`Index page written: ${indexPath}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: Index page generation failed: ${message}`);
  }
}

await main();
