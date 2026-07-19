# WP Trend Watcher

![WP Trend Watcher social card](assets/WP-Trend-Watcher_1200x630.png)

WP Trend Watcher is a lightweight, open-source workflow for helping WordPress developers stay informed about changes in the WordPress ecosystem through AI-assisted, human-reviewed analysis.

The goal is not to automate opinions, replace expertise, or publish without review.

The goal is to collect useful WordPress ecosystem updates, summarize them efficiently, review them with human judgment, and produce a weekly report that developers can actually use.

## Latest Reports

Published weekly reports are available at [colorful-tones.github.io/wp-trend-watcher](https://colorful-tones.github.io/wp-trend-watcher/).

## Intended Audience

Freelance and agency WordPress developers who want to stay current without reading every Make post, Developer Blog update, and ecosystem article.

## Requirements

- **Node.js 22** (pinned in `.nvmrc` and `engines`). nvm is recommended for version management but not required.
- **pnpm 11** (pinned in `packageManager`). Corepack ships with Node.js and provides the correct pnpm version automatically when enabled.
- **Corepack enabled** — run `corepack enable` once per machine.
- **git** — to clone the repo.
- **A local LLM provider** for summarization: LM Studio, Ollama, or any OpenAI-compatible endpoint. Collection, doctor, and review work without one, but summarization requires it.
- **macOS, Linux, or WSL2**. The tooling assumes a Unix-like environment.

## Quick Start

```bash
git clone https://github.com/colorful-tones/wp-trend-watcher.git
cd wp-trend-watcher
nvm use
corepack enable
pnpm install
cp .env.example .env   # edit if using a different model or provider
cp sources.example.yaml sources.yaml  # optional: customize sources
pnpm collect           # add -- --days 7 for recent articles
pnpm summarize         # requires a local LLM endpoint for summarization
```

Summarization requires a local LLM provider (see Requirements above). LM Studio users should set `WP_TREND_MAX_TOKENS=2048` in `.env` for predictable report generation. The CLI automatically loads `.env` from the project root.

## What This Does

```bash
pnpm collect         # Fetch RSS feeds from 6 sources (4 Tier 1 + 2 Tier 2), store articles as JSON
pnpm summarize       # Fetch article content, generate summaries, synthesize the weekly report, and build HTML + index
pnpm generate-report # Regenerate the report from saved article summaries
pnpm index-page      # Regenerate the reports index.html listing page
pnpm doctor          # Check environment readiness before first summarize
pnpm review          # Review checklist for the latest report
pnpm weekly          # Run the full weekly workflow (doctor → collect → summarize → review → review server)
```

`pnpm weekly` is the recommended single-command workflow. It runs doctor, collect, summarize, and review sequentially, then starts a local review server at http://127.0.0.1:3001/review where you can view automated checks, read the rendered report, and save your "What I'm Watching" observations. Saved edits update both the canonical Markdown report and regenerated HTML. Press Ctrl-C to stop the server when you're done.

Use `pnpm weekly -- --no-open` to skip the automatic browser launch.

Individual commands remain available for diagnosis and recovery — for example, running `pnpm collect` or `pnpm summarize` separately when you only need that step.

`pnpm summarize` produces an HTML report alongside the Markdown file and writes shared report styles to `reports/assets/report.css`. Reports are deployed to [GitHub Pages](https://colorful-tones.github.io/wp-trend-watcher/) on every push to `main` via the `pages.yml` workflow. Configure GitHub Pages to deploy from the `github-pages` environment (Settings → Pages → Source: GitHub Actions).

See [Summarization](docs/summarization.md) for provider configuration, model options, and synthesis strategy.

## Project Principles

- Human reviewed.
- Budget conscious.
- Provider agnostic.
- Open source first.
- Simple before clever.

See:

- [Weekly Workflow](docs/weekly-workflow.md)
- [Project Philosophy](docs/philosophy.md)
- [Sources](docs/sources.md)
- [Summarization](docs/summarization.md)
- [Human Review](docs/human-review.md)
- [Cost Notes](docs/cost-notes.md)
- [Contributing](CONTRIBUTING.md)

## Feedback & Sources

Found a gap in the latest report? [Open a report feedback issue](https://github.com/colorful-tones/wp-trend-watcher/issues/new?template=report-feedback.yml).

Want to suggest a new RSS source? [Open a source suggestion issue](https://github.com/colorful-tones/wp-trend-watcher/issues/new?template=source-suggestion.yml).

Both templates walk you through what's needed — takes about a minute.

## Changelog

### 0.6.0

- Added `pnpm weekly` single-command workflow: doctor → collect → summarize → review → local review server.
- Added localhost-only review server (http://127.0.0.1:3001/review) for browser-based human review.
- Review page displays automated checks, rendered report, and an editable "What I'm Watching" textarea.
- Saving via the review page updates the canonical Markdown report and regenerates matching HTML atomically.
- Human-authored "What I'm Watching" content is now preserved during same-date report regeneration (`pnpm summarize` and `pnpm generate-report`).
- Added pure Markdown section helpers (`src/review/report-edit.ts`) for extracting and replacing the "What I'm Watching" section.
- New `docs/human-review.md` updated to mention the local review page.
- Added 36 new tests for report editing, preservation behaviour, and review server request handling.
- No new runtime dependencies — uses Node.js native HTTP server.

### 0.5.0

- Added `pnpm watch` zero-dependency live-reload dev server with SSE browser reload.
- Added project icon to report headers and index page (flexbox-aligned with h1).
- Added `pnpm regen-html` command to batch-regenerate all report HTML from existing Markdown — no LLM calls.
- Refined report CSS: cleaned-up header, horizontal table-of-contents layout, tighter spacing on build notes and footer.

### 0.4.3

- Repaired flaky auto-days test assertion.
- Aligned package version with changelog.
- Corrected README token-cap example.
- Corrected weekly-workflow auto-window documentation.
- Removed stale Phase 1 phrasing from active docs.

### 0.4.2

- Changed generated HTML reports and the report index to share `reports/assets/report.css` instead of embedding the full stylesheet in every HTML file.
- Migrated previously generated report HTML from existing Markdown only, without changing report Markdown or article data.

### 0.4.1

**README and documentation overhaul:**
- Added Requirements section with Node/pnpm/Corepack/LLM prerequisites
- Added Latest Reports section linking to the GitHub Pages index
- Added Feedback & Sources section linking to the GitHub issue templates (report feedback and source suggestion)
- Removed stale Status snapshot, What This Does Not Do Yet, Report Format, and Data Snapshot Policy (all covered by docs/ or Project Principles)
- New `docs/weekly-workflow.md` — 7-step command sequence quick reference with scannable table

**HTML navigation polish:**
- Individual report pages now include a "← Back to Reports" footer link
- Reports index page now includes "Suggest a source" and "Send feedback" footer links pointing to the issue templates
- New `.nav-footer` CSS class for consistent navigation styling

**Smarter default collection window:**
- `pnpm collect` now auto-calculates `--days` from the most recent report date instead of defaulting to 7
- Priority: explicit `--days N` flag → `WP_TREND_DAYS` env var → auto-calculated from last report → 7 day fallback
- New `findDaysSinceLastReport` helper scans `reports/` for date-named `.md` files

### 0.4.0 — Phase 4 Release

**Previous-report comparison:**
- Reports now include an optional `## Since Last Report` section comparing topics to the previous week
- Auto-generated from existing report files — no LLM call or database required
- Up to 3 bullets per report (Continued topic, New topic, Dropped topic), prioritized by signal

**HTML report polish:**
- Added stable heading IDs (`id="weekly-summary"`, etc.) for deep linking
- Added auto-generated table of contents on reports with 2+ sections
- Added styled report header card with left-border accent
- Added Article Inventory list item styling for better scannability
- Added muted Build Notes metadata panel
- HTML entity escaping for XSS prevention

**Reports index page polish:**
- Card-style report listing with border, rounded corners, and hover effect
- Friendly date formatting ("June 21, 2026") via `toLocaleDateString`
- "Latest report" badge on the newest entry
- Dynamic report count with singular/plural support

**Under the hood:**
- New `src/summarize/report-comparison.ts` module with topic parsing and comparison helpers
- `findPreviousReportPath()` helper for deterministic previous-report discovery
- Both `pnpm summarize` and `pnpm generate-report` support the comparison pipeline
- 114 tests across all modules, 0 failures, typecheck clean

### 0.2.8
Article Inventory is now assembled deterministically from saved article summaries, giving every source a linked title and one-sentence takeaway while reserving model output for trends and implications.

### 0.2.7
Added local provider tuning for LM Studio and other OpenAI-compatible models. Users can now configure max tokens, request timeout, and optional Qwen `/no_think` prompting through environment variables.

### 0.2.6
Fix missing Weekly Summary heading in report output and review check. The review checklist now looks for the h2 heading and falls back to the Article Inventory sub-section. Report assembly guarantees the heading is present even when the model omits it.

### 0.2.5
Cross-article report prompts now include inline Markdown links for source article titles and ask the model to preserve them when referencing specific articles. Release-planning prompts now preserve high-signal roadmap, schedule, proposal, and testing details for trend and developer-impact synthesis.

### 0.2.4
Pinned local tooling to Node.js 22 and pnpm 11 via `.nvmrc`, `packageManager`, `engines`, and npm strictness settings. Quick Start now documents `nvm use` and Corepack setup for contributors and local agents.

### 0.2.3
`pnpm generate-report` command for regenerating the cross-article synthesis and Markdown/HTML reports from existing article summaries. Useful for iterating on report prompts without re-summarizing articles. Shared report assembly logic extracted into `src/summarize/report.ts`.

### 0.2.2
`pnpm review` command for report review checklists. Checks Weekly Summary, source article references, weasel words, Build Notes, What I'm Watching, markdown link validity, and HTML report presence. Exits nonzero only for true blockers.

### 0.2.1
`pnpm doctor` command for setup sanity checks. Reports Node/pnpm versions, .env status, provider config, endpoint reachability, sources, and directory writability. Exits nonzero only for true blockers.

### 0.2.0 — Phase 2 Release

All Phase 2 enhancements together: collection summary with 6 sources (4 Tier 1 + 2 Tier 2), YAML source configuration, HTML reports with self-contained inline styling, GitHub Pages deployment via Actions, and auto-release workflow on tag push. pnpm 11 compatibility verified. No new dependencies.

### 0.1.5
HTML report generation. `pnpm summarize` now produces self-contained HTML reports alongside Markdown. Index page auto-generated in `reports/`. GitHub Pages deployment via GitHub Actions workflow.

### 0.1.4
Source configuration via `sources.yaml`. Users can now customize the source list without editing TypeScript. Copy `sources.example.yaml` to `sources.yaml` and edit. If the file is missing, built-in defaults are used.

### 0.1.3
Tier 2 sources (Gutenberg Times, ACF Chat Fridays) added to the default collection. Collection now prints a clean summary with article counts, filtered counts, and source error reporting.

### 0.1.2

Launch readiness pass. Added the README hero image, updated the launch status, and documented the public share point with the first human-reviewed report.

### 0.1.1

AI summarization pipeline. Per-article content fetching, LLM summarization, cross-article synthesis with article inventory strategy, parallel processing, summary caching, and provider abstraction. Supports Ollama and OpenAI-compatible local endpoints such as LM Studio. Provider configurable via `WP_TREND_PROVIDER`, `WP_TREND_MODEL`, `WP_TREND_OPENAI_BASE_URL`, `WP_TREND_OLLAMA_MODEL`, and `WP_TREND_OLLAMA_URL`.

### 0.1.0

Initial project scaffold. Phase 1 source definitions, RSS collection pipeline, atomic file storage with merge-on-write, and project documentation.
