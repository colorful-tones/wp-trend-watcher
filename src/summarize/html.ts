import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import {
  renderMarkdown,
  renderReportBody,
  extractToc,
  slugify,
} from "./renderer.js";

const REPORT_STYLESHEET_HREF = "assets/report.css";
const REPORT_STYLESHEET_SOURCE = new URL("./report.css", import.meta.url);
const REPORT_ICON_HREF = "assets/icon.svg";
const REPORT_ICON_SOURCE = new URL("./icon.svg", import.meta.url);

// Radio Canada variable font (source lives at repo-root assets/fonts/).
// Copied into reports/assets/ alongside the stylesheet so it ships with
// GitHub Pages deployments.
const REPORT_FONT_FILE = "RadioCanada-VariableFont_wdth,wght.woff2";
const REPORT_FONT_HREF = `assets/${REPORT_FONT_FILE}`;
const REPORT_FONT_SOURCE = new URL(
  `../../assets/fonts/${REPORT_FONT_FILE}`,
  import.meta.url,
);

/**
 * Extract the report date from a Markdown filename like "2026-06-12.md".
 */
function dateFromFilename(filePath: string): string {
  return basename(filePath, ".md");
}

/**
 * Copy the shared report stylesheet and icon into the generated reports
 * asset directory.
 *
 * @param reportsDir - Directory containing generated report HTML files.
 * @returns Relative stylesheet href for report-root HTML pages.
 */
async function ensureReportStylesheet(reportsDir: string): Promise<string> {
  const css = await readFile(REPORT_STYLESHEET_SOURCE, "utf8");
  const assetsDir = join(reportsDir, "assets");
  await mkdir(assetsDir, { recursive: true });
  await writeFile(join(assetsDir, "report.css"), css, "utf8");

  // Also copy the icon into the assets directory alongside the stylesheet.
  const icon = await readFile(REPORT_ICON_SOURCE);
  await writeFile(join(assetsDir, "icon.svg"), icon);

  // Copy the Radio Canada variable font so the shared stylesheet's
  // @font-face rule can load it from the same assets directory.
  const font = await readFile(REPORT_FONT_SOURCE);
  await writeFile(join(assetsDir, REPORT_FONT_FILE), font);

  return REPORT_STYLESHEET_HREF;
}

/**
 * Generate a styled HTML report from a Markdown report file.
 *
 * Reads the Markdown, converts to HTML via the shared renderer, writes the
 * shared stylesheet, and writes an HTML file alongside the original.
 *
 * @param mdPath - Absolute path to the Markdown report (e.g. reports/2026-06-12.md)
 * @returns Absolute path to the generated HTML file
 */
export async function generateHtmlReport(mdPath: string): Promise<string> {
  const md = await readFile(mdPath, "utf8");
  const date = dateFromFilename(mdPath);
  const stylesheetHref = await ensureReportStylesheet(dirname(mdPath));
  const bodyHtml = renderReportBody(md);

  // Extract the h1 heading for the report header
  const h1Match = md.match(/^#\s+(.*)$/m);
  let headerHtml: string;
  if (h1Match) {
    const h1Id = slugify(h1Match[1]);
    headerHtml = `<header class="report-header">\n  <img class="report-icon" src="${REPORT_ICON_HREF}" alt="" width="40" height="40">\n  <h1 id="${h1Id}"><a href="index.html" title="Back to all reports">${h1Match[1]}</a></h1>\n</header>`;
  } else {
    headerHtml = `<header class="report-header">\n  <img class="report-icon" src="${REPORT_ICON_HREF}" alt="" width="40" height="40">\n  <h1><a href="index.html" title="Back to all reports">WordPress Trend Report — ${date}</a></h1>\n</header>`;
  }

  // Build table of contents from h2 headings (if 2 or more exist)
  const tocEntries = extractToc(bodyHtml);
  let tocHtml = "";
  if (tocEntries.length >= 2) {
    const links = tocEntries
      .map(
        (entry) =>
          `    <li><a href="#${entry.id}">${entry.text}</a></li>`,
      )
      .join("\n");
    tocHtml = `<nav class="toc">\n  <h2>Contents</h2>\n  <ul>\n${links}\n  </ul>\n</nav>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WordPress Trend Report — ${date}</title>
  <link rel="stylesheet" href="${stylesheetHref}">
</head>
<body class="report-page">
  ${headerHtml}
  ${tocHtml}
  <div class="report-body">
  ${bodyHtml}
</div>
  <footer class="nav-footer">
    <a href="index.html">← Back to Reports</a>
  </footer>
</body>
</html>`;

  const outPath = join(dirname(mdPath), `${date}.html`);
  await writeFile(outPath, html, "utf8");
  return outPath;
}

/**
 * Generate the index.html listing page for all HTML reports in a directory.
 *
 * Scans for *.html files (skipping index.html itself) and produces a
 * minimal listing page sorted by date descending.
 *
 * @param reportsDir - Absolute path to the reports directory
 * @returns Absolute path to the generated index.html
 */
export async function generateIndexPage(reportsDir: string): Promise<string> {
  const stylesheetHref = await ensureReportStylesheet(reportsDir);
  const files = await readdir(reportsDir);
  const htmlFiles = files
    .filter((f) => f.endsWith(".html") && f !== "index.html")
    .sort()
    .reverse();

  const reportCount = htmlFiles.length;
  const reportLabel =
    reportCount === 1
      ? "1 weekly WordPress ecosystem trend report."
      : `${reportCount} weekly WordPress ecosystem trend reports.`;

  const cards = htmlFiles
    .map((f, i) => {
      const dateStr = f.replace(".html", "");
      // Parse YYYY-MM-DD into a Date object for locale formatting
      const [year, month, day] = dateStr.split("-").map(Number);
      const dateObj = new Date(year, month - 1, day);
      const formattedDate = dateObj.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const labelHtml =
        i === 0
          ? `\n    <span class="report-card-label">Latest report</span>`
          : "";
      return `    <a href="${f}" class="report-card">
      <span class="report-card-date">${formattedDate}</span>${labelHtml}
    </a>`;
    })
    .join("\n");

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WP Trend Watcher — Reports</title>
  <link rel="stylesheet" href="${stylesheetHref}">
</head>
<body class="report-index">
  <header class="report-header">
    <img class="report-icon" src="${REPORT_ICON_HREF}" alt="" width="40" height="40">
    <h1>WP Trend Watcher — Reports</h1>
  </header>
  <p class="meta">${reportLabel}</p>
  <div class="report-card-grid">
${cards}
  </div>
  <footer class="nav-footer">
    <p>
      <a href="https://github.com/colorful-tones/wp-trend-watcher/issues/new?template=source-suggestion.yml">Suggest a source</a>
      &nbsp;·&nbsp;
      <a href="https://github.com/colorful-tones/wp-trend-watcher/issues/new?template=report-feedback.yml">Send feedback</a>
    </p>
  </footer>
</body>
</html>`;

  const outPath = join(reportsDir, "index.html");
  await writeFile(outPath, indexHtml, "utf8");
  return outPath;
}
