import Parser from "rss-parser";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvFile, parseNonNegativeIntegerEnv } from "../env.js";
import { type Source } from "../sources.js";
import { loadSources } from "../load-sources.js";
import { writeArticlesJson, type CollectedArticle } from "./storage.js";

type FeedItem = {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  isoDate?: string;
};

type SourceResult = {
  source: Source;
  articles: CollectedArticle[];
  error: string | null;
};

const parser = new Parser<Record<string, unknown>, FeedItem>({
  timeout: 15_000,
});

async function collectSource(source: Source): Promise<SourceResult> {
  try {
    const feed = await parser.parseURL(source.feedUrl);
    const articles = feed.items.flatMap((item) => toCollectedArticle(source, item));

    console.log(`  [ok] ${source.name} — ${articles.length} items`);

    return { source, articles, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  [err] ${source.name} — ${message}`);
    return { source, articles: [], error: message };
  }
}

function toCollectedArticle(source: Source, item: FeedItem): CollectedArticle[] {
  const url = item.link ?? item.guid;

  if (!url) {
    return [];
  }

  return [
    {
      id: `${source.id}:${url}`,
      sourceId: source.id,
      sourceName: source.name,
      title: item.title ?? "Untitled",
      url,
      publishedAt: item.isoDate ?? item.pubDate,
    },
  ];
}

async function parseDaysArg(): Promise<number> {
  const daysIndex = process.argv.indexOf("--days");
  if (daysIndex !== -1 && daysIndex < process.argv.length - 1) {
    const value = parseInt(process.argv[daysIndex + 1], 10);
    if (!isNaN(value) && value >= 0) {
      return value;
    }
    console.warn("Invalid --days value, using automatic detection");
  }
  return resolveDefaultDays();
}

/**
 * Resolve the default `--days` value when no explicit flag is passed.
 *
 * Priority:
 * 1. `WP_TREND_DAYS` env var
 * 2. Days since the most recent report in `reports/`
 * 3. 7 days
 */
async function resolveDefaultDays(): Promise<number> {
  const envDays = parseNonNegativeIntegerEnv("WP_TREND_DAYS", -1);
  if (envDays !== -1) {
    return envDays;
  }
  return (await findDaysSinceLastReport()) ?? 7;
}

/**
 * Scan `reports/` for the most recent YYYY-MM-DD.md file and return
 * the number of days between that date and today.
 *
 * @param reportsDir - Optional reports directory path (defaults to cwd/reports)
 * @returns Number of days, or null when no reports exist or the directory is absent.
 */
export async function findDaysSinceLastReport(
  reportsDir?: string,
): Promise<number | null> {
  const dir = reportsDir ?? join(process.cwd(), "reports");
  const reportDatePattern = /^(\d{4}-\d{2}-\d{2})\.md$/;

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return null;
  }

  const dates = files
    .map((file) => file.match(reportDatePattern))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => match[1])
    .sort()
    .reverse();

  if (dates.length === 0) {
    return null;
  }

  const latestDate = new Date(dates[0]);
  const today = new Date();
  const diffMs = today.getTime() - latestDate.getTime();
  // Add 1 so a report generated today yields 1 day (not 0),
  // and a report from yesterday catches articles from both days.
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

function filterRecentArticles(articles: CollectedArticle[], days: number): CollectedArticle[] {
  if (days === 0) {
    return articles;
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return articles.filter((article) => {
    if (!article.publishedAt) {
      return false;
    }
    const publishedDate = new Date(article.publishedAt);
    return publishedDate >= cutoff;
  });
}

async function main(): Promise<void> {
  loadEnvFile();

  const recentDays = await parseDaysArg();
  const sources = await loadSources();
  const sourceCount = sources.length;
  const tier1Count = sources.filter((s) => s.tier === 1).length;
  const tier2Count = sources.filter((s) => s.tier === 2).length;

  console.log(`Collecting from ${sourceCount} sources (${tier1Count} Tier 1, ${tier2Count} Tier 2)...`);
  if (recentDays > 0) {
    console.log(`Filtering to articles from the last ${recentDays} days\n`);
  }

  const results = await Promise.all(sources.map((source) => collectSource(source)));

  const totalCollected = results.reduce((sum, r) => sum + r.articles.length, 0);
  const errors = results.filter((r) => r.error !== null);
  const errorCount = errors.length;

  let allArticles = results.flatMap((r) => r.articles);
  allArticles = filterRecentArticles(allArticles, recentDays);
  const filteredOut = totalCollected - allArticles.length;

  const result = await writeArticlesJson({ articles: allArticles });

  // Summary
  console.log("");
  console.log(`Collection complete`);
  console.log(`  Saved:      ${result.articleCount} articles to ${result.filePath}`);
  if (filteredOut > 0) {
    console.log(`  Filtered:   ${filteredOut} older than ${recentDays} days`);
  }
  if (errorCount > 0) {
    console.log(`  Errors:     ${errorCount} source(s) failed`);
    for (const e of errors) {
      console.log(`    - ${e.source.name}: ${e.error}`);
    }
  }
}

await main();
