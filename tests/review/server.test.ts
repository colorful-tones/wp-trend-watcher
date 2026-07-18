/**
 * Tests for the localhost review server (src/review/server.ts).
 *
 * Uses temporary fixture report directories to test request routing,
 * validation, save behaviour, and HTML regeneration without touching
 * the real reports/ directory.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { createReviewServer, markdownToHtml } from "../../src/review/server.js";
import type { Server } from "node:http";

/** Minimal fixture report with a placeholder "What I'm Watching" section. */
const FIXTURE_REPORT = `# WordPress Trend Report — 2026-07-18

## Weekly Summary

### Article Inventory

1. [Test Article](https://example.com/1) (Test Source) — Summary.

### Emerging Trends

None.

### Developer Implications

None.

---

## What I'm Watching

<!-- Human-authored: add your observations here -->

---

## Source Articles

### Test Source
- [Test Article](https://example.com/1) — 7/18/2026

---

## Build Notes
- Articles analyzed: 1
- Sources: Test Source
- Model: test/model
- Tokens: 100 prompt + 50 completion
- Estimated cost: $0.00
`;

/** Prepare a temporary reports directory with a single fixture report. */
async function setupFixture(
  reportMd: string | null = FIXTURE_REPORT,
): Promise<{ reportsDir: string; server: Server; baseUrl: string }> {
  const reportsDir = await mkdtemp(join(tmpdir(), "wp-trend-review-test-"));
  const server = createReviewServer({ reportsDir, port: 0 });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  const addr = server.address();
  if (!addr || typeof addr === "string") {
    server.close();
    throw new Error("Could not get server address");
  }

  if (reportMd !== null) {
    await writeFile(
      join(reportsDir, "2026-07-18.md"),
      reportMd,
      "utf8",
    );
  }

  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return { reportsDir, server, baseUrl };
}

/** Clean up a fixture server and directory. */
async function teardownFixture(params: {
  server: Server;
}): Promise<void> {
  return new Promise<void>((resolve) => {
    params.server.close(() => resolve());
  });
}

/** Helper to make an HTTP request and return status + body. */
async function fetchFrom(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<{ status: number; body: string }> {
  const { method = "GET", headers = {}, body } = options;
  const url = new URL(path, baseUrl);

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 500,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// --- GET /review ---

test("GET /review returns HTML review page", async () => {
  const fixture = await setupFixture();
  try {
    const { status, body } = await fetchFrom(fixture.baseUrl, "/review");
    assert.equal(status, 200);
    assert.ok(body.includes("<!DOCTYPE html>"));
    assert.ok(body.includes("WP Trend Watcher"));
    assert.ok(body.includes("summary-textarea"));
  } finally {
    await teardownFixture(fixture);
  }
});

test("GET /review returns 405 for POST method", async () => {
  const fixture = await setupFixture();
  try {
    const { status, body } = await fetchFrom(fixture.baseUrl, "/review", {
      method: "POST",
    });
    assert.equal(status, 405);
    assert.ok(body.includes("Method not allowed"));
  } finally {
    await teardownFixture(fixture);
  }
});

// --- GET /api/review ---

test("GET /api/review returns JSON with date, html, summary, checks", async () => {
  const fixture = await setupFixture();
  try {
    const { status, body } = await fetchFrom(fixture.baseUrl, "/api/review");
    assert.equal(status, 200);
    const data = JSON.parse(body);
    assert.equal(data.date, "2026-07-18");
    assert.ok(typeof data.html === "string");
    assert.ok(data.html.length > 0);
    assert.ok(data.summary.includes("Human-authored"));
    assert.ok(Array.isArray(data.checks));
    assert.ok(data.checks.length >= 7);
  } finally {
    await teardownFixture(fixture);
  }
});

test("GET /api/review returns 404 when no reports exist", async () => {
  const fixture = await setupFixture(null); // no report written at all
  try {
    const { status, body } = await fetchFrom(fixture.baseUrl, "/api/review");
    assert.equal(status, 404);
    assert.ok(body.includes("No reports found"));
  } finally {
    await teardownFixture(fixture);
  }
});

test("GET /api/review returns 405 for POST", async () => {
  const fixture = await setupFixture();
  try {
    const { status } = await fetchFrom(fixture.baseUrl, "/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(status, 405);
  } finally {
    await teardownFixture(fixture);
  }
});

// --- GET /api/review-checks ---

test("GET /api/review-checks returns checks JSON", async () => {
  const fixture = await setupFixture();
  try {
    const { status, body } = await fetchFrom(fixture.baseUrl, "/api/review-checks");
    assert.equal(status, 200);
    const data = JSON.parse(body);
    assert.ok(Array.isArray(data.checks));
    assert.ok(data.checks.length >= 7);
  } finally {
    await teardownFixture(fixture);
  }
});

// --- POST /api/review-summary ---

test("POST /api/review-summary saves summary and returns updated state", async () => {
  const fixture = await setupFixture();
  try {
    const { status, body } = await fetchFrom(
      fixture.baseUrl,
      "/api/review-summary",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: "Updated observation: this is important.",
        }),
      },
    );
    assert.equal(status, 200);
    const data = JSON.parse(body);
    assert.ok(data.summary.includes("Updated observation"));
    assert.ok(!data.summary.includes("Human-authored"));
    assert.ok(data.html.includes("Updated observation"));
    assert.equal(data.date, "2026-07-18");
  } finally {
    await teardownFixture(fixture);
  }
});

