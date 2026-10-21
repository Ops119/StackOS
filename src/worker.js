// StackOS Worker: serves the static SPA and proxies the official MCP Registry (cached) for the "Live scan".
const REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/registry") return registry(request, url, ctx);
    if (url.pathname === "/api/health") return Response.json({ ok: true, app: "StackOS" });
    return env.ASSETS.fetch(request);
  },
};

async function registry(request, url, ctx) {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const search = (url.searchParams.get("search") || "").slice(0, 80);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "30", 10) || 30, 1), 50);
  const upstream = new URL(REGISTRY);
  upstream.searchParams.set("limit", String(limit));
  upstream.searchParams.set("version", "latest");
  if (search) upstream.searchParams.set("search", search);

  const cacheKey = new Request("https://stackos.cache/registry?" + upstream.searchParams.toString());
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  try {
    const r = await fetch(upstream, { headers: { accept: "application/json", "user-agent": "StackOS/1.0" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return Response.json({ error: "registry " + r.status, servers: [] }, { status: 502 });
    const data = await r.json();
    const res = Response.json({ servers: data.servers || [], metadata: data.metadata || {} }, {
      headers: { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" },
    });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    return Response.json({ error: "registry unreachable", servers: [] }, { status: 504 });
  }
}
