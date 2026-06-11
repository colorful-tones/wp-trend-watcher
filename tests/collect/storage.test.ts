import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { writeArticlesJson, type CollectedArticle } from "../../src/collect/storage.js";

test("writeArticlesJson writes articles to a date-stamped JSON file", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "wp-trend-watcher-"));

  try {
    const articles: CollectedArticle[] = [
      {
        id: "wordpress-developer-blog:https://example.com/post",
        sourceId: "wordpress-developer-blog",
        sourceName: "WordPress Developer Blog",
        title: "Example Post",
        url: "https://example.com/post",
        publishedAt: "2026-06-11T12:00:00.000Z",
      },
    ];

    const result = await writeArticlesJson({
      articles,
      outputRoot,
      date: "2026-06-11",
      collectedAt: "2026-06-11T13:00:00.000Z",
    });

    assert.equal(result.articleCount, 1);
    assert.equal(result.filePath, join(outputRoot, "data/articles/2026-06-11/articles.json"));

    const saved = JSON.parse(await readFile(result.filePath, "utf8"));

    assert.equal(saved.date, "2026-06-11");
    assert.equal(saved.collectedAt, "2026-06-11T13:00:00.000Z");
    assert.deepEqual(saved.articles, articles);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("writeArticlesJson merges with existing articles without duplicates", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "wp-trend-watcher-"));

  try {
    const existing: CollectedArticle = {
      id: "make-core:https://example.com/existing",
      sourceId: "make-core",
      sourceName: "Make Core",
      title: "Existing Post",
      url: "https://example.com/existing",
      publishedAt: "2026-06-10T12:00:00.000Z",
    };

    const duplicateWithUpdatedTitle: CollectedArticle = {
      ...existing,
      title: "Existing Post, Updated Title",
    };

    const next: CollectedArticle = {
      id: "acf-blog:https://example.com/new",
      sourceId: "acf-blog",
      sourceName: "ACF Blog",
      title: "New Post",
      url: "https://example.com/new",
      publishedAt: "2026-06-11T12:00:00.000Z",
    };

    await writeArticlesJson({
      articles: [existing],
      outputRoot,
      date: "2026-06-11",
      collectedAt: "2026-06-11T13:00:00.000Z",
    });

    const result = await writeArticlesJson({
      articles: [duplicateWithUpdatedTitle, next],
      outputRoot,
      date: "2026-06-11",
      collectedAt: "2026-06-11T14:00:00.000Z",
    });

    const saved = JSON.parse(await readFile(result.filePath, "utf8"));

    assert.equal(result.articleCount, 2);
    assert.deepEqual(saved.articles.map((article: CollectedArticle) => article.id), [existing.id, next.id]);
    assert.equal(saved.articles[0].title, "Existing Post, Updated Title");
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});
