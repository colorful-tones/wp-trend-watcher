import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateDescriptionsForReports,
} from "../../src/summarize/description-backfill.js";
import type { SummarizeProvider } from "../../src/providers.js";

function makeProvider(): SummarizeProvider {
  return {
    name: "stub",
    model: "test-model",
    summarize: async (_systemPrompt, userPrompt) => ({
      text: userPrompt.includes("2026-01-01")
        ? "Description for the first report."
        : "Description for the second report.",
      promptTokens: 10,
      completionTokens: 5,
    }),
    costFor: () => 0,
  };
}

test("generateDescriptionsForReports fills reports without descriptions and rebuilds HTML/index", async () => {
  const reportsDir = await mkdtemp(join(tmpdir(), "description-backfill-"));
  await writeFile(
    join(reportsDir, "2026-01-01.md"),
    "# WordPress Trend Report — 2026-01-01\n\n## What I'm Watching\n\nNotes.\n",
    "utf8",
  );
  await writeFile(
    join(reportsDir, "2026-01-08.md"),
    "<!-- SEO_DESCRIPTION: Existing description. -->\n# WordPress Trend Report — 2026-01-08\n",
    "utf8",
  );

  const result = await generateDescriptionsForReports(reportsDir, makeProvider());

  assert.deepEqual(result, { generated: 1, skipped: 1, failed: 0 });
  assert.ok(
    (await readFile(join(reportsDir, "2026-01-01.md"), "utf8")).includes(
      "<!-- SEO_DESCRIPTION: Description for the first report. -->",
    ),
  );
  assert.ok(await readFile(join(reportsDir, "2026-01-01.html"), "utf8"));
  assert.ok(await readFile(join(reportsDir, "index.html"), "utf8"));
});

test("generateDescriptionsForReports force-regenerates existing descriptions", async () => {
  const reportsDir = await mkdtemp(join(tmpdir(), "description-backfill-force-"));
  await writeFile(
    join(reportsDir, "2026-01-08.md"),
    "<!-- SEO_DESCRIPTION: Existing description. -->\n# WordPress Trend Report — 2026-01-08\n",
    "utf8",
  );

  const result = await generateDescriptionsForReports(reportsDir, makeProvider(), {
    force: true,
  });

  assert.deepEqual(result, { generated: 1, skipped: 0, failed: 0 });
  assert.ok(
    (await readFile(join(reportsDir, "2026-01-08.md"), "utf8")).includes(
      "Description for the second report.",
    ),
  );
});
