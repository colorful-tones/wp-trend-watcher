/**
 * Pure functions for the setup doctor command.
 * Separated for testability — no side effects, no imports beyond types.
 */

/** Supported provider identifiers. */
export type ProviderName = "ollama" | "openai-compatible" | "openai";

/** Resolved provider configuration from environment variables. */
export interface ProviderConfig {
  provider: ProviderName;
  baseUrl: string;
  model: string;
}

/**
 * Resolve the provider configuration from environment variables.
 * Mirrors the same defaults used by createProvider() in providers.ts.
 *
 * @param env - Environment variables to read from (default: process.env).
 * @returns Resolved provider, base URL, and model.
 */
export function resolveProviderConfig(
  env: Record<string, string | undefined> = process.env,
): ProviderConfig {
  const provider = (env.WP_TREND_PROVIDER ?? "ollama") as string;

  if (provider === "ollama") {
    return {
      provider: "ollama",
      baseUrl: env.WP_TREND_OLLAMA_URL ?? "http://localhost:11434",
      model:
        env.WP_TREND_OLLAMA_MODEL ??
        env.WP_TREND_MODEL ??
        "llama3.2:3b",
    };
  }

  if (provider === "openai-compatible" || provider === "openai") {
    return {
      provider: "openai-compatible",
      baseUrl: (
        env.WP_TREND_OPENAI_BASE_URL ?? "http://localhost:1234/v1"
      ).replace(/\/+$/, ""),
      model: env.WP_TREND_MODEL ?? "local-model",
    };
  }

  // Unknown provider — return as-is so caller can report the error.
  return {
    provider: provider as ProviderName,
    baseUrl: "",
    model: env.WP_TREND_MODEL ?? "",
  };
}

/** Doctor check severity. */
export type CheckStatus = "ok" | "warn" | "fail";

/** A single doctor check result. */
export interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
}

/**
 * Format a check result as a human-readable line.
 *
 * @param check - The check result to format.
 * @returns Formatted string with status indicator and message.
 */
export function formatCheck(check: CheckResult): string {
  const icon = check.status === "ok" ? "✓" : check.status === "warn" ? "⚠" : "✗";
  return `  ${icon} ${check.name}: ${check.message}`;
}
