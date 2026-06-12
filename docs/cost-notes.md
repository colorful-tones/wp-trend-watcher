# Cost Notes

WP Trend Watcher should make AI cost visible.

The target is practical usage, not impressive automation.

## Phase 1 Cost Targets

- Personal usage: less than $1/month.
- Heavier usage: less than $5/month.

These are targets, not guarantees.

## Track Per Run

Each report run should try to record:

- date
- article count
- source count
- provider
- model
- input tokens, if available
- output tokens, if available
- estimated cloud cost
- local model used, if any
- human review time

## Example Build Notes Format

```markdown
## Build Notes

- Articles analyzed: 18
- Sources reviewed: 4
- Provider: local / cloud
- Model: TBD
- Estimated cloud cost: $0.00
- Human review time: 15 minutes
```

## Cost-Saving Principles

- Summarize only articles that pass source/date filters.
- Keep prompts short and specific.
- Store summaries so the same article does not need to be summarized repeatedly.
- Prefer local models when quality is good enough.
- Use cloud models only where they clearly improve output quality.
- Avoid sending full article text repeatedly if a stored summary is sufficient.

## Open Questions

- What token/cost estimator should be used when providers other than Ollama are implemented?
