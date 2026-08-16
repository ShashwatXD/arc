"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "./button";
import { Input, Textarea } from "./fields";
import { KeyBanner } from "./key-banner";
import { formatTime } from "@/lib/cn";

type Workspace = {
  id: string;
  name: string;
  description: string;
  updatedAt: number;
  isSample: boolean;
};

export function HomeStudio() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/workspaces");
    const data = await res.json();
    setWorkspaces(data.workspaces ?? []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/w/${data.workspace.id}/sources`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create workspace");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center justify-between border-b border-line px-6">
        <div className="font-mono text-sm tracking-[0.2em] text-copper">ARC</div>
        <KeyBanner />
      </header>
      <main className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1.1fr_0.9fr]">
        <section>
          <p className="text-xs uppercase tracking-[0.2em] text-copper">RAG workflow studio</p>
          <h1 className="mt-3 max-w-xl text-4xl font-medium tracking-tight">
            Compose retrieval. Ground the answer. Prove it with evals.
          </h1>
          <p className="mt-4 max-w-lg text-muted">
            Arc is a local studio for knowledge workflows. Build a hybrid retrieval graph,
            chat with citations, and treat faithfulness as a release gate — not a vibe check.
          </p>
          <form onSubmit={create} className="mt-8 space-y-3 rounded-2xl border border-line bg-bg-elev p-5">
            <div className="text-sm font-medium">New workspace</div>
            <Input placeholder="Name — e.g. Support handbook" value={name} onChange={(e) => setName(e.target.value)} required />
            <Textarea
              placeholder="What knowledge lives here?"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {error ? <p className="text-sm text-bad">{error}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create workspace"}
            </Button>
          </form>
        </section>
        <section className="space-y-3">
          <div className="text-sm text-muted">Workspaces</div>
          {workspaces.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-8 text-sm text-muted">
              Loading sample handbook…
            </div>
          ) : (
            workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => router.push(`/w/${ws.id}/chat`)}
                className="w-full rounded-2xl border border-line bg-bg-elev p-5 text-left transition hover:border-copper/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{ws.name}</div>
                  {ws.isSample ? (
                    <span className="text-[11px] uppercase tracking-wide text-copper">Sample</span>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{ws.description || "No description"}</p>
                <p className="mt-3 font-mono text-[11px] text-muted">{formatTime(ws.updatedAt)}</p>
              </button>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
