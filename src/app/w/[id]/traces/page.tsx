import { TracesStudio } from "@/ui/traces-studio";

export default async function TracesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TracesStudio workspaceId={id} />;
}
