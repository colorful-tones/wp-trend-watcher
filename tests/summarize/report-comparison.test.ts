import test from "node:test";
import assert from "node:assert/strict";
import {
  parseReportTopics,
  normalizeLabel,
  buildSinceLastReportSection,
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

// --- buildSinceLastReportSection ---

/**
 * Helper to create a ReportTopic with the given label.
 * Source is irrelevant for comparison tests.
 */
function topic(label: string, source: ReportTopic["source"] = "emerging-trends"): ReportTopic {
  return { label, source };
}

test("buildSinceLastReportSection returns null when both topic arrays are empty", () => {
  const result = buildSinceLastReportSection([], []);
  assert.equal(result, null);
});

test("buildSinceLastReportSection returns null when previous topics array is empty", () => {
  const result = buildSinceLastReportSection(
    [topic("WordPress 7.1 Release Planning")],
    [],
  );
  assert.equal(result, null);
});

test("buildSinceLastReportSection returns null when topic sets are identical", () => {
  const current = [
    topic("WordPress 7.1 Release Planning"),
    topic("Gutenberg 23.4 React 19 Integration"),
  ];
  const previous = [
    topic("WordPress 7.1 Release Planning"),
    topic("Gutenberg 23.4 React 19 Integration"),
  ];
  const result = buildSinceLastReportSection(current, previous);
  assert.equal(result, null);
});

test("buildSinceLastReportSection returns single continued bullet when one topic continued and one is new", () => {
  // current has [A, B], previous has [A] → A is continued, B is new
  const current = [
    topic("WordPress 7.1 Release Planning"),
    topic("Gutenberg 23.4 React 19 Integration"),
  ];
  const previous = [
    topic("WordPress 7.1 Release Planning"),
  ];
  const result = buildSinceLastReportSection(current, previous);
  assert.ok(result !== null);
  assert.ok(result.includes("**Continued topic:**"));
  assert.ok(result.includes("WordPress 7.1 Release Planning"));
  // Should include both the continued and new bullets
  assert.ok(result.includes("**New topic:**"));
  assert.ok(result.includes("Gutenberg 23.4 React 19 Integration"));
});

test("buildSinceLastReportSection returns bullets prioritizing continued, then new, then dropped", () => {
  const current = [
    topic("Continued A"),
    topic("New C"),
  ];
  const previous = [
    topic("Continued A"),
    topic("Dropped B"),
  ];
  const result = buildSinceLastReportSection(current, previous);
  assert.ok(result !== null);

  const lines = result.split("\n");
  // First bullet should be continued, second should be new, third should be dropped
  assert.ok(lines[0].includes("**Continued topic:**"));
  assert.ok(lines[0].includes("Continued A"));
  assert.ok(lines[1].includes("**New topic:**"));
  assert.ok(lines[1].includes("New C"));
  assert.ok(lines[2].includes("**Dropped topic:**"));
  assert.ok(lines[2].includes("Dropped B"));
});

test("buildSinceLastReportSection caps at 3 bullets when there are more than 3 changes", () => {
  const current = [
    topic("C1"),
    topic("C2"),
    topic("C3"),
    topic("N1"),
    topic("N2"),
  ];
  const previous = [
    topic("C1"),
    topic("C2"),
    topic("C3"),
    topic("D1"),
    topic("D2"),
    topic("D3"),
  ];
  const result = buildSinceLastReportSection(current, previous);
  assert.ok(result !== null);

  const lines = result.split("\n");
  assert.equal(lines.length, 3);
  // All three should be continued (highest priority)
  assert.ok(lines[0].includes("**Continued topic:**"));
  assert.ok(lines[1].includes("**Continued topic:**"));
  assert.ok(lines[2].includes("**Continued topic:**"));
});

test("buildSinceLastReportSection uses normalized matching for continued topics", () => {
  // Labels that differ only in punctuation should match as continued.
  // Include a second new topic so the comparison is not empty (no new/dropped).
  const current = [
    topic("WordPress 7.1 Release Planning!"),
    topic("Brand New Topic"),
  ];
  const previous = [
    topic("WordPress 7.1 Release Planning"),
  ];
  const result = buildSinceLastReportSection(current, previous);
  assert.ok(result !== null);
  assert.ok(result.includes("**Continued topic:**"));
  // Should use the current label (with the exclamation) in the output
  assert.ok(result.includes("WordPress 7.1 Release Planning!"));
  // Should use current label for new topic
  assert.ok(result.includes("Brand New Topic"));
});

test("buildSinceLastReportSection includes both continued and dropped when no new topics", () => {
  const current = [
    topic("WordPress 7.1 Release Planning"),
  ];
  const previous = [
    topic("WordPress 7.1 Release Planning"),
    topic("Gutenberg 23.4"),
  ];
  const result = buildSinceLastReportSection(current, previous);
  assert.ok(result !== null);
  assert.ok(result.includes("**Continued topic:**"));
  assert.ok(result.includes("WordPress 7.1 Release Planning"));
  assert.ok(result.includes("**Dropped topic:**"));
  assert.ok(result.includes("Gutenberg 23.4"));
});

test("buildSinceLastReportSection uses current label for continued and new, previous label for dropped", () => {
  // Labels may differ slightly due to normalization, but output uses original labels
  const current = [
    topic("WordPress 7.1!"),
  ];
  const previous = [
    topic("WordPress 7.1!"),
    topic("Dropped Item (old)"),
  ];
  const result = buildSinceLastReportSection(current, previous);
  assert.ok(result !== null);
  assert.ok(result.includes("WordPress 7.1!"));
  assert.ok(result.includes("Dropped Item (old)"));
});
