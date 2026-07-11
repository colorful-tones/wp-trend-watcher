import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";

const REPORT_STYLESHEET_HREF = "assets/report.css";
const REPORT_STYLESHEET_SOURCE = new URL("./report.css", import.meta.url);
const REPORT_ICON_HREF = "assets/icon.svg";
const REPORT_ICON_SOURCE = new URL("./icon.svg", import.meta.url);

/**
 * Convert a URL-friendly slug from plain text.
 *
 * Strips non-alphanumeric characters, lowercases, and collapses whitespace
 * into hyphens. Used to generate stable heading ids.
 */
function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Convert a simple Markdown string to HTML.
 *
 * Handles the subset found in wp-trend-watcher reports: headings (h1–h3),
 * paragraphs, unordered lists, links, bold, italic, inline code, horizontal
 * rules, and HTML comments. Not a general-purpose parser.
 */
function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // HTML comment — pass through
    if (/^\s*<!--/.test(line)) {
      out.push(line);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // Headings (h1–h6) — add stable id attribute
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = inlineFormat(headingMatch[2]);
      const id = slugify(headingMatch[2]);
      out.push(`<h${level} id="${id}">${text}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list
    if (/^[*-]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[*-]\s+/.test(lines[i])) {
        items.push(`<li>${inlineFormat(lines[i].replace(/^[-*]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }

    // Ordered list — handles both tight (no blank lines between items) and
    // loose (blank lines between items) formats. Collects indented continuation
    // lines that follow a numbered item as part of that item's content.
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        let itemText = lines[i].replace(/^\d+\.\s+/, "");
        i++;
        // Collect indented continuation lines (part of this list item)
        while (
          i < lines.length &&
          /^\s{2,}\S/.test(lines[i]) &&
          !/^\d+\.\s+/.test(lines[i]) &&
          !/^(#{1,6})\s+/.test(lines[i]) &&
          !/^[-*]\s+/.test(lines[i]) &&
          !/^---+\s*$/.test(lines[i])
        ) {
          itemText += " " + lines[i].trim();
          i++;
        }
        // Skip blank line between loose list items (next line is another item)
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

    // Blank line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-blank lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i]) &&
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
 * Apply inline formatting: bold, italic, code, and links.
 */
function inlineFormat(text: string): string {
  return (
    text
      // HTML-escape angle brackets for XSS prevention (before other transforms)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Inline code (must come before bold/italic to avoid conflicts)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // Bold
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  );
}

/**
 * Extract the report date from a Markdown filename like "2026-06-12.md".
 */
function dateFromFilename(filePath: string): string {
  const name = basename(filePath, ".md");
  return name;
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

  return REPORT_STYLESHEET_HREF;
}

/**
 * Generate a styled HTML report from a Markdown report file.
 *
 * Reads the Markdown, converts to HTML, writes the shared stylesheet, and
 * writes an HTML file alongside the original.
 *
 * @param mdPath - Absolute path to the Markdown report (e.g. reports/2026-06-12.md)
 * @returns Absolute path to the generated HTML file
 */
export async function generateHtmlReport(mdPath: string): Promise<string> {
  const md = await readFile(mdPath, "utf8");
  const date = dateFromFilename(mdPath);
  const stylesheetHref = await ensureReportStylesheet(dirname(mdPath));
  const htmlContent = markdownToHtml(md);

  // Extract the h1 heading for the report header
  const h1Match = htmlContent.match(/<h1[^>]*>.*?<\/h1>/);
  let headerHtml = "";
  let bodyHtml = htmlContent;
  if (h1Match) {
    headerHtml = `<header class="report-header">\n  <img class="report-icon" src="${REPORT_ICON_HREF}" alt="" width="40" height="40">\n  ${h1Match[0]}\n</header>`;
    bodyHtml = htmlContent.slice(h1Match.index! + h1Match[0].length).trim();
  } else {
    headerHtml = `<header class="report-header">\n  <img class="report-icon" src="${REPORT_ICON_HREF}" alt="" width="40" height="40">\n  <h1>WordPress Trend Report — ${date}</h1>\n</header>`;
  }

  // Build table of contents from h2 headings (if 2 or more exist)
  const h2Regex = /<h2[^>]*id="([^"]*)"[^>]*>(.*?)<\/h2>/g;
  const tocEntries: { id: string; text: string }[] = [];
  let tocMatch: RegExpExecArray | null;
  while ((tocMatch = h2Regex.exec(htmlContent)) !== null) {
    tocEntries.push({ id: tocMatch[1], text: tocMatch[2] });
  }

  let tocHtml = "";
  if (tocEntries.length >= 2) {
    const links = tocEntries
      .map((entry) => `    <li><a href="#${entry.id}">${entry.text}</a></li>`)
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
