"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, EmptyState } from "./badge";
import { Button } from "./button";
import { Textarea } from "./fields";
import { scoreColor } from "@/lib/cn";
import type { Citation, TraceStep } from "@/domain/models";

type Conversation = { id: string; title: string; updatedAt: number };
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  traceId: string | null;
};

export function ChatStudio({ workspaceId }: { workspaceId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [rewritten, setRewritten] = useState<string | null>(null);
  const [activeChunk, setActiveChunk] = useState<Citation | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  async function loadConversations() {
    const res = await fetch(`/api/workspaces/${workspaceId}/conversations`);
    const data = await res.json();
    setConversations(data.conversations ?? []);
  }

  useEffect(() => {
    loadConversations().catch((e) => setError(e.message));
  }, [workspaceId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function openConversation(id: string) {
    setConversationId(id);
    const res = await fetch(`/api/workspaces/${workspaceId}/conversations/${id}`);
    const data = await res.json();
    const msgs: ChatMessage[] = data.messages ?? [];
    setMessages(msgs);
    const last = [...msgs].reverse().find((m) => m.role === "assistant");
    setCitations(last?.citations ?? []);
  }

  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setError(null);
    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: question,
      citations: [],
      traceId: null,
    };
    setMessages((m) => [...m, userMsg]);
    const assistant: ChatMessage = {
      id: `stream-${Date.now()}`,
      role: "assistant",
      content: "",
      citations: [],
      traceId: null,
    };
    setMessages((m) => [...m, assistant]);

    const res = await fetch(`/api/workspaces/${workspaceId}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: question, conversationId }),
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({ error: "Chat failed" }));
      setError(data.error);
      setBusy(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let acc = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const event = /event: (\w+)/.exec(part)?.[1];
        const raw = part.split("data: ")[1];
        if (!event || !raw) continue;
        const data = JSON.parse(raw);
        if (event === "meta") {
          setConversationId(data.conversationId);
          setCitations(data.citations ?? []);
          setSteps(data.steps ?? []);
          setRewritten(data.rewritten);
          setMessages((list) =>
            list.map((m) => (m.id === assistant.id ? { ...m, citations: data.citations ?? [] } : m)),
          );
        }
        if (event === "token") {
          acc += data.token;
          const snapshot = acc;
          setMessages((list) =>
            list.map((m) => (m.id === assistant.id ? { ...m, content: snapshot } : m)),
          );
        }
        if (event === "error") setError(data.error);
        if (event === "done") {
          setMessages((list) =>
            list.map((m) => (m.id === assistant.id ? { ...m, traceId: data.traceId } : m)),
          );
        }
      }
    }
    setBusy(false);
    await loadConversations();
  }

  function newThread() {
    setConversationId(null);
    setMessages([]);
    setCitations([]);
    setSteps([]);
    setRewritten(null);
    setActiveChunk(null);
  }

  return (
    <div className="grid h-[calc(100vh-56px)] grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
      <aside className="hidden overflow-y-auto border-r border-line p-3 lg:block">
        <Button variant="quiet" className="mb-3 w-full" onClick={newThread}>
          New thread
        </Button>
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => openConversation(c.id)}
            className={`mb-1 w-full truncate rounded-lg px-3 py-2 text-left text-sm ${
              c.id === conversationId ? "bg-white/10" : "text-muted hover:bg-white/5"
            }`}
          >
            {c.title}
          </button>
        ))}
      </aside>
      <section className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 ? (
            <EmptyState
              title="Ask the workspace"
              body="Answers only come from indexed sources. Try the sample handbook: “How many PTO days do full-time employees get?”"
              action={
                <Button
                  variant="quiet"
                  onClick={() => {
                    setInput("How many PTO days do full-time employees get?");
                  }}
                >
                  Use a sample question
                </Button>
              }
            />
          ) : (
            <div className="mx-auto max-w-2xl space-y-6">
              {messages.map((m) => (
                <div key={m.id}>
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">
                    {m.role === "user" ? "You" : "Arc"}
                  </div>
                  <Answer text={m.content} onCite={(n) => setActiveChunk(m.citations[n - 1] ?? citations[n - 1] ?? null)} />
                </div>
              ))}
              {busy ? <div className="text-sm text-muted">Retrieving and writing…</div> : null}
              <div ref={bottom} />
            </div>
          )}
        </div>
        <form onSubmit={send} className="border-t border-line p-4">
          {error ? <p className="mb-2 text-sm text-bad">{error}</p> : null}
          <div className="mx-auto flex max-w-2xl gap-2">
            <Textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask something the sources can answer"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Button type="submit" disabled={busy || !input.trim()}>
              Send
            </Button>
          </div>
        </form>
      </section>
      <aside className="hidden overflow-y-auto border-l border-line p-4 lg:block">
        <div className="text-sm font-medium">Retrieval inspector</div>
        {rewritten ? (
          <p className="mt-2 font-mono text-[11px] text-muted">rewrite → {rewritten}</p>
        ) : null}
        <div className="mt-3 space-y-1">
          {steps.map((step) => (
            <div key={step.name + step.startedAt} className="flex items-center justify-between text-xs">
              <span className="uppercase tracking-wide text-muted">{step.name}</span>
              <span className="font-mono text-muted">{step.durationMs}ms</span>
            </div>
          ))}
        </div>
        <div className="mt-6 space-y-2">
          {citations.length === 0 ? (
            <p className="text-sm text-muted">Citations appear after the first grounded answer.</p>
          ) : (
            citations.map((c, i) => (
              <button
                key={c.chunkId}
                onClick={() => setActiveChunk(c)}
                className="w-full rounded-xl border border-line bg-bg-elev p-3 text-left hover:border-copper/40"
              >
                <div className="flex items-center justify-between">
                  <Badge tone="copper">[{i + 1}]</Badge>
                  <span className={`font-mono text-[11px] ${scoreColor(c.score)}`}>{c.score.toFixed(3)}</span>
                </div>
                <div className="mt-1 truncate text-xs text-muted">{c.sourceName}</div>
                <p className="mt-2 line-clamp-4 text-[12px] leading-relaxed text-muted">{c.text}</p>
              </button>
            ))
          )}
        </div>
        {activeChunk ? (
          <div className="mt-6 rounded-xl border border-copper/30 bg-bg-sunken p-3">
            <div className="text-xs text-copper">{activeChunk.sourceName}</div>
            <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed">{activeChunk.text}</p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function Answer({ text, onCite }: { text: string; onCite: (n: number) => void }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="whitespace-pre-wrap text-sm leading-7">
      {parts.map((part, i) => {
        const m = /^\[(\d+)\]$/.exec(part);
        if (m) {
          return (
            <button
              key={i}
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
