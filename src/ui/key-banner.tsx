"use client";

import { useEffect, useState } from "react";
import { Badge } from "./badge";

type Health = { openai: boolean; cohere: boolean; qdrant: boolean };

export function KeyBanner() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ openai: false, cohere: false, qdrant: false }));
  }, []);
  if (!health) return null;
  return (
    <div className="flex items-center gap-2">
      <Badge tone={health.openai ? "good" : "bad"}>{health.openai ? "OpenAI" : "No OpenAI"}</Badge>
      <Badge tone={health.qdrant ? "good" : "bad"}>{health.qdrant ? "Qdrant" : "Qdrant down"}</Badge>
      <Badge tone={health.cohere ? "copper" : "muted"}>{health.cohere ? "Rerank" : "Rerank off"}</Badge>
    </div>
  );
}
