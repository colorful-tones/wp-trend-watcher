import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";

type ArticlesJson = {
  date: string;
  collectedAt: string;
  articleCount: number;
  articles: CollectedArticle[];
};

type CollectedArticle = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAt?: string;
};

async function findLatestArticlesJson(): Promise<string> {
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

  throw new Error("No articles.json files found");
}

function generateReport(articlesData: ArticlesJson): string {
  const { date, articleCount, articles } = articlesData;
  const bySource = new Map<string, CollectedArticle[]>();

  for (const article of articles) {
    const existing = bySource.get(article.sourceName) ?? [];
    existing.push(article);
    bySource.set(article.sourceName, existing);
  }

  const lines: string[] = [];
  lines.push(`# WordPress Trend Report — ${date}`);
  lines.push("");
  lines.push(`**Articles collected:** ${articleCount}`);
  lines.push(`**Sources:** ${bySource.size}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const [sourceName, sourceArticles] of bySource) {
    lines.push(`## ${sourceName}`);
    lines.push("");

    for (const article of sourceArticles) {
      const published = article.publishedAt
        ? new Date(article.publishedAt).toLocaleDateString()
        : "Unknown date";
      lines.push(`- [${article.title}](${article.url}) — ${published}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const inputPath = await findLatestArticlesJson();
  const raw = await readFile(inputPath, "utf8");
  const articlesData = JSON.parse(raw) as ArticlesJson;

  const report = generateReport(articlesData);
  const outputPath = join(process.cwd(), "reports", `${articlesData.date}.md`);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report, "utf8");

  console.log(`Report written to ${outputPath}`);
}

await main();