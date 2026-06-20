function normalizePath(p) {
  let s = (p || "").trim();
  if (!s || s === "/") return "";
  if (!s.startsWith("/")) s = "/" + s;
  return s.replace(/\/+$/, "");
}

export function gatewayInfo() {
  const raw = (process.env.GATEWAY_BASE_URL || "").trim();
  const basePath = normalizePath(process.env.GATEWAY_BASE_PATH || "/api/v1/whatsapp");
  let scheme = "http", host = "", defaultPort = "80";
  try {
    const u = new URL(raw);
    scheme = u.protocol.replace(":", "");
    host = u.hostname;
    defaultPort = u.port || (scheme === "https" ? "443" : "80");
  } catch {
    /* leave defaults */
  }
  return { host, scheme, defaultPort, basePath };
}

export async function gatewayFetch(path, init = {}, port) {
  const token = process.env.GATEWAY_TOKEN || "";
  if (!token) throw new Error("GATEWAY_TOKEN não configurado no servidor.");

  const { scheme, host, defaultPort, basePath } = gatewayInfo();
  let p = port == null ? "" : String(port).trim();
  const n = parseInt(p, 10);
  if (!p || isNaN(n) || n < 1 || n > 65535) p = defaultPort;

  const origin = `${scheme}://${host}:${p}`;
  const res = await fetch(origin + basePath + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}
