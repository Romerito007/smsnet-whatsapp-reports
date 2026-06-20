"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import StatsReport from "@/components/StatsReport";
import CancelPanel from "@/components/CancelPanel";
import DataTable from "@/components/DataTable";
import ThemeToggle from "@/components/ThemeToggle";
import { fmt } from "@/components/format";

const ERROR_CLASSES = [
  "",
  "contact_not_registered",
  "whatsapp_usync_timeout",
  "whatsapp_server_463",
  "whatsapp_logged_out",
  "whatsapp_temp_banned",
  "whatsapp_client_outdated",
  "unknown",
];

const DATE_BASIS = {
  created: ["dateCreatedStart", "dateCreatedEnd"],
  sent: ["dateSentStart", "dateSentEnd"],
  updated: ["dateUpdatedStart", "dateUpdatedEnd"],
};

function toISO(local) {
  if (!local) return undefined;
  const d = new Date(local);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Sessão expirada.");
  }
  const data = await res.json().catch(() => ({ error: "Resposta inválida do servidor." }));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}.`);
  return data;
}

function findArray(obj) {
  if (Array.isArray(obj)) return obj;
  if (obj && typeof obj === "object") {
    for (const k of ["messages", "data", "items", "results", "history", "rows"]) {
      if (Array.isArray(obj[k])) return obj[k];
    }
  }
  return null;
}

function instanceKey(item) {
  return `${item.srvPort}|${item.consumerId ?? ""}|${item.wid ?? ""}`;
}

function instanceLabel(item) {
  let label = `:${item.srvPort} · ${item.name || item.from || "—"} · cons ${item.consumerId ?? "—"}`;
  if (item.wid) label += ` · wid ${item.wid}`;
  if (item.status) label += ` · ${item.status}`;
  return label;
}

function matchesFilter(item, filter) {
  if (!filter) return true;
  const q = filter.toLowerCase();
  return [
    item.name,
    item.from,
    item.wid,
    item.consumerId != null ? String(item.consumerId) : null,
    item.srvPort != null ? String(item.srvPort) : null,
    item.queueName,
    item.srvName,
  ].some((v) => v && v.toLowerCase().includes(q));
}

function parseConsumerIds(str) {
  return String(str || "").split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function ResultView({ data }) {
  if (!data) return null;
  if (data.error) return <div className="error-box">{fmt(data.error)}</div>;
  const arr = findArray(data);
  return (
    <div>
      {arr ? (
        <div className="section">
          <h3>
            Mensagens <span className="count">{arr.length}</span>
          </h3>
          {arr.length ? (
            <DataTable rows={arr} max={500} />
          ) : (
            <div className="empty">Nenhuma mensagem retornada.</div>
          )}
        </div>
      ) : (
        <div className="empty">
          Resposta sem lista de mensagens reconhecível — veja o JSON abaixo.
        </div>
      )}
      <details className="raw">
        <summary>JSON bruto</summary>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  );
}

const READONLY_STYLE = { color: "var(--muted)", background: "var(--surface-2)", cursor: "default" };

export default function Dashboard() {
  const router = useRouter();

  const [defaultPort, setDefaultPort] = useState("");

  // Instance selector
  const [instances, setInstances] = useState([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [instancesError, setInstancesError] = useState("");
  const [instanceFilter, setInstanceFilter] = useState("");
  const [onlyOnline, setOnlyOnline] = useState(true);
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedInstance, setSelectedInstance] = useState(null);

  // Server-side search inputs (committed on button/Enter)
  const [searchWid, setSearchWid] = useState("");
  const [searchConsumer, setSearchConsumer] = useState("");
  const [searchPort, setSearchPort] = useState("");
  const [committedWid, setCommittedWid] = useState("");
  const [committedConsumer, setCommittedConsumer] = useState("");
  const [committedPort, setCommittedPort] = useState("");

  // Derived from selected instance (readonly in querybar)
  const [hostInst, setHostInst] = useState("");
  const [port, setPort] = useState("");
  const [wid, setWid] = useState("");
  const [consumer, setConsumer] = useState("");
  const [queueNames, setQueueNames] = useState("");

  // Shared filters (editable)
  const [messageKind, setMessageKind] = useState("");
  const [dateBasis, setDateBasis] = useState("created");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [recentMinutes, setRecentMinutes] = useState("10");
  const [pageSize, setPageSize] = useState("100");

  // Stats advanced
  const [errorClass, setErrorClass] = useState("");
  const [errorContains, setErrorContains] = useState("");
  const [previewType, setPreviewType] = useState("");
  const [phone, setPhone] = useState("");

  // History
  const [historyId, setHistoryId] = useState("");
  const [historySize, setHistorySize] = useState("50");

  // Search tab
  const [searchPhone, setSearchPhone] = useState("");
  const [searchLimit, setSearchLimit] = useState("50");
  const [searchJSON, setSearchJSON] = useState("");

  const [tab, setTab] = useState("stats");
  const [statsData, setStatsData] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [searchData, setSearchData] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadInstances = useCallback(async () => {
    setInstancesLoading(true);
    setInstancesError("");
    try {
      const allItems = [];
      let pageNumber = 1;
      for (let i = 0; i < 25; i++) {
        const body = { pageNumber, pageSize: 200 };
        if (onlyOnline) body.status = "ONLINE";
        if (committedWid.trim()) body.wids = [committedWid.trim()];
        if (committedConsumer.trim()) {
          const n = Number(committedConsumer.trim());
          if (!isNaN(n)) body.consumerIds = [n];
        }
        if (committedPort.trim()) {
          const n = Number(committedPort.trim());
          if (!isNaN(n)) body.srvPorts = [n];
        }
        const resp = await postJSON("/api/gateway/instances", body);
        const items = Array.isArray(resp.items)
          ? resp.items
          : Array.isArray(resp.data)
          ? resp.data
          : Array.isArray(resp.rows)
          ? resp.rows
          : [];
        allItems.push(...items.filter((it) => it.srvPort != null));
        if (!resp.pagination?.hasNext) break;
        pageNumber++;
      }
      allItems.sort((a, b) => {
        const aOnline = (a.status || "").toUpperCase() === "ONLINE" ? 0 : 1;
        const bOnline = (b.status || "").toUpperCase() === "ONLINE" ? 0 : 1;
        if (aOnline !== bOnline) return aOnline - bOnline;
        return (a.srvPort ?? 0) - (b.srvPort ?? 0);
      });
      setInstances(allItems);
    } catch (e) {
      if (e.message !== "Sessão expirada.") setInstancesError(e.message);
    } finally {
      setInstancesLoading(false);
    }
  }, [onlyOnline, committedWid, committedConsumer, committedPort]);

  useEffect(() => {
    fetch("/api/instances")
      .then((r) => r.json())
      .then((d) => {
        if (d.defaultPort) setDefaultPort(d.defaultPort);
      })
      .catch(() => {})
      .finally(() => loadInstances());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadInstances();
  }, [loadInstances]);

  function commitSearch() {
    setCommittedWid(searchWid);
    setCommittedConsumer(searchConsumer);
    setCommittedPort(searchPort);
  }

  function handleSearchKeyDown(e) {
    if (e.key === "Enter") commitSearch();
  }

  const effectivePort = port.trim();
  const effectiveWid = wid.trim();

  const filteredInstances = instances.filter((it) => matchesFilter(it, instanceFilter));

  function clearSelection() {
    setSelectedInstance(null);
    setSelectedKey("");
    setHostInst("");
    setPort(defaultPort ? String(defaultPort) : "");
    setWid("");
    setConsumer("");
    setQueueNames("");
  }

  function handleSelectInstance(value) {
    if (!value) {
      clearSelection();
      return;
    }
    const item = instances.find((it) => instanceKey(it) === value);
    if (!item) return;
    setSelectedInstance(item);
    setSelectedKey(value);
    setHostInst(item.srvHost || "");
    setPort(String(item.srvPort));
    setWid(item.wid != null ? String(item.wid) : "");
    setConsumer(item.consumerId != null ? String(item.consumerId) : "");
    setQueueNames(item.queueName ?? `consumer_${item.consumerId}`);
  }

  function applyShared(body) {
    const w = effectiveWid;
    if (w) body.wids = [w];
    const ids = parseConsumerIds(consumer);
    if (ids.length) body.consumerIds = ids;
    if (queueNames.trim()) {
      body.queueNames = queueNames.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (messageKind) body.messageKind = messageKind;
    const [ks, ke] = DATE_BASIS[dateBasis] || DATE_BASIS.created;
    if (dateStart) body[ks] = toISO(dateStart);
    if (dateEnd) body[ke] = toISO(dateEnd);
    body._port = effectivePort;
    body._wid = effectiveWid || undefined;
    body._host = hostInst || undefined;
  }

  function buildStatsBody() {
    const body = {
      recentMinutes: Number(recentMinutes) > 0 ? Number(recentMinutes) : 10,
      pageNumber: 1,
      pageSize: Math.min(Math.max(Number(pageSize) || 100, 1), 500),
      includeDetails: true,
      includeDaily: true,
      includeHourly: true,
      includeHealth: true,
      includeRecommendations: true,
      includeSmsnetContract: true,
      includePendingDetails: true,
      includeErrorDetails: true,
      includeSlowest: true,
      includeSamples: true,
    };
    applyShared(body);
    if (errorClass) body.errorClass = errorClass;
    if (errorContains.trim()) body.errorContains = errorContains.trim();
    if (previewType) body.previewType = previewType;
    if (phone.trim()) body.phone = phone.trim();
    return body;
  }

  function buildSearchBody() {
    let body = {};
    if (searchJSON.trim()) {
      try {
        body = JSON.parse(searchJSON);
      } catch {
        throw new Error("JSON avançado de busca inválido.");
      }
    }
    const w = effectiveWid;
    if (w && body.wid == null && body.wids == null) body.wid = w;
    if (body.consumerId == null && body.consumerIds == null) {
      const ids = parseConsumerIds(consumer);
      if (ids.length) body.consumerId = ids[0];
    }
    if (searchPhone.trim() && body.phone == null) body.phone = searchPhone.trim();
    if (body.limit == null && Number(searchLimit) > 0) body.limit = Number(searchLimit);
    body._port = effectivePort;
    body._wid = w || undefined;
    body._host = hostInst || undefined;
    return body;
  }

  async function run() {
    setError("");
    if (!selectedInstance && !effectivePort) {
      setError("Selecione uma instância.");
      return;
    }
    if (!effectivePort) {
      setError("Informe a porta da instância.");
      return;
    }
    if (!effectiveWid) {
      setError("Selecione a instância (WID) para autenticar.");
      return;
    }
    setLoading(true);
    try {
      if (tab === "stats") {
        setStatsData(await postJSON("/api/gateway/stats", buildStatsBody()));
      } else if (tab === "history") {
        if (!historyId.trim()) throw new Error("Informe o ID da conversa / remotejid.");
        setHistoryData(
          await postJSON("/api/gateway/history", {
            id: historyId.trim(),
            size: Number(historySize) > 0 ? Number(historySize) : 50,
            _port: effectivePort,
            _wid: effectiveWid || undefined,
            _host: hostInst || undefined,
          })
        );
      } else if (tab === "search") {
        setSearchData(await postJSON("/api/gateway/search", buildSearchBody()));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const actionLabel =
    tab === "stats"
      ? "Sincronizar relatório"
      : tab === "history"
      ? "Buscar histórico"
      : "Buscar mensagens";

  const showQueryBar = tab !== "cancel";

  return (
    <div>
      <div className="topbar">
        <div className="brand">
          <span className="dot" />
          <span>
            SMSNET
            <small>Relatórios WhatsApp</small>
          </span>
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
          <button className="btn-ghost" onClick={logout}>
            Sair
          </button>
        </div>
      </div>

      <div className="container">
        {/* ── Instancebar ── */}
        <div className="instancebar">
          {/* Server-side search: WID, Consumer, Port */}
          <div className="field mono">
            <label htmlFor="sw-wid">WID</label>
            <input
              id="sw-wid"
              value={searchWid}
              onChange={(e) => setSearchWid(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="ex.: 12887"
            />
          </div>
          <div className="field mono">
            <label htmlFor="sw-cons">Consumer</label>
            <input
              id="sw-cons"
              value={searchConsumer}
              onChange={(e) => setSearchConsumer(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="ex.: 2202"
              inputMode="numeric"
            />
          </div>
          <div className="field mono">
            <label htmlFor="sw-port">Porta</label>
            <input
              id="sw-port"
              value={searchPort}
              onChange={(e) => setSearchPort(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="ex.: 10005"
              inputMode="numeric"
            />
          </div>

          {/* Online checkbox + local text filter stacked */}
          <div className="field">
            <label
              htmlFor="only-online"
              style={{ display: "flex", alignItems: "center", gap: 6, textTransform: "none", letterSpacing: 0, fontSize: 12 }}
            >
              <input
                id="only-online"
                type="checkbox"
                checked={onlyOnline}
                onChange={(e) => setOnlyOnline(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: "var(--accent)", flexShrink: 0 }}
              />
              Somente ONLINE
            </label>
            <input
              value={instanceFilter}
              onChange={(e) => setInstanceFilter(e.target.value)}
              placeholder="Filtrar lista…"
              style={{ marginTop: 2 }}
            />
          </div>

          {/* Instance select */}
          <div className="field" style={{ flex: 2 }}>
            <label htmlFor="inst-select">
              Instância
              {instances.length > 0 && (
                <span style={{ color: "var(--muted-2)", fontWeight: 400, marginLeft: 6 }}>
                  ({filteredInstances.length}{instances.length !== filteredInstances.length ? ` de ${instances.length}` : ""})
                </span>
              )}
            </label>
            <select
              id="inst-select"
              value={selectedKey}
              onChange={(e) => handleSelectInstance(e.target.value)}
              disabled={instancesLoading}
            >
              <option value="">— informar manualmente —</option>
              {filteredInstances.map((item) => {
                const key = instanceKey(item);
                return (
                  <option key={key} value={key}>
                    {instanceLabel(item)}
                  </option>
                );
              })}
            </select>
            {instancesError && (
              <span style={{ color: "var(--crit)", fontSize: 11, marginTop: 2 }}>
                {instancesError}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <label style={{ visibility: "hidden", fontSize: 11 }}>.</label>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="btn-ghost"
                onClick={commitSearch}
                disabled={instancesLoading}
                style={{ whiteSpace: "nowrap" }}
              >
                {instancesLoading ? "Buscando…" : "Buscar"}
              </button>
              <button
                className="btn-ghost"
                onClick={loadInstances}
                disabled={instancesLoading}
                title="Recarregar sem alterar filtros"
                style={{ padding: "8px 10px" }}
              >
                ↺
              </button>
            </div>
          </div>
        </div>

        {/* ── Active-instance summary ── */}
        {selectedInstance && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "var(--surface)",
              border: "1px solid var(--accent-dim)",
              borderRadius: "var(--radius-sm)",
              padding: "9px 14px",
              marginBottom: 10,
              fontSize: 13,
            }}
          >
            <span style={{ color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>
              Instância ativa
            </span>
            <span style={{ color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 12.5 }}>
              :{selectedInstance.srvPort}
              {" · "}{selectedInstance.name || selectedInstance.from || "—"}
              {" · cons "}{selectedInstance.consumerId ?? "—"}
              {selectedInstance.wid ? ` · wid ${selectedInstance.wid}` : ""}
              {selectedInstance.status ? ` · ${selectedInstance.status}` : ""}
            </span>
            <button
              className="btn-ghost"
              onClick={clearSelection}
              style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 12 }}
            >
              Trocar / limpar
            </button>
          </div>
        )}

        <div className="tabs">
          <button className={`tab ${tab === "stats" ? "active" : ""}`} onClick={() => setTab("stats")}>
            Relatório de envios
          </button>
          <button className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
            Histórico por conversa
          </button>
          <button className={`tab ${tab === "search" ? "active" : ""}`} onClick={() => setTab("search")}>
            Busca de mensagens
          </button>
          <button className={`tab ${tab === "cancel" ? "active" : ""}`} onClick={() => setTab("cancel")}>
            Cancelar pendências
          </button>
        </div>

        {showQueryBar && (
          <div className="querybar">
            {/* Readonly fields derived from selected instance */}
            <div className="field mono">
              <label htmlFor="wid">WhatsApp ID (wid)</label>
              <input
                id="wid"
                value={wid}
                readOnly
                placeholder="— selecione uma instância —"
                style={READONLY_STYLE}
              />
            </div>
            <div className="field mono">
              <label htmlFor="consumer">Consumer ID</label>
              <input
                id="consumer"
                value={consumer}
                readOnly
                placeholder="— selecione uma instância —"
                style={READONLY_STYLE}
              />
            </div>
            <div className="field mono">
              <label htmlFor="queue">Queue name</label>
              <input
                id="queue"
                value={queueNames}
                readOnly
                placeholder="— selecione uma instância —"
                style={READONLY_STYLE}
              />
            </div>
            <div className="field mono">
              <label htmlFor="gw-port">Porta</label>
              <input
                id="gw-port"
                value={port}
                readOnly
                placeholder="— selecione uma instância —"
                style={READONLY_STYLE}
              />
            </div>

            {/* Editable filters */}
            <div className="field">
              <label htmlFor="kind">Tipo</label>
              <select id="kind" value={messageKind} onChange={(e) => setMessageKind(e.target.value)}>
                <option value="">Todos</option>
                <option value="billing">Cobrança (billing)</option>
                <option value="group">Grupo / campanha</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="basis">Filtrar data por</label>
              <select id="basis" value={dateBasis} onChange={(e) => setDateBasis(e.target.value)}>
                <option value="created">created_at</option>
                <option value="sent">sent_at</option>
                <option value="updated">updated_at</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ds">Início</label>
              <input id="ds" type="datetime-local" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="de">Fim</label>
              <input id="de" type="datetime-local" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
            </div>

            {tab === "stats" && (
              <>
                <div className="field mono">
                  <label htmlFor="rm">Janela recente (min)</label>
                  <input id="rm" value={recentMinutes} onChange={(e) => setRecentMinutes(e.target.value)} inputMode="numeric" />
                </div>
                <div className="field mono">
                  <label htmlFor="ps">Page size</label>
                  <input id="ps" value={pageSize} onChange={(e) => setPageSize(e.target.value)} inputMode="numeric" />
                </div>
                <div className="field">
                  <label htmlFor="ec">Classe de erro</label>
                  <select id="ec" value={errorClass} onChange={(e) => setErrorClass(e.target.value)}>
                    {ERROR_CLASSES.map((c) => (
                      <option key={c} value={c}>{c === "" ? "Todas" : c}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pt">Preview type</label>
                  <select id="pt" value={previewType} onChange={(e) => setPreviewType(e.target.value)}>
                    <option value="">Todos</option>
                    <option value="text">text</option>
                    <option value="image">image</option>
                    <option value="video">video</option>
                    <option value="document">document</option>
                  </select>
                </div>
                <div className="field mono">
                  <label htmlFor="ph">Telefone</label>
                  <input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5511999999999" />
                </div>
                <div className="field">
                  <label htmlFor="ecn">Erro contém</label>
                  <input id="ecn" value={errorContains} onChange={(e) => setErrorContains(e.target.value)} placeholder="ex.: 463" />
                </div>
              </>
            )}

            {tab === "history" && (
              <>
                <div className="field mono">
                  <label htmlFor="hid">ID conversa / remotejid</label>
                  <input id="hid" value={historyId} onChange={(e) => setHistoryId(e.target.value)} placeholder="5511999999999" />
                </div>
                <div className="field mono">
                  <label htmlFor="hsz">Quantidade</label>
                  <input id="hsz" value={historySize} onChange={(e) => setHistorySize(e.target.value)} inputMode="numeric" />
                </div>
              </>
            )}

            {tab === "search" && (
              <>
                <div className="field mono">
                  <label htmlFor="sph">Telefone</label>
                  <input id="sph" value={searchPhone} onChange={(e) => setSearchPhone(e.target.value)} placeholder="5511999999999" />
                </div>
                <div className="field mono">
                  <label htmlFor="slm">Limite</label>
                  <input id="slm" value={searchLimit} onChange={(e) => setSearchLimit(e.target.value)} inputMode="numeric" />
                </div>
              </>
            )}

            <div className="actions">
              <button className="btn" onClick={run} disabled={loading}>
                {loading ? "Carregando…" : actionLabel}
              </button>
              <span className="spacer" />
            </div>
          </div>
        )}

        {tab === "search" && (
          <details className="raw" style={{ marginTop: 14 }}>
            <summary>Busca avançada (JSON do corpo)</summary>
            <textarea
              value={searchJSON}
              onChange={(e) => setSearchJSON(e.target.value)}
              placeholder='{ "phone": "5511999999999", "limit": 50 }'
              style={{
                width: "100%",
                minHeight: 120,
                marginTop: 12,
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "7px",
                padding: 12,
                fontFamily: "var(--mono)",
                fontSize: 12.5,
              }}
            />
          </details>
        )}

        <div style={{ marginTop: 18 }}>
          {error && <div className="error-box">{error}</div>}

          {loading && tab !== "cancel" && (
            <div className="loading">
              <span className="pulse" />
              Consultando o gateway…
            </div>
          )}

          {!loading && tab === "stats" &&
            (statsData ? (
              <StatsReport data={statsData} />
            ) : (
              <div className="empty">
                Selecione uma instância e clique em "Sincronizar relatório".
              </div>
            ))}

          {!loading && tab === "history" &&
            (historyData ? (
              <ResultView data={historyData} />
            ) : (
              <div className="empty">
                Informe o ID da conversa e clique em "Buscar histórico".
              </div>
            ))}

          {!loading && tab === "search" &&
            (searchData ? (
              <ResultView data={searchData} />
            ) : (
              <div className="empty">
                Defina os filtros de busca e clique em "Buscar mensagens".
              </div>
            ))}

          {tab === "cancel" && (
            <CancelPanel
              port={effectivePort}
              wid={effectiveWid}
              consumer={consumer}
              queueNames={queueNames}
            />
          )}
        </div>
      </div>
    </div>
  );
}
