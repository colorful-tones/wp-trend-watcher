import { join } from "node:path";
import { loadEnvFile } from "../env.js";
import { generateIndexPage } from "./html.js";

/**
 * Standalone script to regenerate reports/index.html.
 *
 * Scans the reports/ directory for *.html files and produces a listing page.
 */
async function main(): Promise<void> {
  loadEnvFile();
  const reportsDir = join(process.cwd(), "reports");
  const indexPath = await generateIndexPage(reportsDir);
  console.log(`Index page written: ${indexPath}`);
}

await main();
