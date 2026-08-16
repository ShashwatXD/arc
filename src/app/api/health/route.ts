import { NextResponse } from "next/server";
import { hasOpenAiKey } from "@/adapters/openai";
import { getServices } from "@/lib/composition";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const qdrant = await getServices().retrieval.ping();
  return NextResponse.json({
    openai: hasOpenAiKey(),
    qdrant,
    qdrantUrl: env().QDRANT_URL,
    model: env().OPENAI_MODEL,
  });
}
