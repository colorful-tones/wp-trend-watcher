import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import {
  extractReportSeoMetadata,
  type ReportSeoMetadata,
} from "./report.js";
import {
  renderMarkdown,
  renderReportBody,
  extractToc,
  slugify,
} from "./renderer.js";

const REPORT_STYLESHEET_HREF = "assets/report.css";
const REPORT_STYLESHEET_SOURCE = new URL("./report.css", import.meta.url);

// Radio Canada variable font (source lives at repo-root assets/fonts/).
// Copied into reports/assets/ alongside the stylesheet so it ships with
// GitHub Pages deployments.
const REPORT_FONT_FILE = "RadioCanada-VariableFont_wdth,wght.woff2";
const REPORT_FONT_HREF = `assets/${REPORT_FONT_FILE}`;
const REPORT_FONT_SOURCE = new URL(
  `../../assets/fonts/${REPORT_FONT_FILE}`,
  import.meta.url,
);

// Social sharing image (Open Graph / Twitter card). Same repo-root assets/
// convention as the icon and font: copied into reports/assets/ at generation
// time so it ships with GitHub Pages deployments and resolves at the site root.
const REPORT_OG_IMAGE_FILE = "WP-Trend-Watcher_1200x630.png";
const REPORT_OG_IMAGE_HREF = `assets/${REPORT_OG_IMAGE_FILE}`;
const REPORT_OG_IMAGE_SOURCE = new URL(
  `../../assets/${REPORT_OG_IMAGE_FILE}`,
  import.meta.url,
);

// Canonical site base URL for absolute Open Graph / Twitter / canonical URLs.
// Must match the GitHub Pages deployment root (see README).
const SITE_BASE_URL = "https://colorful-tones.github.io/wp-trend-watcher/";
const GITHUB_REPO_URL = "https://github.com/colorful-tones/wp-trend-watcher";
const DEFAULT_REPORT_THEME = "civic-brutalist";
const DEFAULT_REPORT_MODE = "system";
const GOATCOUNTER_SCRIPT_SRC = "//gc.zgo.at/count.js";
const REPORT_THEME_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=DM+Mono:wght@400;500&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=Space+Grotesk:wght@400;500;600;700&family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet">`;

const REPORT_SETTINGS_BUTTON = `<button
  class="settings-button"
  type="button"
  data-theme-settings-open
  aria-haspopup="dialog"
  aria-controls="report-settings"
  aria-label="Open report settings"
  title="Open report settings"
>
  <span class="settings-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false"><path d="M4 7h7M15 7h5M4 17h3M11 17h9M11 4v6M7 14v6"/></svg>
  </span>
  <span class="settings-label sr-only">Display</span>
  <span class="sr-only">Settings</span>
</button>`;

const REPORT_THEME_CONTROLS = `<dialog class="theme-settings-dialog" id="report-settings" aria-labelledby="report-settings-title">
  <div>
    <div class="theme-settings-header">
      <h2 id="report-settings-title">Report settings</h2>
      <button class="theme-settings-close" type="button" data-theme-settings-close aria-label="Close report settings">×</button>
    </div>
    <div class="theme-controls" aria-label="Report display settings">
      <label>
        <span>Style</span>
        <select data-theme-control="theme" aria-label="Report visual style">
          <option value="civic-brutalist">Civic Brutalist</option>
          <option value="ink-editorial">Ink Editorial</option>
          <option value="neon-observatory">Neon Observatory</option>
        </select>
      </label>
      <label>
        <span>Mode</span>
        <select data-theme-control="mode" aria-label="Report color mode">
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
    </div>
    <div class="theme-settings-actions">
      <button type="button" data-theme-settings-close>Done</button>
    </div>
  </div>
</dialog>`;

