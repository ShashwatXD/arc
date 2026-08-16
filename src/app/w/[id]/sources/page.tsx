import { SourcesStudio } from "@/ui/sources-studio";

export default async function SourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SourcesStudio workspaceId={id} />;
}
