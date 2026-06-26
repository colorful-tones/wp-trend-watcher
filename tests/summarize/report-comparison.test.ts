import test from "node:test";
import assert from "node:assert/strict";
import {
  parseReportTopics,
  normalizeLabel,
  type ReportTopic,
} from "../../src/summarize/report-comparison.js";

// --- parseReportTopics ---

test("parseReportTopics extracts topics from ### Emerging Trends with * items", () => {
  const md =
    [
      "### Emerging Trends",
      "",
      "* WordPress 7.1 Release Planning",
      "* Gutenberg 23.4 React 19 Integration",
      "* Template Part Dynamic Loading",
    ].join("\n") + "\n";

  const topics = parseReportTopics(md);

  assert.equal(topics.length, 3);
  assert.equal(topics[0].source, "emerging-trends");
  assert.equal(topics[0].label, "WordPress 7.1 Release Planning");
  assert.equal(topics[1].source, "emerging-trends");
  assert.equal(topics[1].label, "Gutenberg 23.4 React 19 Integration");
  assert.equal(topics[2].source, "emerging-trends");
  assert.equal(topics[2].label, "Template Part Dynamic Loading");
});

test("parseReportTopics extracts topics from ### Emerging Trends with mixed * and numbered items", () => {
  const md =
    [
      "## Weekly Summary",
      "",
      "### Emerging Trends",
      "",
      "* WordCamp Europe 2026 Recap",
      "* WordPress 7.1 Release Planning",
      "1. Gutenberg 23.4 React 19 Integration",
    ].join("\n") + "\n";

  const topics = parseReportTopics(md);

  assert.equal(topics.length, 3);
  assert.equal(topics[0].source, "emerging-trends");
  assert.equal(topics[0].label, "WordCamp Europe 2026 Recap");
  assert.equal(topics[1].source, "emerging-trends");
  assert.equal(topics[1].label, "WordPress 7.1 Release Planning");
  assert.equal(topics[2].source, "emerging-trends");
  assert.equal(topics[2].label, "Gutenberg 23.4 React 19 Integration");
});

test("parseReportTopics extracts topics from ### Developer Implications with numbered items", () => {
  const md =
    [
      "### Developer Implications",
      "",
      "1. Prepare for WordPress 7.1 (August 19, 2026)",
      "2. Monitor WordPress 7.0.1 (July 9, 2026)",
      "3. Update Build Pipelines for React 19",
      "",
      "### Other Section",
      "",
      "* Not a developer implication",
    ].join("\n") + "\n";

  const topics = parseReportTopics(md);

  assert.equal(topics.length, 3);
  assert.equal(topics[0].source, "developer-implications");
  assert.equal(
    topics[0].label,
    "Prepare for WordPress 7.1 (August 19, 2026)",
  );
  assert.equal(topics[1].source, "developer-implications");
  assert.equal(topics[1].label, "Monitor WordPress 7.0.1 (July 9, 2026)");
  assert.equal(topics[2].source, "developer-implications");
  assert.equal(topics[2].label, "Update Build Pipelines for React 19");
});

test("parseReportTopics extracts topics from ### Article Inventory with numbered items + markdown links", () => {
  const md =
    [
      "### Article Inventory",
      "",
      "1. [Roadmap to 7.1](https://make.wordpress.org/core/2026/06/19/roadmap-to-7-1/) (Make Core)",
      "2. [WordPress 7.0.1 Release Schedule](https://make.wordpress.org/core/2026/06/18/wordpress-7-0-1-release-schedule/) (Make Core)",
    ].join("\n") + "\n";

  const topics = parseReportTopics(md);

  assert.equal(topics.length, 2);
  assert.equal(topics[0].source, "article-inventory");
  assert.ok(
    topics[0].label.includes("[Roadmap to 7.1]"),
    `Expected label to contain markdown link, got: ${topics[0].label}`,
  );
  assert.equal(topics[1].source, "article-inventory");
  assert.ok(
    topics[1].label.includes("[WordPress 7.0.1 Release Schedule]"),
    `Expected label to contain markdown link, got: ${topics[1].label}`,
  );
});

test("parseReportTopics returns empty array for missing sections", () => {
  const md =
    [
      "### Some Other Section",
      "",
      "* Item one",
      "* Item two",
    ].join("\n") + "\n";

  assert.deepEqual(parseReportTopics(md), []);
});

test("parseReportTopics returns empty array for empty markdown", () => {
  assert.deepEqual(parseReportTopics(""), []);
});

test("parseReportTopics extracts heading-adjacent paragraph as topic from ### Developer Implications", () => {
  const md =
    [
      "### Developer Implications",
      "",
      "For freelance or agency WordPress developers:",
      "",
      "* Prepare for WordPress 7.1 (August 19, 2026)",
      "* Monitor WordPress 7.0.1 (July 9, 2026)",
    ].join("\n") + "\n";

  const topics = parseReportTopics(md);

  // Should include the heading-adjacent paragraph + the 2 list items
  assert.equal(topics.length, 3);
  assert.equal(topics[0].source, "developer-implications");
  assert.equal(
    topics[0].label,
    "For freelance or agency WordPress developers:",
  );
  assert.equal(topics[1].source, "developer-implications");
  assert.equal(
    topics[1].label,
    "Prepare for WordPress 7.1 (August 19, 2026)",
  );
  assert.equal(topics[2].source, "developer-implications");
  assert.equal(topics[2].label, "Monitor WordPress 7.0.1 (July 9, 2026)");
});

// --- normalizeLabel ---

test("normalizeLabel strips markdown links, lowercases, removes punctuation", () => {
  const input = "[Hello World](https://example.com) — Test!";
  const result = normalizeLabel(input);

  // Strip link:  "Hello World — Test!"
  // Lowercase:   "hello world — test!"
  // Remove punct: "hello world  test"
  // Trim:        "hello world  test"
  assert.equal(result, "hello world  test");
});

test("normalizeLabel preserves hyphens and apostrophes", () => {
  const result = normalizeLabel(
    "WordPress 7.1 Release Planning - It's great!",
  );

  // No links:     "WordPress 7.1 Release Planning - It's great!"
  // Lowercase:    "wordpress 7.1 release planning - it's great!"
  // Remove punct: "wordpress 71 release planning - it's great"
  // Trim:         "wordpress 71 release planning - it's great"
  assert.equal(result, "wordpress 71 release planning - it's great");
});

test("normalizeLabel trims leading and trailing whitespace", () => {
  const result = normalizeLabel("  [Hello](https://example.com)  ");
  assert.equal(result, "hello");
});

test("normalizeLabel handles string with no markdown or punctuation", () => {
  const result = normalizeLabel("Hello World");
  assert.equal(result, "hello world");
});
