import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import {
  DEFAULT_REPORT_SEO_DESCRIPTION,
  extractReportSeoMetadata,
} from "./report.js";
import { SITE_BASE_URL } from "./html.js";

/** RSS 2.0 feed filename written into the reports directory. */
export const RSS_FEED_FILE = "feed.xml";

/** Channel title for the reports feed. */
const FEED_TITLE = "WP Trend Watcher";

/** Channel description for the reports feed. */
const FEED_DESCRIPTION =
  "Weekly human-reviewed WordPress ecosystem trend reports.";

/** Fixed publication time-of-day (UTC) for deterministic report dates. */
const PUBLICATION_HOUR_UTC = 12;

/**
 * A single report entry destined for the RSS feed.
 *
 * `date` is the canonical `YYYY-MM-DD` report date; `title` and `description`
 * come from the report's SEO metadata (or a safe fallback).
 */
export interface RssReportItem {
  date: string;
  title: string;
  description: string;
}

/**
 * Validate a `YYYY-MM-DD` date string against the real calendar.
 *
 * @param date - Date string in `YYYY-MM-DD` format
 * @returns Parsed year/month/day components, or null when invalid
 */
function parseReportDate(
  date: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * Extract a valid `YYYY-MM-DD` report date from a Markdown filename, or null
 * when the filename is not a canonical date-named report.
 *
 * @param filename - A file basename such as `2026-08-24.md`
 * @returns The `YYYY-MM-DD` date string, or null when the filename is not a
 *   valid date-named report
 */
function dateFromReportFilename(filename: string): string | null {
  if (!filename.endsWith(".md")) return null;
  const date = basename(filename, ".md");
  return parseReportDate(date) ? date : null;
}

/**
 * Escape text for safe inclusion in XML element content.
 *
 * Escapes the five XML-significant characters so titles and descriptions
 * cannot break out of their element or inject markup.
 *
 * @param value - Raw text to escape
 * @returns XML-safe text
 */
export function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    switch (character) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return character;
    }
  });
}

/**
 * Format a `YYYY-MM-DD` report date as a deterministic RFC 822 publication
 * date.
 *
 * Uses a fixed noon UTC timestamp so the feed output is reproducible and
 * stable across regenerations regardless of the local timezone.
 *
 * @param date - Date string in `YYYY-MM-DD` format
 * @returns RFC 822 date string such as `Mon, 24 Aug 2026 12:00:00 GMT`
 * @throws When the date is not a valid calendar date
 */
export function formatReportPubDate(date: string): string {
  const parsed = parseReportDate(date);
  if (!parsed) {
    throw new Error(`Invalid report date: ${date}`);
  }
  const { year, month, day } = parsed;
  return new Date(
    Date.UTC(year, month - 1, day, PUBLICATION_HOUR_UTC, 0, 0),
  ).toUTCString();
}

/**
 * Build a complete RSS 2.0 document from report items.
 *
 * Items are emitted in the order given (callers sort newest-first). Each item
 * links to its canonical report page with a stable perma-link GUID and a
 * deterministic report-date publication date.
 *
 * @param items - Report entries in desired (newest-first) order
 * @returns RSS 2.0 XML document string
 */
export function buildRssFeed(items: RssReportItem[]): string {
  const itemXml = items
    .map((item) => {
      const link = `${SITE_BASE_URL}${item.date}.html`;
      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${formatReportPubDate(item.date)}</pubDate>
    </item>`;
    })
    .join("\n");

  const lastBuildDate =
    items.length > 0
      ? `    <lastBuildDate>${formatReportPubDate(items[0].date)}</lastBuildDate>\n`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${escapeXml(SITE_BASE_URL)}</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>en-us</language>
    <atom:link href="${escapeXml(`${SITE_BASE_URL}${RSS_FEED_FILE}`)}" rel="self" type="application/rss+xml"/>
${lastBuildDate}${itemXml}
  </channel>
</rss>
`;
}

/**
 * Generate `reports/feed.xml` from canonical date-named Markdown reports.
 *
 * Scans the reports directory for `YYYY-MM-DD.md` files, extracts each
 * report's SEO metadata (falling back to a date-derived title and the shared
 * description when metadata is missing or empty), and writes a deterministic
 * RSS 2.0 feed with the newest report first. Non-report files and files with
 * invalid report dates are skipped.
 *
 * @param reportsDir - Directory containing Markdown reports
 * @returns Absolute path to the generated feed.xml
 */
export async function generateRssFeed(reportsDir: string): Promise<string> {
  const files = await readdir(reportsDir);

  const reportDates = files
    .map((file) => dateFromReportFilename(file))
    .filter((date): date is string => date !== null)
    .sort()
    .reverse();

  const items: RssReportItem[] = [];
  for (const date of reportDates) {
    const fallback = {
      title: `WordPress Trend Report — ${date}`,
      description: DEFAULT_REPORT_SEO_DESCRIPTION,
    };

    let markdown = "";
    try {
      markdown = await readFile(join(reportsDir, `${date}.md`), "utf8");
    } catch {
      // A missing source should not abort feed generation; fall back cleanly.
    }

    const seo = extractReportSeoMetadata(markdown, fallback);
    items.push({
      date,
      title: seo.title.trim() || fallback.title,
      description: seo.description.trim() || fallback.description,
    });
  }

  const outPath = join(reportsDir, RSS_FEED_FILE);
  await writeFile(outPath, buildRssFeed(items), "utf8");
  return outPath;
}
