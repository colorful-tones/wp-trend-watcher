# Weekly Report Workflow

The sequence of commands to go from zero to a published weekly report.

## Prerequisites

- [Requirements](../README.md#requirements) met (Node 22, pnpm 11, Corepack, LLM provider)
- `.env` configured with your provider settings (see [Summarization](summarization.md))
- `sources.yaml` in place (copy from `sources.example.yaml` if you haven't yet)

## The Sequence

### 1. Doctor Check

```bash
pnpm doctor
```

Verifies Node/pnpm versions, `.env` presence, provider config, endpoint reachability, source count, and directory writability. Exits nonzero only for real blockers. Run this before your first summarization, or anytime after changing providers.

### 2. Collect Articles

```bash
pnpm collect -- --days 7
```

Fetches RSS feeds from all configured sources (6 by default: 4 Tier 1 + 2 Tier 2). Filters to articles published in the last 7 days, deduplicates, and writes `data/articles/YYYY-MM-DD/articles.json`.

- Omit `-- --days 7` to collect everything (no date filter).
- Adjust the number for a different window (`-- --days 3`, `-- --days 14`).

### 3. Summarize

```bash
pnpm summarize
```

The heavy step. Fetches each article's content, generates per-article summaries via your LLM, runs cross-article synthesis for trends and implications, assembles the full report, and builds the HTML + reports index page. Output lands in `reports/YYYY-MM-DD.md` and `reports/YYYY-MM-DD.html`.

- Requires your LLM provider to be running.
- First run is slowest (every article is new). Subsequent runs within the same week only summarize new articles — cached summaries from `data/articles/YYYY-MM-DD/summaries.json` are reused.
- Provider/model are controlled by `.env` variables. See [Summarization](summarization.md) for the full table.

### 4. Review

```bash
pnpm review
```

Runs the automated review checklist against the latest report. Checks: Weekly Summary presence, source article references, weasel words, Build Notes completeness, What I'm Watching content, markdown link validity, and HTML report presence. Exits nonzero only for true blockers.

### 5. Human Review

Open `reports/YYYY-MM-DD.md` and:

- Check source accuracy — do summaries match the original articles?
- Remove weak or unsupported claims.
- Decide which trends actually matter.
- Fill in the `What I'm Watching` section with personal observations.
- Add any missing developer implications.
- Update Build Notes with review time.

See [Human Review](human-review.md) for the full checklist.

### 6. Regenerate (if needed)

```bash
pnpm generate-report
```

If you edited the report Markdown and want to rebuild the HTML, or if you want to re-run the cross-article synthesis step without re-summarizing articles, run this. It uses saved article summaries from `summaries.json` and skips content fetching and per-article LLM calls.

### 7. Index Page (if needed)

```bash
pnpm index-page
```

Regenerates `reports/index.html` independently. Normally `pnpm summarize` already does this, but use this when you've added or removed report files manually.

## Quick Reference

| Step | Command | Requires LLM? | Idempotent? |
|---|---|---|---|
| Doctor | `pnpm doctor` | No | Yes |
| Collect | `pnpm collect -- --days 7` | No | Yes (merges) |
| Summarize | `pnpm summarize` | Yes | Yes (cached) |
| Review | `pnpm review` | No | Yes |
| Regenerate | `pnpm generate-report` | Yes | Yes |
| Index | `pnpm index-page` | No | Yes |

## Typical Session

```bash
pnpm doctor
pnpm collect -- --days 7
pnpm summarize
pnpm review
# … human review and edits …
pnpm generate-report   # rebuild HTML after edits
```

If the summarization step fails (timeout, model error), fix the issue and just re-run `pnpm summarize`. Cached summaries are preserved — only new articles trigger LLM calls.
