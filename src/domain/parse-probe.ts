import { z } from "zod";
import { ArcError } from "./ports.ts";
import { isProbeKind, probeKinds, type ProbeSpec } from "./models.ts";

export const probeSpecSchema = z.object({
  kind: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export function parseProbeSpec(input: unknown): ProbeSpec {
  const parsed = probeSpecSchema.safeParse(input);
  if (!parsed.success) {
    throw new ArcError("Not a ProbeSpec.", "invalid_probe");
  }
  if (!isProbeKind(parsed.data.kind)) {
    throw new ArcError(
      `Unknown ProbeKind "${parsed.data.kind}". Catalog: ${probeKinds.join(", ")}.`,
      "unknown_probe_kind",
    );
  }
  return { kind: parsed.data.kind, params: parsed.data.params };
}
