import { NextResponse } from "next/server";
import * as repos from "@/adapters/db/repos";
import { ensureReady } from "@/application/seed";
import { createWorkspace } from "@/application/workspaces";
import { jsonError, readJson } from "@/lib/http";
import type { TemplateId } from "@/domain/templates";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureReady();
    const workspaces = await repos.listWorkspaces();
    return NextResponse.json({ workspaces });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ name?: string; description?: string; template?: TemplateId }>(request);
    const workspace = await createWorkspace({
      name: body.name ?? "Untitled workspace",
      description: body.description,
      template: body.template,
    });
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
