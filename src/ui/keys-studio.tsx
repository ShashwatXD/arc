"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "./button";
import { Input } from "./fields";
import { KeyBanner } from "./key-banner";
import { cn } from "@/lib/cn";

type Settings = {
  openaiKeySet: boolean;
  openaiKeyLast4: string | null;
  openaiKeyFromFile: boolean;
  openaiBaseUrl: string;
  openaiModel: string;
  embeddingKeySet: boolean;
  embeddingKeyLast4: string | null;
  embeddingSameAsChat: boolean;
  embeddingBaseUrl: string;
  embeddingModel: string;
  qdrantUrl: string;
  qdrantKeySet: boolean;
};

const presets = [
  {
    id: "openai",
    label: "OpenAI",
    baseURL: "",
    chatModel: "gpt-4o-mini",
    embedModel: "text-embedding-3-small",
    hint: "Chat and embeddings on api.openai.com.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    chatModel: "openai/gpt-4o-mini",
    embedModel: "openai/text-embedding-3-small",
    hint: "One key for many models. Use OpenRouter model ids.",
  },
  {
    id: "groq",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    chatModel: "llama-3.3-70b-versatile",
    embedModel: "text-embedding-3-small",
    hint: "Chat on Groq. Embeddings still need OpenAI or Ollama — uncheck “same as chat”.",
  },
  {
    id: "together",
    label: "Together",
    baseURL: "https://api.together.xyz/v1",
    chatModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    embedModel: "BAAI/bge-large-en-v1.5",
    hint: "Together OpenAI-compatible chat and embeddings.",
  },
  {
    id: "ollama",
    label: "Ollama",
    baseURL: "http://127.0.0.1:11434/v1",
    chatModel: "llama3.1",
    embedModel: "nomic-embed-text",
    hint: "Local. Use any placeholder key (e.g. ollama) if the client requires one.",
  },
  {
    id: "custom",
    label: "Custom",
    baseURL: "",
    chatModel: "",
    embedModel: "",
    hint: "Any OpenAI-compatible /v1 endpoint (Fireworks, LM Studio, vLLM, Azure-compatible).",
  },
] as const;

