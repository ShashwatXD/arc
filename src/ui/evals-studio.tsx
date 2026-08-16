"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, EmptyState } from "./badge";
import { Button } from "./button";
import { Input, Textarea } from "./fields";
import { scoreColor } from "@/lib/cn";
import type { EvalMetrics, EvalResult, EvalRun } from "@/domain/models";

type Dataset = {
  id: string;
  name: string;
  items: { id: string; question: string; expectedAnswer: string }[];
};

type Workflow = { id: string; name: string; isActive: boolean };

export function EvalsStudio({ workspaceId }: { workspaceId: string }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [datasetId, setDatasetId] = useState<string>("");
  const [workflowId, setWorkflowId] = useState<string>("");
  const [compareId, setCompareId] = useState<string>("");
  const [results, setResults] = useState<EvalResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ question: string; expectedAnswer: string }[]>([
    { question: "", expectedAnswer: "" },
  ]);

  async function load() {
    const [evalRes, wfRes] = await Promise.all([
      fetch(`/api/workspaces/${workspaceId}/evals`),
      fetch(`/api/workspaces/${workspaceId}/workflows`),
    ]);
    const evalData = await evalRes.json();
    const wfData = await wfRes.json();
    setDatasets(evalData.datasets ?? []);
    setRuns(evalData.runs ?? []);
    setWorkflows(wfData.workflows ?? []);
    const first = (evalData.datasets ?? [])[0];
    if (first) {
      setDatasetId(first.id);
      setDraft(
        first.items.length
          ? first.items.map((i: Dataset["items"][number]) => ({
              question: i.question,
              expectedAnswer: i.expectedAnswer,
            }))
          : [{ question: "", expectedAnswer: "" }],
      );
    }
    const active = (wfData.workflows ?? []).find((w: Workflow) => w.isActive);
    if (active) setWorkflowId(active.id);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [workspaceId]);

  const selected = datasets.find((d) => d.id === datasetId);

  function pickDataset(id: string) {
    setDatasetId(id);
    const ds = datasets.find((d) => d.id === id);
    setDraft(
      ds?.items.length
        ? ds.items.map((i) => ({ question: i.question, expectedAnswer: i.expectedAnswer }))
        : [{ question: "", expectedAnswer: "" }],
    );
  }

  async function saveItems() {
    if (!datasetId) return;
    setBusy(true);
    const res = await fetch(`/api/workspaces/${workspaceId}/evals/${datasetId}/items`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: draft }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    await load();
    setBusy(false);
  }

  async function run() {
    if (!datasetId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/evals/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ datasetId, workflowId: workflowId || undefined }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else {
      setResults(data.results ?? []);
      await load();
    }
    setBusy(false);
  }

  async function openRun(id: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/evals/runs/${id}`);
    const data = await res.json();
    setResults(data.results ?? []);
  }

  const compareRun = runs.find((r) => r.id === compareId);
  const latest = runs[0];

  const compare = useMemo(() => {
    if (!compareRun?.metrics || !latest?.metrics) return null;
    return {
      faithfulness: latest.metrics.faithfulness - compareRun.metrics.faithfulness,
      relevancy: latest.metrics.relevancy - compareRun.metrics.relevancy,
      citationPrecision: latest.metrics.citationPrecision - compareRun.metrics.citationPrecision,
    };
  }, [compareRun, latest]);

  return (
    <div className="grid h-[calc(100vh-56px)] grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="overflow-y-auto p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-medium">Evals</h1>
            <p className="text-sm text-muted">
              Golden questions run through the same workflow as chat. A change is only better if the scorecard moves.
            </p>
          </div>
          <div className="flex gap-2">
            <select
              className="rounded-lg border border-line bg-bg-sunken px-2 py-2 text-sm"
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
            >
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <Button onClick={run} disabled={busy || !datasetId}>
              {busy ? "Running…" : "Run evals"}
            </Button>
          </div>
        </div>
        {error ? <p className="mb-4 text-sm text-bad">{error}</p> : null}
        {latest?.metrics ? <Scorecard metrics={latest.metrics} label={`${latest.workflowName} · latest`} /> : null}
        {compare ? (
          <div className="mt-3 text-sm text-muted">
            vs compared run: faith {delta(compare.faithfulness)} · rel {delta(compare.relevancy)} · cite{" "}
            {delta(compare.citationPrecision)}
          </div>
        ) : null}
        <div className="mt-8 space-y-3">
          {results.length === 0 ? (
            <EmptyState
              title="No run selected"
              body="Save the golden set, then run evals. Open a past run to inspect failures and traces."
            />
          ) : (
            results.map((r) => (
              <div key={r.id} className="rounded-2xl border border-line bg-bg-elev p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">{r.question}</div>
                  <Badge tone={r.passed ? "good" : "bad"}>{r.passed ? "pass" : "fail"}</Badge>
                </div>
                <div className="mt-2 flex gap-3 font-mono text-[11px]">
                  <span className={scoreColor(r.scores.faithfulness)}>faith {r.scores.faithfulness.toFixed(2)}</span>
                  <span className={scoreColor(r.scores.relevancy)}>rel {r.scores.relevancy.toFixed(2)}</span>
                  <span className={scoreColor(r.scores.citationPrecision)}>cite {r.scores.citationPrecision.toFixed(2)}</span>
                </div>
                <p className="mt-3 text-sm text-muted">Expected: {r.expectedAnswer}</p>
                <p className="mt-2 text-sm">{r.answer}</p>
              </div>
            ))
          )}
        </div>
      </div>
      <aside className="overflow-y-auto border-l border-line p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">Golden set</div>
          <select
            className="rounded-lg border border-line bg-bg-sunken px-2 py-1 text-sm"
            value={datasetId}
            onChange={(e) => pickDataset(e.target.value)}
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        {draft.map((row, i) => (
          <div key={i} className="mb-3 space-y-1">
            <Input
              placeholder="Question"
              value={row.question}
              onChange={(e) =>
                setDraft((d) => d.map((x, idx) => (idx === i ? { ...x, question: e.target.value } : x)))
              }
            />
            <Textarea
              rows={2}
              placeholder="Expected answer"
              value={row.expectedAnswer}
              onChange={(e) =>
                setDraft((d) => d.map((x, idx) => (idx === i ? { ...x, expectedAnswer: e.target.value } : x)))
              }
            />
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setDraft((d) => [...d, { question: "", expectedAnswer: "" }])}>
            Add question
          </Button>
          <Button variant="quiet" onClick={saveItems} disabled={busy}>
            Save set
          </Button>
        </div>
        <div className="mt-8 text-sm font-medium">Runs</div>
        <label className="mt-2 block text-xs text-muted">
          Compare latest against
          <select
            className="mt-1 w-full rounded-lg border border-line bg-bg-sunken px-2 py-1.5 text-sm text-text"
            value={compareId}
            onChange={(e) => setCompareId(e.target.value)}
          >
            <option value="">None</option>
            {runs.slice(1).map((r) => (
              <option key={r.id} value={r.id}>
                {r.workflowName} · {new Date(r.startedAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3 space-y-2">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => openRun(run.id)}
              className="w-full rounded-xl border border-line bg-bg-elev p-3 text-left"
            >
              <div className="text-sm">{run.workflowName}</div>
              <div className="text-[11px] text-muted">{new Date(run.startedAt).toLocaleString()}</div>
              {run.metrics ? (
                <div className="mt-1 font-mono text-[11px] text-muted">
                  f {run.metrics.faithfulness.toFixed(2)} · r {run.metrics.relevancy.toFixed(2)} · c{" "}
                  {run.metrics.citationPrecision.toFixed(2)}
                </div>
              ) : (
                <div className="text-xs text-bad">{run.error ?? "running"}</div>
              )}
            </button>
          ))}
        </div>
        {selected && selected.items.length === 0 ? (
          <p className="mt-4 text-xs text-muted">Add questions, save, then run.</p>
        ) : null}
      </aside>
    </div>
  );
}

function Scorecard({ metrics, label }: { metrics: EvalMetrics; label: string }) {
  const items = [
    ["Faithfulness", metrics.faithfulness],
    ["Relevancy", metrics.relevancy],
    ["Citation precision", metrics.citationPrecision],
  ] as const;
  return (
    <div className="rounded-2xl border border-line bg-bg-elev p-4">
      <div className="mb-3 text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="grid grid-cols-3 gap-4">
        {items.map(([name, value]) => (
          <div key={name}>
            <div className="text-xs text-muted">{name}</div>
            <div className={`mt-1 text-2xl font-medium ${scoreColor(value)}`}>{value.toFixed(2)}</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-sunken">
              <div className="h-full bg-copper" style={{ width: `${Math.round(value * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function delta(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}
