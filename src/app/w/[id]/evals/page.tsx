import { EvalsStudio } from "@/ui/evals-studio";

export default async function EvalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EvalsStudio workspaceId={id} />;
}
