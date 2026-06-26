import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateHtmlReport, generateIndexPage } from "../../src/summarize/html.js";

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

test("generateIndexPage renders report cards sorted by date descending", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "index-test-"));
  // Create 3 HTML files with different dates
  await writeFile(join(tmpDir, "2026-06-21.html"), "<html></html>", "utf8");
  await writeFile(join(tmpDir, "2026-06-14.html"), "<html></html>", "utf8");
  await writeFile(join(tmpDir, "2026-07-01.html"), "<html></html>", "utf8");

  const indexPath = await generateIndexPage(tmpDir);
  const html = await readFile(indexPath, "utf8");

  // Extract report-card hrefs in order
  const cardRegex = /<a\s+href="([^"]+\.html)"[^>]*class="report-card"/g;
  const matches = [];
  let m;
  while ((m = cardRegex.exec(html)) !== null) {
    matches.push(m[1]);
  }

  assert.equal(matches.length, 3);
  assert.equal(matches[0], "2026-07-01.html");
  assert.equal(matches[1], "2026-06-21.html");
  assert.equal(matches[2], "2026-06-14.html");
});

test("generateIndexPage marks the newest report as Latest report", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "index-test-"));
  await writeFile(join(tmpDir, "2026-01-01.html"), "<html></html>", "utf8");
  await writeFile(join(tmpDir, "2026-06-15.html"), "<html></html>", "utf8");

  const indexPath = await generateIndexPage(tmpDir);
  const html = await readFile(indexPath, "utf8");

  // Only the first card (newest) should have the "Latest report" label
  const cards = html.match(/<a\s+href="([^"]+\.html)"[^>]*class="report-card"/g);
  assert.ok(cards, "should have at least one report card");
  assert.equal(cards.length, 2);

  // The first card in the HTML should be the newest and have the label
  const firstCardStart = html.indexOf('<a href="2026-06-15.html"');
  const secondCardStart = html.indexOf('<a href="2026-01-01.html"');
  assert.ok(firstCardStart >= 0, "newest report link should exist");
  assert.ok(secondCardStart >= 0, "oldest report link should exist");
  assert.ok(firstCardStart < secondCardStart, "newest should appear first");

  // The Latest report label should appear once, after the first card's href
  // but before the second card starts
  const labelCount = (html.match(/Latest report/g) || []).length;
  assert.equal(labelCount, 1);

  const betweenCards = html.slice(firstCardStart, secondCardStart);
  assert.ok(
    betweenCards.includes("Latest report"),
    "newest card should contain the Latest report label",
  );
});

test("generateIndexPage shows correct report count", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "index-test-"));
  await writeFile(join(tmpDir, "2026-06-21.html"), "<html></html>", "utf8");
  await writeFile(join(tmpDir, "2026-06-14.html"), "<html></html>", "utf8");
  await writeFile(join(tmpDir, "2026-06-07.html"), "<html></html>", "utf8");

  const indexPath = await generateIndexPage(tmpDir);
  const html = await readFile(indexPath, "utf8");

  assert.ok(
    html.includes("3 weekly WordPress ecosystem trend reports"),
    `Expected "3 weekly WordPress ecosystem trend reports" in output`,
  );
});

test("generateIndexPage skips index.html itself", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "index-test-"));
  await writeFile(join(tmpDir, "2026-06-21.html"), "<html></html>", "utf8");
  await writeFile(join(tmpDir, "2026-06-14.html"), "<html></html>", "utf8");
  // index.html should already exist or we create one to ensure it's skipped
  const indexPath = await generateIndexPage(tmpDir);
  // Read the generated index to verify count
  const html = await readFile(indexPath, "utf8");

  // Count report cards
  const cardCount = (html.match(/class="report-card"/g) || []).length;
  assert.equal(cardCount, 2, "index.html should not be counted as a report card");

  // Also verify no card links to index.html
  assert.ok(!html.includes('href="index.html"'), "no card should link to index.html");
});
