import test from "node:test";
import assert from "node:assert/strict";
import { createProvider } from "../../src/providers.js";

const ENV_KEYS = [
  "WP_TREND_PROVIDER",
  "WP_TREND_OPENAI_BASE_URL",
  "WP_TREND_MODEL",
  "WP_TREND_API_KEY",
  "WP_TREND_DISABLE_REASONING",
  "WP_TREND_MAX_TOKENS",
  "WP_TREND_REQUEST_TIMEOUT_MS",
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

test("openai-compatible provider applies local generation controls", async () => {
  const restoreEnv = withCleanEnv();
  const originalFetch = globalThis.fetch;

  try {
    process.env.WP_TREND_PROVIDER = "openai-compatible";
    process.env.WP_TREND_MODEL = "qwen/qwen3.5-9b";
    process.env.WP_TREND_MAX_TOKENS = "900";
    process.env.WP_TREND_DISABLE_REASONING = "true";

    let requestBody: unknown;

    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "report text" } }],
          usage: { prompt_tokens: 120, completion_tokens: 90 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const provider = createProvider();
    const result = await provider.summarize("system prompt", "user prompt");

    assert.deepEqual(requestBody, {
      model: "qwen/qwen3.5-9b",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt\n\n/no_think" },
      ],
      temperature: 0.3,
      max_tokens: 900,
    });
    assert.deepEqual(result, {
      text: "report text",
      promptTokens: 120,
      completionTokens: 90,
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("openai-compatible provider does not duplicate no_think directive", async () => {
  const restoreEnv = withCleanEnv();
  const originalFetch = globalThis.fetch;

  try {
    process.env.WP_TREND_PROVIDER = "openai-compatible";
    process.env.WP_TREND_DISABLE_REASONING = "true";

    let requestBody: { messages?: Array<{ content: string }> } = {};

    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as {
        messages?: Array<{ content: string }>;
      };

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "summary text" } }],
          usage: { prompt_tokens: 12, completion_tokens: 5 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const provider = createProvider();
    await provider.summarize("system prompt", "user prompt\n\n/no_think");

    assert.equal(requestBody.messages?.[1]?.content, "user prompt\n\n/no_think");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("openai-compatible provider uses configured request timeout", async () => {
  const restoreEnv = withCleanEnv();
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;

  try {
    process.env.WP_TREND_PROVIDER = "openai-compatible";
    process.env.WP_TREND_REQUEST_TIMEOUT_MS = "120000";

    let timeoutMs = 0;
    AbortSignal.timeout = (milliseconds: number): AbortSignal => {
      timeoutMs = milliseconds;
      return originalTimeout(60_000);
    };

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "summary text" } }],
          usage: { prompt_tokens: 12, completion_tokens: 5 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const provider = createProvider();
    await provider.summarize("system prompt", "user prompt");

    assert.equal(timeoutMs, 120000);
  } finally {
    AbortSignal.timeout = originalTimeout;
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
