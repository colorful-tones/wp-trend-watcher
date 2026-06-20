import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";

/**
 * Minimal CSS for report pages.
 *
 * Single-column, system font stack, dark-on-light readable design.
 */
const STYLESHEET = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.6;
  color: #1a1a1a;
  background: #fff;
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}
h1 { font-size: 1.75rem; margin-bottom: 0.5rem; line-height: 1.3; }
h2 { font-size: 1.35rem; margin-top: 2rem; margin-bottom: 0.5rem; border-bottom: 1px solid #e0e0e0; padding-bottom: 0.25rem; }
h3 { font-size: 1.1rem; margin-top: 1.5rem; margin-bottom: 0.4rem; }
p { margin-bottom: 1rem; }
ul { margin: 0 0 1rem 1.5rem; }
li { margin-bottom: 0.35rem; }
a { color: #0969da; text-decoration: none; }
a:hover { text-decoration: underline; }
code {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 0.9em;
  background: #f0f0f0;
  padding: 0.15em 0.35em;
  border-radius: 3px;
}
pre {
  background: #f6f8fa;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 1rem;
  overflow-x: auto;
  margin-bottom: 1rem;
}
pre code { background: none; padding: 0; font-size: 0.85em; }
hr { border: none; border-top: 1px solid #e0e0e0; margin: 2rem 0; }
strong { font-weight: 600; }
em { font-style: italic; }
.meta { color: #666; font-size: 0.85rem; margin-bottom: 2rem; }
`.trim();

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

    // Headings (h1–h6)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = inlineFormat(headingMatch[2]);
      out.push(`<h${level}>${text}</h${level}>`);
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

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inlineFormat(lines[i].replace(/^\d+\.\s+/, ""))}</li>`);
        i++;
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
 * Generate a styled HTML report from a Markdown report file.
 *
 * Reads the Markdown, converts to HTML with inline styles, and writes a
 * self-contained HTML file alongside the original.
 *
 * @param mdPath - Absolute path to the Markdown report (e.g. reports/2026-06-12.md)
 * @returns Absolute path to the generated HTML file
 */
export async function generateHtmlReport(mdPath: string): Promise<string> {
  const md = await readFile(mdPath, "utf8");
  const date = dateFromFilename(mdPath);
  const htmlContent = markdownToHtml(md);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WordPress Trend Report — ${date}</title>
  <style>${STYLESHEET}</style>
</head>
<body>
  ${htmlContent}
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
  const files = await readdir(reportsDir);
  const htmlFiles = files
    .filter((f) => f.endsWith(".html") && f !== "index.html")
    .sort()
    .reverse();

  const links = htmlFiles
    .map((f) => {
      const date = f.replace(".html", "");
      return `    <li><a href="${f}">${date}</a></li>`;
    })
    .join("\n");

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WP Trend Watcher — Reports</title>
  <style>${STYLESHEET}
h1 { border-bottom: none; }
  </style>
</head>
<body>
  <h1>WP Trend Watcher — Reports</h1>
  <p class="meta">Weekly WordPress ecosystem trend reports.</p>
  <ul>
${links}
  </ul>
</body>
</html>`;

  const outPath = join(reportsDir, "index.html");
  await writeFile(outPath, indexHtml, "utf8");
  return outPath;
}
