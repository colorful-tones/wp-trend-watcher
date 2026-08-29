import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildRssFeed,
  escapeXml,
  formatReportPubDate,
  generateRssFeed,
  RSS_FEED_FILE,
  type RssReportItem,
} from "../../src/summarize/rss.js";

/** Create an isolated reports directory with the given file contents. */
async function makeReportsDir(
  files: Record<string, string>,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "rss-test-"));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content, "utf8");
  }
  return dir;
}

/** Extract item <link> URLs (YYYY-MM-DD.html) from a feed string, in order. */
function extractItemLinks(xml: string): string[] {
  return [...xml.matchAll(/<link>([^<]+\.html)<\/link>/g)].map((m) => m[1]);
}

function makeItem(overrides: Partial<RssReportItem> = {}): RssReportItem {
  return {
    date: "2026-08-24",
    title: "WordPress 7.1 and Gutenberg updates",
    description: "This week's WordPress ecosystem changes.",
    ...overrides,
  };
}

// --- escapeXml ---

test("escapeXml escapes all five XML-significant characters", () => {
  assert.equal(escapeXml('a < b & c > d "e" \'f\''), "a &lt; b &amp; c &gt; d &quot;e&quot; &apos;f&apos;");
});

test("escapeXml leaves ordinary text unchanged", () => {
  assert.equal(escapeXml("Plain report title"), "Plain report title");
});

// --- formatReportPubDate ---

test("formatReportPubDate formats a valid date as deterministic RFC 822", () => {
  assert.equal(
    formatReportPubDate("2026-08-24"),
    "Mon, 24 Aug 2026 12:00:00 GMT",
  );
  assert.equal(
    formatReportPubDate("2026-07-01"),
    "Wed, 01 Jul 2026 12:00:00 GMT",
  );
});

test("formatReportPubDate throws on invalid calendar dates", () => {
  assert.throws(() => formatReportPubDate("2026-13-40"), /Invalid report date/);
  assert.throws(() => formatReportPubDate("2026-02-30"), /Invalid report date/);
  assert.throws(() => formatReportPubDate("not-a-date"), /Invalid report date/);
});

// --- buildRssFeed ---

