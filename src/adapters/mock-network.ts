export function mockNetwork(sequence: string[]) {
  let i = 0;
  return {
    calls: () => i,
    fetch: async (url: string) => {
      const step = sequence[Math.min(i, sequence.length - 1)] ?? "ok";
      i += 1;
      if (step === "fail") return { ok: false, status: 503, body: "down" };
      return { ok: true, status: 200, body: `ok:${url}` };
    },
  };
}
