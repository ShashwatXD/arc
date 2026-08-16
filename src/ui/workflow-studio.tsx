"use client";

import {
  Background,
  Controls,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  Handle,
  Position,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "./badge";
import { Button } from "./button";
import { Input, Textarea } from "./fields";
import { readSse } from "./read-sse";
import {
  defaultNodeConfig,
  isIndexKind,
  isQueryKind,
  nodeKinds,
  queryKinds,
  type NodeKind,
  type WorkflowGraph,
  type WorkflowIssue,
} from "@/domain/workflow";
import type { Citation, TraceStep } from "@/domain/models";
import type { TemplateId } from "@/domain/templates";
import { cn, scoreColor } from "@/lib/cn";

type Workflow = {
  id: string;
  name: string;
  graph: WorkflowGraph;
  isActive: boolean;
};

type RunBadge = { status: "idle" | "running" | "ok" | "skip" | "error"; detail: string; ms?: number };

type FlowData = { kind: NodeKind; config: Record<string, unknown>; run?: RunBadge };

const kindMeta: Record<NodeKind, { label: string; hint: string }> = {
  sources: { label: "Sources", hint: "Index-time" },
  chunk: { label: "Chunk", hint: "Index-time" },
  embed: { label: "Embed", hint: "Index-time" },
  rewrite: { label: "Rewrite", hint: "Standalone query" },
  route: { label: "Route", hint: "Pick a branch" },
  retrieve: { label: "Retrieve", hint: "Hybrid dense + sparse" },
  grade: { label: "Grade", hint: "Drop weak chunks" },
  merge: { label: "Merge", hint: "RRF / concat" },
  rerank: { label: "Rerank", hint: "Same chat model" },
  generate: { label: "Generate", hint: "Cited answer" },
};

function FlowNode({ data, selected }: { data: FlowData; selected: boolean }) {
  const meta = kindMeta[data.kind];
  const run = data.run;
  const index = isIndexKind(data.kind);
  return (
    <div
      className={cn(
        "min-w-48 rounded-xl border bg-bg-elev px-3 py-2",
        selected ? "border-copper" : "border-line",
        run?.status === "running" && "border-copper",
        run?.status === "ok" && "border-good/70",
        run?.status === "skip" && "opacity-50",
        run?.status === "error" && "border-bad",
        index && "opacity-80",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-copper" />
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted">{data.kind}</div>
        {run?.status && run.status !== "idle" ? (
          <span
            className={cn(
              "font-mono text-[10px]",
              run.status === "running" && "text-copper",
              run.status === "ok" && "text-good",
              run.status === "skip" && "text-muted",
              run.status === "error" && "text-bad",
            )}
          >
            {run.status === "running" ? "…" : run.ms != null ? `${run.ms}ms` : run.status}
          </span>
        ) : null}
      </div>
      <div className="text-sm font-medium">{meta.label}</div>
      <div className="line-clamp-2 text-[11px] text-muted">{run?.detail || meta.hint}</div>
      <Handle type="source" position={Position.Right} className="!bg-copper" />
    </div>
  );
}

const nodeTypes = { arc: FlowNode };

function toFlow(graph: WorkflowGraph): { nodes: Node<FlowData>[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: "arc",
      position: n.position,
      data: { kind: n.kind, config: n.config },
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
  };
}

function fromFlow(nodes: Node<FlowData>[], edges: Edge[]): WorkflowGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      kind: n.data.kind,
      position: n.position,
      config: n.data.config ?? defaultNodeConfig(n.data.kind),
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };
}

export function WorkflowStudio({ workspaceId }: { workspaceId: string }) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [issues, setIssues] = useState<WorkflowIssue[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [activeChunk, setActiveChunk] = useState<Citation | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const current = workflows.find((w) => w.id === activeId);
  const graph = useMemo(() => fromFlow(nodes, edges), [nodes, edges]);
  const selectedNode = graph.nodes.find((n) => n.id === selected);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/workflows`);
    const data = await res.json();
    const list: Workflow[] = data.workflows ?? [];
    setWorkflows(list);
    const preferred = list.find((w) => w.isActive) ?? list[0];
    if (preferred) {
      setActiveId(preferred.id);
      setName(preferred.name);
      const flow = toFlow(preferred.graph);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setIssues((data.issues ?? {})[preferred.id] ?? []);
    }
  }, [workspaceId, setNodes, setEdges]);

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);

  function switchWorkflow(id: string) {
    const wf = workflows.find((w) => w.id === id);
    if (!wf) return;
    setActiveId(id);
    setName(wf.name);
    const flow = toFlow(wf.graph);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setSelected(null);
    clearRun();
  }

  function clearRun() {
    setSteps([]);
    setCitations([]);
    setAnswer("");
    setActiveChunk(null);
    setNodes((list) =>
      list.map((n) => ({ ...n, data: { ...n.data, run: { status: "idle" as const, detail: "" } } })),
    );
  }

  function patchNodeRun(nodeId: string, run: RunBadge) {
    setNodes((list) =>
      list.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, run } } : n)),
    );
  }

  function updateConfig(patch: Record<string, unknown>) {
    if (!selected) return;
    setNodes((list) =>
      list.map((n) =>
        n.id === selected ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } } : n,
      ),
    );
    setWorkflows((list) =>
      list.map((w) => (w.id === activeId ? { ...w, graph: fromFlow(
        nodes.map((n) =>
          n.id === selected ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } } : n,
        ),
        edges,
      ) } : w)),
    );
  }

  async function save(activate = false) {
    if (!current) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/workflows`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflowId: current.id, graph, name, activate }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error);
      return;
    }
    setWorkflows(data.workflows ?? []);
    setMessage(activate ? "Active. Reindex if chunk/embed changed." : "Saved.");
  }

  async function fromTemplate(template: TemplateId) {
    const res = await fetch(`/api/workspaces/${workspaceId}/workflows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ template }),
    });
    const data = await res.json();
    if (data.workflow) await load();
  }

  async function duplicate() {
    if (!current) return;
    await fetch(`/api/workspaces/${workspaceId}/workflows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ duplicateFrom: current.id, name: `${current.name} copy` }),
    });
    await load();
  }

  function addNode(kind: NodeKind) {
    const id = `n-${kind}-${Date.now()}`;
    const count = nodes.filter((n) => n.data.kind === kind).length;
    setNodes((list) => [
      ...list,
      {
        id,
        type: "arc",
        position: { x: 80 + (count % 4) * 200, y: isIndexKind(kind) ? 40 : 220 + count * 28 },
        data: { kind, config: defaultNodeConfig(kind) },
      },
    ]);
    setSelected(id);
  }

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, id: `e-${Date.now()}` }, eds)),
    [setEdges],
  );

  async function ask(event?: React.FormEvent) {
    event?.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setMessage(null);
    setAnswer("");
    setCitations([]);
    setSteps([]);
    setActiveChunk(null);
    setNodes((list) =>
      list.map((n) => ({
        ...n,
        data: {
          ...n.data,
          run: isQueryKind(n.data.kind)
            ? { status: "idle" as const, detail: "waiting" }
            : { status: "skip" as const, detail: "index-time — not in this run" },
        },
      })),
    );
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: q, conversationId }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: "Run failed" }));
        throw new Error(data.error);
      }
      let acc = "";
      await readSse(res, (event, raw) => {
        const data = raw as Record<string, unknown>;
        if (event === "meta" && typeof data.conversationId === "string") {
          setConversationId(data.conversationId);
        }
        if (event === "node" && typeof data.nodeId === "string") {
          patchNodeRun(data.nodeId, { status: "running", detail: "running" });
        }
        if (event === "step") {
          const step = raw as TraceStep;
          setSteps((s) => [...s.filter((x) => x.nodeId !== step.nodeId || x.name !== step.name), step]);
          patchNodeRun(step.nodeId, {
            status: step.status === "ok" || step.status === "skip" || step.status === "error" ? step.status : "ok",
            detail: step.detail,
            ms: step.durationMs,
          });
        }
        if (event === "context") {
          setCitations((data.citations as Citation[]) ?? []);
        }
        if (event === "token" && typeof data.token === "string") {
          acc += data.token;
          setAnswer(acc);
        }
        if (event === "error") setMessage(String(data.error ?? "Run failed"));
        if (event === "done") {
          setCitations((data.citations as Citation[]) ?? citations);
        }
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <select
          className="rounded-lg border border-line bg-bg-sunken px-2 py-1.5 text-sm"
          value={activeId ?? ""}
          onChange={(e) => switchWorkflow(e.target.value)}
        >
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
              {w.isActive ? " · active" : ""}
            </option>
          ))}
        </select>
        <Input className="max-w-44" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="quiet" onClick={() => save(false)} disabled={saving}>
          Save
        </Button>
        <Button onClick={() => save(true)} disabled={saving}>
          Activate
        </Button>
        <Button variant="ghost" onClick={duplicate}>
          Duplicate
        </Button>
        <div className="ml-auto flex flex-wrap gap-1">
          {(["router", "balanced", "precise", "fast"] as TemplateId[]).map((id) => (
            <Button key={id} variant="ghost" onClick={() => fromTemplate(id)}>
              {id}
            </Button>
          ))}
        </div>
      </div>
      {message ? <div className="border-b border-line px-4 py-2 text-sm text-copper">{message}</div> : null}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              onNodeClick={(_, n) => setSelected(n.id)}
              fitView
            >
              <Background gap={18} size={1} color="#23262d" />
              <Controls />
            </ReactFlow>
          </div>
          <form onSubmit={ask} className="border-t border-line p-3">
            <div className="mb-2 flex flex-wrap gap-2">
              {["How many PTO days do full-time employees get?", "What is the SEV-1 acknowledge time?", "Can I get a full refund after 20 days?"].map(
                (sample) => (
                  <button
                    key={sample}
                    type="button"
                    className="rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:text-text"
                    onClick={() => setQuestion(sample)}
                  >
                    {sample}
                  </button>
                ),
              )}
            </div>
            <div className="flex gap-2">
              <Textarea
                rows={2}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask on this graph — nodes light up as they run"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
              />
              <Button type="submit" disabled={busy || !question.trim()}>
                {busy ? "Running…" : "Run"}
              </Button>
            </div>
            {answer ? (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-line bg-bg-sunken p-3 text-sm leading-6">
                <Answer text={answer} onCite={(n) => setActiveChunk(citations[n - 1] ?? null)} />
              </div>
            ) : null}
          </form>
        </div>
        <aside className="overflow-y-auto border-l border-line p-4">
          <div className="text-sm font-medium">What ran</div>
          {steps.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              Press Run. Query nodes execute in graph order (parallel retrieves in one wave). Index
              nodes (sources / chunk / embed) only run when you reindex.
            </p>
          ) : (
            <ol className="mt-3 space-y-2">
              {steps.map((step, i) => (
                <li key={`${step.nodeId}-${step.startedAt}-${i}`}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-left"
                    onClick={() => setSelected(step.nodeId)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">{step.name}</span>
                      <span className="font-mono text-[10px] text-muted">
                        {step.status} · {step.durationMs}ms
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted">{step.detail}</p>
                  </button>
                </li>
              ))}
            </ol>
          )}
          {citations.length > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted">Citations</div>
              {citations.map((c, i) => (
                <button
                  key={c.chunkId}
                  onClick={() => setActiveChunk(c)}
                  className="w-full rounded-lg border border-line p-2 text-left hover:border-copper/40"
                >
                  <div className="flex justify-between">
                    <Badge tone="copper">[{i + 1}]</Badge>
                    <span className={`font-mono text-[11px] ${scoreColor(c.score)}`}>{c.score.toFixed(3)}</span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted">{c.sourceName}</div>
                </button>
              ))}
            </div>
          ) : null}
          {activeChunk ? (
            <p className="mt-3 whitespace-pre-wrap text-[12px] leading-relaxed text-muted">{activeChunk.text}</p>
          ) : null}

          <div className="mt-8 text-sm font-medium">Add node</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {nodeKinds.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => addNode(kind)}
                className="rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:text-text"
              >
                {kind}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Query path: {queryKinds.join(" → ")}. Connect retrieve branches into merge. Set retrieve
            “when” to a route name to skip the other branches.
          </p>

          <div className="mt-6 text-sm font-medium">Inspector</div>
          {issues.length ? (
            <div className="mt-2 space-y-1">
              {issues.map((issue) => (
                <div key={issue.message} className={issue.level === "error" ? "text-xs text-bad" : "text-xs text-copper"}>
                  {issue.level}: {issue.message}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2">
              <Badge tone="good">Graph valid</Badge>
            </div>
          )}
          {selectedNode ? (
            <NodeInspector node={selectedNode} onChange={updateConfig} />
          ) : (
            <p className="mt-3 text-sm text-muted">Click a node to edit it.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Answer({ text, onCite }: { text: string; onCite: (n: number) => void }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        const m = /^\[(\d+)\]$/.exec(part);
        if (m) {
          return (
            <button
              key={i}
              type="button"
              className="mx-0.5 rounded bg-copper/15 px-1 text-[11px] text-copper"
              onClick={() => onCite(Number(m[1]))}
            >
              {part}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function NodeInspector({
  node,
  onChange,
}: {
  node: WorkflowGraph["nodes"][number];
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const c = node.config;
  if (node.kind === "chunk") {
    return (
      <div className="mt-3 space-y-3">
        <Field label="Chunk size">
          <Input type="number" value={Number(c.size ?? 800)} onChange={(e) => onChange({ size: Number(e.target.value) })} />
        </Field>
        <Field label="Overlap">
          <Input type="number" value={Number(c.overlap ?? 120)} onChange={(e) => onChange({ overlap: Number(e.target.value) })} />
        </Field>
      </div>
    );
  }
  if (node.kind === "embed") {
    return (
      <Field label="Embedding model">
        <Input value={String(c.model ?? "text-embedding-3-small")} onChange={(e) => onChange({ model: e.target.value })} />
      </Field>
    );
  }
  if (node.kind === "rewrite") {
    return (
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(c.enabled ?? true)}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        Rewrite before retrieve
      </label>
    );
  }
  if (node.kind === "route") {
    const routes = (c.routes as { name: string; hint: string }[] | undefined) ?? [];
    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs text-muted">One name is chosen per question. Retrieve nodes with matching “when” run.</p>
        {routes.map((route, i) => (
          <div key={i} className="space-y-1 rounded-lg border border-line p-2">
            <Input
              value={route.name}
              onChange={(e) => {
                const next = routes.map((r, j) => (j === i ? { ...r, name: e.target.value } : r));
                onChange({ routes: next });
              }}
            />
            <Input
              value={route.hint}
              onChange={(e) => {
                const next = routes.map((r, j) => (j === i ? { ...r, hint: e.target.value } : r));
                onChange({ routes: next });
              }}
            />
          </div>
        ))}
      </div>
    );
  }
  if (node.kind === "retrieve") {
    return (
      <div className="mt-3 space-y-3">
        <Field label="When (route name, empty = always)">
          <Input value={String(c.when ?? "")} onChange={(e) => onChange({ when: e.target.value })} />
        </Field>
        <Field label="Keep sources whose names include (comma)">
          <Input
            value={Array.isArray(c.sourceNameIncludes) ? c.sourceNameIncludes.join(", ") : ""}
            onChange={(e) =>
              onChange({
                sourceNameIncludes: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <Field label="Dense topK">
          <Input type="number" value={Number(c.denseTopK ?? 12)} onChange={(e) => onChange({ denseTopK: Number(e.target.value) })} />
        </Field>
        <Field label="Sparse topK">
          <Input type="number" value={Number(c.sparseTopK ?? 12)} onChange={(e) => onChange({ sparseTopK: Number(e.target.value) })} />
        </Field>
        <Field label="Fused topK">
          <Input type="number" value={Number(c.fusedTopK ?? 12)} onChange={(e) => onChange({ fusedTopK: Number(e.target.value) })} />
        </Field>
      </div>
    );
  }
  if (node.kind === "grade") {
    return (
      <Field label="Min relevance (hint for the judge)">
        <Input
          type="number"
          step="0.05"
          value={Number(c.minScore ?? 0.45)}
          onChange={(e) => onChange({ minScore: Number(e.target.value) })}
        />
      </Field>
    );
  }
  if (node.kind === "merge") {
    return (
      <Field label="Method">
        <select
          className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2 text-sm"
          value={String(c.method ?? "rrf")}
          onChange={(e) => onChange({ method: e.target.value })}
        >
          <option value="rrf">RRF</option>
          <option value="concat">Concat unique</option>
        </select>
      </Field>
    );
  }
  if (node.kind === "rerank") {
    return (
      <div className="mt-3 space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(c.enabled ?? true)}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          Enable rerank (same chat model, no extra key)
        </label>
        <Field label="Keep top N">
          <Input type="number" value={Number(c.topN ?? 6)} onChange={(e) => onChange({ topN: Number(e.target.value) })} />
        </Field>
      </div>
    );
  }
  if (node.kind === "generate") {
    return (
      <div className="mt-3 space-y-3">
        <Field label="Model">
          <Input value={String(c.model ?? "gpt-4o-mini")} onChange={(e) => onChange({ model: e.target.value })} />
        </Field>
        <Field label="Temperature">
          <Input
            type="number"
            step="0.1"
            value={Number(c.temperature ?? 0.1)}
            onChange={(e) => onChange({ temperature: Number(e.target.value) })}
          />
        </Field>
        <Field label="System prompt">
          <Textarea rows={6} value={String(c.systemPrompt ?? "")} onChange={(e) => onChange({ systemPrompt: e.target.value })} />
        </Field>
      </div>
    );
  }
  return <p className="mt-3 text-sm text-muted">Index node — used on Reindex, not on Run.</p>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block space-y-1 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}
