import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { loadEnvFile, parsePositiveIntegerEnv } from "../env.js";
import { createProvider, type SummarizeResult } from "../providers.js";
import { fetchArticleContent } from "./content.js";
import { generateHtmlReport, generateIndexPage } from "./html.js";
import {
  type CollectedArticle,
  type ArticlesJson,
  type ArticleSummary,
  findLatestArticlesJson,
  findPreviousReportPath,
  loadExistingSummaries,
  writeSummariesJson,
  REPORT_SYSTEM_PROMPT,
  buildReportPrompt,
  assembleReport,
} from "./report.js";

// --- Per-article summarization ---

const ARTICLE_SYSTEM_PROMPT = `You summarize WordPress technical articles for busy freelance and agency developers.
Rules:
- 2-3 sentences maximum.
- Include the key technical takeaway if there is one.
- Be specific, not generic.
- Do not use marketing phrases like "dive deep into" or "in this article we explore."
- For release roadmap, schedule, proposal, or call-for-testing posts, include dates, proposed focus areas, decisions under discussion, and developer-facing implications.
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

  // 4. Save per-article summaries
  const summariesPath = await writeSummariesJson(
    articlesData.date,
    summaries,
    provider,
    totalPromptTokens,
    totalCompletionTokens,
  );
  console.log(`\nSummaries saved: ${summariesPath}`);

  // 5. Cross-article synthesis
  const synthesisResult: SummarizeResult = await provider.summarize(
    REPORT_SYSTEM_PROMPT,
    buildReportPrompt(successfulSummaries, articlesData.date),
  );
  const synthesisPromptTokens = synthesisResult.promptTokens;
  const synthesisCompletionTokens = synthesisResult.completionTokens;

  // 6. Load previous report for comparison (non-blocking)
  let previousReportMd: string | null = null;
  try {
    const reportsDir = join(process.cwd(), "reports");
    const previousReportPath = await findPreviousReportPath(
      reportsDir,
      articlesData.date,
    );
    if (previousReportPath) {
      previousReportMd = await readFile(previousReportPath, "utf8");
    }
  } catch {
    // No previous report available — comparison section will be omitted
  }

  // 6. Assemble and write report
  const report = assembleReport(
    articlesData.date,
    articlesData.articles,
    synthesisResult.text.trim(),
    summaries,
    provider,
    totalPromptTokens + synthesisPromptTokens,
    totalCompletionTokens + synthesisCompletionTokens,
    previousReportMd,
  );

  const outputPath = join(process.cwd(), "reports", `${articlesData.date}.md`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report, "utf8");

  console.log(`Report written: ${outputPath}`);

  // 7. Generate HTML report (non-blocking — warn on failure)
  try {
    const htmlPath = await generateHtmlReport(outputPath);
    console.log(`HTML report written: ${htmlPath}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: HTML report generation failed: ${message}`);
  }

  // 8. Regenerate index page (non-blocking)
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
