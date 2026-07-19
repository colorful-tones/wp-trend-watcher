/**
 * Localhost-only review server for WP Trend Watcher.
 *
 * Provides a browser UI for reviewing the latest report, viewing
 * automated checks, and saving human-authored "What I'm Watching"
 * summary content. The server is designed for personal local use
 * only — it binds to 127.0.0.1 and rejects any request that
 * attempts to target an arbitrary report path.
 *
 * Endpoints:
 *   GET  /review             — review UI page
 *   GET  /api/review         — JSON: date, html, summary, checks
 *   POST /api/review-summary — save summary (accepts {"summary":"..."})
 *   GET  /api/review-checks  — JSON: review checks only (used by UI polling)
 *
 * Security:
 *   - Binds to 127.0.0.1 only
 *   - Rejects unknown methods/routes with 404/405
 *   - POST requires Content-Type: application/json
 *   - Request body limited to 100 KB
 *   - Payload validated: { summary: string } only
 *   - No arbitrary report path accepted from client
 *   - No filesystem path traversal possible (report path is server-determined)
 *   - Never exposes env vars, credentials, or stack traces
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile, rename, mkdir, unlink, readdir } from "node:fs/promises";
import {
  join,
  dirname,
  basename,
  resolve as pathResolve,
  extname,
} from "node:path";
import { randomBytes } from "node:crypto";
import { generateHtmlReport } from "../summarize/html.js";
import {
  findWatchingSection,
  replaceWatchingSection,
  isPlaceholderContent,
} from "./report-edit.js";
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
  type ReviewCheck,
} from "./checks.js";

// --- Configuration ---

const DEFAULT_PORT = 3001;
const BIND_ADDRESS = "127.0.0.1";
const MAX_REQUEST_BODY = 100 * 1024; // 100 KB

/** Internal review-data shape returned by /api/review. */
export interface ReviewData {
  date: string;
  html: string;
  summary: string;
  checks: ReviewCheck[];
}

/** Convenience type for route handler functions. */
type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

// --- Server factory ---

/**
 * Options for creating the review HTTP server.
 *
 * @internal exported for test use.
 */
export interface ReviewServerOptions {
  /** Absolute path to the reports directory. Defaults to `process.cwd()/reports`. */
  reportsDir?: string;
  /** Port to listen on. Defaults to 3001. */
  port?: number;
  /** Host to bind to. Defaults to 127.0.0.1. */
  hostname?: string;
}

/**
 * Create and return a configured review HTTP server (not started).
 *
 * The server instance is returned so tests can start/stop it and
 * pass a custom reports directory.
 *
 * @param options - Server configuration.
 * @returns A Node.js http.Server instance.
 */
export function createReviewServer(
  options: ReviewServerOptions = {},
): ReturnType<typeof createServer> {
  const reportsDir = options.reportsDir ?? join(process.cwd(), "reports");
  const port = options.port ?? DEFAULT_PORT;
  const hostname = options.hostname ?? BIND_ADDRESS;

  return createServer((req, res) =>
    handleRequest(req, res, { reportsDir, port, hostname }),
  );
}

// --- Internal request context ---

interface RequestContext {
  reportsDir: string;
  port: number;
  hostname: string;
}

// --- Route table ---

/**
 * Read the full request body with a size cap.
 *
 * @returns The body as a UTF-8 string.
 * @throws If the body exceeds MAX_REQUEST_BODY.
 */
function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_REQUEST_BODY) {
        reject(new Error("request body too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", reject);
  });
}

/**
 * Find the latest Markdown report file in the reports directory.
 *
 * @param reportsDir - Absolute path to the reports directory.
 * @returns The filename (e.g. "2026-07-11.md") or null if none found.
 */
export async function findLatestReportFile(
  reportsDir: string,
): Promise<string | null> {
  try {
    const files = await readdir(reportsDir);
    const mdFiles = files
      .filter((f) => f.endsWith(".md") && f !== "index.md")
      .sort()
      .reverse();
    return mdFiles.length > 0 ? mdFiles[0] : null;
  } catch {
    return null;
  }
}

