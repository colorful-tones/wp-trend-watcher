import test from "node:test";
import assert from "node:assert/strict";
import {
  extractReportBody,
  parseSourceArticles,
  checkWeeklySummary,
  checkSourceReferences,
  checkWeaselWords,
  checkBuildNotes,
  checkWatchingSection,
  checkMarkdownLinks,
  checkHtmlReport,
  type SourceArticle,
} from "../../src/review/checks.js";

// --- extractReportBody ---

test("extractReportBody returns everything before Source Articles", () => {
  const report = `# Title

### Weekly Summary
Hello world.

## Source Articles
### Source
* [Link](https://example.com)`;
  const body = extractReportBody(report);
  assert.ok(body.includes("Weekly Summary"));
  assert.ok(!body.includes("Source Articles"));
  assert.ok(!body.includes("Link"));
});

test("extractReportBody returns full text when no Source Articles marker", () => {
  const report = "# Title\n\nHello world.";
  assert.equal(extractReportBody(report), report);
});

// --- parseSourceArticles ---

test("parseSourceArticles extracts title and URL from markdown links", () => {
  const report = `## Source Articles
### WordPress Developer Blog
* [What's new for developers](https://developer.wordpress.org/news/2026/06/) — 6/10/2026
### Make Core
* [Dev Chat Agenda](https://make.wordpress.org/core/2026/06/) — 6/9/2026`;
  const articles = parseSourceArticles(report);
  assert.equal(articles.length, 2);
  assert.equal(articles[0].title, "What's new for developers");
  assert.equal(articles[0].url, "https://developer.wordpress.org/news/2026/06/");
  assert.equal(articles[1].title, "Dev Chat Agenda");
});

test("parseSourceArticles returns empty array when no Source Articles section", () => {
  assert.deepEqual(parseSourceArticles("# Just a title"), []);
});

test("parseSourceArticles returns empty array for empty section", () => {
  assert.deepEqual(parseSourceArticles("## Source Articles\n"), []);
});

// --- checkWeeklySummary ---

test("checkWeeklySummary passes when section has content", () => {
  const body = "### Weekly Summary\nHere is the summary.";
  const result = checkWeeklySummary(body);
  assert.equal(result.status, "pass");
});

test("checkWeeklySummary fails when section is missing", () => {
  const result = checkWeeklySummary("### Something else");
  assert.equal(result.status, "fail");
  assert.ok(result.message.includes("not found"));
});

test("checkWeeklySummary fails when section is empty", () => {
  const result = checkWeeklySummary("### Weekly Summary");
  assert.equal(result.status, "fail");
  assert.ok(result.message.includes("empty"));
});

// --- checkSourceReferences ---

test("checkSourceReferences passes when all articles are referenced by title", () => {
  const articles: SourceArticle[] = [
    { title: "Gutenberg Update", url: "https://example.com/1" },
    { title: "ACF Release", url: "https://example.com/2" },
  ];
  const body = "The Gutenberg Update brings new features. ACF Release is out.";
  const result = checkSourceReferences(articles, body);
  assert.equal(result.status, "pass");
});

test("checkSourceReferences passes when articles referenced by URL", () => {
  const articles: SourceArticle[] = [
    { title: "Some Article", url: "https://example.com/special" },
  ];
  const body = "See https://example.com/special for details.";
  const result = checkSourceReferences(articles, body);
  assert.equal(result.status, "pass");
});

test("checkSourceReferences warns when articles are not referenced", () => {
  const articles: SourceArticle[] = [
    { title: "Referenced Article", url: "https://example.com/1" },
    { title: "Missing Article", url: "https://example.com/2" },
  ];
  const body = "Referenced Article is great.";
  const result = checkSourceReferences(articles, body);
  assert.equal(result.status, "warn");
  assert.ok(result.message.includes("1 unreferenced"));
  assert.ok(result.message.includes("Missing Article"));
});

