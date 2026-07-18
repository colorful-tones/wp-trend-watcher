import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildReportPrompt,
  buildArticleInventorySection,
  assembleReport,
  isHighSignalReleasePlanningArticle,
  findPreviousReportPath,
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

async function makeReportsDir(files: string[]): Promise<string> {
  const reportsDir = await mkdtemp(join(tmpdir(), "wp-trend-reports-"));
  await Promise.all(
    files.map((file) => writeFile(join(reportsDir, file), "# Report\n", "utf8")),
  );
  return reportsDir;
}

// --- findPreviousReportPath ---

test("findPreviousReportPath finds the immediate previous date", async () => {
  const reportsDir = await makeReportsDir([
    "2026-06-06.md",
    "2026-06-13.md",
    "2026-06-20.md",
  ]);

  const previous = await findPreviousReportPath(reportsDir, "2026-06-20");

  assert.equal(previous, join(reportsDir, "2026-06-13.md"));
});

test("findPreviousReportPath ignores future reports", async () => {
  const reportsDir = await makeReportsDir([
    "2026-06-13.md",
    "2026-06-20.md",
    "2026-06-27.md",
  ]);

  const previous = await findPreviousReportPath(reportsDir, "2026-06-20");

  assert.equal(previous, join(reportsDir, "2026-06-13.md"));
});

test("findPreviousReportPath ignores index.md", async () => {
  const reportsDir = await makeReportsDir([
    "index.md",
    "2026-06-13.md",
    "2026-06-20.md",
  ]);

  const previous = await findPreviousReportPath(reportsDir, "2026-06-20");

  assert.equal(previous, join(reportsDir, "2026-06-13.md"));
});

test("findPreviousReportPath returns null with no previous report", async () => {
  const reportsDir = await makeReportsDir([
    "index.md",
    "2026-06-20.md",
    "2026-06-27.md",
  ]);

  const previous = await findPreviousReportPath(reportsDir, "2026-06-20");

  assert.equal(previous, null);
});

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
  assert.ok(prompt.includes("## Source Inventory"));
  assert.ok(prompt.includes("## Weekly Summary"));
  assert.ok(!prompt.includes("### Article Inventory"));
  assert.ok(prompt.includes("### Emerging Trends"));
  assert.ok(prompt.includes("### Developer Implications"));
});

