# WP Trend Watcher

WP Trend Watcher is a lightweight, open-source workflow for helping WordPress developers stay informed about changes in the WordPress ecosystem through AI-assisted, human-reviewed analysis.

The goal is not to automate opinions, replace expertise, or publish without review.

The goal is to collect useful WordPress ecosystem updates, summarize them efficiently, review them with human judgment, and produce a weekly report that developers can actually use.

## Phase 1 Goal

Ship one human-reviewed weekly WordPress trend report.

Phase 1 should prove the workflow before adding automation, dashboards, historical trend tracking, or complex storage.

## Intended Audience

Freelance and agency WordPress developers who want to stay current without reading every Make post, Developer Blog update, and ecosystem article.

## What This Does

Phase 1 workflow (working):

```bash
pnpm collect    # Fetch RSS feeds from Tier 1 sources, store articles as JSON
pnpm summarize  # Fetch article content, generate per-article summaries, synthesize weekly report
```

See [Summarization](docs/summarization.md) for provider configuration, model options, and synthesis strategy.

## What This Does Not Do Yet

- No autonomous publishing.
- No vector database.
- No embeddings.
- No agent swarms.
- No UI/dashboard.
- No historical trend engine.
- No custom source registry.

## Report Format

Each weekly report should include:

- Weekly Summary
- Emerging Trends
- Developer Implications
- What I'm Watching
- Build Notes

Build Notes should include article count, sources reviewed, model/provider, estimated cost, and human review time.

## Data Snapshot Policy

Article collection snapshots under `data/articles/YYYY-MM-DD/articles.json` are generated local output by default.

Commit a snapshot only when it directly supports a reviewed or published report. Ad hoc collection runs should stay local, even when they help test the workflow.

## Project Principles

- Human reviewed.
- Budget conscious.
- Provider agnostic.
- Open source first.
- Simple before clever.

See:

- [Project Philosophy](docs/philosophy.md)
- [Sources](docs/sources.md)
- [Summarization](docs/summarization.md)
- [Human Review](docs/human-review.md)
- [Cost Notes](docs/cost-notes.md)

## Status

Phase 1 scaffold is in progress.

## Changelog

### 0.1.1

AI summarization pipeline. Per-article content fetching, LLM summarization, cross-article synthesis with article inventory strategy, parallel processing, summary caching, and provider abstraction. Defaults to Ollama local (llama3.2:3b, $0/run). Provider configurable via `WP_TREND_PROVIDER`, `WP_TREND_OLLAMA_MODEL`, and `WP_TREND_OLLAMA_URL`.

### 0.1.0

Initial project scaffold. Phase 1 source definitions, RSS collection pipeline, atomic file storage with merge-on-write, and project documentation.