/**
 * Simple Markdown-to-HTML converter for review server use.
 *
 * Handles the subset of Markdown found in trend reports.
 */
export function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  function slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function inlineFormat(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (_m: string, linkText: string, url: string) => {
          const unsafe = /^(javascript:|data:|vbscript:)/i;
          if (unsafe.test(url)) return linkText;
          return `<a href="${url}">${linkText}</a>`;
        },
      );
  }

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*<!--/.test(line)) {
      out.push(line);
      i++;
      continue;
    }

    if (/^---+$/.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = inlineFormat(headingMatch[2]);
      const id = slugify(headingMatch[2]);
      out.push(`<h${level} id="${id}">${text}</h${level}>`);
      i++;
      continue;
    }

    if (/^[*-]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[*-]\s+/.test(lines[i])) {
        items.push(
          `<li>${inlineFormat(lines[i].replace(/^[-*]\s+/, ""))}</li>`,
        );
        i++;
      }
      out.push(`<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        let itemText = lines[i].replace(/^\d+\.\s+/, "");
        i++;
        while (
          i < lines.length &&
          /^\s{2,}\S/.test(lines[i]) &&
          !/^\d+\.\s+/.test(lines[i]) &&
          !/^(#{1,6})\s+/.test(lines[i]) &&
          !/^[-*]\s+/.test(lines[i]) &&
          !/^---+$/.test(lines[i])
        ) {
          itemText += " " + lines[i].trim();
          i++;
        }
        if (
          i < lines.length &&
          lines[i].trim() === "" &&
          i + 1 < lines.length &&
          /^\d+\.\s+/.test(lines[i + 1])
        ) {
          i++;
        }
        items.push(`<li>${inlineFormat(itemText)}</li>`);
      }
      out.push(`<ol>\n${items.join("\n")}\n</ol>`);
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^---+$/.test(lines[i]) &&
      !/^\s*<!--/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      out.push(`<p>${inlineFormat(paraLines.join("\n"))}</p>`);
    }
  }

  return out.join("\n");
}

/**
 * Generate the review UI page as inline HTML.
 *
 * Embeds CSS and JavaScript directly — no external assets needed.
 * The page fetches /api/review for data, renders the report, and
 * provides a textarea for editing the "What I'm Watching" section.
 */
function reviewPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WP Trend Watcher — Review</title>
<style>
  :root {
    --bg: #ffffff;
    --text: #1a1a1a;
    --muted: #6b7280;
    --border: #e5e7eb;
    --accent: #2563eb;
    --accent-hover: #1d4ed8;
    --pass: #16a34a;
    --warn: #d97706;
    --fail: #dc2626;
    --pass-bg: #f0fdf4;
    --warn-bg: #fffbeb;
    --fail-bg: #fef2f2;
    --surface: #f9fafb;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #111827;
      --text: #f3f4f6;
      --muted: #9ca3af;
      --border: #374151;
      --accent: #3b82f6;
      --accent-hover: #60a5fa;
      --pass: #22c55e;
      --warn: #f59e0b;
      --fail: #ef4444;
      --pass-bg: #052e16;
      --warn-bg: #451a03;
      --fail-bg: #450a0a;
      --surface: #1f2937;
    }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    max-width: 900px;
    margin: 0 auto;
    padding: 1.5rem;
    line-height: 1.6;
  }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  h2 { font-size: 1.25rem; margin: 1.5rem 0 0.75rem; }
  h3 { font-size: 1.1rem; margin: 1rem 0 0.5rem; }
  hr { border: 0; border-top: 1px solid var(--border); margin: 1.5rem 0; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  ul, ol { padding-left: 1.5rem; margin: 0.5rem 0; }
  code { background: var(--surface); padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
  p { margin: 0.5rem 0; }

  .checks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 0.5rem;
    margin: 1rem 0;
  }
  .check {
    padding: 0.75rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    font-size: 0.9rem;
  }
  .check.pass { background: var(--pass-bg); border-color: var(--pass); }
  .check.warn { background: var(--warn-bg); border-color: var(--warn); }
  .check.fail { background: var(--fail-bg); border-color: var(--fail); }
  .check-name { font-weight: 600; }
  .check-msg { color: var(--muted); font-size: 0.85rem; }
  .check-icon { margin-right: 0.25rem; }

  .report-body {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    margin: 1rem 0;
    max-height: 60vh;
    overflow-y: auto;
  }

  .editor-section {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.25rem;
    margin: 1rem 0;
  }
  .editor-section h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.15rem;
  }
  .editor-label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }
  textarea {
    width: 100%;
    min-height: 160px;
    padding: 0.75rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 0.95rem;
    line-height: 1.5;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    resize: vertical;
  }
  textarea:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.6rem 1.25rem;
    margin-top: 0.75rem;
    font-size: 0.95rem;
    font-weight: 500;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    background: var(--accent);
    color: #ffffff;
    transition: background 0.15s;
  }
  .btn:hover { background: var(--accent-hover); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
  }
  .btn-secondary:hover { background: var(--border); }

  .status {
    margin-top: 0.75rem;
    padding: 0.75rem;
    border-radius: 6px;
    font-size: 0.9rem;
    display: none;
  }
  .status.success {
    display: block;
    background: var(--pass-bg);
    color: var(--pass);
    border: 1px solid var(--pass);
  }
  .status.error {
    display: block;
    background: var(--fail-bg);
    color: var(--fail);
    border: 1px solid var(--fail);
  }
  .status.loading {
    display: block;
    background: var(--surface);
    color: var(--muted);
    border: 1px solid var(--border);
  }

  .meta {
    color: var(--muted);
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
  }
</style>
</head>
<body>
<h1>WP Trend Watcher — Review</h1>
<div class="meta" id="meta-info">Loading…</div>

<section>
  <h2>Automated Checks</h2>
  <div class="checks" id="checks-container">Loading checks…</div>
</section>

<section>
  <h2>Rendered Report</h2>
  <div class="report-body" id="report-container">Loading report…</div>
</section>

<section class="editor-section">
  <h2>Your Review Summary</h2>
  <p class="meta">Edit the <em>What I'm Watching</em> section below. Saving updates the canonical Markdown report and regenerates the matching HTML.</p>
  <label class="editor-label" for="summary-textarea">What I'm Watching</label>
  <textarea id="summary-textarea" placeholder="Add your observations here…"></textarea>
  <button class="btn" id="save-btn" onclick="saveSummary()">💾 Save summary</button>
  <div class="status" id="save-status"></div>
</section>

<script>
async function loadReview() {
  try {
    const res = await fetch('/api/review');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    document.getElementById('meta-info').textContent =
      'Report: ' + data.date + ' — ' + data.checks.length + ' checks run';

    renderChecks(data.checks);
    document.getElementById('report-container').innerHTML = data.html;
    document.getElementById('summary-textarea').value = data.summary;
  } catch (err) {
    document.getElementById('meta-info').textContent = 'Failed to load: ' + err.message;
  }
}

function renderChecks(checks) {
  const icons = { pass: '✓', warn: '⚠', fail: '✗' };
  const labels = { pass: 'Pass', warn: 'Warning', fail: 'Blocker' };
  const container = document.getElementById('checks-container');
  container.innerHTML = checks.map(c =>
    '<div class="check ' + c.status + '">' +
    '<span class="check-icon">' + (icons[c.status] || '?') + '</span>' +
    '<span class="check-name">' + c.name + '</span>' +
    '<div class="check-msg">' + labels[c.status] + ': ' + c.message + '</div>' +
    '</div>'
  ).join('');
}

async function saveSummary() {
  const statusEl = document.getElementById('save-status');
  const btn = document.getElementById('save-btn');
  const summary = document.getElementById('summary-textarea').value;

  statusEl.className = 'status loading';
  statusEl.textContent = 'Saving…';
  btn.disabled = true;

  try {
    const res = await fetch('/api/review-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: summary }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'HTTP ' + res.status);
    }

    const data = await res.json();
    statusEl.className = 'status success';
    statusEl.textContent = '✓ Saved successfully — Markdown and HTML updated.';
    document.getElementById('report-container').innerHTML = data.html;
    document.getElementById('meta-info').textContent =
      'Report: ' + data.date + ' — ' + data.checks.length + ' checks run';
  } catch (err) {
    statusEl.className = 'status error';
    statusEl.textContent = '✗ Save failed: ' + err.message;
  } finally {
    btn.disabled = false;
  }
}

loadReview();
</script>
</body>
</html>`;
}

