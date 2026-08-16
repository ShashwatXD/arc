import type { LlmMessage, RetrievedChunk } from "./ports";

export function buildGenerateMessages(
  question: string,
  chunks: RetrievedChunk[],
  systemPrompt: string,
  history: LlmMessage[],
): LlmMessage[] {
  const sourceBlock = chunks
    .map((chunk, i) => `[${i + 1}] (${chunk.sourceName} #${chunk.ordinal + 1})\n${chunk.text}`)
    .join("\n\n");
  const context = chunks.length === 0 ? "No sources were retrieved. Say you do not know." : sourceBlock;
  const recent = history.slice(-6);
  return [
    { role: "system", content: systemPrompt },
    ...recent,
    {
      role: "user",
      content: `Sources:\n${context}\n\nQuestion: ${question}\n\nAnswer from the sources. Cite as [n].`,
    },
  ];
}
