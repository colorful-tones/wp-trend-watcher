/**
 * Shallow parsing of report sections to extract topic candidates
 * for comparison between previous and current reports.
 *
 * Intentionally dumb — identifies repeated phrases and section items,
 * not semantic similarity. No LLM call or historical store involved.
 */

// --- Types ---

/** A topic candidate extracted from a report section. */
export type ReportTopic = {
  label: string;
  source: "emerging-trends" | "developer-implications" | "article-inventory";
};

// --- Internal helpers ---

const SECTION_PATTERNS: Array<{
  heading: string;
  source: ReportTopic["source"];
}> = [
  { heading: "### Emerging Trends", source: "emerging-trends" },
  { heading: "### Developer Implications", source: "developer-implications" },
  { heading: "### Article Inventory", source: "article-inventory" },
];

/**
 * Build a RegExp that matches one of the known section headings.
 * The `m` flag lets `^` match at line boundaries.
 */
function buildSectionPattern(): RegExp {
  const names = SECTION_PATTERNS.map(
    (s) => s.heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), // escape regex metacharacters
  ).join("|");
  return new RegExp(`^(${names})$`, "gm");
}

// --- Public API ---

/**
 * Parse a Markdown report and extract topic candidates from known sections.
 *
 * Looks for `### Emerging Trends`, `### Developer Implications`, and
 * `### Article Inventory` sections. For each found section, extracts:
 *   - Lines starting with `* ` (bullet list items)
 *   - Lines starting with `N. ` (numbered list items)
 *   - Heading-adjacent paragraph text (non-empty, non-list lines between
 *     the heading and the first list item)
 *
 * Each extracted candidate is tagged with its section source.
 *
 * @param markdown - Full Markdown text of a trend report
 * @returns Array of extracted topic candidates (empty if none found)
 */
export function parseReportTopics(markdown: string): ReportTopic[] {
  if (!markdown) return [];

  const topics: ReportTopic[] = [];
  const sectionRe = buildSectionPattern();
  let match: RegExpExecArray | null;

  while ((match = sectionRe.exec(markdown)) !== null) {
    const headingLine = match[1];
    const source = SECTION_PATTERNS.find(
      (s) => s.heading === headingLine,
    )!.source;

    // Slice from the end of the heading line to the end of the markdown
    const afterHeading = markdown.slice(match.index + headingLine.length);

    // Find the next heading at any level (h1–h6) to delimit the section
    const nextHeading = afterHeading.match(/^#{1,6}\s/m);
    const sectionContent = nextHeading
      ? afterHeading.slice(0, nextHeading.index)
      : afterHeading;

    // Parse lines in the section content
    const lines = sectionContent.split("\n");
    let headingAdjacentText: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Bullet list item: * content
      const bulletMatch = trimmed.match(/^\*\s+(.+)$/);
      if (bulletMatch) {
        // If we've been accumulating heading-adjacent text, emit it first
        if (headingAdjacentText !== null) {
          topics.push({ label: headingAdjacentText, source });
          headingAdjacentText = null;
        }
        topics.push({ label: bulletMatch[1], source });
        continue;
      }

      // Numbered list item: N. content
      const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (numberedMatch) {
        if (headingAdjacentText !== null) {
          topics.push({ label: headingAdjacentText, source });
          headingAdjacentText = null;
        }
        topics.push({ label: numberedMatch[1], source });
        continue;
      }

      // Non-list, non-empty, non-heading text — accumulate as heading-adjacent
      // paragraph (only the first contiguous block before list items)
      if (headingAdjacentText === null) {
        headingAdjacentText = trimmed;
      }
    }

    // Emit leftover heading-adjacent text if section had no list items
    if (headingAdjacentText !== null) {
      topics.push({ label: headingAdjacentText, source });
    }
  }

  return topics;
}

/**
 * Normalize a topic label for shallow comparison.
 *
 * Steps:
 * 1. Strip markdown links (`[text](url)` → `text`)
 * 2. Lowercase
 * 3. Remove punctuation characters except hyphens (`-`) and apostrophes (`'`)
 * 4. Trim leading and trailing whitespace
 *
 * @param label - Raw label string to normalize
 * @returns Normalized label
 */
export function normalizeLabel(label: string): string {
  // Strip markdown links — replace [text](url) with just text
  let result = label.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Lowercase
  result = result.toLowerCase();

  // Remove punctuation except hyphens and apostrophes
  // Keep: whitespace, a-z, 0-9, hyphens, apostrophes
  result = result.replace(/[^\sa-z0-9'-]/g, "");

  // Trim whitespace
  result = result.trim();

  return result;
}
