/**
 * Pure helpers for extracting and replacing the human-authored
 * "What I'm Watching" section in a WordPress trend report.
 *
 * These functions operate on strings only — no filesystem access,
 * no side effects. They are the contract between the review UI
 * and the canonical Markdown report.
 */

/** Result of extracting a Markdown section. */
export interface SectionSpan {
  /** The body content between the heading and the section end marker. */
  body: string;
  /**
   * Byte offset where the section body begins (after the heading line
   * and any trailing whitespace).
   */
  bodyStart: number;
  /**
   * Byte offset where the section body ends (right before the section
   * end marker — `---` or the next `## ` heading).
   */
  bodyEnd: number;
}

const WATCHING_HEADING = "## What I'm Watching";

/**
 * Known placeholder patterns that indicate no human-authored content.
 * Matched case-insensitively after trimming whitespace.
 */
const PLACEHOLDER_MARKERS = [
  "TODO",
  "FIXME",
  "PLACEHOLDER",
  "ADD YOUR NOTE",
  "YOUR OBSERVATION HERE",
  "ADD YOUR OBSERVATIONS HERE",
  "Human-authored: add your observations here",
];

/**
 * Check whether a section body is still a placeholder (no human-authored content).
 *
 * @param body - The section body text.
 * @returns True when the body matches a known placeholder or is empty.
 */
export function isPlaceholderContent(body: string): boolean {
  const trimmed = body.trim();
  if (trimmed.length === 0) return true;
  const upper = trimmed.toUpperCase();
  return PLACEHOLDER_MARKERS.some((marker) => {
    // Match HTML comments like `<!-- Human-authored: ... -->` too
    const withoutComment = trimmed.replace(/<!--.*?-->/gs, "").trim();
    if (withoutComment.length === 0) return true;
    return upper.includes(marker.toUpperCase());
  });
}

/**
 * Find the "What I'm Watching" section in a report.
 *
 * Returns the section body and its byte offsets, or `null` if the heading
 * is not found.
 *
 * @param report - Full Markdown report text.
 * @returns SectionSpan with body and offsets, or null.
 */
export function findWatchingSection(report: string): SectionSpan | null {
  const headingIdx = report.indexOf(WATCHING_HEADING);
  if (headingIdx === -1) return null;

  // Body starts after the heading line (+ newline)
  const headingEnd = headingIdx + WATCHING_HEADING.length;

  // Find next newline after heading to skip to body
  let newlineIdx = report.indexOf("\n", headingEnd);
  if (newlineIdx === -1) {
    // Heading is last line, no body
    return {
      body: "",
      bodyStart: headingEnd,
      bodyEnd: headingEnd,
    };
  }

  // Skip any blank lines immediately after the heading line
  let bodyStart = newlineIdx + 1;
  while (bodyStart < report.length && report[bodyStart] === "\n") {
    bodyStart++;
  }

  // Find where the section ends: next `---` on its own line, or next `## ` heading
  const afterHeading = report.slice(bodyStart);

  // Try to find the first `---` on its own line (horizontal rule)
  const hrMatch = afterHeading.match(/\n---\s*\n/);
  // Try to find the next `## ` heading
  const h2Match = afterHeading.match(/\n## /);

  let bodyEnd: number;

  if (hrMatch && h2Match) {
    // Both exist — use whichever comes first
    bodyEnd = bodyStart + Math.min(hrMatch.index!, h2Match.index!);
  } else if (hrMatch) {
    bodyEnd = bodyStart + hrMatch.index!;
  } else if (h2Match) {
    bodyEnd = bodyStart + h2Match.index!;
  } else {
    // Section runs to end of file
    bodyEnd = report.length;
  }

  // Trim trailing whitespace/blank lines from the body
  while (bodyEnd > bodyStart && report[bodyEnd - 1] === "\n") {
    bodyEnd--;
  }

  let body = report.slice(bodyStart, bodyEnd);

  // Clean leading/trailing whitespace
  body = body.trim();

  return { body, bodyStart, bodyEnd };
}

/**
 * Replace the "What I'm Watching" section body in a report.
 *
 * Uses the section span returned by `findWatchingSection()` for precise
 * replacement.  Content before and after the section is preserved exactly.
 *
 * Returns `null` if the section is not found (caller should check
 * `findWatchingSection()` first).
 *
 * @param report - Full Markdown report text.
 * @param newContent - New content for the section (can be empty string).
 * @returns Modified report with the section replaced, or null.
 */
export function replaceWatchingSection(
  report: string,
  newContent: string,
): string | null {
  const span = findWatchingSection(report);
  if (span === null) return null;

  const before = report.slice(0, span.bodyStart - 1); // strip leading newline we'll replace
  const after = report.slice(span.bodyEnd);

  // The bodyStart-1 skips the newline that separates heading from body.
  // We reconstruct: heading + \n\n + content + \n + everything after.
  // But let's be more careful — we need to preserve the exact boundary.
  //
  // report[bodyStart] is the first char of body content (or newline).
  // report[bodyEnd] is the first char after the body end.
  //
  // The space between headingEnd and bodyStart is the newlines between
  // `## What I'm Watching` and the body text.
  // The space between bodyEnd and the next marker is trailing whitespace
  // that ends the section.
  //
  // Strategy: splice at bodyStart/bodyEnd positions, then re-add proper spacing.
  const beforeBody = report.slice(0, span.bodyStart);
  const afterBody = report.slice(span.bodyEnd);

  const cleanContent = newContent.trim();

  // Reconstruct: preserve everything before bodyStart, insert clean content
  // with exactly one blank line before and after, then everything after bodyEnd.
  if (cleanContent.length === 0) {
    // Empty — just leave the heading with the HTML placeholder comment
    return (
      beforeBody.trimEnd() +
      "\n\n<!-- Human-authored: add your observations here -->\n" +
      afterBody
    );
  }

  return beforeBody.trimEnd() + "\n\n" + cleanContent + "\n" + afterBody;
}
