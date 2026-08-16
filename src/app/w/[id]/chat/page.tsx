import { ChatStudio } from "@/ui/chat-studio";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatStudio workspaceId={id} />;
}