test("POST /api/review-summary actually writes to the Markdown file", async () => {
  const fixture = await setupFixture();
  try {
    await fetchFrom(fixture.baseUrl, "/api/review-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: "Persisted observation.",
      }),
    });

    // Re-read the file to confirm it was written
    const md = await readFile(join(fixture.reportsDir, "2026-07-18.md"), "utf8");
    assert.ok(md.includes("Persisted observation."));
    assert.ok(!md.includes("Human-authored: add your observations here"));
    assert.ok(md.includes("## Source Articles"));
    assert.ok(md.includes("## Build Notes"));
  } finally {
    await teardownFixture(fixture);
  }
});

test("POST /api/review-summary regenerates HTML after save", async () => {
  const fixture = await setupFixture();
  try {
    await fetchFrom(fixture.baseUrl, "/api/review-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: "HTML should reflect this.",
      }),
    });

    // Check HTML was created
    const html = await readFile(
      join(fixture.reportsDir, "2026-07-18.html"),
      "utf8",
    );
    assert.ok(html.includes("HTML should reflect this."));
    assert.ok(html.includes("<!DOCTYPE html>"));
  } finally {
    await teardownFixture(fixture);
  }
});

test("POST /api/review-summary returns 400 for missing Content-Type", async () => {
  const fixture = await setupFixture();
  try {
    const { status, body } = await fetchFrom(
      fixture.baseUrl,
      "/api/review-summary",
      {
        method: "POST",
        body: JSON.stringify({ summary: "test" }),
      },
    );
    assert.equal(status, 400);
    assert.ok(body.includes("application/json"));
  } finally {
    await teardownFixture(fixture);
  }
});

test("POST /api/review-summary returns 400 for invalid JSON", async () => {
  const fixture = await setupFixture();
  try {
    const { status, body } = await fetchFrom(
      fixture.baseUrl,
      "/api/review-summary",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      },
    );
    assert.equal(status, 400);
    assert.ok(body.includes("Invalid JSON"));
  } finally {
    await teardownFixture(fixture);
  }
});

test("POST /api/review-summary returns 400 for missing summary field", async () => {
  const fixture = await setupFixture();
  try {
    const { status, body } = await fetchFrom(
      fixture.baseUrl,
      "/api/review-summary",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ other: "field" }),
      },
    );
    assert.equal(status, 400);
    assert.ok(body.includes("summary"));
  } finally {
    await teardownFixture(fixture);
  }
});

test("POST /api/review-summary returns 400 for non-string summary", async () => {
  const fixture = await setupFixture();
  try {
    const { status, body } = await fetchFrom(
      fixture.baseUrl,
      "/api/review-summary",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: 123 }),
      },
    );
    assert.equal(status, 400);
    assert.ok(body.includes("summary"));
  } finally {
    await teardownFixture(fixture);
  }
});

