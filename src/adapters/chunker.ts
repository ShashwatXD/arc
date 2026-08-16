import "server-only";

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { ChunkerPort } from "@/domain/ports";

export function createLangchainChunker(): ChunkerPort {
  return {
    async split(text, size, overlap) {
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: size,
        chunkOverlap: overlap,
      });
      return (await splitter.splitText(text)).map((part) => part.trim()).filter(Boolean);
    },
  };
}