export function KeysStudio() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [preset, setPreset] = useState("openai");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [embeddingSameAsChat, setEmbeddingSameAsChat] = useState(true);
  const [embeddingApiKey, setEmbeddingApiKey] = useState("");
  const [embeddingBaseUrl, setEmbeddingBaseUrl] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-3-small");
  const [qdrantUrl, setQdrantUrl] = useState("http://127.0.0.1:6333");
  const [qdrantApiKey, setQdrantApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [healthTick, setHealthTick] = useState(0);

  function applySettings(data: Settings) {
    setSettings(data);
    setOpenaiBaseUrl(data.openaiBaseUrl);
    setOpenaiModel(data.openaiModel);
    setEmbeddingSameAsChat(data.embeddingSameAsChat);
    setEmbeddingBaseUrl(data.embeddingBaseUrl);
    setEmbeddingModel(data.embeddingModel);
    setQdrantUrl(data.qdrantUrl);
    const match = presets.find(
      (item) => item.baseURL === data.openaiBaseUrl || (item.id === "openai" && !data.openaiBaseUrl),
    );
    if (match) setPreset(match.id);
  }

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: Settings) => applySettings(data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load keys"));
  }, []);

  function applyPreset(id: string) {
    const next = presets.find((item) => item.id === id);
    if (!next) return;
    setPreset(id);
    setOpenaiBaseUrl(next.baseURL);
    if (next.chatModel) setOpenaiModel(next.chatModel);
    if (next.embedModel) setEmbeddingModel(next.embedModel);
    if (id === "groq") setEmbeddingSameAsChat(false);
    if (id === "ollama" && !openaiApiKey) setOpenaiApiKey("ollama");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          openaiApiKey: openaiApiKey || undefined,
          openaiBaseUrl,
          openaiModel,
          embeddingSameAsChat,
          embeddingApiKey: embeddingSameAsChat ? undefined : embeddingApiKey || undefined,
          embeddingBaseUrl: embeddingSameAsChat ? undefined : embeddingBaseUrl,
          embeddingModel,
          qdrantUrl,
          qdrantApiKey: qdrantApiKey || undefined,
          applyModelsToWorkflows: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      applySettings(data);
      setOpenaiApiKey("");
      setEmbeddingApiKey("");
      setQdrantApiKey("");
      setSaved(true);
      setHealthTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const hint = presets.find((item) => item.id === preset)?.hint;

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center justify-between border-b border-line px-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-mono text-sm tracking-[0.2em] text-copper">
            ARC
          </Link>
          <span className="text-sm text-muted">Keys</span>
        </div>
        <KeyBanner key={healthTick} />
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-medium tracking-tight">Providers</h1>
        <p className="mt-2 text-sm text-muted">
          Chat, embeddings, rewrite, route, grade, and rerank all use this one OpenAI-compatible key.
          Keys stay on this machine in <span className="font-mono text-text">data/settings.json</span> (gitignored).
          Leave a key blank to keep the one already saved.
        </p>

        <form onSubmit={save} className="mt-8 space-y-8">
          <section className="space-y-3">
            <div className="text-sm font-medium">Chat provider</div>
            <div className="flex flex-wrap gap-2">
              {presets.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => applyPreset(item.id)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition",
                    preset === item.id
                      ? "border-copper/60 bg-copper/10 text-text"
                      : "border-line text-muted hover:text-text",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {hint ? <p className="text-xs text-muted">{hint}</p> : null}
            <label className="block space-y-1.5">
              <span className="text-xs text-muted">
                API key
                {settings?.openaiKeySet ? ` · saved …${settings.openaiKeyLast4}` : " · required for chat"}
              </span>
              <Input
                type="password"
                autoComplete="off"
                placeholder={settings?.openaiKeySet ? "Leave blank to keep the saved key" : "sk-… or provider key"}
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted">Base URL · empty = OpenAI</span>
              <Input
                placeholder="https://api.openai.com/v1"
                value={openaiBaseUrl}
                onChange={(e) => setOpenaiBaseUrl(e.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted">Chat model · applied to generate nodes</span>
              <Input value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)} />
            </label>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Embeddings</div>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={embeddingSameAsChat}
                  onChange={(e) => setEmbeddingSameAsChat(e.target.checked)}
                />
                Same as chat
              </label>
            </div>
            {embeddingSameAsChat ? (
              <p className="text-xs text-muted">
                Uses the chat key and base URL. Model below still needs to be an embedding model.
              </p>
            ) : (
              <>
                <label className="block space-y-1.5">
                  <span className="text-xs text-muted">
                    Embedding API key
                    {settings?.embeddingKeySet ? ` · saved …${settings.embeddingKeyLast4}` : ""}
                  </span>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="Leave blank to keep the saved key"
                    value={embeddingApiKey}
                    onChange={(e) => setEmbeddingApiKey(e.target.value)}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs text-muted">Embedding base URL</span>
                  <Input
                    value={embeddingBaseUrl}
                    onChange={(e) => setEmbeddingBaseUrl(e.target.value)}
                  />
                </label>
              </>
            )}
            <label className="block space-y-1.5">
              <span className="text-xs text-muted">Embedding model · applied to embed nodes</span>
              <Input value={embeddingModel} onChange={(e) => setEmbeddingModel(e.target.value)} />
            </label>
          </section>

          <section className="space-y-3">
            <div className="text-sm font-medium">Qdrant</div>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted">URL</span>
              <Input value={qdrantUrl} onChange={(e) => setQdrantUrl(e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted">
                API key {settings?.qdrantKeySet ? "· saved" : "· local Docker needs none"}
              </span>
              <Input
                type="password"
                autoComplete="off"
                placeholder="Leave blank to keep the saved key"
                value={qdrantApiKey}
                onChange={(e) => setQdrantApiKey(e.target.value)}
              />
            </label>
          </section>

          {error ? <p className="text-sm text-bad">{error}</p> : null}
          {saved ? (
            <p className="text-sm text-good">Saved. Chat and embed nodes now use these models.</p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save keys"}
          </Button>
        </form>
      </main>
    </div>
  );
}