test("checkSourceReferences warns when no articles found", () => {
  const result = checkSourceReferences([], "body text");
  assert.equal(result.status, "warn");
  assert.ok(result.message.includes("no source articles"));
});

test("checkSourceReferences truncates long lists", () => {
  const articles: SourceArticle[] = [
    { title: "A", url: "https://a.com" },
    { title: "B", url: "https://b.com" },
    { title: "C", url: "https://c.com" },
    { title: "D", url: "https://d.com" },
  ];
  const result = checkSourceReferences(articles, "no references here");
  assert.equal(result.status, "warn");
  assert.ok(result.message.includes("+1 more"));
});

// --- checkWeaselWords ---

test("checkWeaselWords passes when no weasel words found", () => {
  const result = checkWeaselWords("This is a straightforward update.");
  assert.equal(result.status, "pass");
});

test("checkWeaselWords warns when weasel words are found", () => {
  const result = checkWeaselWords("This seamlessly integrates with the robust system.");
  assert.equal(result.status, "warn");
  assert.ok(result.message.includes("seamlessly"));
  assert.ok(result.message.includes("robust"));
});

test("checkWeaselWords is case-insensitive", () => {
  const result = checkWeaselWords("A GAME-CHANGER for developers.");
  assert.equal(result.status, "warn");
  assert.ok(result.message.includes("game-changer"));
});

// --- checkBuildNotes ---

test("checkBuildNotes passes when section has provider and cost info", () => {
  const report = `## Build Notes
* Model: ollama/llama3.2:3b
* Estimated cost: $0.00`;
  const result = checkBuildNotes(report);
  assert.equal(result.status, "pass");
});

test("checkBuildNotes fails when section is missing", () => {
  const result = checkBuildNotes("# Just a title");
  assert.equal(result.status, "fail");
});

test("checkBuildNotes warns when section lacks metadata", () => {
  const report = "## Build Notes\nSome notes here.";
  const result = checkBuildNotes(report);
  assert.equal(result.status, "warn");
});

// --- checkWatchingSection ---

test("checkWatchingSection passes when section has human note", () => {
  const report = `## What I'm Watching
- Collaborative editing is the biggest shift.`;
  const result = checkWatchingSection(report);
  assert.equal(result.status, "pass");
});

test("checkWatchingSection fails when section is missing", () => {
  const result = checkWatchingSection("# Title");
  assert.equal(result.status, "fail");
});

test("checkWatchingSection fails when section is empty", () => {
  const result = checkWatchingSection("## What I'm Watching");
  assert.equal(result.status, "fail");
});

test("checkWatchingSection warns on placeholder text", () => {
  const report = "## What I'm Watching\nTODO: add notes";
  const result = checkWatchingSection(report);
  assert.equal(result.status, "warn");
  assert.ok(result.message.includes("placeholder"));
});

// --- checkMarkdownLinks ---

test("checkMarkdownLinks passes for well-formed links", () => {
  const report = "* [Title](https://example.com)\n* [Another](https://other.com)";
  const result = checkMarkdownLinks(report);
  assert.equal(result.status, "pass");
});

test("checkMarkdownLinks warns on empty link text", () => {
  const report = "[](https://example.com)";
  const result = checkMarkdownLinks(report);
  assert.equal(result.status, "warn");
  assert.ok(result.message.includes("empty link text"));
});

test("checkMarkdownLinks warns on empty URL", () => {
  const report = "[Title]()";
  const result = checkMarkdownLinks(report);
  assert.equal(result.status, "warn");
  assert.ok(result.message.includes("empty link URL"));
});

// --- checkHtmlReport ---

test("checkHtmlReport passes when file exists", () => {
  const result = checkHtmlReport(true, "reports/2026-06-12.html");
  assert.equal(result.status, "pass");
});

test("checkHtmlReport warns when file is missing", () => {
  const result = checkHtmlReport(false, "reports/2026-06-12.html");
  assert.equal(result.status, "warn");
  assert.ok(result.message.includes("not found"));
});
