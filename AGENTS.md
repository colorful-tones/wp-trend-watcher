# Agent Rules for WP Trend Watcher

Rules for AI/coding agents working in this repository.

## Inspect Before Editing

Read a file before editing it. Understand existing patterns, types, and conventions before making changes.

## Project Direction

WP Trend Watcher is in Phase 3. The current goal is to keep the weekly WordPress trend-report workflow boring, local-first, reviewable, and easy for other people to run.

Do not add dashboards, autonomous publishing, scheduled/social automation, embeddings, vector storage, complex plugin systems, or a database unless explicitly directed. Preserve file-based storage and the small TypeScript pipeline. Prefer improvements that make provider setup, source management, diagnostics, review, reporting, and release polish clearer without changing the core workflow.

The package is currently `0.2.8`. Expected scripts include `collect`, `summarize`, `generate-report`, `index-page`, `doctor`, `review`, `test`, and `typecheck`.

## Package Manager

Use `pnpm` for all dependency management. Do not use `npm` or `yarn`.

Use `nvm use` from the repository root to select the Node.js version pinned in `.nvmrc`, then rely on Corepack to provide the `pnpm` version pinned by `packageManager` in `package.json`.

## Baseline Code Standards

- Use strict TypeScript and native ESM patterns consistent with the existing codebase.
- Keep CLI entrypoints thin. Put reusable logic in importable modules.
- Prefer small pure functions for parsing, validation, report assembly, provider configuration, request-shape construction, source handling, and storage merging/deduplication.
- Avoid global state except at environment/CLI boundaries.
- Load `.env` through the existing helper instead of adding duplicate dotenv/config logic.
- Never put secrets in source, reports, tests, fixtures, docs, logs, or generated output.
- Avoid new dependencies unless they clearly reduce complexity or remove brittle custom code.
- Preserve local file-based storage. Do not introduce a database or service dependency unless explicitly directed.

## CLI Standards

- CLI commands should validate inputs, print actionable messages, and fail with clear non-zero exits for real errors.
- Keep network or model calls behind explicit commands. Do not make diagnostics, review, or report formatting unexpectedly run expensive summarization.
- Prefer dry, deterministic checks for `doctor` and `review`; call live endpoints only when the command's documented behavior requires it.
- Keep provider-specific logic isolated so Ollama and OpenAI-compatible local servers can evolve without spreading conditionals through the app.

## Report and Data Output Standards

- Reports should remain human-reviewable Markdown plus generated HTML.
- Preserve source references and links in summaries so claims can be traced back to collected articles.
- Build notes should continue to expose relevant provider/model/cost metadata without leaking secrets.
- Generated article snapshots under `data/articles/YYYY-MM-DD/articles.json` are generated local output. Commit a snapshot only when it directly supports a reviewed or published report. Ad hoc collection runs should stay local.
- Keep generated output deterministic where practical so diffs are meaningful.

## Testing

Create tests for critical paths, pure logic, and validation functions. Useful targets include:

- provider config parsing and request-shape logic.
- source loading, fallback behavior, and validation.
- report assembly, Markdown/HTML generation, and source references.
- `review` and `doctor` checks.
- storage merge and deduplication behavior.

Do not test thin CLI wrappers, live RSS feeds, live LLM calls, GitHub Pages deployment, or implementation details that would make refactors noisy. Avoid heavy mocking. Target roughly 60% coverage where coverage is measured.

## Verification

Run both checks before considering work complete:

```bash
pnpm run test
pnpm run typecheck
```

When touching a CLI feature, also run the relevant smoke test, such as `pnpm run doctor` or `pnpm run review`.

Do not run summarization against a live model unless the task specifically requires it. If `pnpm` is unavailable in the active shell, fix the shell setup with `nvm use` and Corepack instead of using another package manager.

## Docblocks

Add JSDoc docblocks (`/** ... */`) to all new functions, types, and exported interfaces. Existing code without docblocks is legacy — do not add docblocks to code you are not otherwise changing.

## Documentation

User-facing changes must be recorded in the README's Changelog section. Use semantic versioning. Entries are date-free.

Update README/docs when provider behavior, source configuration, review checks, doctor checks, report output, cost/build-note behavior, or weekly workflow expectations change.
