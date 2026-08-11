import type { SummarizeProvider } from "../providers.js";
import { DEFAULT_REPORT_SEO_DESCRIPTION } from "./report.js";

/**
 * System instructions for generating a post-review report description.
 */
export const REPORT_DESCRIPTION_SYSTEM_PROMPT = `You write concise SEO descriptions for weekly WordPress trend reports.
Rules:
- Return one factual sentence only.
- Aim for 140-160 characters, but prefer clarity over filling the limit.
- Use the most important signals from the report and its human review notes.
- Do not use hype, generic marketing language, or unsupported claims.
- Do not mention AI, the generation process, or these instructions.`;

/**
 * Build the prompt for generating a description from the final reviewed report.
 *
 * @param reportMarkdown - Canonical Markdown report after human notes are saved
 * @returns Prompt text for the summarization provider
 */
export function buildReportDescriptionPrompt(reportMarkdown: string): string {
  return `Create one factual sentence of 140-160 characters for the SEO description of this final reviewed report. Return the description only, with no label or quotation marks.

${reportMarkdown}`;
}

/**
 * Generate and normalize a report description through the configured provider.
 *
 * @param reportMarkdown - Canonical Markdown report after human notes are saved
 * @param provider - Configured LLM provider
 * @returns A single-line SEO description
 * @throws If the provider returns no usable description
 */
export async function generateReportDescription(
  reportMarkdown: string,
  provider: SummarizeProvider,
): Promise<string> {
  const result = await provider.summarize(
    REPORT_DESCRIPTION_SYSTEM_PROMPT,
    buildReportDescriptionPrompt(reportMarkdown),
  );
  const description = normalizeDescription(result.text);
  if (!description) {
    throw new Error("Provider returned an empty description");
  }

  return description;
}

/**
 * Normalize provider output while accepting a labelled response from a model.
 *
 * @param value - Raw provider response
 * @returns Safe single-line description, or an empty string
 */
function normalizeDescription(value: string): string {
  const normalized = value
    .replace(/^\s*SEO_DESCRIPTION:\s*/i, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, " ")
    .replace(/--/g, "—")
    .trim()
    .slice(0, 160);

  if (!normalized) {
    return "";
  }

  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

/**
 * Determine whether a report still has the generic fallback description.
 *
 * @param description - Existing extracted description
 * @returns True when a post-review description has not been generated
 */
export function isFallbackReportDescription(description: string): boolean {
  return description === DEFAULT_REPORT_SEO_DESCRIPTION;
}