const REPORT_THEME_SCRIPT = `<script>
(function () {
  var root = document.documentElement;
  var themeKey = "wp-trend-watcher-theme";
  var modeKey = "wp-trend-watcher-mode";
  var themes = ["civic-brutalist", "ink-editorial", "neon-observatory"];
  var modes = ["system", "light", "dark"];

  function read(key, allowed, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      return allowed.indexOf(value) >= 0 ? value : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function persist(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_error) {
      // Continue without persistence when storage is unavailable.
    }
  }

  function apply(theme, mode, save) {
    root.dataset.theme = theme;
    root.dataset.mode = mode;
    if (save) {
      persist(themeKey, theme);
      persist(modeKey, mode);
    }
    document.querySelectorAll("[data-theme-control='theme']").forEach(function (control) {
      control.value = theme;
    });
    document.querySelectorAll("[data-theme-control='mode']").forEach(function (control) {
      control.value = mode;
    });
  }

  apply(
    read(themeKey, themes, "${DEFAULT_REPORT_THEME}"),
    read(modeKey, modes, "${DEFAULT_REPORT_MODE}"),
    false,
  );

  var controlsBound = false;
  function bindControls() {
    if (controlsBound) return;
    controlsBound = true;
    var settingsDialog = document.getElementById("report-settings");
    document.querySelectorAll("[data-theme-settings-open]").forEach(function (control) {
      control.addEventListener("click", function () {
        if (settingsDialog && typeof settingsDialog.showModal === "function") {
          settingsDialog.showModal();
        } else if (settingsDialog) {
          settingsDialog.setAttribute("open", "");
        }
      });
    });
    function closeDialog() {
      if (!settingsDialog) return;
      if (typeof settingsDialog.close === "function") {
        settingsDialog.close();
      } else {
        settingsDialog.removeAttribute("open");
      }
    }
    document.querySelectorAll("[data-theme-settings-close]").forEach(function (control) {
      control.addEventListener("click", closeDialog);
    });
    if (settingsDialog) {
      settingsDialog.addEventListener("click", function (event) {
        if (event.target === settingsDialog) {
          closeDialog();
        }
      });
    }
    document.querySelectorAll("[data-theme-control='theme']").forEach(function (control) {
      control.addEventListener("change", function (event) {
        apply(event.target.value, root.dataset.mode || "${DEFAULT_REPORT_MODE}", true);
      });
    });
    document.querySelectorAll("[data-theme-control='mode']").forEach(function (control) {
      control.addEventListener("change", function (event) {
        apply(root.dataset.theme || "${DEFAULT_REPORT_THEME}", event.target.value, true);
      });
    });
    apply(root.dataset.theme || "${DEFAULT_REPORT_THEME}", root.dataset.mode || "${DEFAULT_REPORT_MODE}", false);
  }

  document.addEventListener("DOMContentLoaded", bindControls);
  window.addEventListener("load", bindControls);
  if (document.readyState !== "loading") bindControls();
})();
</script>`;

// Shared SEO description for report pages.
const REPORT_SEO_DESCRIPTION =
  "Weekly human-reviewed analysis of changes across the WordPress ecosystem, covering releases, tools, and developer implications.";

/**
 * Extract the report date from a Markdown filename like "2026-06-12.md".
 */
function dateFromFilename(filePath: string): string {
  return basename(filePath, ".md");
}

/**
 * Escape text inserted into generated HTML.
 *
 * @param value - Text value to escape
 * @returns HTML-safe text
 */
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

/**
 * Build the optional GoatCounter analytics script from the configured public
 * endpoint. Analytics remains disabled when the setting is unset.
 *
 * @returns An analytics script tag, or an empty string when disabled.
 */
function buildAnalyticsScript(): string {
  const endpoint = process.env.WP_TREND_GOATCOUNTER_URL?.trim();
  if (!endpoint) {
    return "";
  }

  try {
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" ||
      url.pathname !== "/count" ||
      url.search ||
      url.hash
    ) {
      throw new Error("expected an HTTPS URL ending in /count");
    }
  } catch {
    console.warn(
      "Invalid WP_TREND_GOATCOUNTER_URL; analytics disabled. Use an HTTPS URL ending in /count.",
    );
    return "";
  }

  return `<script data-goatcounter="${escapeHtml(endpoint)}" async src="${GOATCOUNTER_SCRIPT_SRC}"></script>`;
}

/**
 * Build standard SEO / social-sharing meta tags for a report or index page.
 *
 * Emits a description, canonical link, Open Graph tags, and Twitter Card tags.
 * The image and page URL are absolute so social scrapers can resolve them
 * without knowing the deployment path.
 *
 * @param opts.title - Page title (also used for OG/Twitter title)
 * @param opts.description - Page description (also used for OG/Twitter)
 * @param opts.url - Absolute canonical URL for the page
 * @param opts.type - Open Graph type ("article" for reports, "website" for index)
 * @returns Newline-joined meta/link tags for the document head
 */
function buildSeoMeta(opts: {
  title: string;
  description: string;
  url: string;
  type: string;
}): string {
  const image = `${SITE_BASE_URL}assets/${REPORT_OG_IMAGE_FILE}`;
  const title = escapeHtml(opts.title);
  const description = escapeHtml(opts.description);
  const url = escapeHtml(opts.url);
  return [
    `<meta name="description" content="${description}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="${opts.type}">`,
    `<meta property="og:site_name" content="WP Trend Watcher">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${image}">`,
  ].join("\n  ");
}

