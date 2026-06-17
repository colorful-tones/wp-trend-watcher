#!/usr/bin/env node

/**
 * Report review checklist for WP Trend Watcher.
 *
 * Prints pass/warn/fail checks for the latest report. Exits 0 for
 * warnings-only, 1 for true blockers.
 *
 * Usage: pnpm review
 */

import { access, readdir, readFile, stat, constants } from "node:fs/promises";
import { join, basename } from "node:path";

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
  type ReviewStatus,
} from "./checks.js";

const REPORTS_DIR = "reports";

/**
 * Format a check result as a human-readable line.
 *
 * @param check - The review check result.
 * @returns Formatted string with status indicator.
 */
function formatCheck(check: ReviewCheck): string {
  const icon =
    check.status === "pass" ? "✓" : check.status === "warn" ? "⚠" : "✗";
  return `  ${icon} ${check.name}: ${check.message}`;
}

/**
 * Find the latest markdown report in the reports directory.
 *
 * @param reportsDir - Path to the reports directory.
 * @returns The full path to the latest report, or null if none found.
 */
async function findLatestReport(reportsDir: string): Promise<string | null> {
  let files: string[];
  try {
    files = await readdir(reportsDir);
  } catch {
    return null;
  }

  const mdFiles = files
    .filter((f) => f.endsWith(".md") && f !== "index.md")
    .sort()
    .reverse();

  return mdFiles.length > 0 ? join(reportsDir, mdFiles[0]) : null;
}

async function main(): Promise<void> {
  const reportsDir = join(process.cwd(), REPORTS_DIR);

  const reportPath = await findLatestReport(reportsDir);
  if (!reportPath) {
    console.log("No reports found in reports/");
    process.exitCode = 1;
    return;
  }

  const report = await readFile(reportPath, "utf8");
  const date = basename(reportPath, ".md");

  console.log(`WP Trend Watcher — review checklist for ${date}\n`);

  const body = extractReportBody(report);
  const articles = parseSourceArticles(report);

  // Check if HTML report exists
  const htmlPath = join(reportsDir, `${date}.html`);
  let htmlExists = false;
  try {
    await access(htmlPath, constants.R_OK);
    htmlExists = true;
  } catch {
    // not found
  }

  // Run all checks
  const checks: ReviewCheck[] = [
    checkWeeklySummary(body),
    checkSourceReferences(articles, body),
    checkWeaselWords(body),
    checkBuildNotes(report),
    checkWatchingSection(report),
    checkMarkdownLinks(report),
    checkHtmlReport(htmlExists, htmlPath),
  ];

  // Print results
  for (const check of checks) {
    console.log(formatCheck(check));
  }

  // Summary
  const failures = checks.filter((c) => c.status === "fail");
  const warnings = checks.filter((c) => c.status === "warn");

  console.log("");
  if (failures.length > 0) {
    console.log(
      `${failures.length} blocker(s), ${warnings.length} warning(s) — review before publishing`,
    );
    process.exitCode = 1;
  } else if (warnings.length > 0) {
    console.log(`${warnings.length} warning(s) — review recommended`);
  } else {
    console.log("All checks passed — ready for human review");
  }
}

await main();
