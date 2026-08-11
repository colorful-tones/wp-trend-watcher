import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_REPORT_SEO_DESCRIPTION,
  extractReportSeoMetadata,
  updateReportSeoDescription,
} from "../../src/summarize/report.js";

test("updateReportSeoDescription inserts metadata after the title comment", () => {
  const report = "<!-- SEO_TITLE: A report title -->\n# Report\n";
  const updated = updateReportSeoDescription(
    report,
    "A specific description from the final reviewed report.",
  );

  assert.equal(
    updated,
    "<!-- SEO_TITLE: A report title -->\n<!-- SEO_DESCRIPTION: A specific description from the final reviewed report. -->\n# Report\n",
  );
});

test("updateReportSeoDescription replaces an existing description", () => {
  const report =
    "<!-- SEO_TITLE: A report title -->\n<!-- SEO_DESCRIPTION: Old description. -->\n# Report\n";

  assert.ok(
    updateReportSeoDescription(report, "New description.").includes(
      "<!-- SEO_DESCRIPTION: New description. -->",
    ),
  );
  assert.equal(
    updateReportSeoDescription(report, "New description.").match(
      /SEO_DESCRIPTION/g,
    )?.length,
    1,
  );
});

test("extractReportSeoMetadata uses the deterministic fallback before description generation", () => {
  const metadata = extractReportSeoMetadata("# Report\n", {
    title: "Fallback title",
    description: DEFAULT_REPORT_SEO_DESCRIPTION,
  });

  assert.equal(metadata.description, DEFAULT_REPORT_SEO_DESCRIPTION);
});
