import { NextResponse } from "next/server";
import * as repos from "@/adapters/db/repos";
import { duplicateWorkflow } from "@/application/workspaces";
import { jsonError, readJson } from "@/lib/http";
import { workflowGraphSchema, validateGraph } from "@/domain/workflow";
import { newId } from "@/domain/ids";
import { workflowTemplates, type TemplateId } from "@/domain/templates";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const workflows = await repos.listWorkflows(id);
    return NextResponse.json({
      workflows,
      issues: Object.fromEntries(workflows.map((w) => [w.id, validateGraph(w.graph)])),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson<{
      name?: string;
      template?: TemplateId;
      duplicateFrom?: string;
    }>(request);
    if (body.duplicateFrom) {
      const copy = await duplicateWorkflow(id, body.duplicateFrom, body.name);
      if (!copy) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
      return NextResponse.json({ workflow: copy }, { status: 201 });
    }
    const template = workflowTemplates[body.template ?? "balanced"];
    const workflow = {
      id: newId("workflow"),
      workspaceId: id,
      name: body.name?.trim() || `${template.name} v${Date.now() % 1000}`,
      graph: template.graph,
      createdAt: Date.now(),
      isActive: false,
    };
    await repos.insertWorkflow(workflow);
    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson<{
      workflowId: string;
      graph?: unknown;
      name?: string;
      activate?: boolean;
    }>(request);
    if (!body.workflowId) {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    if (body.graph) {
      const graph = workflowGraphSchema.parse(body.graph);
      const issues = validateGraph(graph).filter((i) => i.level === "error");
      if (issues.length) {
        return NextResponse.json({ error: issues[0].message, issues }, { status: 400 });
      }
      await repos.saveWorkflowGraph(body.workflowId, graph, body.name);
    } else if (body.name) {
      const wf = await repos.getWorkflow(body.workflowId);
      if (wf) await repos.saveWorkflowGraph(body.workflowId, wf.graph, body.name);
    }
    if (body.activate) {
      await repos.setActiveWorkflow(id, body.workflowId);
    }
    const workflows = await repos.listWorkflows(id);
    return NextResponse.json({ workflows });
  } catch (error) {
    return jsonError(error);
  }
}