test("POST /api/review-summary returns 413 for oversized body", async () => {
  const fixture = await setupFixture();
  try {
    const hugeString = "x".repeat(200_000);
    const { status, body } = await fetchFrom(
      fixture.baseUrl,
      "/api/review-summary",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: hugeString }),
      },
    );
    assert.equal(status, 413);
    assert.ok(body.includes("too large"));
  } finally {
    await teardownFixture(fixture);
  }
});

test("POST /api/review-summary returns 404 when no reports exist", async () => {
  const fixture = await setupFixture(null);
  try {
    const { status, body } = await fetchFrom(
      fixture.baseUrl,
      "/api/review-summary",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: "test" }),
      },
    );
    assert.equal(status, 404);
    assert.ok(body.includes("No reports found"));
  } finally {
    await teardownFixture(fixture);
  }
});

// --- Unknown routes ---

test("unknown route returns 404", async () => {
  const fixture = await setupFixture();
  try {
    const { status, body } = await fetchFrom(fixture.baseUrl, "/nonexistent");
    assert.equal(status, 404);
    assert.ok(body.includes("Not found"));
  } finally {
    await teardownFixture(fixture);
  }
});

test("GET on save endpoint returns 405", async () => {
  const fixture = await setupFixture();
  try {
    const { status } = await fetchFrom(fixture.baseUrl, "/api/review-summary");
    assert.equal(status, 405);
  } finally {
    await teardownFixture(fixture);
  }
});

// --- markdownToHtml link safety ---

test("markdownToHtml strips javascript: links", () => {
  const result = markdownToHtml("[click me](javascript:alert(1))");
  assert.ok(!result.includes("<a href"), "should not contain anchor tag");
  assert.ok(!result.includes("javascript:"), "should not contain javascript URL");
  assert.ok(result.includes("click me"), "should preserve link text");
});

test("markdownToHtml strips data: links", () => {
  const result = markdownToHtml("[text](data:text/html,<script>alert(1)</script>)");
  assert.ok(!result.includes("<a href"), "should not contain anchor tag");
  assert.ok(!result.includes("data:"), "should not contain data URL");
  assert.ok(result.includes("text"), "should preserve link text");
});

test("markdownToHtml strips vbscript: links", () => {
  const result = markdownToHtml("[text](vbscript:msgbox(1))");
  assert.ok(!result.includes("<a href"), "should not contain anchor tag");
  assert.ok(!result.includes("vbscript:"), "should not contain vbscript URL");
  assert.ok(result.includes("text"), "should preserve link text");
});

test("markdownToHtml strips unsafe links case-insensitively", () => {
  const result = markdownToHtml("[text](JAVASCRIPT:alert(1))");
  assert.ok(!result.includes("<a href"), "should not contain anchor tag");
  assert.ok(!result.includes("JAVASCRIPT:"), "should not contain javascript URL");
  assert.ok(result.includes("text"), "should preserve link text");
});

test("markdownToHtml preserves safe https: links", () => {
  const result = markdownToHtml("[safe](https://example.com)");
  assert.ok(result.includes('<a href="https://example.com"'), "should keep the anchor");
  assert.ok(result.includes("safe"), "should keep link text");
});

test("markdownToHtml preserves safe http: links", () => {
  const result = markdownToHtml("[safe](http://example.com)");
  assert.ok(result.includes('<a href="http://example.com"'), "should keep the anchor");
  assert.ok(result.includes("safe"), "should keep link text");
});

test("markdownToHtml handles mixed safe and unsafe links", () => {
  const md = "- [good](https://ok.com) and [bad](javascript:evil) in one line";
  const result = markdownToHtml(md);
  assert.ok(result.includes('<a href="https://ok.com"'), "keeps safe link");
  assert.ok(!result.includes("javascript:"), "strips unsafe link");
  assert.ok(result.includes("bad"), "preserves unsafe link text");
});

// --- Server binding protection ---

test("server binds to 127.0.0.1 only", async () => {
  const fixture = await setupFixture();
  try {
    const addr = fixture.server.address();
    assert.ok(typeof addr === "object" && addr !== null);
    assert.equal((addr as import("node:net").AddressInfo).address, "127.0.0.1");
  } finally {
    await teardownFixture(fixture);
  }
});
