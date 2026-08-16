import "server-only";

import { newId } from "@/domain";
import { workflowTemplates } from "@/domain/templates";
import * as repos from "@/adapters/db/repos";
import { ingestText } from "./ingest";
import { hasOpenAiKey } from "@/adapters/openai";

const pto = `# Time off — Northstar Handbook

Full-time employees receive 20 days of paid time off (PTO) per calendar year, accrued monthly.
Unused PTO rolls over up to 5 days. After that, unused days expire on January 31.

Parental leave is 16 weeks fully paid for the primary caregiver, 6 weeks for the secondary caregiver.
PTO requests over 5 consecutive days need manager approval 14 days in advance.

Sick leave is separate: 10 days per year and does not roll over.
Employees in Germany follow local statutory leave, which supersedes this policy when it is more generous.
`;

const oncall = `# On-call — Northstar Handbook

The product engineering rotation is one week, Monday 10:00 UTC to the following Monday 10:00 UTC.
Primary on-call receives a $150/day stipend. Secondary on-call receives $50/day.

SEV-1 (customer-facing outage): page primary immediately. Acknowledge within 10 minutes.
SEV-2 (degraded): respond within 30 minutes. SEV-3: next business day.

Handoff happens in #oncall-handoff with: open incidents, risky deploys, and a health check of payments and search.
Do not ship schema migrations while you are primary on-call unless a SEV-1 requires it.
`;

const refunds = `# Refunds — Northstar Handbook

Self-serve monthly plans: full refund within 14 days of charge if usage is under 1,000 API calls.
Annual plans: prorated refund within 30 days, minus the current month.

Chargebacks: pause the workspace, notify finance, do not restore access until the dispute closes.
Enterprise contracts follow the MSA. This handbook does not override an MSA.

Credits for incidents: SEV-1 lasting over 2 hours earns 10% of that month's bill as account credit, requested via support.
`;

const architecture = `# Platform architecture — Northstar Handbook

Northstar is a document search API. Ingest goes through the Parser service, then Chunker, then Embedder (text-embedding-3-large in production).
Vectors live in the retrieval cluster. The Query service does hybrid search: dense + lexical, then a cross-encoder rerank.

The public API is api.northstar.dev. Staging is api.staging.northstar.dev.
PII must not be written to application logs. Use the redaction filter in the Logger SDK.

The only production region is eu-west-1. US data residency is not available yet — say so if a prospect asks.
`;

export async function seedSampleWorkspace() {
  const existing = await repos.listWorkspaces();
  if (existing.some((w) => w.isSample)) return existing.find((w) => w.isSample)!;

  const now = Date.now();
  const workspaceId = newId("workspace");
  const workflowId = newId("workflow");
  await repos.insertWorkspace({
    id: workspaceId,
    name: "Northstar Handbook",
    description: "Sample knowledge base — PTO, on-call, refunds, architecture. Run evals on this.",
    createdAt: now,
    updatedAt: now,
    activeWorkflowId: workflowId,
    isSample: true,
  });
  await repos.insertWorkflow({
    id: workflowId,
    workspaceId,
    name: "Fast v1",
    graph: workflowTemplates.fast.graph,
    createdAt: now,
    isActive: true,
  });

  const docs = [
    { name: "pto.md", text: pto },
    { name: "oncall.md", text: oncall },
    { name: "refunds.md", text: refunds },
    { name: "architecture.md", text: architecture },
  ];

  if (hasOpenAiKey()) {
    for (const doc of docs) {
      try {
        await ingestText({ workspaceId, name: doc.name, kind: "md", text: doc.text });
      } catch {
        // ingestText already stores the source with status=error
      }
    }
  } else {
    for (const doc of docs) {
      await repos.insertSource({
        id: newId("source"),
        workspaceId,
        kind: "md",
        name: doc.name,
        status: "pending",
        byteSize: doc.text.length,
        rawText: doc.text,
        error: "Add OPENAI_API_KEY and reindex to embed this source.",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  const datasetId = newId("dataset");
  await repos.insertDataset({
    id: datasetId,
    workspaceId,
    name: "Handbook golden set",
    createdAt: Date.now(),
  });
  await repos.replaceEvalItems(datasetId, [
    {
      id: newId("evalItem"),
      datasetId,
      question: "How many PTO days do full-time employees get?",
      expectedAnswer: "20 days per calendar year, accrued monthly.",
    },
    {
      id: newId("evalItem"),
      datasetId,
      question: "What is the SEV-1 acknowledge time for on-call?",
      expectedAnswer: "Acknowledge within 10 minutes.",
    },
    {
      id: newId("evalItem"),
      datasetId,
      question: "Can a monthly plan get a full refund after 20 days?",
      expectedAnswer: "No. Full refunds are only within 14 days of charge, and only if usage is under 1,000 API calls.",
    },
    {
      id: newId("evalItem"),
      datasetId,
      question: "Which AWS region is production in?",
      expectedAnswer: "eu-west-1. US data residency is not available yet.",
    },
    {
      id: newId("evalItem"),
      datasetId,
      question: "What stipend does secondary on-call receive?",
      expectedAnswer: "$50 per day.",
    },
  ]);

  return (await repos.getWorkspace(workspaceId))!;
}

export async function ensureReady() {
  const list = await repos.listWorkspaces();
  if (list.length === 0) await seedSampleWorkspace();
}
