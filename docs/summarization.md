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

The provider is selected by environment variables:

| Variable | Default | Description |
|---|---|---|
| `WP_TREND_PROVIDER` | `ollama` | Provider: `ollama` or `openai` (when implemented) |
| `WP_TREND_OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint |
| `WP_TREND_OLLAMA_MODEL` | `llama3.2:3b` | Model tag to use |

Example — use a larger local model:

```bash
WP_TREND_OLLAMA_MODEL=qwen3:14b pnpm summarize
```

Example — point to a remote Ollama instance:

```bash
WP_TREND_OLLAMA_URL=https://ollama.example.com pnpm summarize
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

### Cloud models (future)

When the OpenAI provider is implemented, models like GPT-4o mini (~$0.01/report) will offer near-perfect coverage with no local resource requirements.

## Caching

Per-article summaries are stored in `data/articles/YYYY-MM-DD/summaries.json`. On subsequent runs, articles already in the cache are skipped. Only new articles (from a fresh `pnpm collect` run) trigger additional LLM calls.

The cross-article synthesis always re-runs — it's cheap (~1,000 tokens) and benefits from seeing all cached + new summaries together.

To force re-summarization of all articles, delete the summaries.json file:

```bash
rm data/articles/YYYY-MM-DD/summaries.json
pnpm summarize
```
