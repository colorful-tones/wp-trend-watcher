#!/usr/bin/env node

/**
 * Weekly workflow orchestration command for WP Trend Watcher.
 *
 * Runs the full weekly pipeline sequentially: doctor, collect, summarize,
 * review, then starts the local review server and opens the browser.
 *
 * Usage: pnpm weekly
 *
 * Optional: --no-open flag to skip browser launch.
 *
 * The command stops early if doctor reports a true blocker. Warnings
 * are printed but do not block the workflow.
 *
 * No new dependencies — uses Node's child_process to run existing
 * pnpm scripts and the native http server from src/review/server.ts.
 */

import { spawn } from "node:child_process";
import { createReviewServer } from "../review/server.js";

const REVIEW_PORT = 3001;
const REVIEW_HOST = "127.0.0.1";

/**
 * Run a pnpm script and return a promise that resolves when the process
 * exits with code 0, or rejects with a formatted error message.
 *
 * @param script - The pnpm script name (e.g. "doctor", "collect").
 * @param args - Additional arguments to pass after `--`.
 * @param label - Human-readable step label for progress output.
 * @returns Promise resolving when the script completes successfully.
 */
function runScript(
  script: string,
  args: string[] = [],
  label: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmdArgs = ["run", script];
    if (args.length > 0) cmdArgs.push("--", ...args);

    console.log(`\n▶ ${label} (pnpm ${script}${args.length ? " " + args.join(" ") : ""})`);

    const child = spawn("pnpm", cmdArgs, {
      stdio: "inherit",
      cwd: process.cwd(),
      shell: true,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} failed with exit code ${code}`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`${label} failed: ${err.message}`));
    });
  });
}

/**
 * Open a URL in the default browser.
 *
 * Supports macOS (`open`), Linux (`xdg-open`), and falls back to
 * printing the URL for unsupported platforms.
 *
 * @param url - The URL to open.
 */
function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;

  if (platform === "darwin") {
    command = "open";
  } else if (platform === "linux") {
    command = "xdg-open";
  } else {
    console.log(`\n  Open this URL in your browser:\n  ${url}\n`);
    return;
  }

  const child = spawn(command, [url], { stdio: "ignore", detached: true });
  child.unref();
  console.log(`\n  Opening ${url} in your browser…\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const noOpen = args.includes("--no-open");

  console.log("WP Trend Watcher — weekly workflow\n");

  const startTime = Date.now();

  try {
    // 1. Doctor check (blocking on failure)
    await runScript("doctor", [], "Doctor check");

    // 2. Collect articles
    await runScript("collect", [], "Collect articles");

    // 3. Summarize
    await runScript("summarize", [], "Summarize");

    // 4. Automated review
    await runScript("review", [], "Automated review");

    // 5. Start review server
    console.log(`\n▶ Review server (http://${REVIEW_HOST}:${REVIEW_PORT}/review)`);
    const server = createReviewServer({ port: REVIEW_PORT });

    server.listen(REVIEW_PORT, REVIEW_HOST, () => {
      const reviewUrl = `http://${REVIEW_HOST}:${REVIEW_PORT}/review`;
      console.log(`  Review server running at ${reviewUrl}`);
      console.log(`  Press Ctrl-C to stop.\n`);

      if (!noOpen) {
        openBrowser(reviewUrl);
      }
    });

    // Keep the process alive until the user stops it
    process.on("SIGINT", () => {
      console.log("\nShutting down review server…");
      server.close(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`Weekly workflow stopped after ${elapsed}s.`);
        process.exit(0);
      });
    });

    process.on("SIGTERM", () => {
      server.close(() => process.exit(0));
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ Weekly workflow stopped: ${message}`);
    process.exit(1);
  }
}

await main();
