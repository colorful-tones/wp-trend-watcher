import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvFile(filePath = ".env"): void {
  const resolvedPath = resolve(process.cwd(), filePath);

  let content: string;
  try {
    content = readFileSync(resolvedPath, "utf8");
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return;
    }
    throw err;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = normalized.slice(0, equalsIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = parseEnvValue(normalized.slice(equalsIndex + 1).trim());
  }
}

export function parseNonNegativeIntegerEnv(
  key: string,
  fallback: number,
): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 0) {
    console.warn(`Invalid ${key} value, defaulting to ${fallback}`);
    return fallback;
  }

  return value;
}

export function parsePositiveIntegerEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    console.warn(`Invalid ${key} value, defaulting to ${fallback}`);
    return fallback;
  }

  const value = Number.parseInt(trimmed, 10);
  if (Number.isNaN(value) || value < 1) {
    console.warn(`Invalid ${key} value, defaulting to ${fallback}`);
    return fallback;
  }

  return value;
}

/**
 * Parse an optional positive integer environment variable.
 *
 * @param key - Environment variable name to read
 * @returns Parsed positive integer, or undefined when unset or invalid
 */
export function parseOptionalPositiveIntegerEnv(
  key: string,
): number | undefined {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    console.warn(`Invalid ${key} value, ignoring`);
    return undefined;
  }

  const value = Number.parseInt(trimmed, 10);
  if (Number.isNaN(value) || value < 1) {
    console.warn(`Invalid ${key} value, ignoring`);
    return undefined;
  }

  return value;
}

/**
 * Parse a boolean environment variable with common truthy/falsy strings.
 *
 * @param key - Environment variable name to read
 * @param fallback - Value to use when unset or invalid
 * @returns Parsed boolean value
 */
export function parseBooleanEnv(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  switch (raw.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      console.warn(`Invalid ${key} value, defaulting to ${fallback}`);
      return fallback;
  }
}

function parseEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
