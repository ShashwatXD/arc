# Arc — interview briefing

**Pitch (30s).** Most RAG demos are a chat box on PDFs. Arc is a local RAG workflow studio: compose a retrieval graph, ground every answer in citations, and treat evals as the release gate. Chat and evals share one LangGraph runner.

**Problem.** RAG assistants fail quietly. Retrieval is a black box, prompts ship on vibe, and fluent hallucinations look like features. There is no proof a pipeline change helped.

**One line.** Compose. Ground. Prove.

---

## What it is

| Surface | What you show |
| --- | --- |
| Sources | PDF / DOCX / MD / TXT / URL / notes → chunk → dual-index in Qdrant |
| Workflow | React Flow graph we own; LangGraph executes it |
| Chat | Streaming answers with clickable `[n]` citations + retrieval inspector |
| Evals | Golden set, faithfulness / relevancy / citation precision, version compare |
| Traces | rewrite → retrieve → rerank → generate on every run |

Not n8n. Not multi-agent. Not auth SaaS.

---

## How a question runs

```
question → rewrite → dense + sparse (parallel) → RRF fuse → Cohere rerank → generate with citations
```

**Retrieve (wide net).** Embed the query. Qdrant prefetches dense (cosine / meaning) and sparse (tokens + IDF / exact words), then reciprocal rank fusion. A chunk strong in both lists beats #1 in only one.

**Rerank (quality gate).** Cross-encoder reads query + chunk together, keeps top N. Cheap retrieve, expensive rerank. If the rerank node is on and there is no Cohere key, the run fails.

**Generate.** The model only sees surviving chunks, numbered `[1]…[n]`. Cite or say you don't know.

**Ingest.** Split → OpenAI embed + sparse term vector → Qdrant. SQLite is metadata only.

---

## Architecture to say out loud

Hexagonal: `domain` (DAG + ports) → `application` (ingest, evals) → `adapters` (LangGraph, Qdrant, ChatOpenAI, Cohere).

The product owns the graph. SDKs execute it. Same `WorkflowRunnerPort` for chat and evals.

| Choice | Why |
| --- | --- |
| LangGraph JS | Production orchestration |
| LangChain OpenAI / Cohere / splitters | Official SDKs, not hand-rolled HTTP |
| Qdrant hybrid | Real ANN + sparse IDF + RRF |
| Own DAG + Zod | Not a LangFlow wrapper |

---

## Key learnings

1. **Own the graph, not the math.** LlamaIndex.TS is deprecated; in-process cosine is a demo.
2. **Hybrid retrieve ≠ rerank.** Dense = paraphrase. Sparse = IDs. Rerank = joint relevance.
3. **Same path for playground and evals.** A second demo prompt makes metrics theater.
4. **Fail loud.** Silent fallbacks look like they work.
5. **Ports let you swap infra.** SQLite cosine → Qdrant without rewriting the product.

---

## They will ask

**Why not ChatGPT + a PDF?** No retrieval control, no auditable citations, no eval regression.

**Why hybrid if you have embeddings?** Embeddings miss rare tokens (`SEV-1`, `$50`). Sparse IDF keeps them.

**Why rerank after retrieve?** You cannot cross-encode the corpus. Retrieve 12, rerank 4–6.

**Why LangGraph if you own the DAG?** We own semantics; LangGraph is the runtime.

**How do you know a change helped?** Same golden set, two versions, three metrics.

**What's next?** Qdrant Cloud, LangSmith, parent-document retrieval, a real BM25 tokenizer.

---

## 5-minute demo

1. Northstar Handbook — policy corpus, where RAG usually lies.
2. Sources / chunks — split, embed, dual-index.
3. Workflow canvas — Fast vs Precise is config, not a rewrite.
4. Chat: “How many PTO days?” — citations + inspector.
5. Trick: “full refund after 20 days?” — should refuse.
6. Evals — same runner, scorecard is the argument.
