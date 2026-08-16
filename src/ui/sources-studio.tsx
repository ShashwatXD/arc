"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, EmptyState } from "./badge";
import { Button } from "./button";
import { Input, Textarea } from "./fields";
import { formatTime } from "@/lib/cn";

type Source = {
  id: string;
  name: string;
  kind: string;
  status: string;
  byteSize: number;
  error: string | null;
  updatedAt: number;
};

export function SourcesStudio({ workspaceId }: { workspaceId: string }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [note, setNote] = useState("");
  const [noteName, setNoteName] = useState("Untitled note");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; chunks: { id: string; ordinal: number; text: string }[] } | null>(null);

  async function load() {
    const res = await fetch(`/api/workspaces/${workspaceId}/sources`);
    const data = await res.json();
    setSources(data.sources ?? []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [workspaceId]);

  const ready = useMemo(() => sources.filter((s) => s.status === "ready").length, [sources]);

  async function upload(file: File) {
    setBusy("file");
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/workspaces/${workspaceId}/sources`, { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    await load();
    setBusy(null);
  }

  async function addUrl(event: React.FormEvent) {
    event.preventDefault();
    setBusy("url");
    setError(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else setUrl("");
    await load();
    setBusy(null);
  }

  async function addNote(event: React.FormEvent) {
    event.preventDefault();
    setBusy("note");
    setError(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note, name: noteName }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else {
      setNote("");
      setNoteName("Untitled note");
    }
    await load();
    setBusy(null);
  }

  async function remove(id: string) {
    await fetch(`/api/workspaces/${workspaceId}/sources/${id}`, { method: "DELETE" });
    await load();
    if (preview) setPreview(null);
  }

  async function openChunks(source: Source) {
    const res = await fetch(`/api/workspaces/${workspaceId}/sources/${source.id}/chunks`);
    const data = await res.json();
    setPreview({ name: source.name, chunks: data.chunks ?? [] });
  }

  async function reindex() {
    setBusy("reindex");
    setError(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/reindex`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    await load();
    setBusy(null);
  }

  return (
    <div className="grid h-[calc(100vh-56px)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="overflow-y-auto p-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-medium">Sources</h1>
            <p className="text-sm text-muted">{ready} ready · {sources.length} total</p>
          </div>
          <Button variant="quiet" onClick={reindex} disabled={busy === "reindex"}>
            {busy === "reindex" ? "Reindexing…" : "Reindex workspace"}
          </Button>
        </div>
        {error ? <p className="mb-4 text-sm text-bad">{error}</p> : null}
        <label className="mb-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-bg-elev px-6 py-10 text-center hover:border-copper/50">
          <div className="text-sm">Drop PDF, DOCX, Markdown, or TXT</div>
          <div className="mt-1 text-xs text-muted">or click to browse</div>
          <input
            type="file"
            className="hidden"
            accept=".pdf,.docx,.md,.txt,.text"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
        </label>
        <div className="space-y-2">
          {sources.length === 0 ? (
            <EmptyState
              title="No sources yet"
              body="Add a PDF, URL, or note so this workspace can retrieve. The sample handbook is the fastest way to try chat and evals."
            />
          ) : (
            sources.map((source) => (
              <div key={source.id} className="flex items-center gap-4 rounded-xl border border-line bg-bg-elev px-4 py-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => openChunks(source)}>
                  <div className="truncate text-sm font-medium">{source.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <Badge tone={source.status === "ready" ? "good" : source.status === "error" ? "bad" : "copper"}>
                      {source.status}
                    </Badge>
                    <span className="uppercase">{source.kind}</span>
                    <span>{formatTime(source.updatedAt)}</span>
                  </div>
                  {source.error ? <p className="mt-1 text-xs text-bad">{source.error}</p> : null}
                </button>
                <Button variant="ghost" onClick={() => remove(source.id)}>
                  Remove
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
      <aside className="space-y-6 overflow-y-auto border-l border-line p-5">
        <form onSubmit={addUrl} className="space-y-2">
          <div className="text-sm font-medium">Add URL</div>
          <Input placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button type="submit" variant="quiet" disabled={busy === "url"}>
            {busy === "url" ? "Fetching…" : "Ingest page"}
          </Button>
        </form>
        <form onSubmit={addNote} className="space-y-2">
          <div className="text-sm font-medium">Paste a note</div>
          <Input value={noteName} onChange={(e) => setNoteName(e.target.value)} />
          <Textarea rows={8} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Policy, FAQ, meeting notes…" />
          <Button type="submit" variant="quiet" disabled={busy === "note" || !note.trim()}>
            {busy === "note" ? "Indexing…" : "Add note"}
          </Button>
        </form>
        {preview ? (
          <div>
            <div className="mb-2 text-sm font-medium">Chunks · {preview.name}</div>
            <div className="space-y-2">
              {preview.chunks.length === 0 ? (
                <p className="text-sm text-muted">Not indexed yet. Reindex after adding an OpenAI key.</p>
              ) : (
                preview.chunks.map((chunk) => (
                  <div key={chunk.id} className="rounded-lg border border-line bg-bg-sunken p-3 font-mono text-[11px] leading-relaxed text-muted">
                    <div className="mb-1 text-copper">#{chunk.ordinal + 1}</div>
                    {chunk.text}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
