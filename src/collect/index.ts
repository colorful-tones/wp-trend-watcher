import Parser from "rss-parser";
import { sources, type Source } from "../sources.js";
import { writeArticlesJson, type CollectedArticle } from "./storage.js";

type FeedItem = {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  isoDate?: string;
};

const parser = new Parser<Record<string, unknown>, FeedItem>({
  timeout: 15_000,
});

async function collectSource(source: Source): Promise<CollectedArticle[]> {
  try {
    const feed = await parser.parseURL(source.feedUrl);
    const latestItem = feed.items[0];
    const articles = feed.items.flatMap((item) => toCollectedArticle(source, item));

    console.log(`\n${source.name}`);
    console.log(`Feed: ${source.feedUrl}`);
    console.log(`Items: ${feed.items.length}`);

    if (!latestItem) {
      console.log("Latest: No items found");
      return articles;
    }

    console.log(`Latest title: ${latestItem.title ?? "Untitled"}`);
    console.log(`Latest URL: ${latestItem.link ?? latestItem.guid ?? "No URL found"}`);

    return articles;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`\n${source.name}`);
    console.error(`Feed: ${source.feedUrl}`);
    console.error(`Error: ${message}`);

    return [];
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

function parseDaysArg(): number {
  const daysIndex = process.argv.indexOf("--days");
  if (daysIndex === -1 || daysIndex === process.argv.length - 1) {
    return 7;
  }
  const value = parseInt(process.argv[daysIndex + 1], 10);
  if (isNaN(value) || value < 0) {
    console.warn("Invalid --days value, defaulting to 7");
    return 7;
  }
  return value;
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
  const recentDays = parseDaysArg();
  const tierOneSources = sources.filter((source) => source.tier === 1);

  console.log(`Collecting ${tierOneSources.length} Tier 1 sources...`);
  if (recentDays > 0) {
    console.log(`Filtering to articles from the last ${recentDays} days`);
  }

  const articleGroups = await Promise.all(tierOneSources.map((source) => collectSource(source)));
  let articles = articleGroups.flat();

  const totalCollected = articles.length;
  articles = filterRecentArticles(articles, recentDays);
  const filteredOut = totalCollected - articles.length;
  if (filteredOut > 0) {
    console.log(`\nFiltered out ${filteredOut} articles older than ${recentDays} days`);
  }

  const result = await writeArticlesJson({ articles });

  console.log(`\nSaved ${result.articleCount} articles to ${result.filePath}`);
}

await main();
