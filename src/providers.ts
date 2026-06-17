export interface SummarizeResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

export interface SummarizeProvider {
  name: string;
  model: string;
  summarize(systemPrompt: string, userPrompt: string): Promise<SummarizeResult>;
  costFor(result: SummarizeResult): number;
}

export function createProvider(): SummarizeProvider {
  const provider = process.env.WP_TREND_PROVIDER ?? "ollama";

  switch (provider) {
    case "ollama":
      return createOllamaProvider();
    case "openai-compatible":
    case "openai":
      return createOpenAiCompatibleProvider();
    default:
      throw new Error(
        `Unknown provider "${provider}". Supported: ollama, openai-compatible.`,
      );
  }
}

function createOllamaProvider(): SummarizeProvider {
  const baseUrl =
    process.env.WP_TREND_OLLAMA_URL ?? "http://localhost:11434";
  const model =
    process.env.WP_TREND_OLLAMA_MODEL ??
    process.env.WP_TREND_MODEL ??
    "llama3.2:3b";

  return {
    name: "ollama",
    model,

    async summarize(systemPrompt, userPrompt) {
      const body = JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
        options: { temperature: 0.3 },
      });

      let response: Response;
      try {
        response = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(60_000),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Cannot reach Ollama at ${baseUrl}. Is it running? (${message})`,
        );
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        if (response.status === 404 && errorText.includes("not found")) {
          throw new Error(
            `Model "${model}" not found. Pull it with: ollama pull ${model}`,
          );
        }
        throw new Error(
          `Ollama API error ${response.status}: ${errorText.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      if (!data.message?.content) {
        throw new Error("Ollama returned empty response");
      }

      return {
        text: data.message.content,
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
      };
    },

    costFor(_result: SummarizeResult): number {
      return 0; // local, free
    },
  };
}

function createOpenAiCompatibleProvider(): SummarizeProvider {
  const baseUrl = stripTrailingSlash(
    process.env.WP_TREND_OPENAI_BASE_URL ?? "http://localhost:1234/v1",
  );
  const model = process.env.WP_TREND_MODEL ?? "local-model";
  const apiKey = process.env.WP_TREND_API_KEY;

  return {
    name: "openai-compatible",
    model,

    async summarize(systemPrompt, userPrompt) {
      const body = JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      let response: Response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(60_000),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Cannot reach OpenAI-compatible endpoint at ${baseUrl}. Is it running? (${message})`,
        );
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `OpenAI-compatible API error ${response.status}: ${errorText.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: { content?: string; reasoning_content?: string };
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const message = data.choices?.[0]?.message;
      const text = message?.content ?? message?.reasoning_content ?? "";
      if (!text) {
        throw new Error("OpenAI-compatible endpoint returned empty response");
      }

      return {
        text,
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      };
    },

    costFor(_result: SummarizeResult): number {
      return 0; // local/OpenAI-compatible cost is user-managed
    },
  };
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
