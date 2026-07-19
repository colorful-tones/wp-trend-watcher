import test from "node:test";
import assert from "node:assert/strict";
import {
  findWatchingSection,
  replaceWatchingSection,
  isPlaceholderContent,
} from "../../src/review/report-edit.js";

// --- Stripped-down test report ---

/** A minimal but structurally valid report template. */
function makeReport(watchingContent: string): string {
  return `# WordPress Trend Report — 2026-07-11

## Weekly Summary

Some summary content.

---

## What I'm Watching

${watchingContent}

---

## Source Articles

Article listing here.

---

## Build Notes

Build metadata here.
`;
}

const PLACEHOLDER_REPORT = makeReport(
  "<!-- Human-authored: add your observations here -->",
);

const HUMAN_REPORT = makeReport(
  "The merge proposal for the design system is exciting. It may feel like it is long overdue.",
);

// --- findWatchingSection ---

test("findWatchingSection returns body for placeholder report", () => {
  const span = findWatchingSection(PLACEHOLDER_REPORT);
  assert.ok(span, "section should be found");
  assert.ok(span!.body.includes("Human-authored: add your observations here"));
});

test("findWatchingSection returns body for human-authored report", () => {
  const span = findWatchingSection(HUMAN_REPORT);
  assert.ok(span, "section should be found");
  assert.ok(span!.body.includes("merge proposal"));
});

test("findWatchingSection returns null when heading is missing", () => {
  const report = "# Title\n\nNo watching section here.\n";
  assert.equal(findWatchingSection(report), null);
});

test("findWatchingSection returns empty body when heading is at end of file", () => {
  const report = "# Title\n\n## What I'm Watching";
  const span = findWatchingSection(report);
  assert.ok(span, "section should be found");
  assert.equal(span!.body, "");
});

test("findWatchingSection body offsets point to correct content", () => {
  const span = findWatchingSection(HUMAN_REPORT);
  assert.ok(span, "section should be found");
  const extracted = HUMAN_REPORT.slice(span!.bodyStart, span!.bodyEnd).trim();
  assert.equal(extracted, span!.body);
  assert.ok(extracted.includes("merge proposal"));
});

test("findWatchingSection preserves markdown links in body", () => {
  const report = makeReport(
    "See [this proposal](https://example.com) for details.",
  );
  const span = findWatchingSection(report);
  assert.ok(span, "section should be found");
  assert.ok(span!.body.includes("[this proposal](https://example.com)"));
});

test("findWatchingSection preserves unicode text", () => {
  const report = makeReport("WordPress 7.1 is exciting 🚀 — let's see what happens.");
  const span = findWatchingSection(report);
  assert.ok(span, "section should be found");
  assert.ok(span!.body.includes("🚀"));
  assert.ok(span!.body.includes("—"));
});

test("findWatchingSection preserves lists", () => {
  const report = makeReport("- Item one\n- Item two\n- Item three");
  const span = findWatchingSection(report);
  assert.ok(span, "section should be found");
  assert.ok(span!.body.startsWith("- Item one"));
  assert.ok(span!.body.includes("- Item three"));
});

test("findWatchingSection body end stops at next ## heading when no ---", () => {
  const report = `## What I'm Watching
Some notes.

## Source Articles
Articles here.`;
  const span = findWatchingSection(report);
  assert.ok(span, "section should be found");
  assert.equal(span!.body, "Some notes.");
});

// --- replaceWatchingSection ---

test("replaceWatchingSection replaces placeholder with new content", () => {
  const result = replaceWatchingSection(
    PLACEHOLDER_REPORT,
    "My review summary here.",
  );
  assert.ok(result, "replacement should succeed");
  assert.ok(result!.includes("My review summary here."));
  assert.ok(!result!.includes("Human-authored: add your observations here"));
  // Verify surrounding content preserved
  assert.ok(result!.includes("# WordPress Trend Report — 2026-07-11"));
  assert.ok(result!.includes("## Weekly Summary"));
  assert.ok(result!.includes("## Source Articles"));
  assert.ok(result!.includes("## Build Notes"));
});

