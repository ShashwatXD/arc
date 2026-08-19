import assert from "node:assert/strict";
import test from "node:test";
import { parseProbeSpec } from "./parse-probe.ts";
import { ArcError } from "./ports.ts";

test("parseProbeSpec refuses unconstrained kinds", () => {
  assert.throws(() => parseProbeSpec({ kind: "write_whatever_pytest", params: {} }), ArcError);
  assert.throws(() => parseProbeSpec({ kind: "contract.cacheHit", params: [] }), ArcError);
  const spec = parseProbeSpec({ kind: "contract.cacheHit", params: { url: "http://x" } });
  assert.equal(spec.kind, "contract.cacheHit");
});
