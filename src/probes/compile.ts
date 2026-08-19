import { parseProbeSpec } from "../domain/parse-probe.ts";
import { DEFAULT_BODY, DEFAULT_URL } from "../domain/hypotheses.ts";
import type { ProbeSpec } from "../domain/models.ts";

function paramString(spec: ProbeSpec, key: string, fallback: string): string {
  const value = spec.params[key];
  return typeof value === "string" ? value : fallback;
}

function paramNumber(spec: ProbeSpec, key: string, fallback: number): number {
  const value = spec.params[key];
  return typeof value === "number" ? value : fallback;
}

/** Compile a catalog ProbeSpec to node:test source. Unknown kinds never reach here. */
export function compileProbe(input: unknown, targetImport: string): { spec: ProbeSpec; source: string } {
  const spec = parseProbeSpec(input);
  const url = paramString(spec, "url", DEFAULT_URL);
  const body = paramString(spec, "body", DEFAULT_BODY);
  const retries = paramNumber(spec, "retries", 1);

  const header = `import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from ${JSON.stringify(targetImport)};
`;

  const tests: Record<ProbeSpec["kind"], string> = {
    "contract.basicGet": `
test("contract.basicGet", async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    return { ok: true, status: 200, body: ${JSON.stringify(body)} };
  }, { retries: ${retries} });
  const got = await client.get(${JSON.stringify(url)});
  assert.equal(got, ${JSON.stringify(body)});
  assert.equal(calls, 1);
});
`,
    "contract.cacheHit": `
test("contract.cacheHit", async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    return { ok: true, status: 200, body: ${JSON.stringify(body)} };
  }, { retries: ${retries} });
  await client.get(${JSON.stringify(url)});
  await client.get(${JSON.stringify(url)});
  assert.equal(calls, 1, "second GET must be served from cache");
});
`,
    "discriminator.retryVsDuplicate": `
test("discriminator.retryVsDuplicate", async () => {
  const sequence = ["fail", "ok"];
  let i = 0;
  const client = createClient(async () => {
    const step = sequence[i++] ?? "ok";
    if (step === "fail") return { ok: false, status: 503, body: "down" };
    return { ok: true, status: 200, body: ${JSON.stringify(body)} };
  }, { retries: ${retries} });
  const got = await client.get(${JSON.stringify(url)});
  assert.equal(got, ${JSON.stringify(body)});
  assert.equal(i, 2, "exactly one retry after failure");
  assert.equal(client.cache.size, 1, "one logical write");
});
`,
    "discriminator.idempotency": `
test("discriminator.idempotency", async () => {
  const a = ${JSON.stringify(url)} + "?q=1";
  const b = ${JSON.stringify(url)} + "?q=2";
  const client = createClient(async (u) => {
    return { ok: true, status: 200, body: "body-for:" + u };
  }, { retries: ${retries} });
  const left = await client.get(a);
  const right = await client.get(b);
  assert.notEqual(left, right, "query string must be part of the cache key");
  assert.equal(client.cache.size, 2);
});
`,
    "discriminator.concurrency": `
test("discriminator.concurrency", async () => {
  let inflight = 0;
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    inflight += 1;
    await new Promise((r) => setTimeout(r, 20));
    inflight -= 1;
    return { ok: true, status: 200, body: ${JSON.stringify(body)} };
  }, { retries: 0 });
  await Promise.all([client.get(${JSON.stringify(url)}), client.get(${JSON.stringify(url)})]);
  assert.equal(calls, 1, "in-flight identical GETs must coalesce");
});
`,
  };

  return { spec, source: header + tests[spec.kind] };
}
