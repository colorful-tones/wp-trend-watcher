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
    case "openai":
      throw new Error(
        "OpenAI provider not yet implemented. Set WP_TREND_PROVIDER=ollama or contribute a provider at src/providers.ts",
      );
    default:
      throw new Error(
        `Unknown provider "${provider}". Supported: ollama. Set WP_TREND_PROVIDER=ollama.`,
      );
  }
}

function createOllamaProvider(): SummarizeProvider {
  const baseUrl =
    process.env.WP_TREND_OLLAMA_URL ?? "http://localhost:11434";
  const model = process.env.WP_TREND_OLLAMA_MODEL ?? "llama3.2:3b";

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
