export function createClient(fetchImpl, opts = {}) {
  const cache = new Map();
  const retries = opts.retries ?? 1;

  function cacheKey(url) {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }

  async function get(url) {
    const key = cacheKey(url);
    if (cache.has(key)) return cache.get(key);
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetchImpl(url);
        if (!res.ok) throw new Error(String(res.status));
        cache.set(key, res.body);
        return res.body;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  return { get, cache };
}
