import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SummarizeProvider } from "../providers.js";
import { generateHtmlReport, generateIndexPage } from "./html.js";
import {
  generateReportDescription,
  isFallbackReportDescription,
} from "./description.js";
import {
  DEFAULT_REPORT_SEO_DESCRIPTION,
  extractReportSeoMetadata,
  updateReportSeoDescription,
} from "./report.js";

/** Options for historical SEO description generation. */
export interface DescriptionBackfillOptions {
  /** Regenerate descriptions even when a custom description already exists. */
  force?: boolean;
  /** Restrict generation to these YYYY-MM-DD report dates. */
  dates?: string[];
}

/** Counts returned by a historical description generation run. */
export interface DescriptionBackfillResult {
  generated: number;
  skipped: number;
  failed: number;
}

const REPORT_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.md$/;

/**
 * Generate descriptions for selected Markdown reports and rebuild their HTML.
 *
 * Reports with an existing non-fallback description are skipped unless force is
 * enabled. A failed provider call leaves that report unchanged and processing
 * continues for the remaining reports.
 *
 * @param reportsDir - Directory containing Markdown reports
 * @param provider - Configured LLM provider
 * @param options - Selection and overwrite behavior
 * @returns Counts for generated, skipped, and failed reports
 */
export async function generateDescriptionsForReports(
  reportsDir: string,
  provider: SummarizeProvider,
  options: DescriptionBackfillOptions = {},
): Promise<DescriptionBackfillResult> {
  const requestedDates = options.dates ? new Set(options.dates) : null;
  const files = (await readdir(reportsDir))
    .map((file) => ({ file, match: file.match(REPORT_FILE_PATTERN) }))
    .filter(
      (entry): entry is { file: string; match: RegExpMatchArray } =>
        entry.match !== null &&
        (requestedDates === null || requestedDates.has(entry.match[1])),
    )
    .sort((a, b) => a.match[1].localeCompare(b.match[1]));

  const result: DescriptionBackfillResult = {
    generated: 0,
    skipped: 0,
    failed: 0,
  };

  for (const { file, match } of files) {
    const date = match[1];
    const reportPath = join(reportsDir, file);
    const report = await readFile(reportPath, "utf8");
    const metadata = extractReportSeoMetadata(report, {
      title: `WordPress Trend Report — ${date}`,
      description: DEFAULT_REPORT_SEO_DESCRIPTION,
    });

    if (!options.force && !isFallbackReportDescription(metadata.description)) {
      result.skipped++;
      continue;
    }

    try {
      const description = await generateReportDescription(report, provider);
      await writeFile(
        reportPath,
        updateReportSeoDescription(report, description),
        "utf8",
      );
      await generateHtmlReport(reportPath);
      result.generated++;
    } catch {
      result.failed++;
    }
  }

  await generateIndexPage(reportsDir);
  return result;
}


