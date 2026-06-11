import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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

export type WriteArticlesJsonInput = {
  articles: CollectedArticle[];
  outputRoot?: string;
  date?: string;
  collectedAt?: string;
};

export type WriteArticlesJsonResult = {
  filePath: string;
  articleCount: number;
};

export async function writeArticlesJson({
  articles,
  outputRoot = process.cwd(),
  date = formatDate(new Date()),
  collectedAt = new Date().toISOString(),
}: WriteArticlesJsonInput): Promise<WriteArticlesJsonResult> {
  const filePath = join(outputRoot, "data/articles", date, "articles.json");
  const existingArticles = await readExistingArticles(filePath);
  const mergedArticles = mergeArticles(existingArticles, articles);

  const payload: ArticlesJson = {
    date,
    collectedAt,
    articleCount: mergedArticles.length,
    articles: mergedArticles,
  };

  const tmpFilePath = `${filePath}.tmp`;

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(tmpFilePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmpFilePath, filePath);

  return {
    filePath,
    articleCount: mergedArticles.length,
  };
}

function mergeArticles(existingArticles: CollectedArticle[], newArticles: CollectedArticle[]): CollectedArticle[] {
  const articlesById = new Map<string, CollectedArticle>();

  for (const article of existingArticles) {
    articlesById.set(article.id, article);
  }

  for (const article of newArticles) {
    articlesById.set(article.id, article);
  }

  return [...articlesById.values()];
}

async function readExistingArticles(filePath: string): Promise<CollectedArticle[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ArticlesJson>;

    if (!Array.isArray(parsed.articles)) {
      return [];
    }

    return parsed.articles;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