// --- HTTP request routing ---

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RequestContext,
): Promise<void> {
  const url = req.url ?? "/";
  const method = (req.method ?? "GET").toUpperCase();

  // Normalize URL: strip query string
  const path = url.split("?")[0];

  // Route matching
  if (path === "/review" && (method === "GET" || method === "HEAD")) {
    return serveReviewPage(res);
  }

  if (path === "/api/review" && method === "GET") {
    return serveReviewData(req, res, ctx);
  }

  if (path === "/api/review-checks" && method === "GET") {
    return serveReviewChecks(req, res, ctx);
  }

  if (path === "/api/review-summary" && method === "POST") {
    return handleSaveSummary(req, res, ctx);
  }

  // Unknown route or method
  if (["/review", "/api/review", "/api/review-checks", "/api/review-summary"].includes(path)) {
    res.writeHead(405, { Allow: getAllowHeader(path) });
    res.end(JSON.stringify({ error: "Method not allowed" }) + "\n");
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }) + "\n");
}

function getAllowHeader(path: string): string {
  switch (path) {
    case "/review":
      return "GET, HEAD";
    case "/api/review":
    case "/api/review-checks":
      return "GET";
    case "/api/review-summary":
      return "POST";
    default:
      return "";
  }
}

// --- Route handlers ---

