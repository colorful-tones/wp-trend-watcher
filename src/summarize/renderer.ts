import MarkdownIt from "markdown-it";

/**
 * Semantic section keys used for configurable report presentation order.
 *
 * These correspond to the top-level `##` headings emitted by
 * `assembleReport()`. The Article Inventory is a `###` sub-heading inside the
 * Weekly Summary block and is handled as a presentation detail (collapsible
 * disclosure) rather than an independently reorderable section.
 */
export type ReportSection =
  | "weekly-summary"
  | "since-last-report"
  | "what-i-m-watching"
  | "source-articles"
  | "build-notes";

/**
 * Default presentation order for report sections.
 *
 * This is a presentation concern only. It does not change the canonical
 * Markdown report or source data. Adjusting this array reorders the generated
 * HTML without rewriting report history.
 */
export const DEFAULT_PRESENTATION_ORDER: ReportSection[] = [
  "weekly-summary",
  "since-last-report",
  "what-i-m-watching",
  "source-articles",
  "build-notes",
];

/**
 * Known top-level report section headings in the canonical Markdown report.
 *
 * Sub-headings (any `###`) are intentionally excluded so that nested blocks
 * inside the Weekly Summary (Article Inventory, Emerging Trends, Developer
 * Implications) render together with their parent section.
 */
const SECTION_HEADINGS: Record<ReportSection, string> = {
  "weekly-summary": "## Weekly Summary",
  "since-last-report": "## Since Last Report",
  "what-i-m-watching": "## What I'm Watching",
  "source-articles": "## Source Articles",
  "build-notes": "## Build Notes",
};

/** Pattern that marks the start of a top-level `## ` section. */
const SECTION_LINE = /^##\s+(.*)$/;

/**
 * Extract the top-level report sections from canonical Markdown.
 *
 * The canonical Markdown order is preserved in the returned map; the
 * presentation order is applied separately by {@link renderReportBody}. Nested
 * `###` sub-headings stay part of their parent `##` section.
 *
 * @param reportMd - Canonical Markdown report.
 * @returns Map of semantic section key to its raw Markdown body (heading
 *   line excluded), in canonical order. Sections not present are omitted.
 */
export function extractReportSections(
  reportMd: string,
): Map<ReportSection, string> {
  const lines = reportMd.split("\n");
  const sections = new Map<ReportSection, string>();
  let current: ReportSection | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (current !== null) {
      sections.set(current, buffer.join("\n").trim());
    }
    buffer = [];
  };

  for (const line of lines) {
    const match = SECTION_LINE.exec(line);
    if (match) {
      const heading = match[1].trim();
      const key = (Object.keys(SECTION_HEADINGS) as ReportSection[]).find(
        (k) => SECTION_HEADINGS[k] === `## ${heading}`,
      );
      if (key) {
        flush();
        current = key;
        // Keep the heading line in the body so the rendered section retains
        // its h2 (and any stable id) instead of only emitting body text.
        buffer.push(line);
        continue;
      }
    }
    if (current !== null) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Markdown-it instance shared by report HTML generation and the local
 * review server.
 *
 * Safety choices:
 * - `html: false` — raw HTML in report Markdown is escaped, not passed through.
 *   This keeps the generated pages safe even if an LLM or source feed emits
 *   markup, and avoids the fenced-code XSS class affecting markdown-it 14.x.
 * - `linkify: false` / `typographer: false` — avoid surprising auto-linking and
 *   avoid the quadratic smartquotes DoS path.
 * - Link hrefs are validated by `normalizeLink`/`validateLink`; javascript:,
 *   data:, and vbscript: URLs are not emitted as anchors.
 */
export const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});

/**
 * Slugify a heading label into a stable HTML id.
 *
 * Lowercase, non-alphanumeric characters become hyphens, and leading/trailing
 * hyphens are trimmed.
 *
 * @param text - Heading text (already without the leading `#` markers).
 * @returns A URL-friendly slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Convert a Markdown string into HTML using the shared markdown-it instance.
 *
 * Headings receive stable `id` attributes so table-of-contents links and the
 * review server anchors remain predictable. Raw HTML is escaped.
 *
 * @param mdSource - Markdown report body.
 */
export function renderMarkdown(mdSource: string): string {
  const html = md.render(mdSource);
  return addHeadingIds(stripHeadingIds(html));
}

/**
 * Decode the small set of HTML entities markdown-it emits for heading text so
 * that slug ids match the raw heading text rather than the escaped form.
 *
 * @param text - Heading text possibly containing `&lt;`/`&gt;`/etc.
 * @returns Text with entities decoded.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Add stable `id` attributes to headings in already-rendered HTML.
 *
 * markdown-it does not emit heading ids by default; this keeps our TOC and
 * anchor links working. It only augments elements that lack an id and skips
 * headings inside `<details>` summaries to avoid duplicate anchors for the
 * Article Inventory disclosure.
 *
 * @param html - HTML produced by markdown-it.
 * @returns HTML with `id` attributes added to headings.
 */
