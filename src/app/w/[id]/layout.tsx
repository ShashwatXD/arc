import { WorkspaceChrome } from "@/ui/workspace-chrome";
import * as repos from "@/adapters/db/repos";
import { ensureReady } from "@/application/seed";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await ensureReady();
  const { id } = await params;
  const workspace = await repos.getWorkspace(id);
  if (!workspace) notFound();
  return (
    <div className="min-h-screen">
      <WorkspaceChrome workspaceId={id} name={workspace.name} />
      {children}
    </div>
  );
}
