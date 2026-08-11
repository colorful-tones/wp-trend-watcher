import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReportDescriptionPrompt,
  generateReportDescription,
} from "../../src/summarize/description.js";
import type { SummarizeProvider } from "../../src/providers.js";

function makeProvider(text: string): SummarizeProvider {
  return {
    name: "stub",
    model: "test-model",
    summarize: async (_systemPrompt, userPrompt) => {
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
