# Arc

Local RAG workflow studio: compose a retrieval graph, ground answers in sources, and treat evals as the release gate.

## Run

```bash
pnpm install
cp .env.example .env.local
# set OPENAI_API_KEY (required for ingest/chat/evals)
# set COHERE_API_KEY if the workflow's rerank node is enabled
docker compose up -d
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). A **Northstar Handbook** sample workspace is created on first launch. Reindex after Qdrant and OpenAI are up.

## Use

1. Open the sample or create a workspace.
2. **Sources** — PDF, DOCX, MD, TXT, URL, or pasted notes. Reindex after chunk/embed changes.
3. **Workflow** — edit the graph (rewrite → hybrid retrieve → rerank → generate). Save a version and activate it.
4. **Chat** — answers cite chunks. Open the inspector for rewrite/retrieve/rerank.
5. **Evals** — golden questions, run against a workflow version, compare scorecards.
6. **Traces** — every chat/eval path.

Chat and evals share the same LangGraph runner.

## Stack

Next.js, TypeScript, LangGraph, LangChain (OpenAI, Cohere, splitters), Qdrant hybrid (dense + sparse IDF + RRF), SQLite metadata, React Flow.
