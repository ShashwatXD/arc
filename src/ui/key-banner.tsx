"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "./badge";

type Health = { openai: boolean; qdrant: boolean };

export function KeyBanner() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ openai: false, qdrant: false }));
  }, []);
  if (!health) return null;
  return (
    <Link href="/settings" className="flex items-center gap-2" title="Open keys">
      <Badge tone={health.openai ? "good" : "bad"}>{health.openai ? "Chat key" : "Add chat key"}</Badge>
      <Badge tone={health.qdrant ? "good" : "bad"}>{health.qdrant ? "Qdrant" : "Qdrant down"}</Badge>
    </Link>
  );
}
