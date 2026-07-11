/**
 * Regenerate all report HTML and the index page from existing Markdown reports.
 *
 * Scans `reports/` for `*.md` files (excluding index.md), converts each
 * to HTML via `generateHtmlReport()`, then rebuilds the index page.
 * No LLM calls, no article fetching — purely a file-to-file conversion.
 *
 * Usage: `pnpm regen-html`
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { generateHtmlReport, generateIndexPage } from "../summarize/html.js";

const reportsDir = join(process.cwd(), "reports");
const mdFiles = (await readdir(reportsDir)).filter(
  (f) => f.endsWith(".md") && f !== "index.md",
);

for (const file of mdFiles.sort()) {
  const outPath = await generateHtmlReport(join(reportsDir, file));
  console.log(`  regenerated: ${outPath}`);
}
await generateIndexPage(reportsDir);
console.log("  regenerated: reports/index.html");
