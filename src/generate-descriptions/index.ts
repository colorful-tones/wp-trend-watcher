#!/usr/bin/env node

/**
 * Generate SEO descriptions for reviewed reports.
 *
 * Usage:
 *   pnpm generate-descriptions       # Fill missing descriptions
 *   pnpm generate-descriptions --all # Regenerate every report
 *   pnpm generate-descriptions --date 2026-08-10
 */

import { join } from "node:path";
import { loadEnvFile } from "../env.js";
import { createProvider } from "../providers.js";
import { generateDescriptionsForReports } from "../summarize/description-backfill.js";

/** Parse the supported description backfill command-line arguments. */
function parseArgs(args: string[]): { force: boolean; dates: string[] } {
  let force = false;
  const dates: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--all") {
      force = true;
      continue;
    }

    if (arg === "--date") {
      const date = args[++index];
      if (!date) {
        throw new Error("--date requires a YYYY-MM-DD value");
      }
      dates.push(date);
      continue;
    }

    if (arg.startsWith("--date=")) {
      dates.push(arg.slice("--date=".length));
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  for (const date of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`Invalid report date: ${date}`);
    }
  }

  return { force, dates };
}

async function main(): Promise<void> {
  loadEnvFile();

  const { force, dates } = parseArgs(process.argv.slice(2));
  const provider = createProvider();
  const reportsDir = join(process.cwd(), "reports");

  console.log("WP Trend Watcher — generate descriptions\n");
  console.log(`Provider: ${provider.name}/${provider.model}`);
  console.log(
    dates.length > 0
      ? `Reports: ${dates.join(", ")}`
      : force
        ? "Reports: all"
        : "Reports: missing descriptions",
  );

  const result = await generateDescriptionsForReports(reportsDir, provider, {
    force,
    dates: dates.length > 0 ? dates : undefined,
  });

  console.log(`\nGenerated: ${result.generated}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Failed: ${result.failed}`);

  for (const failure of result.failures) {
    console.error(`  ${failure.date}: ${failure.reason}`);
  }

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

await main();
