import test from "node:test";
import assert from "node:assert/strict";
import {
  slugify,
  renderMarkdown,
  renderReportBody,
  extractReportSections,
  extractToc,
  DEFAULT_PRESENTATION_ORDER,
  type ReportSection,
} from "../../src/summarize/renderer.js";

/** A representative canonical report with all known sections. */
const SAMPLE_REPORT = `# WordPress Trend Report — 2026-07-19

## Weekly Summary

### Article Inventory

1. [One](https://example.com/1) (Source A) — First.
2. [Two](https://example.com/2) (Source B) — Second.

### Emerging Trends

A trend.

### Developer Implications

An implication.

---

## What I'm Watching

My notes.

---

## Source Articles

### Source A
- [One](https://example.com/1) — 7/19/2026

---

## Build Notes
- Articles analyzed: 2
- Review time: ~15 minutes
`;

test("slugify produces stable lowercase-hyphenated ids", () => {
  assert.equal(slugify("Weekly Summary"), "weekly-summary");
  assert.equal(slugify("What I'm Watching"), "what-i-m-watching");
  assert.equal(slugify("Release v2.0 [beta]"), "release-v2-0-beta");
});

test("renderMarkdown adds heading ids", () => {
  const html = renderMarkdown("## Weekly Summary\n\nText.");
  assert.ok(html.includes('<h2 id="weekly-summary">'));
});

test("renderMarkdown escapes raw HTML for XSS safety", () => {
  const html = renderMarkdown("Body with <script>alert(1)</script> text.");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("renderMarkdown strips unsafe link schemes", () => {
  const html = renderMarkdown("[bad](javascript:alert(1))");
  assert.ok(!html.includes('<a href="javascript:alert(1)"'));
  assert.ok(html.includes("bad"));
});

test("renderMarkdown keeps safe https links", () => {
  const html = renderMarkdown("[good](https://example.com)");
  assert.ok(html.includes('<a href="https://example.com">good</a>'));
});

test("extractReportSections maps known top-level sections", () => {
  const sections = extractReportSections(SAMPLE_REPORT);
  assert.ok(sections.has("weekly-summary"));
  assert.ok(sections.get("what-i-m-watching")?.includes("My notes."));
  assert.ok(sections.get("build-notes")?.includes("Review time: ~15 minutes"));
  // Article Inventory is nested inside Weekly Summary, not a standalone section.
  assert.ok(sections.get("weekly-summary")?.includes("Article Inventory"));
  assert.ok(sections.get("weekly-summary")?.includes("Emerging Trends"));
});

test("renderReportBody wraps Article Inventory in <details>", () => {
  const html = renderReportBody(SAMPLE_REPORT);
  assert.ok(html.includes("<details class=\"article-inventory\" id=\"article-inventory\">"));
  assert.ok(html.includes("<summary>Article Inventory"));
  assert.ok(html.includes("(2 articles)"));
  // Closed by default: no `open` attribute
  assert.ok(!/<details[^>]*\sopen\b/.test(html));
  // The disclosure still lives inside the Weekly Summary block output.
  const weeklyIdx = html.indexOf('id="weekly-summary"');
  const detailsIdx = html.indexOf('class="article-inventory"');
  assert.ok(weeklyIdx >= 0 && detailsIdx > weeklyIdx);
});

test("renderReportBody uses configurable presentation order", () => {
  const reordered: ReportSection[] = [
    "what-i-m-watching",
    "source-articles",
    "weekly-summary",
    "build-notes",
  ];
  const html = renderReportBody(SAMPLE_REPORT, reordered);
  const watchingIdx = html.indexOf('id="what-i-m-watching"');
  const sourceIdx = html.indexOf('id="source-articles"');
  const summaryIdx = html.indexOf('id="weekly-summary"');
  assert.ok(watchingIdx >= 0 && sourceIdx >= 0 && summaryIdx >= 0);
  // Watching section appears before the Weekly Summary block
  assert.ok(watchingIdx < summaryIdx);
  assert.ok(sourceIdx < summaryIdx);
});

test("renderReportBody default order preserves canonical section presence", () => {
  const html = renderReportBody(SAMPLE_REPORT, DEFAULT_PRESENTATION_ORDER);
  assert.ok(html.includes('id="weekly-summary"'));
  assert.ok(html.includes('id="what-i-m-watching"'));
  assert.ok(html.includes('id="source-articles"'));
  assert.ok(html.includes('id="build-notes"'));
});

test("extractToc returns h2 entries", () => {
  const html = renderMarkdown(
    "## Weekly Summary\n\n## What I'm Watching\n\n## Build Notes",
  );
  const toc = extractToc(html);
  assert.equal(toc.length, 3);
  assert.deepEqual(
    toc.map((t) => t.id),
    ["weekly-summary", "what-i-m-watching", "build-notes"],
  );
});

test("renderReportBody omits absent sections", () => {
  const partial = "# T\n\n## Weekly Summary\n\nOnly this.";
  const html = renderReportBody(partial);
  assert.ok(html.includes('id="weekly-summary"'));
  assert.ok(!html.includes('id="build-notes"'));
});
