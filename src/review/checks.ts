/**
 * Pure functions for the report review checklist.
 * Separated for testability — no side effects, no filesystem imports.
 */

import { isArticleReferenced } from "../summarize/source-refs.js";

/** Check severity for the review checklist. */
export type ReviewStatus = "pass" | "warn" | "fail";

/** A single review checklist result. */
export interface ReviewCheck {
  name: string;
  status: ReviewStatus;
  message: string;
}

/** A parsed source article from the Source Articles section. */
export interface SourceArticle {
  title: string;
  url: string;
}

/**
 * Extract the body of a markdown report (everything before ## Source Articles).
 *
 * @param report - Full markdown content of the report.
 * @returns The body text (before Source Articles section), or the full text if the marker is absent.
 */
export function extractReportBody(report: string): string {
  const marker = "## Source Articles";
  const idx = report.indexOf(marker);
  return idx >= 0 ? report.slice(0, idx) : report;
}

/**
 * Parse source articles from the ## Source Articles section of a report.
 *
 * @param report - Full markdown content of the report.
 * @returns Array of parsed source articles with title and URL.
 */
export function parseSourceArticles(report: string): SourceArticle[] {
  const marker = "## Source Articles";
  const idx = report.indexOf(marker);
  if (idx < 0) return [];

  const section = report.slice(idx);
  const articles: SourceArticle[] = [];
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;

  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(section)) !== null) {
    articles.push({ title: match[1], url: match[2] });
  }

  return articles;
}

/**
 * Check that the Weekly Summary section exists and is non-empty.
 *
 * @param body - The report body (before Source Articles).
 * @returns Review check result.
 */
export function checkWeeklySummary(body: string): ReviewCheck {
  const h2Marker = "## Weekly Summary";
  const inventoryMarker = "### Article Inventory";

  const h2Idx = body.indexOf(h2Marker);
  const inventoryIdx = body.indexOf(inventoryMarker);

  // Accept either the expected h2 parent heading or the first sub-section
  // as evidence the weekly summary content is present.  Some models omit the
  // parent heading and emit sub-sections directly.
  const idx = h2Idx >= 0 ? h2Idx : inventoryIdx;
  if (idx < 0) {
    return { name: "Weekly Summary", status: "fail", message: "section not found" };
  }

  const marker = h2Idx >= 0 ? h2Marker : inventoryMarker;
  const afterMarker = body.slice(idx + marker.length).trim();
  if (!afterMarker) {
    return { name: "Weekly Summary", status: "fail", message: "section is empty" };
  }

  return { name: "Weekly Summary", status: "pass", message: "present" };
}

/**
 * Check that every source article is referenced in the report body.
 *
 * @param articles - Parsed source articles from the Source Articles section.
 * @param body - The report body (before Source Articles).
 * @returns Review check result. Warns for unreferenced articles.
 */
export function checkSourceReferences(
  articles: SourceArticle[],
  body: string,
): ReviewCheck {
  if (articles.length === 0) {
    return { name: "Source references", status: "warn", message: "no source articles found" };
  }

  const unreferenced: string[] = [];
  for (const article of articles) {
    if (!isArticleReferenced(article.title, article.url, body)) {
      unreferenced.push(article.title);
    }
  }

  if (unreferenced.length > 0) {
    const list = unreferenced.slice(0, 3).join(", ");
    const suffix = unreferenced.length > 3 ? ` (+${unreferenced.length - 3} more)` : "";
    return {
      name: "Source references",
      status: "warn",
      message: `${unreferenced.length} unreferenced: ${list}${suffix}`,
    };
  }

  return {
    name: "Source references",
    status: "pass",
    message: `all ${articles.length} articles referenced`,
  };
}

/** Weasel words that signal unsupported or marketing-style claims. */
const WEASEL_WORDS = [
  "seamlessly",
  "robust",
  "game-changer",
  "best practices",
  "cutting-edge",
  "state-of-the-art",
  "revolutionary",
  "unparalleled",
];

