# Adding Sources

This guide helps contributors add new RSS sources to WP Trend Watcher. It covers what makes a good source, what to avoid, and the exact steps to submit a change.

For the full source list and formal criteria, see [sources.md](./sources.md).

## Quick start

1. Open a [source suggestion issue](https://github.com/colorful-tones/wp-trend-watcher/issues/new?template=source-suggestion.yml) to discuss before submitting code.
2. Copy `sources.example.yaml` to `sources.yaml` at the project root.
3. Add your source entry (see [YAML structure](#yaml-structure) below).
4. Run `pnpm collect` to verify the feed fetches successfully.
5. Open a PR with the changes.

If you'd rather not edit code, just open the issue. Maintainers can add confirmed sources directly.

## Source selection criteria

A source belongs in this project when it:

- Publishes WordPress developer-relevant updates
- Has an RSS feed or predictable public URL
- Produces information that can affect real development decisions
- Can be cited in a public report

## Good source examples

These are the kinds of sources that belong in the project, with explanations of why they work.

### Official WordPress sources

| Source | Feed | Why it works |
|--------|------|--------------|
| [WordPress Developer Blog](https://developer.wordpress.org/news/) | `https://developer.wordpress.org/news/feed/` | Official developer-facing updates on APIs, block editor guidance, and educational content. Directly impacts how developers write code. |
| [Make Core](https://make.wordpress.org/core/) | `https://make.wordpress.org/core/feed/` | Core development activity, release planning, technical proposals, and dev notes. Where WordPress direction is decided. |
| [WordPress.org News](https://wordpress.org/news/) | `https://wordpress.org/news/feed/` | Official release announcements and ecosystem-wide updates. Every WordPress developer needs to know about major releases. |

### Established community publications

| Source | Feed | Why it works |
|--------|------|--------------|
| [Gutenberg Times](https://gutenbergtimes.com/) | `https://gutenbergtimes.com/feed/` | Curated Gutenberg ecosystem coverage with consistent community perspective. Fills gaps between official announcements and developer adoption. |
| [ACF Blog](https://www.advancedcustomfields.com/blog/) | `https://www.advancedcustomfields.com/blog/feed/` | ACF-specific developer workflow updates and modern WordPress implementation patterns. Valuable for the large ACF user base. |

### Plugin/theme developer blogs

When evaluating a plugin or theme developer blog, ask: does this publish original technical content that helps WordPress developers make decisions? Strong candidates:

- Post authoring guides, architecture deep-dives, or performance case studies
- Cover block editor, full site editing, or custom field patterns
- Publish on a consistent schedule (at least monthly)

**Example of a strong candidate:** A page builder plugin that publishes regular posts about block patterns, accessibility improvements, and migration guides. The content directly helps developers using that plugin (and similar ones) make informed choices.

**Example of a weak candidate:** A plugin blog that only publishes changelogs, "we just released version X" announcements, or feature marketing. These don't help developers reason about trends or make decisions.

## Bad source examples

These are the kinds of sources that should be excluded, with explanations of why.

### Marketing-heavy sites

Hosting company blogs, agency blogs pushing managed services, or any site where the primary content is "hire us" or "use our hosting." Even when they publish occasional technical content, the signal-to-noise ratio is too low for trend detection.

**Example:** A managed WordPress host that publishes 10 posts/month — 8 about their new features, 1 about pricing, and 1 technical post. The one technical post gets drowned out.

### Rumor and speculation sites

Sites that publish unconfirmed reports, "WordPress might do X" posts, or clickbait predictions. These don't help developers make real decisions because the information isn't reliable.

**Example:** A blog post titled "WordPress 7.0 Could Change Everything" based on a single tweet from a contributor. No linked proposals, no trac tickets, no RFC.

### Drama and commentary sites

Sites whose primary content is opinion, controversy, or personality-driven commentary about the WordPress ecosystem. Even if popular, they don't produce citable technical information.

**Example:** A blog that mostly publishes "WordPress drama of the week" posts or hot takes about corporate decisions. Entertaining but not actionable for developers.

### Duplicate and aggregator sites

Sites that rewrite or aggregate content from official sources without adding original reporting. If all the information is already available from the original source, the aggregator adds noise without value.

**Example:** A site that republishes Make Core dev notes with a different headline and no additional analysis. The original Make Core post is already in the source list.

### Too-broad tech sites

General technology publications that sometimes cover WordPress but aren't focused on it. The WordPress signal gets lost among JavaScript framework posts, AI announcements, and general tech news.

**Example:** A major tech news outlet that publishes one WordPress post per quarter among hundreds of other topics. Not enough WordPress signal to be useful for trend detection.

## YAML structure

Each source entry needs three required fields and supports two optional fields:

```yaml
sources:
  - id: my-source-name          # Required. Unique kebab-case identifier.
    name: My Source Name         # Required. Human-readable display name.
    feedUrl: https://.../feed/   # Required. RSS or Atom feed URL.
    url: https://example.com/    # Optional. Homepage URL (helps with context).
    tier: 2                      # Optional. 1 = official/primary, 2 = community (default).
```

### Field reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier. Use kebab-case (e.g., `make-core`, `gutenberg-times`). Must not duplicate an existing source ID. |
| `name` | Yes | Display name as it should appear in reports. |
| `feedUrl` | Yes | The RSS or Atom feed URL. Verify it works before submitting. |
| `url` | No | Homepage URL. Useful for context but not used by the collector. |
| `tier` | No | `1` for official/primary sources, `2` for community sources. Defaults to `2`. |

### How custom sources.yaml works

The collection script checks for `sources.yaml` at the project root:

- **File exists and has valid sources:** Custom sources replace the built-in defaults entirely.
- **File missing:** Built-in defaults from `src/sources.ts` are used.
- **File exists but is empty or invalid:** Falls back to built-in defaults with a warning.

This means if you create `sources.yaml`, it should include the standard sources you want plus your additions — it does not merge with defaults.

## Verifying your source

Before opening a PR, run the collector to confirm the feed works:

```bash
pnpm collect
```

The command will:
1. Fetch all configured sources (built-in or custom).
2. Save articles to `data/articles/`.
3. Print a summary of fetched articles.

If your source produces an error, check:
- The `feedUrl` is correct and publicly accessible
- The feed is valid RSS or Atom (open it in a browser to check)
- The site doesn't block automated requests (some sites return 403 for non-browser User-Agents)

## Submitting a source suggestion

### Option 1: Issue only

Open a [source suggestion issue](https://github.com/colorful-tones/wp-trend-watcher/issues/new?template=source-suggestion.yml) with:
- Source name
- Homepage URL
- RSS feed URL
- Rationale for why it belongs

A maintainer will review and add it if it fits.

### Option 2: PR with sources.yaml

1. Fork and create a branch (e.g., `add-my-source`).
2. Add your source to `sources.yaml` at the project root.
3. Run `pnpm collect` to verify.
4. Open a PR referencing the source suggestion issue (if one exists).

## Tier guidance

| Tier | Meaning | Examples |
|------|---------|----------|
| **Tier 1** | Official or primary sources. Authoritative, high-signal, first-party. | WordPress.org blogs, Make blogs, official plugin/theme company blogs. |
| **Tier 2** | Community-curated sources. Consistent developer value, well-edited, opinionated but grounded. | Gutenberg Times, community newsletters, conference blogs. |

When in doubt, default to Tier 2. Maintainers can promote sources to Tier 1 after observing consistent quality over time.

## Related resources

- [Source selection criteria (full)](./sources.md)
- [Source example config](../sources.example.yaml)
- [Source suggestion issue template](https://github.com/colorful-tones/wp-trend-watcher/issues/new?template=source-suggestion.yml)
