function normalizePath(p) {
  let s = (p || "").trim();
  if (!s || s === "/") return "";
  if (!s.startsWith("/")) s = "/" + s;
  return s.replace(/\/+$/, "");
}

function hostLabel(url) {
  try {
    const u = new URL(url);
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    return url;
  }
}

function parseInstances(raw) {
  if (!raw) return [];
  const s = raw.trim();
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      return (Array.isArray(arr) ? arr : [])
        .map((i) => ({
          label: (i.label || hostLabel(i.baseUrl || "")).trim(),
          baseUrl: (i.baseUrl || "").trim().replace(/\/+$/, ""),
          token: i.token ? String(i.token) : undefined,
        }))
        .filter((i) => i.baseUrl);
    } catch {
      /* fall through to simple format */
    }
  }
  // Simple format: "label = url ; label2 = url2" (or just "url ; url2")
  return s
    .split(/[;\n]+/)
    .map((line) => {
      const t = line.trim();
      if (!t) return null;
      const eq = t.indexOf("=");
      if (eq === -1) return { label: hostLabel(t), baseUrl: t.replace(/\/+$/, "") };
      return {
        label: t.slice(0, eq).trim(),
        baseUrl: t.slice(eq + 1).trim().replace(/\/+$/, ""),
      };
    })
    .filter((x) => x && x.baseUrl);
}

function getConfig() {
  return {
    instances: parseInstances(process.env.GATEWAY_INSTANCES),
    fallbackBaseUrl: (process.env.GATEWAY_BASE_URL || "").trim().replace(/\/+$/, ""),
    basePath: normalizePath(process.env.GATEWAY_BASE_PATH || "/api/v1/whatsapp"),
    token: process.env.GATEWAY_TOKEN || "",
    allowedSuffixes: (process.env.GATEWAY_ALLOWED_HOST_SUFFIXES || "smsnet.com.br")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  };
}

export function listInstances() {
  const cfg = getConfig();
  const list = cfg.instances.map((i) => ({ label: i.label, baseUrl: i.baseUrl }));
  if (list.length === 0 && cfg.fallbackBaseUrl) {
    list.push({ label: hostLabel(cfg.fallbackBaseUrl), baseUrl: cfg.fallbackBaseUrl });
  }
  return list;
}

function hostnameOf(u) {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isAllowed(baseUrl, cfg) {
  const norm = baseUrl.replace(/\/+$/, "");
  if (cfg.instances.some((i) => i.baseUrl.replace(/\/+$/, "") === norm)) return true;
  if (cfg.fallbackBaseUrl && cfg.fallbackBaseUrl === norm) return true;
  const host = hostnameOf(baseUrl);
  if (!host) return false;
  return cfg.allowedSuffixes.some((sfx) => host === sfx || host.endsWith("." + sfx));
}

function resolveTarget(requestedBaseUrl) {
  const cfg = getConfig();
  if (!cfg.token) throw new Error("GATEWAY_TOKEN não configurado no servidor.");

  let baseUrl = (requestedBaseUrl || "").trim().replace(/\/+$/, "");
  if (baseUrl) {
    if (!isAllowed(baseUrl, cfg)) {
      throw new Error(
        "Endpoint não permitido. Cadastre-o em GATEWAY_INSTANCES ou ajuste GATEWAY_ALLOWED_HOST_SUFFIXES."
      );
    }
  } else {
    const list = listInstances();
    if (list.length === 0) {
      throw new Error("Nenhuma instância configurada (GATEWAY_INSTANCES ou GATEWAY_BASE_URL).");
    }
    baseUrl = list[0].baseUrl.replace(/\/+$/, "");
  }

  const inst = cfg.instances.find((i) => i.baseUrl.replace(/\/+$/, "") === baseUrl);
  const token = inst && inst.token ? inst.token : cfg.token;
  return { baseUrl, basePath: cfg.basePath, token };
}

/**
 * Chama o gateway injetando o Bearer no servidor.
 * `requestedBaseUrl` é a instância escolhida no painel (validada por allowlist).
 */
export async function gatewayFetch(path, init = {}, requestedBaseUrl) {
  const { baseUrl, basePath, token } = resolveTarget(requestedBaseUrl);
  const res = await fetch(baseUrl + basePath + path, {
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
