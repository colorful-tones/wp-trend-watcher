#!/usr/bin/env node

/**
 * Setup sanity check for WP Trend Watcher.
 *
 * Reports environment readiness for `pnpm summarize` without running
 * a full summarization. Exits 0 for warnings-only, 1 for true blockers.
 *
 * Usage: pnpm doctor
 */

import { access, readFile, stat, constants } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";
import { loadEnvFile } from "../env.js";
import {
  resolveProviderConfig,
  formatCheck,
  type CheckResult,
  type ProviderName,
} from "./checks.js";

// --- Checks ---

/** Check Node.js version (requires 18+). */
function checkNodeVersion(): CheckResult {
  const major = process.versions.node
    ? Number.parseInt(process.versions.node.split(".")[0], 10)
    : 0;

  if (major >= 18) {
    return {
      name: "Node.js",
      status: "ok",
      message: `v${process.versions.node}`,
    };
  }

  return {
    name: "Node.js",
    status: "fail",
    message: `v${process.versions.node} — requires 18+`,
  };
}

/** Check pnpm presence and version. */
function checkPnpm(): CheckResult {
  try {
    const version = execSync("pnpm --version", {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return { name: "pnpm", status: "ok", message: `v${version}` };
  } catch {
    return {
      name: "pnpm",
      status: "warn",
      message: "not found in PATH — required to run commands",
    };
  }
}

/** Check .env file presence and whether it loaded. */
function checkEnvFile(loaded: boolean): CheckResult {
  if (loaded) {
    return { name: ".env", status: "ok", message: "found and loaded" };
  }
  return {
    name: ".env",
    status: "warn",
    message: "not found — using defaults (copy .env.example to .env to customize)",
  };
}

/** Check provider configuration. */
function checkProvider(): CheckResult {
  const config = resolveProviderConfig();
  const raw = process.env.WP_TREND_PROVIDER ?? "(default: ollama)";

  if (
    config.provider !== "ollama" &&
    config.provider !== "openai-compatible" &&
    config.provider !== "openai"
  ) {
    return {
      name: "Provider",
      status: "fail",
      message: `unknown provider "${raw}" — supported: ollama, openai-compatible`,
    };
  }

  return {
    name: "Provider",
    status: "ok",
    message: `${config.provider} (${config.model})`,
  };
}

/** Check provider endpoint reachability. */
async function checkEndpoint(
  config: { provider: ProviderName; baseUrl: string; model: string },
): Promise<CheckResult> {
  // Skip if no URL (unknown provider)
  if (!config.baseUrl) {
    return {
      name: "Endpoint",
      status: "warn",
      message: "skipped — provider not configured",
    };
  }

  // Only check local endpoints — skip if URL looks non-local
  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    return {
      name: "Endpoint",
      status: "warn",
      message: `invalid URL "${config.baseUrl}"`,
    };
  }
  const isLocal =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!isLocal) {
    return {
      name: "Endpoint",
      status: "ok",
      message: `${config.baseUrl} (remote — skipped reachability check)`,
    };
  }

  const healthUrl =
    config.provider === "ollama"
      ? `${config.baseUrl}/api/tags`
      : `${config.baseUrl}/models`;

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(3_000),
    });
    if (response.ok) {
      return {
        name: "Endpoint",
        status: "ok",
        message: `${config.baseUrl} — reachable`,
      };
    }
    return {
      name: "Endpoint",
      status: "warn",
      message: `${config.baseUrl} — responded with ${response.status}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: "Endpoint",
      status: "warn",
      message: `${config.baseUrl} — not reachable (${msg.slice(0, 80)})`,
    };
  }
}

/** Check sources.yaml presence. */
async function checkSources(rootDir: string): Promise<CheckResult> {
  const yamlPath = join(rootDir, "sources.yaml");
  try {
    await access(yamlPath, constants.R_OK);
    const raw = await readFile(yamlPath, "utf8");
    // Quick sanity: does it have a sources key?
    if (raw.includes("sources:")) {
      return { name: "Sources", status: "ok", message: "sources.yaml found" };
    }
    return {
      name: "Sources",
      status: "warn",
      message: "sources.yaml exists but missing 'sources:' key — using defaults",
    };
  } catch {
    return {
      name: "Sources",
      status: "warn",
      message: "sources.yaml not found — using built-in defaults",
    };
  }
}

/** Check that data/ and reports/ directories exist and are writable. */
async function checkDirectories(
  rootDir: string,
): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  for (const dir of ["data", "reports"]) {
    const dirPath = join(rootDir, dir);
    try {
      const s = await stat(dirPath);
      if (!s.isDirectory()) {
        checks.push({
          name: `${dir}/`,
          status: "fail",
          message: "exists but is not a directory",
        });
        continue;
      }
      // Check write access by attempting to stat a temp file path
      // (we don't create anything — just verify the directory is writable)
      await access(dirPath, constants.W_OK);
      checks.push({ name: `${dir}/`, status: "ok", message: "writable" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      checks.push({
        name: `${dir}/`,
        status: "warn",
        message: `not found or not writable — will be created on first run (${msg.slice(0, 60)})`,
      });
    }
  }

  return checks;
}

// --- Main ---

async function main(): Promise<void> {
  const rootDir = process.cwd();

  // Check .env before loading it
  let envExists = false;
  try {
    await access(resolve(rootDir, ".env"), constants.R_OK);
    envExists = true;
  } catch {
    // no .env
  }
  loadEnvFile();

  console.log("WP Trend Watcher — setup doctor\n");

  // Sync checks
  const syncChecks: CheckResult[] = [
    checkNodeVersion(),
    checkPnpm(),
    checkEnvFile(envExists),
    checkProvider(),
  ];

  // Async checks
  const config = resolveProviderConfig();
  const endpointCheck = checkEndpoint(config);
  const sourcesCheck = checkSources(rootDir);
  const dirChecks = checkDirectories(rootDir);

  const [endpoint, sources, dirs] = await Promise.all([
    endpointCheck,
    sourcesCheck,
    dirChecks,
  ]);

  const allChecks = [...syncChecks, endpoint, sources, ...dirs];

  // Print results
  for (const check of allChecks) {
    console.log(formatCheck(check));
  }

  // Summary
  const failures = allChecks.filter((c) => c.status === "fail");
  const warnings = allChecks.filter((c) => c.status === "warn");

  console.log("");
  if (failures.length > 0) {
    console.log(
      `${failures.length} blocker(s), ${warnings.length} warning(s) — summarization may not work`,
    );
    process.exitCode = 1;
  } else if (warnings.length > 0) {
    console.log(
      `${warnings.length} warning(s) — summarization should work with defaults`,
    );
  } else {
    console.log("All checks passed — ready to summarize");
  }
}

await main();
