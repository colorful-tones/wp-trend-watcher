import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReportDescriptionInput,
  buildReportDescriptionPrompt,
  generateReportDescription,
} from "../../src/summarize/description.js";
import type { SummarizeProvider } from "../../src/providers.js";

function makeProvider(text: string): SummarizeProvider {
  return {
    name: "stub",
    model: "test-model",
    summarize: async (_systemPrompt, userPrompt, options) => {
      assert.equal(options?.maxTokens, 512);
      assert.ok(userPrompt.includes("Human notes: This week's testing notes."));
      return { text, promptTokens: 10, completionTokens: 5 };
    },
    costFor: () => 0,
  };
}

test("buildReportDescriptionPrompt asks for a factual description from the final report", () => {
  const prompt = buildReportDescriptionPrompt(
    "# Report\n\n## What I'm Watching\n\nHuman notes: This week's testing notes.",
  );

  assert.ok(prompt.includes("one factual sentence"));
  assert.ok(prompt.includes("140-160 characters"));
  assert.ok(prompt.includes("Human notes: This week's testing notes."));
  assert.ok(!prompt.includes("SEO_DESCRIPTION:"));
});

test("buildReportDescriptionInput keeps analysis, human notes, and source titles only", () => {
  const input = buildReportDescriptionInput(
    "# Report\n\n## Weekly Summary\n\n### Emerging Trends\n\nTrend details.\n\n## Developer Implications\n\nImplications.\n\n## What I'm Watching\n\nHuman notes.\n\n## Source Articles\n\n1. [Source title](https://example.com/source) — Long source detail.\n\n## Build Notes\n\nProvider: secret-model\n",
  );

  assert.ok(input.includes("Trend details."));
  assert.ok(input.includes("Implications."));
  assert.ok(input.includes("Human notes."));
  assert.ok(input.includes("Source title"));
  assert.ok(!input.includes("https://example.com/source"));
  assert.ok(!input.includes("Long source detail."));
  assert.ok(!input.includes("secret-model"));
});

test("generateReportDescription returns a normalized model description", async () => {
  const description = await generateReportDescription(
    "# Report\n\n## What I'm Watching\n\nHuman notes: This week's testing notes.",
    makeProvider('SEO_DESCRIPTION:  WordPress 7.1 testing and API changes shape upcoming client work.  '),
  );

  assert.equal(
    description,
    "WordPress 7.1 testing and API changes shape upcoming client work.",
  );
});

test("generateReportDescription rejects an empty model response", async () => {
  const emptyProvider: SummarizeProvider = {
    name: "stub",
    model: "test-model",
    summarize: async () => ({
      text: "SEO_DESCRIPTION:",
      promptTokens: 0,
      completionTokens: 0,
    }),
    costFor: () => 0,
  };

  await assert.rejects(
    generateReportDescription("# Report", emptyProvider),
    /empty description/i,
  );
});