test("buildRssFeed emits a valid RSS 2.0 channel structure", () => {
  const xml = buildRssFeed([makeItem()]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n'));
  assert.ok(xml.includes('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">'));
  assert.ok(xml.includes("<channel>"));
  assert.ok(xml.includes("<title>WP Trend Watcher</title>"));
  assert.ok(xml.includes("<description>Weekly human-reviewed WordPress ecosystem trend reports.</description>"));
  assert.ok(xml.includes("<language>en-us</language>"));
  assert.ok(
    xml.includes(
      '<atom:link href="https://colorful-tones.github.io/wp-trend-watcher/feed.xml" rel="self" type="application/rss+xml"/>',
    ),
  );
  assert.ok(xml.trimEnd().endsWith("</rss>"));
});

test("buildRssFeed uses absolute report links and stable perma-link GUIDs", () => {
  const xml = buildRssFeed([makeItem({ date: "2026-08-24" })]);
  const link = "https://colorful-tones.github.io/wp-trend-watcher/2026-08-24.html";
  assert.ok(xml.includes(`<link>${link}</link>`));
  assert.ok(xml.includes(`<guid isPermaLink="true">${link}</guid>`));
});

test("buildRssFeed emits items in the given order", () => {
  const xml = buildRssFeed([
    makeItem({ date: "2026-08-24" }),
    makeItem({ date: "2026-07-01" }),
  ]);
  assert.deepEqual(extractItemLinks(xml), [
    "https://colorful-tones.github.io/wp-trend-watcher/2026-08-24.html",
    "https://colorful-tones.github.io/wp-trend-watcher/2026-07-01.html",
  ]);
});

test("buildRssFeed sets lastBuildDate from the newest item and omits it when empty", () => {
  const withItems = buildRssFeed([
    makeItem({ date: "2026-08-24" }),
    makeItem({ date: "2026-07-01" }),
  ]);
  assert.ok(withItems.includes("<lastBuildDate>Mon, 24 Aug 2026 12:00:00 GMT</lastBuildDate>"));

  const empty = buildRssFeed([]);
  assert.ok(!empty.includes("<lastBuildDate>"));
  assert.ok(!empty.includes("<item>"));
});

// --- generateRssFeed ---

test("generateRssFeed writes reports/feed.xml and returns its path", async () => {
  const dir = await makeReportsDir({
    "2026-08-24.md": "# WordPress Trend Report — 2026-08-24\n",
  });
  const outPath = await generateRssFeed(dir);
  assert.equal(outPath, join(dir, RSS_FEED_FILE));
  const xml = await readFile(outPath, "utf8");
  assert.ok(xml.includes("<rss version=\"2.0\""));
});

test("generateRssFeed orders reports newest first regardless of directory order", async () => {
  const dir = await makeReportsDir({
    "2026-06-14.md": "# Report\n",
    "2026-08-24.md": "# Report\n",
    "2026-07-01.md": "# Report\n",
  });
  const xml = await readFile(await generateRssFeed(dir), "utf8");
  assert.deepEqual(extractItemLinks(xml), [
    "https://colorful-tones.github.io/wp-trend-watcher/2026-08-24.html",
    "https://colorful-tones.github.io/wp-trend-watcher/2026-07-01.html",
    "https://colorful-tones.github.io/wp-trend-watcher/2026-06-14.html",
  ]);
});

test("generateRssFeed uses SEO metadata for titles and descriptions", async () => {
  const dir = await makeReportsDir({
    "2026-08-24.md":
      "<!-- SEO_TITLE: WordPress 7.1 shipped -->\n" +
      "<!-- SEO_DESCRIPTION: A focused look at this week's releases. -->\n" +
      "# WordPress Trend Report — 2026-08-24\n",
  });
  const xml = await readFile(await generateRssFeed(dir), "utf8");
  assert.ok(xml.includes("<title>WordPress 7.1 shipped</title>"));
  assert.ok(xml.includes("<description>A focused look at this week&apos;s releases.</description>"));
});

test("generateRssFeed falls back to a date-derived title and shared description when metadata is missing", async () => {
  const dir = await makeReportsDir({
    "2026-08-24.md": "# WordPress Trend Report — 2026-08-24\n",
  });
  const xml = await readFile(await generateRssFeed(dir), "utf8");
  assert.ok(xml.includes("<title>WordPress Trend Report — 2026-08-24</title>"));
  assert.ok(
    xml.includes(
      "<description>Weekly human-reviewed analysis of changes across the WordPress ecosystem, covering releases, tools, and developer implications.</description>",
    ),
  );
});

test("generateRssFeed falls back when SEO metadata is present but empty", async () => {
  const dir = await makeReportsDir({
    "2026-08-24.md":
      "<!-- SEO_TITLE: -->\n<!-- SEO_DESCRIPTION: -->\n# Report\n",
  });
  const xml = await readFile(await generateRssFeed(dir), "utf8");
  assert.ok(xml.includes("<title>WordPress Trend Report — 2026-08-24</title>"));
  assert.ok(
    xml.includes(
      "<description>Weekly human-reviewed analysis of changes across the WordPress ecosystem, covering releases, tools, and developer implications.</description>",
    ),
  );
});

test("generateRssFeed escapes special characters in metadata", async () => {
  const dir = await makeReportsDir({
    "2026-08-24.md":
      "<!-- SEO_TITLE: Releases &amp; <bets> -->\n" +
      "<!-- SEO_DESCRIPTION: A \"quoted\" look at it's & more. -->\n" +
      "# Report\n",
  });
  const xml = await readFile(await generateRssFeed(dir), "utf8");
  assert.ok(xml.includes("<title>Releases &amp;amp; &lt;bets&gt;</title>"));
  assert.ok(xml.includes("<description>A &quot;quoted&quot; look at it&apos;s &amp; more.</description>"));
});

test("generateRssFeed skips non-report and malformed filenames", async () => {
  const dir = await makeReportsDir({
    "2026-08-24.md": "# Report\n",
    "index.md": "# not a report\n",
    "notes.txt": "ignored\n",
    "2026-13-40.md": "# invalid date\n",
    "2026-02-30.md": "# invalid calendar date\n",
  });
  const xml = await readFile(await generateRssFeed(dir), "utf8");
  assert.deepEqual(extractItemLinks(xml), [
    "https://colorful-tones.github.io/wp-trend-watcher/2026-08-24.html",
  ]);
});

test("generateRssFeed produces a valid empty feed when no reports exist", async () => {
  const dir = await makeReportsDir({});
  const xml = await readFile(await generateRssFeed(dir), "utf8");
  assert.ok(xml.includes("<channel>"));
  assert.ok(xml.includes("<title>WP Trend Watcher</title>"));
  assert.ok(!xml.includes("<item>"));
  assert.ok(xml.trimEnd().endsWith("</rss>"));
});
