import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateHtmlReport } from "../../src/summarize/html.js";

test("slugify produces stable lowercase-hyphenated strings", async () => {
  // We can test slugify indirectly by creating a .md with a heading
  // and checking the generated HTML for the correct id attribute.
  const tmpDir = await mkdtemp(join(tmpdir(), "html-test-"));
  const mdPath = join(tmpDir, "2026-06-21.md");
  await writeFile(
    mdPath,
    "# Weekly Summary\n\nSome content.\n\n## Build Notes\n\nFine.",
    "utf8",
  );
  const htmlPath = await generateHtmlReport(mdPath);
  const html = await import("node:fs/promises").then((fs) =>
    fs.readFile(htmlPath, "utf8"),
  );

  // h1 id should be "weekly-summary"
  assert.ok(html.includes('<h1 id="weekly-summary">'));
  // h2 id should be "build-notes"
  assert.ok(html.includes('<h2 id="build-notes">'));
});

test("markdownToHtml adds heading ids to h1, h2, h3", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "html-test-"));
  const mdPath = join(tmpDir, "2026-06-21.md");
  await writeFile(
    mdPath,
    "# Top Level\n\n## Second Level\n\n### Third Level\n\nSome content.",
    "utf8",
  );
  const htmlPath = await generateHtmlReport(mdPath);
  const html = await import("node:fs/promises").then((fs) =>
    fs.readFile(htmlPath, "utf8"),
  );

  assert.ok(html.includes('<h1 id="top-level">'));
  assert.ok(html.includes('<h2 id="second-level">'));
  assert.ok(html.includes('<h3 id="third-level">'));
});

test("markdownToHtml escapes text properly in heading ids — brackets/angles become hyphens", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "html-test-"));
  const mdPath = join(tmpDir, "2026-06-21.md");
  await writeFile(
    mdPath,
    "# Release v2.0 [beta]\n\n## What's <new>?\n\nSome content.",
    "utf8",
  );
  const htmlPath = await generateHtmlReport(mdPath);
  const html = await import("node:fs/promises").then((fs) =>
    fs.readFile(htmlPath, "utf8"),
  );

  // h1 id should slugify brackets into hyphens: "release-v2-0-beta"
  assert.ok(html.includes('<h1 id="release-v2-0-beta">'));
  // Heading text renders brackets literally (they are not markdown links without parens)
  assert.ok(html.includes("[beta]"));
  // h2 id should slugify angle brackets and apostrophes: "whats-new" → "what-s-new"
  assert.ok(html.includes('<h2 id="what-s-new">'));
  // Angle brackets in text should be HTML-escaped for XSS prevention
  assert.ok(html.includes("&lt;new&gt;"));
  // Ensure the XSS angle brackets are NOT raw in the HTML
  assert.ok(!html.includes("<new>"));
});

test("generateHtmlReport produces valid HTML with .report-header and .toc when enough headings exist", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "html-test-"));
  const mdPath = join(tmpDir, "2026-06-21.md");
  await writeFile(
    mdPath,
    "# WordPress Trend Report — 2026-06-21\n\n" +
      "## Weekly Summary\n\nSummary here.\n\n" +
      "## Since Last Report\n\nNothing new.\n\n" +
      "## What I'm Watching\n\nWatching stuff.\n\n" +
      "## Source Articles\n\nArticles here.\n\n" +
      "## Build Notes\n\nBuilt with love.\n",
    "utf8",
  );
  const htmlPath = await generateHtmlReport(mdPath);
  const html = await import("node:fs/promises").then((fs) =>
    fs.readFile(htmlPath, "utf8"),
  );

  assert.ok(html.includes('<header class="report-header">'));
  assert.ok(html.includes('<nav class="toc">'));
  assert.ok(html.includes("Contents"));
  assert.ok(html.includes('<div class="report-body">'));
  // TOC should have links to the h2 sections
  assert.ok(html.includes('<a href="#weekly-summary">'));
  assert.ok(html.includes('<a href="#build-notes">'));
});

test("generateHtmlReport does not produce TOC when only 1 heading exists", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "html-test-"));
  const mdPath = join(tmpDir, "2026-06-21.md");
  await writeFile(
    mdPath,
    "# WordPress Trend Report — 2026-06-21\n\nJust a single heading.\n",
    "utf8",
  );
  const htmlPath = await generateHtmlReport(mdPath);
  const html = await import("node:fs/promises").then((fs) =>
    fs.readFile(htmlPath, "utf8"),
  );

  assert.ok(!html.includes('<nav class="toc">'));
  assert.ok(html.includes('<header class="report-header">'));
  assert.ok(html.includes('<div class="report-body">'));
});

test("generateHtmlReport wraps report header with h1 inside .report-header", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "html-test-"));
  const mdPath = join(tmpDir, "2026-06-21.md");
  await writeFile(
    mdPath,
    "# My Report Title\n\nJust content.\n",
    "utf8",
  );
  const htmlPath = await generateHtmlReport(mdPath);
  const html = await import("node:fs/promises").then((fs) =>
    fs.readFile(htmlPath, "utf8"),
  );

  assert.ok(html.includes('<h1 id="my-report-title">My Report Title</h1>'));
});
