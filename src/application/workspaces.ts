import "server-only";

import { newId, workflowTemplates, type TemplateId } from "@/domain";
import * as repos from "@/adapters/db/repos";

export async function createWorkspace(input: {
  name: string;
  description?: string;
  template?: TemplateId;
}) {
  const now = Date.now();
  const id = newId("workspace");
  const workflowId = newId("workflow");
  const template = workflowTemplates[input.template ?? "balanced"];
  await repos.insertWorkspace({
    id,
    name: input.name.trim() || "Untitled workspace",
    description: input.description?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
    activeWorkflowId: workflowId,
    isSample: false,
  });
  await repos.insertWorkflow({
    id: workflowId,
    workspaceId: id,
    name: `${template.name} v1`,
    graph: template.graph,
    createdAt: now,
    isActive: true,
  });
  const datasetId = newId("dataset");
  await repos.insertDataset({
    id: datasetId,
    workspaceId: id,
    name: "Golden set",
    createdAt: now,
  });
  return (await repos.getWorkspace(id))!;
}

export async function duplicateWorkflow(workspaceId: string, workflowId: string, name?: string) {
  const wf = await repos.getWorkflow(workflowId);
  if (!wf || wf.workspaceId !== workspaceId) return null;
  const copy = {
    id: newId("workflow"),
    workspaceId,
    name: name?.trim() || `${wf.name} copy`,
    graph: wf.graph,
    createdAt: Date.now(),
    isActive: false,
  };
  await repos.insertWorkflow(copy);
  return copy;
}
