import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureSourceReferences,
  isArticleReferenced,
} from "../../src/summarize/source-refs.js";
import {
  extractReportBody,
  parseSourceArticles,
  checkSourceReferences,
} from "../../src/review/checks.js";

/** Minimal article shape for testing ensureSourceReferences. */
type TestArticle = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAt?: string;
};

function article(
  id: string,
  title: string,
  url: string,
  sourceName = "Test Source",
): TestArticle {
  return { id, sourceId: "s1", sourceName, title, url };
}

// --- isArticleReferenced ---

test("isArticleReferenced returns true for exact title match", () => {
  assert.ok(
    isArticleReferenced(
      "Gutenberg Update",
      "https://example.com/1",
      "The Gutenberg Update brings new features.",
    ),
  );
});

test("isArticleReferenced returns true for exact URL match", () => {
  assert.ok(
    isArticleReferenced(
      "Some Title",
      "https://example.com/special",
      "See https://example.com/special for details.",
    ),
  );
});

test("isArticleReferenced returns true for paraphrased title (word overlap)", () => {
  // Title: "Call for WordPress 7.0.x Release Managers"
  // Paraphrased: "Call for Release Managers for WordPress 7.0.x releases"
  assert.ok(
    isArticleReferenced(
      "Call for WordPress 7.0.x Release Managers",
      "https://example.com/rm",
      "Call for Release Managers for WordPress 7.0.x releases.",
    ),
  );
});

test("isArticleReferenced returns true when most title words appear", () => {
  // "What Happened at WordCamp Europe 2026" -> paraphrased as "WordCamp Europe 2026 took place"
  assert.ok(
    isArticleReferenced(
      "What Happened at WordCamp Europe 2026",
      "https://example.com/wceu",
      "WordCamp Europe 2026 took place in Kraków.",
    ),
  );
});

test("isArticleReferenced returns false when too few words match", () => {
  assert.ok(
    !isArticleReferenced(
      "Protect The Shire",
      "https://example.com/pts",
      "General trends this week.",
    ),
  );
});

test("isArticleReferenced returns false for empty text", () => {
  assert.ok(
    !isArticleReferenced(
      "Some Article",
      "https://example.com/1",
      "",
    ),
  );
});

test("isArticleReferenced handles short titles (all stop words)", () => {
  // Title with only short/stop words should fall back to URL matching
  assert.ok(
    !isArticleReferenced("The A", "https://example.com/a", "No match here."),
  );
  assert.ok(
    isArticleReferenced("The A", "https://example.com/a", "See https://example.com/a."),
  );
});

// --- ensureSourceReferences ---

test("ensureSourceReferences returns synthesis unchanged when all articles referenced", () => {
  const articles = [
    article("1", "Gutenberg Update", "https://example.com/1"),
    article("2", "ACF Release", "https://example.com/2"),
  ];
  const synthesis =
    "The Gutenberg Update brings new features. ACF Release is now available.";
  const result = ensureSourceReferences(synthesis, articles);
  assert.equal(result, synthesis);
});

test("ensureSourceReferences appends unreferenced articles", () => {
  const articles = [
    article("1", "Referenced Article", "https://example.com/1"),
    article("2", "Missing Article", "https://example.com/2"),
  ];
  const synthesis = "Referenced Article is great.";
  const result = ensureSourceReferences(synthesis, articles);
  assert.ok(result.includes("Additional source references"));
  assert.ok(result.includes("[Missing Article](https://example.com/2)"));
  assert.ok(!result.includes("[Referenced Article]"));
});

test("ensureSourceReferences handles all articles unreferenced", () => {
  const articles = [
    article("1", "Article A", "https://a.com"),
    article("2", "Article B", "https://b.com"),
  ];
  const synthesis = "General trends this week.";
  const result = ensureSourceReferences(synthesis, articles);
  assert.ok(result.includes("[Article A](https://a.com)"));
  assert.ok(result.includes("[Article B](https://b.com)"));
});

test("ensureSourceReferences handles empty articles list", () => {
  const synthesis = "No articles this week.";
  const result = ensureSourceReferences(synthesis, []);
  assert.equal(result, synthesis);
});

test("ensureSourceReferences does not double-append paraphrased articles", () => {
  const articles = [
    article(
      "1",
      "Call for WordPress 7.0.x Release Managers",
      "https://example.com/rm",
    ),
  ];
  const synthesis =
    "WordPress is seeking release managers for the 7.0.x maintenance releases.";
  const result = ensureSourceReferences(synthesis, articles);
  // Should not append — the paraphrase contains enough matching words
  assert.equal(result, synthesis);
});

// --- Integration: ensureSourceReferences + review check ---

test("integration: ensureSourceReferences makes checkSourceReferences pass", () => {
  const articles = [
    article("1", "WordPress 7.1 Beta", "https://example.com/wp71"),
    article("2", "ACF 6.9 Released", "https://example.com/acf69"),
    article("3", "Protect The Shire", "https://example.com/pts"),
  ];
  // Synthesis that misses articles 2 and 3
  const synthesis =
    "WordPress 7.1 Beta introduces collaborative editing features.";
  const ensured = ensureSourceReferences(synthesis, articles);

  // Simulate a report body
  const reportBody = `### Weekly Summary\n${ensured}`;
  const parsedArticles = articles.map((a) => ({
    title: a.title,
    url: a.url,
  }));

  const result = checkSourceReferences(parsedArticles, reportBody);
  assert.equal(result.status, "pass");
});

test("integration: articles referenced by URL are not duplicated", () => {
  const articles = [
    article("1", "Some Article", "https://example.com/special"),
  ];
  // URL is already in synthesis — should not append
  const synthesis = "See https://example.com/special for details.";
  const result = ensureSourceReferences(synthesis, articles);
  assert.equal(result, synthesis);
});

test("integration: paraphrased titles pass review check", () => {
  const articles = [
    article(
      "1",
      "Call for WordPress 7.0.x Release Managers",
      "https://example.com/rm",
    ),
    article(
      "2",
      "What Happened at WordCamp Europe 2026",
      "https://example.com/wceu",
    ),
  ];
  // Paraphrased synthesis
  const synthesis =
    "WordPress is seeking release managers for the 7.0.x maintenance releases. WordCamp Europe 2026 took place in Kraków.";
  const reportBody = `### Weekly Summary\n${synthesis}`;
  const parsedArticles = articles.map((a) => ({
    title: a.title,
    url: a.url,
  }));

  const result = checkSourceReferences(parsedArticles, reportBody);
  assert.equal(result.status, "pass");
});