function serveReviewPage(res: ServerResponse): void {
  const html = reviewPageHtml();
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(html);
}

async function serveReviewChecks(
  _req: IncomingMessage,
  res: ServerResponse,
  ctx: RequestContext,
): Promise<void> {
  try {
    const reportFile = await findLatestReportFile(ctx.reportsDir);
    if (!reportFile) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ checks: [] }) + "\n");
      return;
    }

    const reportPath = join(ctx.reportsDir, reportFile);
    const report = await readFile(reportPath, "utf8");
    const body = extractReportBody(report);
    const articles = parseSourceArticles(report);

    const htmlPath = join(ctx.reportsDir, `${basename(reportFile, ".md")}.html`);
    let htmlExists = false;
    try {
      htmlExists = !!(await readFile(htmlPath));
    } catch {
      // ignore
    }

    const checks: ReviewCheck[] = [
      checkWeeklySummary(body),
      checkSourceReferences(articles, body),
      checkWeaselWords(body),
      checkBuildNotes(report),
      checkWatchingSection(report),
      checkMarkdownLinks(report),
      checkHtmlReport(htmlExists, htmlPath),
    ];

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ checks }) + "\n");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }) + "\n");
  }
}

async function serveReviewData(
  _req: IncomingMessage,
  res: ServerResponse,
  ctx: RequestContext,
): Promise<void> {
  try {
    const reportFile = await findLatestReportFile(ctx.reportsDir);
    if (!reportFile) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No reports found" }) + "\n");
      return;
    }

    const reportPath = join(ctx.reportsDir, reportFile);
    const report = await readFile(reportPath, "utf8");
    const date = basename(reportFile, ".md");
    const html = markdownToHtml(report);
    const body = extractReportBody(report);
    const articles = parseSourceArticles(report);

    // Extract summary (What I'm Watching content)
    const section = findWatchingSection(report);
    const summary = section ? section.body : "";

    const htmlPath = join(ctx.reportsDir, `${date}.html`);
    let htmlExists = false;
    try {
      htmlExists = !!(await readFile(htmlPath));
    } catch {
      // ignore
    }

    const checks: ReviewCheck[] = [
      checkWeeklySummary(body),
      checkSourceReferences(articles, body),
      checkWeaselWords(body),
      checkBuildNotes(report),
      checkWatchingSection(report),
      checkMarkdownLinks(report),
      checkHtmlReport(htmlExists, htmlPath),
    ];

    const data: ReviewData = { date, html, summary, checks };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data) + "\n");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }) + "\n");
  }
}

