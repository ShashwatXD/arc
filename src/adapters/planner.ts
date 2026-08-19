import OpenAI from "openai";
import { parseProbeSpec } from "../domain/parse-probe.ts";
import { probeKinds, type ProbeSpec } from "../domain/models.ts";
import type { PlannerPort } from "../domain/ports.ts";
import { heuristicNextProbe } from "../application/hypotheses.ts";

const SYSTEM = `You are Arc's planner. Return the next ProbeSpec JSON or {"kind":"stop"}.
You may only use ProbeKind values: ${probeKinds.join(", ")}.
Never write tests. Never invent a kind. Search over {hypothesis, ProbeKind, params}.
Prefer unresolved open hypotheses. Prefer contract probes before discriminators when both are open.`;

export function createPlanner(): PlannerPort {
  return {
    async nextProbe(input) {
      const fallback = heuristicNextProbe(input);
      const key = process.env.ARC_PLANNER === "heuristic" ? undefined : process.env.OPENAI_API_KEY;
      if (!key) return fallback;

      try {
        const client = new OpenAI({ apiKey: key });
        const raw = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content: JSON.stringify({
                task: input.task,
                repo: input.repo,
                api: input.api,
                hypotheses: input.hypotheses,
                observations: input.observations.map((o) => ({
                  kind: o.probe.kind,
                  passed: o.passed,
                  weakness: o.weakness,
                })),
                remainingBudget: input.remainingBudget,
              }),
            },
          ],
        });
        const text = raw.choices[0]?.message?.content ?? "{}";
        const json = JSON.parse(text) as { kind?: string };
        if (!json.kind || json.kind === "stop") return fallback && input.remainingBudget > 0 ? fallback : null;
        const spec = parseProbeSpec(json);
        const already = input.observations.some((o) => o.probe.kind === spec.kind);
        if (already) return fallback;
        return spec;
      } catch {
        return fallback;
      }
    },
  };
}

export type { ProbeSpec };
