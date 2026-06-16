# Sources

This file defines the Phase 1 source list and source-selection rules.

## Phase 1 Source Rules

A source belongs in this project if it:

- publishes WordPress developer-relevant updates
- has an RSS feed or predictable public URL
- produces information that can affect real development decisions
- can be cited in a public report

A source should be excluded if it is mostly:

- marketing
- rumors
- drama
- duplicate commentary
- too broad to be useful
- unsupported claims

## Tier 1 Sources

Phase 1 started with Tier 1 only. As of v0.1.3, Tier 2 sources are included in the default collection.

### WordPress Developer Blog

- URL: <https://developer.wordpress.org/news/>
- Feed: <https://developer.wordpress.org/news/feed/>

Why included:
Developer-facing updates, APIs, block editor guidance, and official educational content.

### Make Core

- URL: <https://make.wordpress.org/core/>
- Feed: <https://make.wordpress.org/core/feed/>

Why included:
Core development activity, release planning, technical proposals, and dev notes.

### WordPress.org News

- URL: <https://wordpress.org/news/>
- Feed: <https://wordpress.org/news/feed/>

Why included:
Official release and ecosystem updates.

### ACF Blog

- URL: <https://www.advancedcustomfields.com/blog/>
- Feed: <https://www.advancedcustomfields.com/blog/feed/>

Why included:
ACF-specific developer workflow updates and modern WordPress implementation patterns.

## Tier 2 Sources

Included in the default collection since v0.1.3. The collector fetches all sources (Tier 1 + Tier 2) by default.

### Gutenberg Times

- URL: <https://gutenbergtimes.com/>
- Feed: <https://gutenbergtimes.com/feed/>

Why included:
Curated Gutenberg ecosystem coverage and community perspective.

### ACF Chat Fridays

- URL: <https://www.advancedcustomfields.com/blog/tag/acf-chat-fridays/>
- Feed: <https://www.advancedcustomfields.com/blog/tag/acf-chat-fridays/feed/>

Why included:
Community discussion and emerging ACF-related topics that may not appear in official docs yet.

## Phase 1 Decision

Phase 1 started with Tier 1 only. Tier 2 sources (Gutenberg Times, ACF Chat Fridays) were added once the core workflow was proven.

## Custom Sources

To customize the source list, copy `sources.example.yaml` to `sources.yaml` and edit. The collector reads from `sources.yaml` if it exists, otherwise uses the built-in defaults.

```bash
cp sources.example.yaml sources.yaml
```

Each source needs:
- `id` — unique identifier
- `name` — display name
- `feedUrl` — RSS feed URL

Optional:
- `url` — homepage URL
- `tier` — 1 or 2 (default 2)
