# Agent Rules for WP Trend Watcher

Rules for AI/coding agents working in this repository.

## Inspect Before Editing

Read a file before editing it. Understand existing patterns, types, and conventions before making changes.

## Keep Phase 1 Simple

Phase 1 ships one human-reviewed weekly WordPress trend report. Do not add automation, dashboards, historical tracking, vector storage, or complex infrastructure until Phase 1 is shipped and proven.

## Package Manager

Use `pnpm` for all dependency management. Do not use `npm` or `yarn`.

## Testing

Create tests only when necessary — test critical paths, pure logic, and validation functions. Do not test thin CLI wrappers, filesystem glue, or LLM calls. Target roughly 60% coverage. Avoid writing tests that lock in implementation details or require heavy mocking.

## Verification

Run both checks before considering work complete:

```bash
pnpm run test
pnpm run typecheck
```

## Docblocks

Add JSDoc docblocks (`/** ... */`) to all new functions, types, and exported interfaces. Existing code without docblocks is legacy — do not add docblocks to code you are not otherwise changing.

## Generated Article Snapshots

Article collection snapshots under `data/articles/YYYY-MM-DD/articles.json` are generated local output. Commit a snapshot only when it directly supports a reviewed or published report. Ad hoc collection runs should stay local.

## README Changelog

User-facing changes must be recorded in the README's Changelog section. Use semantic versioning. Entries are date-free.
