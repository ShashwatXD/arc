"use client";

import {
  Background,
  Controls,
  MiniMap,
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
import type { NodeKind, WorkflowGraph, WorkflowIssue } from "@/domain/workflow";
import { nodeKinds } from "@/domain/workflow";

type Workflow = {
  id: string;
  name: string;
  graph: WorkflowGraph;
  isActive: boolean;
};

const kindMeta: Record<NodeKind, { label: string; hint: string }> = {
  sources: { label: "Sources", hint: "Workspace documents" },
  chunk: { label: "Chunk", hint: "Split text" },
  embed: { label: "Embed", hint: "Dense vectors" },
  rewrite: { label: "Rewrite", hint: "Standalone query" },
  retrieve: { label: "Retrieve", hint: "Hybrid dense + BM25" },
  rerank: { label: "Rerank", hint: "Cohere cross-encoder" },
  generate: { label: "Generate", hint: "Grounded answer" },
};

function FlowNode({ data, selected }: { data: { kind: NodeKind }; selected: boolean }) {
  const meta = kindMeta[data.kind];
  return (
    <div
      className={`min-w-44 rounded-xl border bg-bg-elev px-3 py-2 shadow-lg ${
        selected ? "border-copper" : "border-line"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-copper" />
      <div className="text-[10px] uppercase tracking-wider text-muted">{data.kind}</div>
      <div className="text-sm font-medium">{meta.label}</div>
      <div className="text-[11px] text-muted">{meta.hint}</div>
      <Handle type="source" position={Position.Right} className="!bg-copper" />
    </div>
  );
}

const nodeTypes = { arc: FlowNode };

function toFlow(graph: WorkflowGraph): { nodes: Node[]; edges: Edge[] } {
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

function fromFlow(nodes: Node[], edges: Edge[], graph: WorkflowGraph): WorkflowGraph {
  const configById = new Map(graph.nodes.map((n) => [n.id, n]));
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      kind: (n.data as { kind: NodeKind }).kind,
      position: n.position,
      config: configById.get(n.id)?.config ?? {},
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
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const current = workflows.find((w) => w.id === activeId);

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
  }

  const selectedNode = current?.graph.nodes.find((n) => n.id === selected);

  const graph = useMemo(
    () => (current ? fromFlow(nodes, edges, current.graph) : { nodes: [], edges: [] }),
    [nodes, edges, current],
  );

  function updateConfig(patch: Record<string, unknown>) {
    if (!current || !selected) return;
    const next: WorkflowGraph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === selected ? { ...n, config: { ...n.config, ...patch } } : n,
      ),
    };
    setWorkflows((list) => list.map((w) => (w.id === current.id ? { ...w, graph: next } : w)));
  }

  async function save(activate = false) {
    if (!current) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/workflows`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflowId: current.id,
        graph,
        name,
        activate,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error);
      return;
    }
    setWorkflows(data.workflows ?? []);
    setMessage(activate ? "Saved and activated. Reindex if chunk/embed changed." : "Saved.");
  }

  async function fromTemplate(template: "balanced" | "precise" | "fast") {
    const res = await fetch(`/api/workspaces/${workspaceId}/workflows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ template }),
    });
    const data = await res.json();
    if (data.workflow) {
      await load();
      switchWorkflow(data.workflow.id);
    }
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

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, id: `e-${Date.now()}` }, eds)),
    [setEdges],
  );

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2">
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
        <Input className="max-w-56" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="quiet" onClick={() => save(false)} disabled={saving}>
          Save
        </Button>
        <Button onClick={() => save(true)} disabled={saving}>
          Save & activate
        </Button>
        <Button variant="ghost" onClick={duplicate}>
          Duplicate
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => fromTemplate("balanced")}>
            Balanced
          </Button>
          <Button variant="ghost" onClick={() => fromTemplate("precise")}>
            Precise
          </Button>
          <Button variant="ghost" onClick={() => fromTemplate("fast")}>
            Fast
          </Button>
        </div>
      </div>
      {message ? <div className="border-b border-line px-4 py-2 text-sm text-copper">{message}</div> : null}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
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
          <MiniMap pannable zoomable />
        </ReactFlow>
        <aside className="overflow-y-auto border-l border-line p-4">
          <div className="mb-4 text-sm font-medium">Inspector</div>
          {issues.length ? (
            <div className="mb-4 space-y-1">
              {issues.map((issue) => (
                <div key={issue.message} className="text-xs text-bad">
                  {issue.level}: {issue.message}
                </div>
              ))}
            </div>
          ) : (
            <Badge tone="good">Graph valid</Badge>
          )}
          {!selectedNode ? (
            <p className="mt-4 text-sm text-muted">
              Select a node to edit chunk size, retrieve depth, rerank, or the generate prompt.
              Chunk and embed changes need a reindex.
            </p>
          ) : (
            <NodeInspector node={selectedNode} onChange={updateConfig} />
          )}
          <div className="mt-8 text-xs uppercase tracking-wide text-muted">Palette</div>
          <p className="mt-2 text-xs text-muted">
            This pipeline is typed: {nodeKinds.join(" → ")}. Delete rewrite or rerank to skip those
            steps. Chat and evals run this same graph.
          </p>
        </aside>
      </div>
    </div>
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
      <div className="mt-4 space-y-3">
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
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(c.enabled ?? true)}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        Rewrite questions before retrieve
      </label>
    );
  }
  if (node.kind === "retrieve") {
    return (
      <div className="mt-4 space-y-3">
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
  if (node.kind === "rerank") {
    return (
      <div className="mt-4 space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(c.enabled ?? true)}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          Enable Cohere rerank
        </label>
        <Field label="Keep top N">
          <Input type="number" value={Number(c.topN ?? 6)} onChange={(e) => onChange({ topN: Number(e.target.value) })} />
        </Field>
      </div>
    );
  }
  if (node.kind === "generate") {
    return (
      <div className="mt-4 space-y-3">
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
          <Textarea
            rows={8}
            value={String(c.systemPrompt ?? "")}
            onChange={(e) => onChange({ systemPrompt: e.target.value })}
          />
        </Field>
      </div>
    );
  }
  return <p className="mt-4 text-sm text-muted">This node has no extra settings.</p>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}
