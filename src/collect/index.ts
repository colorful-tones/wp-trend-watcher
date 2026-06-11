import Parser from "rss-parser";
import { sources, type Source } from "../sources.js";

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

async function collectSource(source: Source): Promise<void> {
  try {
    const feed = await parser.parseURL(source.feedUrl);
    const latestItem = feed.items[0];

    console.log(`\n${source.name}`);
    console.log(`Feed: ${source.feedUrl}`);
    console.log(`Items: ${feed.items.length}`);

    if (!latestItem) {
      console.log("Latest: No items found");
      return;
    }

    console.log(`Latest title: ${latestItem.title ?? "Untitled"}`);
    console.log(`Latest URL: ${latestItem.link ?? latestItem.guid ?? "No URL found"}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`\n${source.name}`);
    console.error(`Feed: ${source.feedUrl}`);
    console.error(`Error: ${message}`);
  }
}

async function main(): Promise<void> {
  const tierOneSources = sources.filter((source) => source.tier === 1);

  console.log(`Collecting ${tierOneSources.length} Tier 1 sources...`);

  await Promise.all(tierOneSources.map((source) => collectSource(source)));
}

await main();
