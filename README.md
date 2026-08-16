# Arc

Local knowledge studio. You compose a retrieval **graph**, run a question on it, and watch each node fire. Answers cite sources. Evals use the same runner as chat.

The canvas is the runtime — not a config panel in front of a hidden linear chain.

## Run

```bash
pnpm install
cp .env.example .env.local   # optional; Keys in the UI also works
docker compose up -d         # Qdrant on http://127.0.0.1:6333
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) → **Keys** → one OpenAI-compatible chat key (OpenAI, OpenRouter, Groq, Together, Ollama, or any `/v1` endpoint).

A **Northstar Handbook** sample workspace is created on first launch. **Reindex** after Qdrant is up so chunks land in the vector store.

## Use

1. **Keys** — one chat key covers rewrite, route, grade, rerank, generate, and embeddings (if “same as chat” is on). Groq cannot embed; then set a separate embed endpoint.
2. **Sources** — PDF, DOCX, MD, TXT, URL, or notes. Reindex after chunk/embed changes.
3. **Run** — ask at the bottom of the graph. Nodes show `ok` / `skip` / ms. Add **route**, extra **retrieve**, **merge**, **grade**. Templates: Fast, Balanced, Precise, Router.
4. **Threads** — longer chats. Same runner.
5. **Evals** — golden set, faithfulness / relevancy / citation precision, version compare.
6. **Traces** — every hop.

Index nodes (sources / chunk / embed) run on Reindex only. Query nodes follow canvas edges (parallel retrieves in one wave).

## How a question runs

**Balanced:** rewrite → Qdrant hybrid (dense + sparse + RRF) → listwise rerank (same chat model) → generate with `[n]` citations.

**Router:** route the question → retrieve policies *or* engineering *or* all → merge → generate. Skipped branches are visible on the canvas.

Rerank is **not Cohere**. The chat model returns `{"order":[…]}` over the shortlist. Fast has no rerank node.

## Data

| Store | What | Where |
| --- | --- | --- |
| SQLite `data/arc.db` | Workspaces, graphs, chats, evals | This machine (gitignored) |
| `data/settings.json` | Keys from the UI | This machine (gitignored) |
| Qdrant | Chunk vectors | Docker at `127.0.0.1:6333`, no API key |
| Chat API | Embed / rerank / generate text | Your provider |

There is no Arc-hosted database. To use Qdrant Cloud, set `QDRANT_URL` and `QDRANT_API_KEY` in Keys. Serverless deploys wipe `data/` unless you add a hosted DB — that is not wired yet.

## Stack

Next.js, TypeScript, React Flow, LangChain OpenAI + splitters, Qdrant hybrid (dense + sparse IDF + RRF), SQLite (Drizzle + libsql).

## Interview notes

See [INTERVIEW.md](./INTERVIEW.md) for pitch, diagrams-in-prose, and a 5-minute demo script.