async function handleSaveSummary(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RequestContext,
): Promise<void> {
  // Validate Content-Type
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.includes("application/json")) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ error: "Content-Type must be application/json" }) + "\n",
    );
    return;
  }

  // Read and validate body
  let body: string;
  try {
    body = await readRequestBody(req);
  } catch (err) {
    res.writeHead(413, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Request body too large" }) + "\n");
    return;
  }

  let payload: { summary?: unknown };
  try {
    payload = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }) + "\n");
    return;
  }

  if (typeof payload.summary !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ error: 'Missing or invalid "summary" field' }) + "\n",
    );
    return;
  }

  const newSummary = payload.summary;

  // Find latest report
  const reportFile = await findLatestReportFile(ctx.reportsDir);
  if (!reportFile) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No reports found" }) + "\n");
    return;
  }

  const date = basename(reportFile, ".md");
  const reportPath = join(ctx.reportsDir, reportFile);

  // Read existing report, replace section, write atomically
  let existingReport: string;
  try {
    existingReport = await readFile(reportPath, "utf8");
  } catch {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to read report" }) + "\n");
    return;
  }

  const updatedReport = replaceWatchingSection(existingReport, newSummary);
  if (updatedReport === null) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ error: "What I'm Watching section not found in report" }) +
        "\n",
    );
    return;
  }

  // Atomic write: write to temp file, then rename
  const tmpPath =
    reportPath + "." + randomBytes(8).toString("hex") + ".tmp";
  try {
    await mkdir(dirname(tmpPath), { recursive: true });
    await writeFile(tmpPath, updatedReport, "utf8");
    await rename(tmpPath, reportPath);
  } catch (err) {
    // Clean up temp file if it exists
    try {
      await unlink(tmpPath);
    } catch {
      // ignore
    }
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to write report" }) + "\n");
    return;
  }

  // Regenerate HTML
  try {
    await generateHtmlReport(reportPath);
  } catch {
    // HTML regeneration failed but Markdown was saved — non-fatal
  }

  // Return updated state
  const html = markdownToHtml(updatedReport);
  const section = findWatchingSection(updatedReport);
  const summary = section ? section.body : "";
  const rbody = extractReportBody(updatedReport);
  const articles = parseSourceArticles(updatedReport);

  const htmlPath = join(ctx.reportsDir, `${date}.html`);
  let htmlExists = false;
  try {
    htmlExists = !!(await readFile(htmlPath));
  } catch {
    // ignore
  }

  const checks: ReviewCheck[] = [
    checkWeeklySummary(rbody),
    checkSourceReferences(articles, rbody),
    checkWeaselWords(rbody),
    checkBuildNotes(updatedReport),
    checkWatchingSection(updatedReport),
    checkMarkdownLinks(updatedReport),
    checkHtmlReport(htmlExists, htmlPath),
  ];

  const data: ReviewData = { date, html, summary, checks };

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data) + "\n");
}

// --- Standalone entrypoint ---

/**
 * Start a standalone review server (called from CLI / pnpm review-server).
 */
export async function startReviewServer(
  port?: number,
  reportsDir?: string,
): Promise<ReturnType<typeof createServer>> {
  const server = createReviewServer({ reportsDir, port });
  const actualPort = port ?? DEFAULT_PORT;

  await new Promise<void>((resolve) => {
    server.listen(actualPort, BIND_ADDRESS, () => {
      resolve();
    });
  });

  return server;
}