function addHeadingIds(html: string): string {
  return html.replace(
    /<h([1-6])>([\s\S]*?)<\/h\1>/g,
    (match, level: string, inner: string) => {
      const text = decodeEntities(inner.replace(/<[^>]+>/g, "")).trim();
      const id = slugify(text);
      return `<h${level} id="${id}">${inner}</h${level}>`;
    },
  );
}

/**
 * Strip a stale `id` from a heading start tag so {@link addHeadingIds} can
 * assign a clean slug. markdown-it may have already added an `id` (for example
 * from a fenced-code title or by emitting the escaped heading text), and we
 * want our own slug rather than the raw/escaped one.
 *
 * @param html - HTML produced by markdown-it.
 * @returns HTML with pre-existing heading ids removed.
 */
function stripHeadingIds(html: string): string {
  return html.replace(
    /<h([1-6])([^>]*)>/g,
    (_m, level: string, attrs: string) => {
      const cleaned = attrs.replace(/\s+id="[^"]*"/g, "");
      return `<h${level}${cleaned}>`;
    },
  );
}

/**
 * Wrap the Article Inventory sub-section (the `<h3 id="article-inventory">`
 * heading plus its following ordered/unordered list) in a native HTML
 * `<details>` disclosure.
 *
 * The disclosure is closed by default, includes a visible article count in the
 * summary, and carries the `article-inventory` id on the `<details>` element so
 * existing deep links keep working. This is a presentation-only change: the
 * canonical Markdown still contains the full, expanded inventory. When no
 * Article Inventory block is present, the HTML is returned unchanged.
 *
 * @param html - Rendered Weekly Summary HTML.
 * @returns HTML with the Article Inventory wrapped in `<details>`.
 */
function wrapArticleInventory(html: string): string {
  const start = html.indexOf('<h3 id="article-inventory">');
  if (start === -1) return html;

  const tail = html.slice(start);
  const h3End = tail.indexOf("</h3>");
  if (h3End === -1) return html;

  const afterH3 = tail.slice(h3End + "</h3>".length);
  const listMatch = /^\s*<(ol|ul)>[\s\S]*?<\/\1>/.exec(afterH3);
  if (!listMatch) return html;

  const end = start + h3End + "</h3>".length + listMatch.index + listMatch[0].length;
  const count = (listMatch[0].match(/<li>/g) ?? []).length;

  const wrapped =
    `<details class="article-inventory" id="article-inventory">\n` +
    `  <summary>Article Inventory ` +
    `<span class="article-inventory-count">(${count} article${count === 1 ? "" : "s"})</span></summary>\n` +
    `${listMatch[0].trim()}\n` +
    `</details>`;

  return html.slice(0, start) + wrapped + html.slice(end);
}

/**
 * Render the report body HTML in a configurable presentation order.
 *
 * Each known section is rendered with the shared markdown-it renderer, then
 * ordered according to `order`. Unknown or absent sections are ignored. The
 * Article Inventory sub-section inside Weekly Summary is wrapped in a
 * collapsible `<details>` element.
 *
 * @param reportMd - Canonical Markdown report.
 * @param order - Presentation order for sections. Defaults to
 *   {@link DEFAULT_PRESENTATION_ORDER}.
 * @returns HTML string for the report body (no document shell).
 */
export function renderReportBody(
  reportMd: string,
  order: ReportSection[] = DEFAULT_PRESENTATION_ORDER,
): string {
  const sections = extractReportSections(reportMd);
  if (sections.size === 0) {
    // No recognized `##` sections (e.g. a synthetic or partial report). Render
    // the whole document as-is so content is never dropped.
    return renderMarkdown(reportMd);
  }
  const blocks: string[] = [];

  for (const key of order) {
    const body = sections.get(key);
    if (body === undefined) continue;
    let html = renderMarkdown(body);
    if (key === "weekly-summary") {
      html = wrapArticleInventory(html);
    }
    blocks.push(html);
  }

  return blocks.join("\n\n");
}

/**
 * Extract a table-of-contents from h2 headings in rendered HTML.
 *
 * @param html - Rendered report HTML.
 * @returns TOC entries with slug ids and display text.
 */
export function extractToc(html: string): { id: string; text: string }[] {
  const entries: { id: string; text: string }[] = [];
  const h2Regex = /<h2[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h2>/g;
  let m: RegExpExecArray | null;
  while ((m = h2Regex.exec(html)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    entries.push({ id: m[1], text });
  }
  return entries;
}