/**
 * Copy the shared report stylesheet and icon into the generated reports
 * asset directory.
 *
 * @param reportsDir - Directory containing generated report HTML files.
 * @returns Relative stylesheet href for report-root HTML pages.
 */
async function ensureReportStylesheet(reportsDir: string): Promise<string> {
  const css = await readFile(REPORT_STYLESHEET_SOURCE, "utf8");
  const assetsDir = join(reportsDir, "assets");
  await mkdir(assetsDir, { recursive: true });
  await writeFile(join(assetsDir, "report.css"), css, "utf8");

  // Copy the Radio Canada variable font so the shared stylesheet's
  // @font-face rule can load it from the same assets directory.
  const font = await readFile(REPORT_FONT_SOURCE);
  await writeFile(join(assetsDir, REPORT_FONT_FILE), font);

  // Copy the social-sharing image so Open Graph / Twitter cards resolve on
  // GitHub Pages deployments.
  const ogImage = await readFile(REPORT_OG_IMAGE_SOURCE);
  await writeFile(join(assetsDir, REPORT_OG_IMAGE_FILE), ogImage);

  return REPORT_STYLESHEET_HREF;
}

/**
 * Generate a styled HTML report from a Markdown report file.
 *
 * Reads the Markdown, converts to HTML via the shared renderer, writes the
 * shared stylesheet, and writes an HTML file alongside the original.
 *
 * @param mdPath - Absolute path to the Markdown report (e.g. reports/2026-06-12.md)
 * @returns Absolute path to the generated HTML file
 */