/**
 * Scan the report body for weasel words that suggest unsupported claims.
 *
 * @param body - The report body text.
 * @returns Review check result. Warns if weasel words are found.
 */
export function checkWeaselWords(body: string): ReviewCheck {
  const lower = body.toLowerCase();
  const found = WEASEL_WORDS.filter((w) => lower.includes(w));

  if (found.length > 0) {
    return {
      name: "Weasel words",
      status: "warn",
      message: `found: ${found.join(", ")}`,
    };
  }

  return { name: "Weasel words", status: "pass", message: "none detected" };
}

/**
 * Check that Build Notes section exists and contains provider/model/cost info.
 *
 * @param report - Full markdown content of the report.
 * @returns Review check result.
 */
export function checkBuildNotes(report: string): ReviewCheck {
  const marker = "## Build Notes";
  const idx = report.indexOf(marker);
  if (idx < 0) {
    return { name: "Build Notes", status: "fail", message: "section not found" };
  }

  const section = report.slice(idx, idx + 1000);
  const lower = section.toLowerCase();

  const hasProvider = lower.includes("model:") || lower.includes("provider:");
  const hasCost = lower.includes("cost") || lower.includes("token");

  if (!hasProvider && !hasCost) {
    return {
      name: "Build Notes",
      status: "warn",
      message: "present but missing provider/model/cost info",
    };
  }

  return { name: "Build Notes", status: "pass", message: "present with metadata" };
}

/** Placeholder comment that indicates the human hasn't written their note yet. */
const PLACEHOLDER_PATTERNS = [
  "TODO",
  "FIXME",
  "PLACEHOLDER",
  "ADD YOUR NOTE",
  "YOUR OBSERVATION HERE",
];

/**
 * Check that the What I'm Watching section exists and has a human-authored note.
 *
 * @param report - Full markdown content of the report.
 * @returns Review check result.
 */
export function checkWatchingSection(report: string): ReviewCheck {
  const marker = "## What I'm Watching";
  const idx = report.indexOf(marker);
  if (idx < 0) {
    return { name: "What I'm Watching", status: "fail", message: "section not found" };
  }

  const afterMarker = report.slice(idx + marker.length).trim();
  if (!afterMarker) {
    return {
      name: "What I'm Watching",
      status: "fail",
      message: "section is empty",
    };
  }

  const upper = afterMarker.toUpperCase();
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (upper.includes(pattern)) {
      return {
        name: "What I'm Watching",
        status: "warn",
        message: "contains placeholder text — needs human note",
      };
    }
  }

  return { name: "What I'm Watching", status: "pass", message: "has human note" };
}

/**
 * Check that markdown links are well-formed (no empty []() patterns).
 *
 * @param report - Full markdown content of the report.
 * @returns Review check result.
 */
export function checkMarkdownLinks(report: string): ReviewCheck {
  // Match [](url) — empty text
  const emptyText = /\[\s*\]\([^)]+\)/g;
  // Match [text]() — empty url
  const emptyUrl = /\[[^\]]+\]\(\s*\)/g;

  const issues: string[] = [];

  if (emptyText.test(report)) {
    issues.push("empty link text []()");
  }
  if (emptyUrl.test(report)) {
    issues.push("empty link URL [text]()");
  }

  if (issues.length > 0) {
    return {
      name: "Markdown links",
      status: "warn",
      message: issues.join("; "),
    };
  }

  return { name: "Markdown links", status: "pass", message: "well-formed" };
}

/**
 * Check that an HTML report file exists alongside the Markdown report.
 *
 * @param htmlExists - Whether the HTML file was found on disk.
 * @param htmlPath - Path to the expected HTML file.
 * @returns Review check result.
 */
export function checkHtmlReport(
  htmlExists: boolean,
  htmlPath: string,
): ReviewCheck {
  if (htmlExists) {
    return { name: "HTML report", status: "pass", message: htmlPath };
  }

  return {
    name: "HTML report",
    status: "warn",
    message: `not found at ${htmlPath}`,
  };
}
