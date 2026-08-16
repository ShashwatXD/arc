import { nanoid } from "nanoid";

const prefixes = {
  workspace: "ws",
  source: "src",
  chunk: "chk",
  workflow: "wf",
  conversation: "cv",
  message: "msg",
  dataset: "ds",
  evalItem: "ei",
  evalRun: "er",
  evalResult: "rs",
  trace: "tr",
} as const;

export type IdKind = keyof typeof prefixes;

export function newId(kind: IdKind): string {
  return `${prefixes[kind]}_${nanoid(12)}`;
}