test("replaceWatchingSection preserves content before and after section", () => {
  const beforeContent = "# WordPress Trend Report — 2026-07-11";
  const afterContent = "Build metadata here.";
  const result = replaceWatchingSection(HUMAN_REPORT, "Updated watch notes.");
  assert.ok(result, "replacement should succeed");
  assert.ok(result!.includes(beforeContent));
  assert.ok(result!.includes(afterContent));
  assert.ok(result!.includes("Updated watch notes."));
  assert.ok(!result!.includes("merge proposal"));
});

test("replaceWatchingSection returns null when section missing", () => {
  const report = "# No section here.";
  const result = replaceWatchingSection(report, "New content");
  assert.equal(result, null);
});

test("replaceWatchingSection handles empty content", () => {
  const result = replaceWatchingSection(HUMAN_REPORT, "");
  assert.ok(result, "replacement should succeed");
  assert.ok(result!.includes("Human-authored: add your observations here"));
  assert.ok(!result!.includes("merge proposal"));
});

test("replaceWatchingSection preserves markdown links in new content", () => {
  const result = replaceWatchingSection(
    PLACEHOLDER_REPORT,
    "See [the proposal](https://make.wordpress.org/core/proposal).",
  );
  assert.ok(result, "replacement should succeed");
  assert.ok(
    result!.includes("[the proposal](https://make.wordpress.org/core/proposal)"),
  );
});

test("replaceWatchingSection preserves unicode in new content", () => {
  const result = replaceWatchingSection(
    PLACEHOLDER_REPORT,
    "Exciting changes ahead! 🚀",
  );
  assert.ok(result, "replacement should succeed");
  assert.ok(result!.includes("🚀"));
});

test("replaceWatchingSection preserves lists in new content", () => {
  const result = replaceWatchingSection(
    PLACEHOLDER_REPORT,
    "- Point one\n- Point two\n- Point three",
  );
  assert.ok(result, "replacement should succeed");
  assert.ok(result!.includes("- Point one"));
  assert.ok(result!.includes("- Point three"));
});

test("replaceWatchingSection is idempotent when replacing with same content", () => {
  const content = "Same content as before.";
  const report = makeReport(content);
  const result = replaceWatchingSection(report, content);
  assert.ok(result, "replacement should succeed");
  assert.ok(result!.includes(content));
  // Should still have correct structure
  assert.ok(result!.includes("## Source Articles"));
  assert.ok(result!.includes("## Build Notes"));
});

// --- isPlaceholderContent ---

test("isPlaceholderContent returns true for generated placeholder comment", () => {
  assert.equal(
    isPlaceholderContent("<!-- Human-authored: add your observations here -->"),
    true,
  );
});

test("isPlaceholderContent returns true for TODO marker", () => {
  assert.equal(isPlaceholderContent("TODO: write something here"), true);
});

test("isPlaceholderContent returns true for empty string", () => {
  assert.equal(isPlaceholderContent(""), true);
});

test("isPlaceholderContent returns true for whitespace-only", () => {
  assert.equal(isPlaceholderContent("   \n  "), true);
});

test("isPlaceholderContent returns false for human-authored content", () => {
  assert.equal(
    isPlaceholderContent("The merge proposal looks promising."),
    false,
  );
});

test("isPlaceholderContent returns false for multiline human content", () => {
  assert.equal(
    isPlaceholderContent("- Point one\n- Point two\n\nMore notes."),
    false,
  );
});

test("isPlaceholderContent returns true for ADD YOUR NOTE casing variants", () => {
  assert.equal(isPlaceholderContent("Add your note here"), true);
  assert.equal(isPlaceholderContent("ADD YOUR NOTE"), true);
});
