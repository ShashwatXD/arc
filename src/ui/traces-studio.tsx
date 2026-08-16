"use client";

import { useEffect, useState } from "react";
import { Badge, EmptyState } from "./badge";
import { formatTime } from "@/lib/cn";
import type { Trace } from "@/domain/models";

export function TracesStudio({ workspaceId }: { workspaceId: string }) {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [active, setActive] = useState<Trace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/traces`)
      .then((r) => r.json())
      .then((data) => {
        const list: Trace[] = data.traces ?? [];
        setTraces(list);
        setActive(list[0] ?? null);
      })
      .catch((e) => setError(e.message));
  }, [workspaceId]);

  if (error) return <p className="p-6 text-sm text-bad">{error}</p>;

  return (
    <div className="grid h-[calc(100vh-56px)] grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="overflow-y-auto border-r border-line p-4">
        <h1 className="mb-3 text-lg font-medium">Traces</h1>
        {traces.length === 0 ? (
          <EmptyState
            title="No traces yet"
            body="Chat or run evals. Every retrieve → rerank → generate path is recorded here."
          />
        ) : (
          traces.map((trace) => (
            <button
              key={trace.id}
              onClick={() => setActive(trace)}
              className={`mb-2 w-full rounded-xl border p-3 text-left ${
                active?.id === trace.id ? "border-copper bg-bg-elev" : "border-line bg-bg-elev/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <Badge tone={trace.kind === "eval" ? "info" : "copper"}>{trace.kind}</Badge>
                <span className="font-mono text-[11px] text-muted">{formatTime(trace.createdAt)}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm">{trace.question}</p>
            </button>
          ))
        )}
      </aside>
      <section className="overflow-y-auto p-6">
        {!active ? (
          <p className="text-sm text-muted">Select a trace.</p>
        ) : (
          <div className="mx-auto max-w-2xl">
            <div className="text-xs uppercase tracking-wide text-muted">{active.kind}</div>
            <h2 className="mt-1 text-xl font-medium">{active.question}</h2>
            {active.rewritten ? (
              <p className="mt-2 font-mono text-xs text-copper">rewritten query · {active.rewritten}</p>
            ) : null}
            <p className="mt-2 text-sm text-muted">{active.citationCount} citations</p>
            <ol className="mt-8 space-y-4">
              {active.steps.map((step, i) => (
                <li key={i} className="rounded-2xl border border-line bg-bg-elev p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium capitalize">{step.name}</div>
                    <div className="font-mono text-xs text-muted">{step.durationMs}ms</div>
                  </div>
                  <p className="mt-2 text-sm text-muted">{step.detail}</p>
                  {step.data ? (
                    <pre className="mt-3 overflow-x-auto font-mono text-[11px] text-muted">
                      {JSON.stringify(step.data, null, 2)}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}
