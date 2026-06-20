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
  let scheme = "http", host = "", urlPort = "";
  try {
    const u = new URL(raw);
    scheme = u.protocol.replace(":", "");
    host = u.hostname;
    urlPort = u.port || "";
  } catch {
    /* leave defaults */
  }
  // Porta central: da URL ou GATEWAY_CORE_PORT ou default 1000
  const corePort = urlPort || (process.env.GATEWAY_CORE_PORT || "1000");
  const origin = `${scheme}://${host}${corePort ? `:${corePort}` : ""}`;
  return { origin, basePath, authPassword, corePort };
}

export function gatewayInfo() {
  const { origin, basePath } = getConfig();
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

function clampTimeout(ms) {
  const n = Number(ms);
  if (!isNaN(n) && n >= 5000) return Math.min(n, 300000);
  return Number(process.env.GATEWAY_TIMEOUT_MS) || 60000;
}

function withTimeout(ms, fn) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fn(ctrl.signal).finally(() => clearTimeout(t));
}

export async function getBearer({ wid, timeoutMs }) {
  if (!wid) throw new Error("WID da instância é obrigatório para autenticar.");
  const { origin, basePath, authPassword, corePort } = getConfig();
  if (!authPassword)
    throw new Error("GATEWAY_AUTH_PASSWORD não configurado no servidor.");

  const key = `${wid}|${origin}`;
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(key);
  if (cached && cached.exp > now + 30) return cached.token;

  const credentials = Buffer.from(`${wid}:${authPassword}`).toString("base64");
  const ms = clampTimeout(timeoutMs);

  let res;
  try {
    res = await withTimeout(ms, (signal) =>
      fetch(origin + basePath + "/auth", {
        method: "GET",
        headers: { Authorization: `Basic ${credentials}` },
        cache: "no-store",
        signal,
      })
    );
  } catch (e) {
    const secs = Math.round(ms / 1000);
    if (e.name === "AbortError") {
      throw new Error(`Falha/timeout ao autenticar no gateway (/auth) na porta ${corePort} em ${secs}s.`);
    }
    throw new Error(`Falha ao autenticar no gateway (/auth) na porta ${corePort}: ${e.message}`);
  }

  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }

  const token = json?.data?.token;
  if (!res.ok || !token) {
    throw new Error(
      `Falha ao autenticar no gateway (/auth) na porta ${corePort}: ` +
      (json?.message || res.status)
    );
  }

  const exp = jwtExp(token) || now + 600;
  tokenCache.set(key, { token, exp });
  return token;
}

export async function gatewayFetch(path, init = {}, { wid, timeoutMs } = {}) {
  const { origin, basePath, corePort } = getConfig();
  const token = await getBearer({ wid, timeoutMs });
  const key = `${wid}|${origin}`;
  const ms = clampTimeout(timeoutMs);
  const fullPath = origin + basePath + path;

  const doFetch = (tok, signal) =>
    fetch(fullPath, {
      ...init,
      headers: {
        Authorization: `Bearer ${tok}`,
        ...(init.headers || {}),
      },
      cache: "no-store",
      signal,
    });

  let res;
  try {
    res = await withTimeout(ms, (signal) => doFetch(token, signal));
  } catch (e) {
    if (e.name === "AbortError") {
      const secs = Math.round(ms / 1000);
      throw new Error(`Tempo esgotado consultando ${path} (porta ${corePort}) em ${secs}s.`);
    }
    console.error("gateway fetch fail", fullPath, e.message);
    throw e;
  }

  if (res.status === 401) {
    tokenCache.delete(key);
    const freshToken = await getBearer({ wid, timeoutMs });
    try {
      res = await withTimeout(ms, (signal) => doFetch(freshToken, signal));
    } catch (e) {
      if (e.name === "AbortError") {
        const secs = Math.round(ms / 1000);
        throw new Error(`Tempo esgotado consultando ${path} (porta ${corePort}) em ${secs}s.`);
      }
      console.error("gateway fetch fail (retry)", fullPath, e.message);
      throw e;
    }
  }

  if (!res.ok) {
    console.error("gateway fetch fail", fullPath, res.status);
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
