import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { loadEnvFile } from "../env.js";
import { createProvider, type SummarizeResult } from "../providers.js";
import { generateHtmlReport, generateIndexPage } from "../summarize/html.js";
import {
  type ArticlesJson,
  type ArticleSummary,
  type SummariesJson,
  findLatestArticlesJson,
  findPreviousReportPath,
  REPORT_SYSTEM_PROMPT,
  buildReportPrompt,
  assembleReport,
} from "../summarize/report.js";

/**
 * Load summaries for a specific date, failing if none exist.
 *
 * Unlike the summarize pipeline which lazily creates missing summaries,
 * generate-report requires pre-existing summaries (from a prior `pnpm summarize`
 * run).
 *
 * @param date - Date string in YYYY-MM-DD format
 * @returns All ArticleSummary entries for that date
 * @throws If no summaries.json exists for the given date
 */
async function loadRequiredSummaries(date: string): Promise<ArticleSummary[]> {
  const filePath = join(
    process.cwd(),
    "data/articles",
    date,
    "summaries.json",
  );
  try {
    const raw = await readFile(filePath, "utf8");
    const data = JSON.parse(raw) as SummariesJson;
    return data.summaries;
  } catch {
    throw new Error(
      `No summaries found for ${date}. Run \`pnpm summarize\` first to generate article summaries.`,
    );
  }
}

/**
 * Generate Markdown and HTML trend reports from existing article summaries.
 *
 * This command regenerates the cross-article synthesis and reports without
 * re-summarizing individual articles. Useful for iterating on report prompts
 * without incurring per-article LLM costs.
 */
async function main(): Promise<void> {
  loadEnvFile();

  console.log("WP Trend Watcher — generate-report\n");

  const provider = createProvider();
  console.log(`Provider: ${provider.name}/${provider.model}\n`);

  // 1. Load articles
  const inputPath = await findLatestArticlesJson();
  console.log(`Articles: ${inputPath}`);
  const raw = await readFile(inputPath, "utf8");
  const articlesData = JSON.parse(raw) as ArticlesJson;
  console.log(`  ${articlesData.articleCount} articles from ${new Set(articlesData.articles.map((a) => a.sourceName)).size} sources\n`);

  // 2. Load summaries (must exist)
  const summaries = await loadRequiredSummaries(articlesData.date);
  console.log(`Summaries: ${summaries.length} loaded\n`);

  const successfulSummaries = summaries.filter((s) => s.promptTokens > 0);
  const cachedPromptTokens = summaries.reduce(
    (sum, s) => sum + s.promptTokens,
    0,
  );
  const cachedCompletionTokens = summaries.reduce(
    (sum, s) => sum + s.completionTokens,
    0,
  );

  console.log(
    `${successfulSummaries.length}/${summaries.length} articles with successful summaries`,
  );

  // 3. Cross-article synthesis
  console.log("\nGenerating cross-article synthesis...");
  const synthesisResult: SummarizeResult = await provider.summarize(
    REPORT_SYSTEM_PROMPT,
    buildReportPrompt(successfulSummaries, articlesData.date),
  );
  const synthesisPromptTokens = synthesisResult.promptTokens;
  const synthesisCompletionTokens = synthesisResult.completionTokens;

  // 4. Load previous report for comparison (non-blocking)
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

  // 5. Load existing same-date report for preservation (non-blocking)
  let existingReportMd: string | null = null;
  try {
    const existingPath = join(
      process.cwd(),
      "reports",
      `${articlesData.date}.md`,
    );
    existingReportMd = await readFile(existingPath, "utf8");
  } catch {
    // No existing report for this date — use fresh placeholder
  }

  // 6. Assemble and write report
  const report = assembleReport(
    articlesData.date,
    articlesData.articles,
    synthesisResult.text.trim(),
    summaries,
    provider,
    cachedPromptTokens + synthesisPromptTokens,
    cachedCompletionTokens + synthesisCompletionTokens,
    previousReportMd,
    existingReportMd,
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

  // 6. Regenerate index page (non-blocking)
  try {
    const reportsDir = join(process.cwd(), "reports");
    const indexPath = await generateIndexPage(reportsDir);
    console.log(`Index page written: ${indexPath}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: Index page generation failed: ${message}`);
  }

  console.log("\nDone.");
}

await main();
