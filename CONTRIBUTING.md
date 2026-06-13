# Contributing

WP Trend Watcher is a lightweight, human-reviewed workflow. Contributions that keep things simple and useful are welcome.

## Philosophy Check

Before contributing, read [docs/philosophy.md](docs/philosophy.md). Phase 1 avoids:

- Vector databases, embeddings, knowledge graphs
- Agent swarms or autonomous publishing
- UI dashboards
- Historical trend engines
- Complex infrastructure

If a change requires any of the above, it probably belongs in a later phase.

## What's Useful Right Now

| Area | Examples |
|------|----------|
| Sources | New RSS feeds that meet the [source rules](docs/sources.md) |
| Prompts | Improvements to summarization or synthesis prompts that produce better reports |
| Providers | Additional AI provider implementations (OpenAI, Anthropic, Gemini) |
| Docs | Clarifications, setup guides, macOS/Windows/Linux notes |
| Bug fixes | Anything broken in `pnpm collect` or `pnpm summarize` |

## Setup

```bash
git clone https://github.com/colorful-tones/wp-trend-watcher.git
cd wp-trend-watcher
pnpm install
cp .env.example .env  # edit as needed
```

You need:

- Node.js 18+
- pnpm 9+
- Ollama (optional — `pnpm collect` works without it)

## Before Submitting

```bash
pnpm run test
pnpm run typecheck
```

Both must pass. The repo uses conventional commits (`feat:`, `fix:`, `docs:`, etc.).

## Adding a Source

1. Add the source to `src/sources.ts` following the `Source` type
2. Add it to `docs/sources.md` with URL, feed URL, and rationale
3. Run `pnpm collect` to verify the feed resolves

Sources must:

- Publish WordPress developer-relevant updates
- Have a working RSS feed
- Not be primarily marketing, rumors, or drama

## Improving Prompts

The summarization and synthesis prompts live in `src/summarize/index.ts` as `ARTICLE_SYSTEM_PROMPT` and `REPORT_SYSTEM_PROMPT`.

When proposing prompt changes:

- Run `pnpm summarize` before and after
- Include the before/after reports in your PR description
- Note which model you tested with
- Smaller, targeted changes are easier to review than rewrites

## Adding a Provider

1. Implement the `AiProvider` interface from `src/providers.ts`
2. Add a factory case in `getProvider()`
3. Document the new provider in `docs/summarization.md`
4. Add relevant env vars to `.env.example`

## Commit Convention

```
feat: description of new feature
fix: description of bug fix
docs: description of documentation change
chore: maintenance, dependencies, config
```

## Review Expectations

This is a human-reviewed project. All AI-assisted changes should be disclosed in the PR description (model used, what it generated vs what you edited).

PRs that change report output should include a sample report run.