export async function generateHtmlReport(mdPath: string): Promise<string> {
  const md = await readFile(mdPath, "utf8");
  const date = dateFromFilename(mdPath);
  const stylesheetHref = await ensureReportStylesheet(dirname(mdPath));
  const seo = extractReportSeoMetadata(md, {
    title: `WordPress Trend Report — ${date}`,
    description: REPORT_SEO_DESCRIPTION,
  });
  const bodyHtml = renderReportBody(md);
  const analyticsScript = buildAnalyticsScript();

  // Extract the h1 heading for the report hero. Only the title portion
  // (before the " — " separator) becomes a link back to the index; the
  // trailing date stays as plain text so it isn't part of the click target.
  const h1Match = md.match(/^#\s+(.*)$/m);
  let headerHtml: string;
  if (h1Match) {
    const h1Id = slugify(h1Match[1]);
    const dashIdx = h1Match[1].indexOf(" — ");
    const linkText = dashIdx >= 0 ? h1Match[1].slice(0, dashIdx) : h1Match[1];
    const restText = dashIdx >= 0 ? h1Match[1].slice(dashIdx) : "";
    headerHtml = `<header class="report-header report-hero">\n  <div class="report-hero-copy">\n    <div class="report-kicker">Weekly field notes · ${date}</div>\n    <h1 id="${h1Id}"><a href="index.html" title="Back to all reports">${linkText}</a>${restText}</h1>\n    <p class="report-description">${escapeHtml(seo.description)}</p>\n  </div>\n  ${REPORT_SETTINGS_BUTTON}\n</header>`;
  } else {
    headerHtml = `<header class="report-header report-hero">\n  <div class="report-hero-copy">\n    <div class="report-kicker">Weekly field notes · ${date}</div>\n    <h1><a href="index.html" title="Back to all reports">WordPress Trend Report</a> — ${date}</h1>\n    <p class="report-description">${escapeHtml(seo.description)}</p>\n  </div>\n  ${REPORT_SETTINGS_BUTTON}\n</header>`;
  }

  // Build table of contents from h2 headings (if 2 or more exist)
  const tocEntries = extractToc(bodyHtml);
  let tocHtml = "";
  if (tocEntries.length >= 2) {
    const links = tocEntries
      .map(
        (entry) =>
          `    <li><a href="#${entry.id}">${entry.text}</a></li>`,
      )
      .join("\n");
    tocHtml = `<nav class="toc">\n  <h2>Contents</h2>\n  <ul>\n${links}\n  </ul>\n</nav>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(seo.title)}</title>
  <link rel="stylesheet" href="${stylesheetHref}">
  ${REPORT_THEME_FONTS}
  ${REPORT_THEME_SCRIPT}
${analyticsScript}
  ${buildSeoMeta({
    title: seo.title,
    description: seo.description,
    url: `${SITE_BASE_URL}${date}.html`,
    type: "article",
  })}
</head>
<body class="report-page">
  ${headerHtml}
  ${REPORT_THEME_CONTROLS}
  <div class="report-layout">
    <aside class="report-rail">
      <div class="report-rail-label">This issue</div>
      <p>${date}<br>Human-reviewed report</p>
      ${tocHtml}
    </aside>
    <main class="report-main">
      <div class="report-body">
      ${bodyHtml}
      </div>
    </main>
  </div>
  <footer class="nav-footer">
    <a href="index.html">← Back to Reports</a>
    <span class="nav-footer-separator">·</span>
    <a class="repo-link" href="${GITHUB_REPO_URL}">View on GitHub ↗</a>
  </footer>
</body>
</html>`;

  const outPath = join(dirname(mdPath), `${date}.html`);
  await writeFile(outPath, html, "utf8");
  return outPath;
}

/**
 * Generate the index.html listing page for all HTML reports in a directory.
 *
 * Scans for *.html files (skipping index.html itself) and produces a
 * minimal listing page sorted by date descending.
 *
 * @param reportsDir - Absolute path to the reports directory
 * @returns Absolute path to the generated index.html
 */
export async function generateIndexPage(reportsDir: string): Promise<string> {
  const stylesheetHref = await ensureReportStylesheet(reportsDir);
  const analyticsScript = buildAnalyticsScript();
  const files = await readdir(reportsDir);
  const htmlFiles = files
    .filter((f) => f.endsWith(".html") && f !== "index.html")
    .sort()
    .reverse();

  const reportCount = htmlFiles.length;
  const reportLabel =
    reportCount === 1
      ? "1 weekly WordPress ecosystem trend report."
      : `${reportCount} weekly WordPress ecosystem trend reports.`;

  const cards = (
    await Promise.all(
      htmlFiles.map(async (f, i) => {
      const dateStr = f.replace(".html", "");
      const fallback: ReportSeoMetadata = {
        title: `WordPress Trend Report — ${dateStr}`,
        description: REPORT_SEO_DESCRIPTION,
      };
      let seo = fallback;
      try {
        seo = extractReportSeoMetadata(
          await readFile(join(reportsDir, `${dateStr}.md`), "utf8"),
          fallback,
        );
      } catch {
        // Older generated reports may not have a Markdown source beside them.
      }
      // Parse YYYY-MM-DD into a Date object for locale formatting
      const [year, month, day] = dateStr.split("-").map(Number);
      const dateObj = new Date(year, month - 1, day);
      const formattedDate = dateObj.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const labelHtml =
        i === 0
          ? `\n    <span class="report-card-label">Latest report</span>`
          : "";
      return `    <a href="${f}" class="report-card">
      <span class="report-card-date">${formattedDate}</span>
      <span class="report-card-title">${escapeHtml(seo.title)}</span>
      <span class="report-card-description">${escapeHtml(seo.description)}</span>${labelHtml}
    </a>`;
      }),
    )
  ).join("\n");

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WP Trend Watcher — Reports</title>
  <link rel="stylesheet" href="${stylesheetHref}">
  ${REPORT_THEME_FONTS}
  ${REPORT_THEME_SCRIPT}
${analyticsScript}
  ${buildSeoMeta({
    title: "WP Trend Watcher — Reports",
    description: "Weekly human-reviewed WordPress ecosystem trend reports.",
    url: `${SITE_BASE_URL}index.html`,
    type: "website",
  })}
</head>
<body class="report-index">
  <header class="report-header report-hero report-index-hero">
    <div class="report-hero-copy">
      <div class="report-kicker">Weekly field notes · archive</div>
      <h1>What’s moving<br>in WordPress?</h1>
      <p class="report-description">A browsable archive of human-reviewed reports for people who build, maintain, and think about WordPress for a living.</p>
    </div>
    <div class="report-index-count"><strong>${reportCount}</strong><span>weekly reports<br>in the archive</span></div>
    ${REPORT_SETTINGS_BUTTON}
  </header>
  ${REPORT_THEME_CONTROLS}
  <section class="report-index-archive" aria-labelledby="recent-reports-title">
    <div class="report-index-heading">
      <h2 id="recent-reports-title">Recent reports</h2>
      <span class="meta">${reportLabel}</span>
    </div>
    <div class="report-card-grid">
  ${cards}
    </div>
  </section>
  <footer class="nav-footer">
    <p>
      <a class="repo-link" href="${GITHUB_REPO_URL}">View the project on GitHub ↗</a>
      &nbsp;·&nbsp;
      <a href="https://github.com/colorful-tones/wp-trend-watcher/issues/new?template=source-suggestion.yml">Suggest a source</a>
      &nbsp;·&nbsp;
      <a href="https://github.com/colorful-tones/wp-trend-watcher/issues/new?template=report-feedback.yml">Send feedback</a>
    </p>
  </footer>
</body>
</html>`;

  const outPath = join(reportsDir, "index.html");
  await writeFile(outPath, indexHtml, "utf8");
  return outPath;
}
