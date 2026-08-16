import { newId } from "@/domain/ids";
import * as repos from "@/adapters/db/repos";
import { persistTrace } from "@/application/run-workflow";
import { getServices } from "@/lib/composition";
import { jsonError, readJson } from "@/lib/http";
import type { LlmMessage } from "@/domain/ports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson<{
      message: string;
      conversationId?: string;
    }>(request);
    const question = body.message?.trim();
    if (!question) {
      return new Response(JSON.stringify({ error: "message required" }), { status: 400 });
    }

    let conversationId = body.conversationId;
    if (!conversationId) {
      conversationId = newId("conversation");
      await repos.insertConversation({
        id: conversationId,
        workspaceId: id,
        title: question.slice(0, 72),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    const prior = await repos.listMessages(conversationId);
    const history: LlmMessage[] = prior.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    await repos.insertMessage({
      id: newId("message"),
      conversationId,
      role: "user",
      content: question,
      citations: [],
      traceId: null,
      createdAt: Date.now(),
    });

    const { runner, llm } = getServices();
    const retrieved = await runner.retrieve({
      workspaceId: id,
      question,
      history,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        try {
          send("meta", {
            conversationId,
            citations: retrieved.citations,
            rewritten: retrieved.rewritten,
            steps: retrieved.traceSteps,
          });
          let full = "";
          const clock = Date.now();
          for await (const token of llm.stream({
            model: retrieved.generateConfig.model,
            temperature: retrieved.generateConfig.temperature,
            messages: retrieved.prompt,
          })) {
            full += token;
            send("token", { token });
          }
          retrieved.traceSteps.push({
            name: "generate",
            startedAt: clock,
            durationMs: Date.now() - clock,
            detail: `${full.length} chars`,
          });
          const trace = await persistTrace({
            workspaceId: id,
            kind: "chat",
            question,
            rewritten: retrieved.rewritten,
            steps: retrieved.traceSteps,
            citationCount: retrieved.citations.length,
          });
          const assistantId = newId("message");
          await repos.insertMessage({
            id: assistantId,
            conversationId: conversationId!,
            role: "assistant",
            content: full,
            citations: retrieved.citations,
            traceId: trace.id,
            createdAt: Date.now(),
          });
          await repos.updateConversationTitle(
            conversationId!,
            question.slice(0, 72),
            Date.now(),
          );
          send("done", { messageId: assistantId, traceId: trace.id });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Generation failed";
          send("error", { error: message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