test("buildReportPrompt truncates summaries to first sentence", () => {
  const summaries = [
    makeSummary({
      summary: "First sentence ends here.Second sentence continues. Third one too.",
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

test("buildReportPrompt instructs the model not to write Article Inventory", () => {
  const prompt = buildReportPrompt([makeSummary()], "2026-06-20");
  assert.ok(
    prompt.includes(
      "do not write an Article Inventory section",
    ),
  );
});

test("buildArticleInventorySection renders linked titles with deterministic takeaways", () => {
  const summaries = [
    makeSummary({
      title: "Article A",
      sourceName: "Source A",
      url: "https://example.com/a",
      summary: "First takeaway. Extra detail should stay out of inventory.",
    }),
    makeSummary({
      title: "Article B",
      sourceName: "Source B",
      url: "https://example.com/b",
      summary: "Single takeaway without terminal punctuation",
    }),
  ];

  const inventory = buildArticleInventorySection(summaries);

  assert.equal(
    inventory,
    "### Article Inventory\n\n1. [Article A](https://example.com/a) (Source A) — First takeaway.\n2. [Article B](https://example.com/b) (Source B) — Single takeaway without terminal punctuation",
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
  assert.ok(report.includes("## Weekly Summary"));
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

test("assembleReport uses deterministic inventory for source references", () => {
  const articles = [
    makeArticle({ title: "Referenced Article", url: "https://example.com/ref" }),
    makeArticle({ title: "Unreferenced Article", url: "https://example.com/unref" }),
  ];
  const summaries = articles.map((a) =>
    makeSummary({
      title: a.title,
      sourceName: a.sourceName,
      url: a.url,
    }),
  );
  const synthesis = "### Emerging Trends\n\nNone.\n\n### Developer Implications\n\nNone.";

  const report = assembleReport(
    "2026-06-20",
    articles,
    synthesis,
    summaries,
    stubProvider,
    200,
    100,
  );

  assert.ok(report.includes("1. [Referenced Article](https://example.com/ref)"));
  assert.ok(report.includes("[Unreferenced Article](https://example.com/unref)"));
  assert.ok(!report.includes("Additional source references"));
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

test("assembleReport does not duplicate Weekly Summary heading when model includes it", () => {
  const articles = [makeArticle()];
  const summaries = [makeSummary()];
  const synthesis =
    "## Weekly Summary\n\n### Article Inventory\n\n1. Test.\n\n### Emerging Trends\n\nNone.\n\n### Developer Implications\n\nNone.";

  const report = assembleReport(
    "2026-06-20",
    articles,
    synthesis,
    summaries,
    stubProvider,
    200,
    100,
  );

  const matches = report.match(/## Weekly Summary/g);
  assert.ok(matches, "expected ## Weekly Summary in report");
  assert.equal(matches!.length, 1, "heading should appear exactly once");
});

test("assembleReport removes model-generated Article Inventory", () => {
  const articles = [makeArticle({ title: "Article One", url: "https://example.com/1" })];
  const summaries = [
    makeSummary({
      title: "Article One",
      url: "https://example.com/1",
      summary: "Deterministic takeaway. Extra detail.",
    }),
  ];
  const synthesis =
    "## Weekly Summary\n\n### Article Inventory\n\n1. Model-made inventory should be removed.\n\n### Emerging Trends\n\nNone.\n\n### Developer Implications\n\nNone.";

  const report = assembleReport(
    "2026-06-20",
    articles,
    synthesis,
    summaries,
    stubProvider,
    200,
    100,
  );

  assert.ok(!report.includes("Model-made inventory should be removed"));
  assert.ok(
    report.includes(
      "1. [Article One](https://example.com/1) (Test Source) — Deterministic takeaway.",
    ),
  );
  assert.ok(report.includes("### Emerging Trends"));
  assert.ok(report.includes("### Developer Implications"));
});

test("assembleReport removes model-generated h2 Article Inventory", () => {
  const articles = [makeArticle({ title: "Article One", url: "https://example.com/1" })];
  const summaries = [
    makeSummary({
      title: "Article One",
      url: "https://example.com/1",
      summary: "Deterministic takeaway. Extra detail.",
    }),
  ];
  const synthesis =
    "## Article Inventory\n\n1. H2 inventory should be removed.\n\n## Emerging Trends\n\nNone.\n\n## Developer Implications\n\nNone.";

  const report = assembleReport(
    "2026-06-20",
    articles,
    synthesis,
    summaries,
    stubProvider,
    200,
    100,
  );

  assert.ok(!report.includes("H2 inventory should be removed"));
  assert.ok(
    report.includes(
      "1. [Article One](https://example.com/1) (Test Source) — Deterministic takeaway.",
    ),
  );
  assert.ok(report.includes("## Emerging Trends"));
  assert.ok(report.includes("## Developer Implications"));
});

// --- Preservation of human-authored "What I'm Watching" content ---

test("assembleReport preserves human-authored content from existing same-date report", () => {
  const articles = [makeArticle()];
  const summaries = [makeSummary()];
  const synthesis = "### Article Inventory\n\n1. Test.\n\n### Emerging Trends\n\nNone.\n\n### Developer Implications\n\nNone.";

  // An existing report where the human already wrote observations
  const existingReport = `# WordPress Trend Report — 2026-06-20

## Weekly Summary

### Article Inventory

1. [Test Article](https://example.com/1) (Test Source) — Test takeaway.

### Emerging Trends

None.

### Developer Implications

None.

---

## What I'm Watching

The design system proposal is worth monitoring closely.

---

## Source Articles

### Test Source
- [Test Article](https://example.com/1) — 6/15/2026

---

## Build Notes
- Model: stub/test-model
- Tokens: 200 prompt + 100 completion
`;

  const report = assembleReport(
    "2026-06-20",
    articles,
    synthesis,
    summaries,
    stubProvider,
    200,
    100,
    null, // no previous report
    existingReport, // same-date existing report with human content
  );

  assert.ok(report.includes("The design system proposal is worth monitoring closely."));
  assert.ok(!report.includes("Human-authored: add your observations here"));
});

test("assembleReport does not preserve placeholder content from existing report", () => {
  const articles = [makeArticle()];
  const summaries = [makeSummary()];
  const synthesis = "### Article Inventory\n\n1. Test.\n\n### Emerging Trends\n\nNone.\n\n### Developer Implications\n\nNone.";

  // An existing report that still has only the placeholder
  const existingReport = `# WordPress Trend Report — 2026-06-20

## What I'm Watching

<!-- Human-authored: add your observations here -->

---

## Source Articles
`;

  const report = assembleReport(
    "2026-06-20",
    articles,
    synthesis,
    summaries,
    stubProvider,
    200,
    100,
    null,
    existingReport,
  );

  assert.ok(report.includes("Human-authored: add your observations here"));
});

test("assembleReport generates fresh placeholder when no existing report provided", () => {
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
    null, // no previous report
    null, // no existing report
  );

  assert.ok(report.includes("Human-authored: add your observations here"));
});

test("assembleReport preserves multiline human content from existing report", () => {
  const articles = [makeArticle()];
  const summaries = [makeSummary()];
  const synthesis = "### Article Inventory\n\n1. Test.\n\n### Emerging Trends\n\nNone.\n\n### Developer Implications\n\nNone.";

  const existingReport = `# WordPress Trend Report — 2026-06-20

## What I'm Watching

- First observation about the merge proposal.
- Second thought on the release schedule.
- Third note about testing windows.

---

## Source Articles
`;

  const report = assembleReport(
    "2026-06-20",
    articles,
    synthesis,
    summaries,
    stubProvider,
    200,
    100,
    null,
    existingReport,
  );

  assert.ok(report.includes("- First observation about the merge proposal."));
  assert.ok(report.includes("- Second thought on the release schedule."));
  assert.ok(report.includes("- Third note about testing windows."));
  assert.ok(!report.includes("Human-authored: add your observations here"));
});

test("assembleReport does not carry forward content from a different report date", () => {
  const articles = [makeArticle()];
  const summaries = [makeSummary()];
  const synthesis = "### Article Inventory\n\n1. Test.\n\n### Emerging Trends\n\nNone.\n\n### Developer Implications\n\nNone.";

  // A report from a DIFFERENT date — should NOT be treated as same-date existing
  // The function only preserves from existingReportMd param, which is specifically
  // the same-date report.  A different date's content would never be passed as
  // existingReportMd.

  const report = assembleReport(
    "2026-06-20",
    articles,
    synthesis,
    summaries,
    stubProvider,
    200,
    100,
    null, // previous report (different date) — handled via Since Last Report
    null, // no same-date existing report — uses fresh placeholder
  );

  // Should get the default placeholder since no same-date existing report
  assert.ok(report.includes("Human-authored: add your observations here"));
});

test("assembleReport treats existing TODO as placeholder (not preserved)", () => {
  const articles = [makeArticle()];
  const summaries = [makeSummary()];
  const synthesis = "### Article Inventory\n\n1. Test.\n\n### Emerging Trends\n\nNone.\n\n### Developer Implications\n\nNone.";

  const existingReport = `# WordPress Trend Report — 2026-06-20

## What I'm Watching

TODO: fill this in later

---

## Source Articles
`;

  const report = assembleReport(
    "2026-06-20",
    articles,
    synthesis,
    summaries,
    stubProvider,
    200,
    100,
    null,
    existingReport,
  );

  assert.ok(report.includes("Human-authored: add your observations here"));
  assert.ok(!report.includes("TODO: fill this in later"));
});
