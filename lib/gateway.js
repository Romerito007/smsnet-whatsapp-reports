function normalizePath(p) {
  let s = (p || "").trim();
  if (!s || s === "/") return "";
  if (!s.startsWith("/")) s = "/" + s;
  return s.replace(/\/+$/, "");
}

function getConfig() {
  const raw = (process.env.GATEWAY_BASE_URL || "").trim();
  const basePath = normalizePath(process.env.GATEWAY_BASE_PATH || "/api/v1/whatsapp");
  const authPassword = process.env.GATEWAY_AUTH_PASSWORD || "";
  let scheme = "http", host = "", defaultPort = "";
  try {
    const u = new URL(raw);
    scheme = u.protocol.replace(":", "");
    host = u.hostname;
    defaultPort = u.port || "";
  } catch {
    /* leave defaults */
  }
  return { scheme, host, defaultPort, basePath, authPassword };
}

export function gatewayInfo() {
  const { scheme, host, defaultPort, basePath } = getConfig();
  return { host, scheme, defaultPort, basePath };
}

export function resolveOrigin(port) {
  const { scheme, host, defaultPort, basePath } = getConfig();
  const p = port == null ? "" : String(port).trim();
  const n = parseInt(p, 10);
  const validPort = !isNaN(n) && n >= 1 && n <= 65535;
  const usePort = validPort ? p : (defaultPort || "");
  const origin = `${scheme}://${host}${usePort ? `:${usePort}` : ""}`;
  return { origin, basePath };
}

// Token cache keyed by `${wid}|${port}`
const tokenCache = new Map();

function jwtExp(token) {
  try {
    const seg = token.split(".")[1];
    // base64url -> base64
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    return Number(json.exp) || 0;
  } catch {
    return 0;
  }
}

export async function getBearer({ wid, port }) {
  if (!wid) throw new Error("WID da instância é obrigatório para autenticar.");
  const { authPassword } = getConfig();
  if (!authPassword)
    throw new Error("GATEWAY_AUTH_PASSWORD não configurado no servidor.");

  const key = `${wid}|${port || ""}`;
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(key);
  if (cached && cached.exp * 1 > now + 30) return cached.token;

  const { origin, basePath } = resolveOrigin(port);
  const credentials = Buffer.from(`${wid}:${authPassword}`).toString("base64");
  const res = await fetch(origin + basePath + "/auth", {
    method: "GET",
    headers: { Authorization: `Basic ${credentials}` },
    cache: "no-store",
  });

  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }

  const token = json?.data?.token;
  if (!res.ok || !token) {
    throw new Error(
      "Falha ao autenticar no gateway (/auth): " + (json?.message || res.status)
    );
  }

  const exp = jwtExp(token) || now + 600;
  tokenCache.set(key, { token, exp });
  return token;
}

/**
 * Fetches from the gateway with per-instance Bearer auth.
 * @param {string} path  - gateway route (e.g. "/queued-ledger/stats")
 * @param {object} init  - fetch init options (method, headers, body…)
 * @param {{ wid: string, port: string|number }} instance
 */
export async function gatewayFetch(path, init = {}, { wid, port } = {}) {
  const { origin, basePath } = resolveOrigin(port);
  const token = await getBearer({ wid, port });
  const key = `${wid}|${port || ""}`;

  const doFetch = (tok) =>
    fetch(origin + basePath + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${tok}`,
        ...(init.headers || {}),
      },
      cache: "no-store",
    });

  let res = await doFetch(token);

  // Single retry on 401: evict cache and re-auth
  if (res.status === 401) {
    tokenCache.delete(key);
    const freshToken = await getBearer({ wid, port });
    res = await doFetch(freshToken);
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}
