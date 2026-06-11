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

Planned Phase 1 workflow:

```text
collect sources → summarize articles → draft weekly report → human review → publish manually
```

Planned commands:

```bash
pnpm collect
pnpm summarize
```

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

## Project Principles

- Human reviewed.
- Budget conscious.
- Provider agnostic.
- Open source first.
- Simple before clever.

See:

- [Project Philosophy](docs/philosophy.md)
- [Sources](docs/sources.md)
- [Human Review](docs/human-review.md)
- [Cost Notes](docs/cost-notes.md)

## Status

Phase 1 scaffold is in progress.
