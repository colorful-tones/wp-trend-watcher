# Human Review

WP Trend Watcher is human-reviewed by design.

AI can help collect, summarize, and draft. It should not decide what matters without review.

## What AI May Do

- Fetch articles from approved sources.
- Extract article metadata.
- Summarize individual articles.
- Group related topics.
- Draft a weekly report.
- Suggest possible trends.
- Estimate run cost.

## What Humans Must Do

- Check source accuracy.
- Remove weak or unsupported claims.
- Decide which trends matter.
- Add developer implications.
- Add personal observations.
- Approve the final report.
- Decide whether and where to publish.

## Review Checklist

Before publishing a report:

- Every claim should have a source.
- Summaries should match the original articles.
- Trends should explain why developers should care.
- Human-authored sections should be clearly separated.
- Cost and review time should be listed.
- Uncertainty should be stated clearly.

## Local Review Server

The `pnpm weekly` command starts a local review server at http://127.0.0.1:3001/review after running the automated pipeline. The review page displays:

- Automated review checks (Weekly Summary, source references, weasel words, Build Notes, What I'm Watching, markdown links, HTML report presence)
- A rendered preview of the report
- An editable textarea for the "What I'm Watching" section
- A free-form "Review time" field that records how long you spent reviewing and publishing the report

Saving your observations via the review page updates the canonical Markdown report atomically. After the human content is saved, the configured LLM generates the final SEO description from the complete reviewed report, then the matching HTML is regenerated. Press Ctrl-C to stop the server when you're done reviewing. If description generation fails, the human save is retained and can be retried with `pnpm generate-descriptions`.

You can also review the report manually in your editor — the Markdown file at `reports/YYYY-MM-DD.md` is the canonical source of truth. The review server is an optional convenience, not a required step.

## Human-Authored Sections

Each report should include:

### What I'm Watching

A short section with personal observations about what seems important, uncertain, or worth following.

### Build Notes

A transparency section that may include:

- articles analyzed
- sources reviewed
- model/provider used
- estimated cloud cost
- local model used, if any
- human review time (free-form, e.g. "~15 minutes" or "20 minutes review + 5 publishing")
- prompt changes
- workflow issues

## Publishing Rule

Do not publish automatically.

The output of the tool is a draft. The public report is a reviewed artifact.

## Data Snapshot Rule

Treat `data/articles/YYYY-MM-DD/articles.json` files as generated local output unless a snapshot directly supports a reviewed or published report.

If a report cites a specific collection run, commit that snapshot with the report so readers can inspect the source set. Do not commit one-off local test runs.
