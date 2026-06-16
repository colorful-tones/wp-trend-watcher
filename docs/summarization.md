# Summarization

How `pnpm summarize` turns collected articles into a draft report.

## Pipeline

1. **Content fetch** — each article URL is fetched and HTML extracted to plain text
2. **Per-article summarization** — the LLM produces a 2-3 sentence summary of each article
3. **Article inventory** — summaries are distilled to one-sentence takeaways and formatted as a numbered checklist
4. **Cross-article synthesis** — the LLM generates the Weekly Summary, Emerging Trends, and Developer Implications sections from the inventory
5. **Report assembly** — the synthesis output is combined with source links, Build Notes, and placeholder sections for human review

## Synthesis Strategy

The synthesis step uses an **article inventory** approach. Instead of feeding full summaries to the LLM and hoping it covers everything, each article is presented as a numbered checklist item. The prompt explicitly demands every item appear in the Weekly Summary.

This strategy is designed for small local models (3B parameters) that struggle to track every article without structural prompting. With larger models (7B+), the inventory constraint matters less but still helps.

## Provider Configuration

The CLI automatically loads `.env` from the project root if the file exists. Environment variables already exported in your shell take precedence.

The provider is selected by environment variables:

| Variable | Default | Description |
|---|---|---|
| `WP_TREND_PROVIDER` | `ollama` | Provider: `openai-compatible` (LM Studio/local OpenAI-compatible servers) or `ollama` |
| `WP_TREND_OPENAI_BASE_URL` | `http://localhost:1234/v1` | OpenAI-compatible API base URL, without `/chat/completions` |
| `WP_TREND_MODEL` | `local-model` | Model name for OpenAI-compatible providers; also works as the Ollama model fallback |
| `WP_TREND_API_KEY` | unset | Optional bearer token for OpenAI-compatible endpoints that require one; leave blank for LM Studio |
| `WP_TREND_OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint |
| `WP_TREND_OLLAMA_MODEL` | `llama3.2:3b` | Ollama model tag; overrides `WP_TREND_MODEL` for Ollama |

Example — LM Studio or another local OpenAI-compatible server:

```bash
WP_TREND_PROVIDER=openai-compatible \
WP_TREND_OPENAI_BASE_URL=http://localhost:1234/v1 \
WP_TREND_MODEL="your-loaded-model" \
pnpm summarize
```

Example — Ollama with a larger local model:

```bash
WP_TREND_PROVIDER=ollama WP_TREND_OLLAMA_MODEL=qwen3:14b pnpm summarize
```

Example — point to a remote OpenAI-compatible endpoint:

```bash
WP_TREND_PROVIDER=openai-compatible \
WP_TREND_OPENAI_BASE_URL=https://api.example.com/v1 \
WP_TREND_API_KEY=your-token \
WP_TREND_MODEL=your-model \
pnpm summarize
```

## Model Tradeoffs

### llama3.2:3b (default)

- **Cost:** $0 (local)
- **Size:** ~2 GB
- **Coverage:** Typically covers 4-5 of 7 articles in synthesis
- **Best for:** Minimum-resource setups, CI pipelines, quick draft generation

### llama3.2 / llama3.1:8b

- **Cost:** $0 (local)
- **Size:** ~5 GB
- **Coverage:** Typically covers 5-7 of 7 articles
- **Best for:** Daily use, higher quality summaries without cloud cost

### qwen3:14b / similar

- **Cost:** $0 (local)
- **Size:** ~9 GB
- **Coverage:** Consistent 7/7 with better nuance
- **Best for:** Final report generation before human review

### OpenAI-compatible models

LM Studio and other OpenAI-compatible chat completions endpoints let you use whatever local or remote model that server exposes. Local endpoints are usually $0/run; remote endpoint costs depend on the provider.

## Caching

Per-article summaries are stored in `data/articles/YYYY-MM-DD/summaries.json`. On subsequent runs, articles already in the cache are skipped. Only new articles (from a fresh `pnpm collect` run) trigger additional LLM calls.

The cross-article synthesis always re-runs — it's cheap (~1,000 tokens) and benefits from seeing all cached + new summaries together.

To force re-summarization of all articles, delete the summaries.json file:

```bash
rm data/articles/YYYY-MM-DD/summaries.json
pnpm summarize
```
