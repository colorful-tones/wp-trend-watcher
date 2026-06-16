import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveProviderConfig,
  formatCheck,
  type CheckResult,
} from "../../src/doctor/checks.js";

// --- resolveProviderConfig ---

test("defaults to ollama when no env vars set", () => {
  const config = resolveProviderConfig({});
  assert.equal(config.provider, "ollama");
  assert.equal(config.baseUrl, "http://localhost:11434");
  assert.equal(config.model, "llama3.2:3b");
});

test("ollama provider uses ollama-specific env vars", () => {
  const config = resolveProviderConfig({
    WP_TREND_PROVIDER: "ollama",
    WP_TREND_OLLAMA_URL: "http://192.168.1.10:11434",
    WP_TREND_OLLAMA_MODEL: "mistral",
    WP_TREND_MODEL: "ignored-model",
  });
  assert.equal(config.provider, "ollama");
  assert.equal(config.baseUrl, "http://192.168.1.10:11434");
  assert.equal(config.model, "mistral");
});

test("ollama falls back to generic model env var", () => {
  const config = resolveProviderConfig({
    WP_TREND_PROVIDER: "ollama",
    WP_TREND_MODEL: "generic-model",
  });
  assert.equal(config.model, "generic-model");
});

test("openai-compatible provider reads its env vars", () => {
  const config = resolveProviderConfig({
    WP_TREND_PROVIDER: "openai-compatible",
    WP_TREND_OPENAI_BASE_URL: "http://localhost:8080/v1/",
    WP_TREND_MODEL: "my-model",
  });
  assert.equal(config.provider, "openai-compatible");
  assert.equal(config.baseUrl, "http://localhost:8080/v1");
  assert.equal(config.model, "my-model");
});

test("openai alias resolves to openai-compatible provider", () => {
  const config = resolveProviderConfig({
    WP_TREND_PROVIDER: "openai",
    WP_TREND_MODEL: "gpt-4",
  });
  assert.equal(config.provider, "openai-compatible");
  assert.equal(config.baseUrl, "http://localhost:1234/v1");
  assert.equal(config.model, "gpt-4");
});

test("unknown provider is returned as-is", () => {
  const config = resolveProviderConfig({
    WP_TREND_PROVIDER: "llama.cpp",
  });
  assert.equal(config.provider, "llama.cpp");
  assert.equal(config.baseUrl, "");
  assert.equal(config.model, "");
});

test("strips trailing slashes from openai-compatible base URL", () => {
  const config = resolveProviderConfig({
    WP_TREND_PROVIDER: "openai-compatible",
    WP_TREND_OPENAI_BASE_URL: "http://localhost:1234/v1///",
  });
  assert.equal(config.baseUrl, "http://localhost:1234/v1");
});

// --- formatCheck ---

test("formatCheck renders ok status", () => {
  const check: CheckResult = {
    name: "Node.js",
    status: "ok",
    message: "v20.0.0",
  };
  const line = formatCheck(check);
  assert.ok(line.includes("✓"));
  assert.ok(line.includes("Node.js"));
  assert.ok(line.includes("v20.0.0"));
});

test("formatCheck renders warn status", () => {
  const check: CheckResult = {
    name: ".env",
    status: "warn",
    message: "not found",
  };
  const line = formatCheck(check);
  assert.ok(line.includes("⚠"));
  assert.ok(line.includes(".env"));
});

test("formatCheck renders fail status", () => {
  const check: CheckResult = {
    name: "Node.js",
    status: "fail",
    message: "v16.0.0 — requires 18+",
  };
  const line = formatCheck(check);
  assert.ok(line.includes("✗"));
  assert.ok(line.includes("v16.0.0"));
});
