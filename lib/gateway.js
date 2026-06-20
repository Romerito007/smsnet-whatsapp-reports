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
  let scheme = "http", defaultHost = "", defaultPort = "";
  try {
    const u = new URL(raw);
    scheme = u.protocol.replace(":", "");
    defaultHost = u.hostname;
    defaultPort = u.port || "";
  } catch {
    /* leave defaults */
  }
  return { scheme, defaultHost, defaultPort, basePath, authPassword };
}

export function gatewayInfo() {
  const { scheme, defaultHost, defaultPort, basePath } = getConfig();
  return { host: defaultHost, scheme, defaultPort, basePath };
}

export function resolveOrigin({ host, port } = {}) {
  const { scheme, defaultHost, defaultPort, basePath } = getConfig();
  const h = (host || "").trim() || defaultHost;
  const p = port == null ? "" : String(port).trim();
  const n = parseInt(p, 10);
  const validPort = !isNaN(n) && n >= 1 && n <= 65535;
  const usePort = validPort ? p : (defaultPort || "");
  const origin = `${scheme}://${h}${usePort ? `:${usePort}` : ""}`;
  return { origin, basePath };
}

const tokenCache = new Map();

function jwtExp(token) {
  try {
    const seg = token.split(".")[1];
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    return Number(json.exp) || 0;
  } catch {
    return 0;
  }
}

function cacheKey(wid, host, port) {
  const { defaultHost } = getConfig();
  return `${wid}|${(host || "").trim() || defaultHost}|${port || ""}`;
}

export async function getBearer({ wid, port, host }) {
  if (!wid) throw new Error("WID da instância é obrigatório para autenticar.");
  const { authPassword } = getConfig();
  if (!authPassword)
    throw new Error("GATEWAY_AUTH_PASSWORD não configurado no servidor.");

  const key = cacheKey(wid, host, port);
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(key);
  if (cached && cached.exp > now + 30) return cached.token;

  const { origin, basePath } = resolveOrigin({ host, port });
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

export async function gatewayFetch(path, init = {}, { wid, port, host } = {}) {
  const { origin, basePath } = resolveOrigin({ host, port });
  const token = await getBearer({ wid, port, host });
  const key = cacheKey(wid, host, port);

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

  if (res.status === 401) {
    tokenCache.delete(key);
    const freshToken = await getBearer({ wid, port, host });
    res = await doFetch(freshToken);
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    console.error("gateway fetch fail", origin + basePath + path, res.status);
  }

  return { ok: res.ok, status: res.status, data };
}
