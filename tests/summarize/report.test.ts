import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReportPrompt,
  assembleReport,
  isHighSignalReleasePlanningArticle,
} from "../../src/summarize/report.js";
import type {
  ArticleSummary,
  CollectedArticle,
} from "../../src/summarize/report.js";
import type { SummarizeProvider } from "../../src/providers.js";

/** Stub provider for testing — always returns zero cost. */
const stubProvider: SummarizeProvider = {
  name: "stub",
  model: "test-model",
  summarize: async () => ({
    text: "",
    promptTokens: 0,
    completionTokens: 0,
  }),
  costFor: () => 0,
};

function makeArticle(overrides: Partial<CollectedArticle> = {}): CollectedArticle {
  return {
    id: overrides.id ?? "a:1",
    sourceId: overrides.sourceId ?? "s1",
    sourceName: overrides.sourceName ?? "Test Source",
    title: overrides.title ?? "Test Article",
    url: overrides.url ?? "https://example.com/1",
    publishedAt: overrides.publishedAt,
  };
}

function makeSummary(
  overrides: Partial<ArticleSummary> = {},
): ArticleSummary {
  return {
    articleId: overrides.articleId ?? "a:1",
    title: overrides.title ?? "Test Article",
    sourceName: overrides.sourceName ?? "Test Source",
    url: overrides.url ?? "https://example.com/1",
    summary: overrides.summary ?? "This article discusses testing patterns.",
    model: overrides.model ?? "test-model",
    promptTokens: overrides.promptTokens ?? 100,
    completionTokens: overrides.completionTokens ?? 50,
  };
}

// --- buildReportPrompt ---

test("isHighSignalReleasePlanningArticle detects release-planning titles", () => {
  assert.equal(isHighSignalReleasePlanningArticle("Roadmap to 7.1"), true);
  assert.equal(
    isHighSignalReleasePlanningArticle("WordPress 7.0.1 Release Schedule"),
    true,
  );
  assert.equal(
    isHighSignalReleasePlanningArticle(
      "Call for Testing: Unicode email addresses",
    ),
    true,
  );
  assert.equal(
    isHighSignalReleasePlanningArticle("Building layouts with container queries"),
    false,
  );
});

test("buildReportPrompt includes all summaries as linked titles in the inventory", () => {
  const summaries = [
    makeSummary({
      title: "Article A",
      sourceName: "Source A",
      url: "https://example.com/a",
      summary: "Summary A text goes here. More text.",
    }),
    makeSummary({
      title: "Article B",
      sourceName: "Source B",
      url: "https://example.com/b",
      summary: "Summary B text goes here. More text.",
    }),
  ];
  const prompt = buildReportPrompt(summaries, "2026-06-20");
  assert.ok(prompt.includes("Week ending 2026-06-20"));
  assert.ok(prompt.includes("2 articles"));
  assert.ok(prompt.includes("[Article A](https://example.com/a)"));
  assert.ok(prompt.includes("(Source A)"));
  assert.ok(prompt.includes("[Article B](https://example.com/b)"));
  assert.ok(prompt.includes("(Source B)"));
  assert.ok(prompt.includes("Summary A text goes here."));
  assert.ok(prompt.includes("Summary B text goes here."));
});

test("buildReportPrompt includes expected section headings", () => {
  const summaries = [makeSummary()];
  const prompt = buildReportPrompt(summaries, "2026-06-20");
  assert.ok(prompt.includes("## Article Inventory"));
  assert.ok(prompt.includes("## Weekly Summary"));
  assert.ok(prompt.includes("### Article Inventory"));
  assert.ok(prompt.includes("### Emerging Trends"));
  assert.ok(prompt.includes("### Developer Implications"));
});

test("buildReportPrompt truncates summaries to first sentence", () => {
  const summaries = [
    makeSummary({
      summary: "First sentence ends here. Second sentence continues. Third one too.",
    }),
  ];
  const prompt = buildReportPrompt(summaries, "2026-06-20");
  assert.ok(prompt.includes("First sentence ends here."));
  assert.ok(!prompt.includes("Second sentence continues"));
});

test("buildReportPrompt keeps full summaries for high-signal release-planning articles", () => {
  const summaries = [
    makeSummary({
      title: "WordPress 7.0.1 Release Schedule",
      summary:
        "The post outlines release timing for WordPress 7.0.1. It names the planned beta and release candidate windows. Freelance developers should monitor final dates and compatibility issues.",
    }),
  ];
  const prompt = buildReportPrompt(summaries, "2026-06-20");
  assert.ok(prompt.includes("Signal: release planning."));
  assert.ok(prompt.includes("It names the planned beta and release candidate windows."));
  assert.ok(
    prompt.includes(
      "Freelance developers should monitor final dates and compatibility issues.",
    ),
  );
});

test("buildReportPrompt includes release-planning instructions", () => {
  const prompt = buildReportPrompt([makeSummary()], "2026-06-20");
  assert.ok(
    prompt.includes(
      "Release roadmaps, release schedules, major proposals, and calls for testing need explicit attention",
    ),
  );
  assert.ok(prompt.includes("concrete dates"));
  assert.ok(prompt.includes("freelance and agency developers should monitor"));
});

test("buildReportPrompt numbers summaries sequentially", () => {
  const summaries = [
    makeSummary({ title: "A", sourceName: "S1", url: "https://example.com/a" }),
    makeSummary({ title: "B", sourceName: "S2", url: "https://example.com/b" }),
    makeSummary({ title: "C", sourceName: "S3", url: "https://example.com/c" }),
  ];
  const prompt = buildReportPrompt(summaries, "2026-06-20");
  // Check sequential numbering
  assert.ok(prompt.includes("1. [A](https://example.com/a)"));
  assert.ok(prompt.includes("2. [B](https://example.com/b)"));
  assert.ok(prompt.includes("3. [C](https://example.com/c)"));
});

