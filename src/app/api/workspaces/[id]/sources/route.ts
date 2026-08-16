import { NextResponse } from "next/server";
import * as repos from "@/adapters/db/repos";
import { extractFromFile, extractFromUrl } from "@/adapters/parse";
import { ingestText } from "@/application/ingest";
import { jsonError, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sources = await repos.listSources(id);
    return NextResponse.json({
      sources: sources.map((s) => ({ ...s, rawText: s.rawText.slice(0, 4000) })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file is required" }, { status: 400 });
      }
      const extracted = await extractFromFile(file);
      const source = await ingestText({
        workspaceId: id,
        name: extracted.name,
        kind: extracted.kind,
        text: extracted.text,
        byteSize: file.size,
      });
      return NextResponse.json({ source }, { status: 201 });
    }
    const body = await readJson<{ url?: string; note?: string; name?: string }>(request);
    if (body.url) {
      const extracted = await extractFromUrl(body.url);
      const source = await ingestText({
        workspaceId: id,
        name: extracted.name,
        kind: "url",
        text: extracted.text,
      });
      return NextResponse.json({ source }, { status: 201 });
    }
    if (body.note) {
      const source = await ingestText({
        workspaceId: id,
        name: body.name?.trim() || "Note",
        kind: "note",
        text: body.note,
      });
      return NextResponse.json({ source }, { status: 201 });
    }
    return NextResponse.json({ error: "Provide a file, url, or note." }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
