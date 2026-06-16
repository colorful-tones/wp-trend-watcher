import test from "node:test";
import assert from "node:assert/strict";
import { createProvider } from "../../src/providers.js";

const ENV_KEYS = [
  "WP_TREND_PROVIDER",
  "WP_TREND_OPENAI_BASE_URL",
  "WP_TREND_MODEL",
  "WP_TREND_API_KEY",
  "WP_TREND_OLLAMA_MODEL",
  "WP_TREND_OLLAMA_URL",
] as const;

function withCleanEnv(): () => void {
  const original = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    original.set(key, process.env[key]);
    delete process.env[key];
  }

  return () => {
    for (const [key, value] of original) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

test("openai-compatible provider posts to chat completions with bearer token", async () => {
  const restoreEnv = withCleanEnv();
  const originalFetch = globalThis.fetch;

  try {
    process.env.WP_TREND_PROVIDER = "openai-compatible";
    process.env.WP_TREND_OPENAI_BASE_URL = "http://localhost:1234/v1/";
    process.env.WP_TREND_MODEL = "local-test-model";
    process.env.WP_TREND_API_KEY = "test-key";

    let requestUrl = "";
    let requestBody: unknown;
    let requestHeaders: HeadersInit | undefined;

    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body));
      requestHeaders = init?.headers;

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "summary text" } }],
          usage: { prompt_tokens: 12, completion_tokens: 5 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const provider = createProvider();
    const result = await provider.summarize("system prompt", "user prompt");

    assert.equal(provider.name, "openai-compatible");
    assert.equal(provider.model, "local-test-model");
    assert.equal(requestUrl, "http://localhost:1234/v1/chat/completions");
    assert.deepEqual(requestBody, {
      model: "local-test-model",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt" },
      ],
      temperature: 0.3,
    });
    assert.equal(
      (requestHeaders as Record<string, string>).Authorization,
      "Bearer test-key",
    );
    assert.deepEqual(result, {
      text: "summary text",
      promptTokens: 12,
      completionTokens: 5,
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("openai alias uses the OpenAI-compatible provider", () => {
  const restoreEnv = withCleanEnv();

  try {
    process.env.WP_TREND_PROVIDER = "openai";
    process.env.WP_TREND_MODEL = "alias-model";

    const provider = createProvider();

    assert.equal(provider.name, "openai-compatible");
    assert.equal(provider.model, "alias-model");
  } finally {
    restoreEnv();
  }
});

test("ollama model-specific env var takes precedence over generic model env var", () => {
  const restoreEnv = withCleanEnv();

  try {
    process.env.WP_TREND_PROVIDER = "ollama";
    process.env.WP_TREND_MODEL = "generic-model";
    process.env.WP_TREND_OLLAMA_MODEL = "ollama-specific-model";

    const provider = createProvider();

    assert.equal(provider.name, "ollama");
    assert.equal(provider.model, "ollama-specific-model");
  } finally {
    restoreEnv();
  }
});