test("buildReportPrompt instructs the model to preserve Markdown article links", () => {
  const prompt = buildReportPrompt([makeSummary()], "2026-06-20");
  assert.ok(
    prompt.includes(
      "Preserve the Markdown links when mentioning specific article titles",
    ),
  );
});

// --- assembleReport ---

test("assembleReport produces a complete Markdown report", () => {
  const articles = [
    makeArticle({ title: "Article One", url: "https://example.com/1", publishedAt: "2026-06-15T00:00:00Z" }),
  ];
  const summaries = [
    makeSummary({ title: "Article One" }),
  ];
  const synthesis = "### Article Inventory\n\n1. Article One.\n\n### Emerging Trends\n\nNone this week.\n\n### Developer Implications\n\nNothing specific.";

  const report = assembleReport(
    "2026-06-20",
    articles,
    synthesis,
    summaries,
    stubProvider,
    200,
    100,
  );

  assert.ok(report.includes("# WordPress Trend Report — 2026-06-20"));
  assert.ok(report.includes("### Article Inventory"));
  assert.ok(report.includes("### Emerging Trends"));
  assert.ok(report.includes("### Developer Implications"));
  assert.ok(report.includes("## What I'm Watching"));
  assert.ok(report.includes("## Source Articles"));
  assert.ok(report.includes("## Build Notes"));
  assert.ok(report.includes("[Article One](https://example.com/1)"));
  // publishedAt is formatted via toLocaleDateString — check it appears as a date-like string
  assert.ok(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(report));
});

test("assembleReport displays 'Unknown date' for missing publishedAt", () => {
  const articles = [
    makeArticle({ title: "Untimed Article", url: "https://example.com/1" }),
  ];
  const summaries = [makeSummary()];
  const synthesis = "### Article Inventory\n\n1. Untimed Article.\n\n### Emerging Trends\n\nNone.\n\n### Developer Implications\n\nNone.";

  const report = assembleReport(
    "2026-06-20",
    articles,
    synthesis,
    summaries,
    stubProvider,
    200,
    100,
  );

  assert.ok(report.includes("Unknown date"));
});

test("assembleReport groups articles by source name", () => {
  const articles = [
    makeArticle({ title: "Article A", sourceName: "Source One" }),
    makeArticle({ title: "Article B", sourceName: "Source Two" }),
    makeArticle({ title: "Article C", sourceName: "Source One" }),
  ];
  const summaries = articles.map((a) => makeSummary({ title: a.title }));
  const synthesis = "### Article Inventory\n\n1. Article A.\n2. Article B.\n3. Article C.\n\n### Emerging Trends\n\nNone.\n\n### Developer Implications\n\nNone.";

  const report = assembleReport(
    "2026-06-20",
    articles,
    synthesis,
    summaries,
    stubProvider,
    300,
    150,
  );

  assert.ok(report.includes("### Source One"));
  assert.ok(report.includes("### Source Two"));
  // Source One should appear twice in listing
  const sourceOneSection = report.indexOf("### Source One");
  const sourceTwoSection = report.indexOf("### Source Two");
  assert.ok(sourceOneSection < sourceTwoSection);
});

test("assembleReport includes build notes with token counts and cost", () => {
  const articles = [makeArticle()];
  const summaries = [makeSummary()];
  const synthesis = "### Article Inventory\n\n1. Test.\n\n### Emerging Trends\n\nNone.\n\n### Developer Implications\n\nNone.";

  const report = assembleReport(
    "2026-06-20",
    articles,
    synthesis,
    summaries,
    stubProvider,
    500,
    250,
  );

  assert.ok(report.includes("Articles analyzed: 1"));
  assert.ok(report.includes("Model: stub/test-model"));
  assert.ok(report.includes("500 prompt + 250 completion"));
  assert.ok(report.includes("$0.00 (local model)"));
});

test("assembleReport enforces source references for unreferenced articles", () => {
  const articles = [
    makeArticle({ title: "Referenced Article", url: "https://example.com/ref" }),
    makeArticle({ title: "Unreferenced Article", url: "https://example.com/unref" }),
  ];
  const summaries = articles.map((a) => makeSummary({ title: a.title }));
  const synthesis = "### Article Inventory\n\n1. Referenced Article.\n\n### Emerging Trends\n\nNone.\n\n### Developer Implications\n\nNone.";

  const report = assembleReport(
    "2026-06-20",
    articles,
    synthesis,
    summaries,
    stubProvider,
    200,
    100,
  );

  // ensureSourceReferences should have appended unreferenced articles
  assert.ok(report.includes("Additional source references"));
  assert.ok(report.includes("[Unreferenced Article](https://example.com/unref)"));
  // Referenced article appears in the Source Articles listing (all articles listed there),
  // but should NOT appear in the "Additional source references" block specifically
  const additionalStart = report.indexOf("Additional source references");
  const additionalEnd = report.indexOf("---", additionalStart);
  const additionalBlock = report.substring(additionalStart, additionalEnd);
  assert.ok(!additionalBlock.includes("[Referenced Article]"));
});

test("assembleReport includes human placeholders", () => {
  const articles = [makeArticle()];
  const summaries = [makeSummary()];
  const synthesis = "### Article Inventory\n\n1. Test.\n\n### Emerging Trends\n\nNone.\n\n### Developer Implications\n\nNone.";

  const report = assembleReport(
    "2026-06-20",
    articles,
    synthesis,
    summaries,
    stubProvider,
    200,
    100,
  );

  assert.ok(report.includes("Human-authored: add your observations here"));
  assert.ok(report.includes("Review time: (add after human review)"));
});
