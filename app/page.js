"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

function isAbortError(e) {
  return e?.name === "AbortError" || e?.message?.includes("aborted");
}

async function postJSON(url, body, signal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Sessão expirada.");
  }
  const data = await res.json().catch(() => ({ error: "Resposta inválida do servidor." }));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}.`);
  return data;
}

function instanceKey(item) {
  return `${item.consumerId ?? ""}|${item.wid ?? ""}`;
}

function instanceLabel(item) {
  let label = `${item.name || item.from || "—"} · cons ${item.consumerId ?? "—"}`;
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
    item.queueName,
    item.srvName,
  ].some((v) => v && v.toLowerCase().includes(q));
}

function parseConsumerIds(str) {
  return String(str || "").split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function SearchResultView({ data, onNextPage, searchPage }) {
  if (!data) return null;
  if (data.error) return <div className="error-box">{data.error}</div>;
  const items = data.items || [];
  const pag = data.pagination || {};
  return (
    <div>
      <div className="section">
        <h3>
          Mensagens <span className="count">{items.length}</span>
          {pag.total != null && <span style={{color:"var(--muted)", fontSize:12, marginLeft:8}}>de {pag.total}</span>}
        </h3>
        {items.length ? (
          <DataTable rows={items} prefer={["direction","status","messageType","phone","remoteJid","bodyPreview","createdAt","sentAt"]} max={200} />
        ) : (
          <div className="empty">Nenhuma mensagem encontrada.</div>
        )}
      </div>
      {pag.hasNext && (
        <div style={{marginTop:12}}>
          <button className="btn-ghost" onClick={() => onNextPage(searchPage + 1)}>
            Próxima página ({searchPage + 1})
          </button>
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
const TIMEOUT_MIN = 5;
const TIMEOUT_MAX = 300;
const TIMEOUT_DEFAULT = 60;

export default function Dashboard() {
  const router = useRouter();
  const controllerRef = useRef(null);

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
  const [committedWid, setCommittedWid] = useState("");
  const [committedConsumer, setCommittedConsumer] = useState("");

  // Derived from selected instance (readonly in querybar)
  const [wid, setWid] = useState("");
  const [consumer, setConsumer] = useState("");
  const [queueNames, setQueueNames] = useState("");

  // Timeout
  const [timeoutSec, setTimeoutSec] = useState(TIMEOUT_DEFAULT);

  // Shared filters (editable)
  const [messageKind, setMessageKind] = useState("");
  const [dateBasis, setDateBasis] = useState("created");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [recentMinutes, setRecentMinutes] = useState("10");
  const [pageSize, setPageSize] = useState("100");

  // Stats advanced
  const [filterByWid, setFilterByWid] = useState(false);
  const [includeDaily, setIncludeDaily] = useState(false);
  const [includeHourly, setIncludeHourly] = useState(false);
  const [errorClass, setErrorClass] = useState("");
  const [errorContains, setErrorContains] = useState("");
  const [previewType, setPreviewType] = useState("");
  const [phone, setPhone] = useState("");

  // Search tab state
  const [searchPhone, setSearchPhone] = useState("");
  const [searchIdSms, setSearchIdSms] = useState("");
  const [searchLimit, setSearchLimit] = useState("50");
  const [searchIncludeTotal, setSearchIncludeTotal] = useState(false);
  const [searchBody, setSearchBody] = useState(false);
  const [searchJSON, setSearchJSON] = useState("");
  const [searchPage, setSearchPage] = useState(1);

  const [tab, setTab] = useState("stats");
  const [statsData, setStatsData] = useState(null);
  const [searchData, setSearchData] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false);

  // Load persisted timeout
  useEffect(() => {
    try {
      const saved = localStorage.getItem("timeoutSec");
      if (saved) {
        const n = Number(saved);
        if (n >= TIMEOUT_MIN && n <= TIMEOUT_MAX) setTimeoutSec(n);
      }
    } catch {}
  }, []);

  function saveTimeout(val) {
    const n = Math.max(TIMEOUT_MIN, Math.min(TIMEOUT_MAX, Number(val) || TIMEOUT_DEFAULT));
    setTimeoutSec(n);
    try { localStorage.setItem("timeoutSec", String(n)); } catch {}
    return n;
  }

  function timeoutMs() {
    return timeoutSec * 1000;
  }

  function abortCurrent() {
    controllerRef.current?.abort();
  }

  function newController() {
    abortCurrent();
    const ctrl = new AbortController();
    controllerRef.current = ctrl;
    return ctrl;
  }

  const loadInstances = useCallback(async () => {
    setInstancesLoading(true);
    setInstancesError("");
    const ctrl = new AbortController();
    try {
      const allItems = [];
      let pageNumber = 1;
      for (let i = 0; i < 25; i++) {
        const body = { pageNumber, pageSize: 200, _timeoutMs: timeoutMs() };
        if (onlyOnline) body.status = "ONLINE";
        if (committedWid.trim()) body.wids = [committedWid.trim()];
        if (committedConsumer.trim()) {
          const n = Number(committedConsumer.trim());
          if (!isNaN(n)) body.consumerIds = [n];
        }
        const resp = await postJSON("/api/gateway/instances", body, ctrl.signal);
        const items = Array.isArray(resp.items)
          ? resp.items
          : Array.isArray(resp.data)
          ? resp.data
          : Array.isArray(resp.rows)
          ? resp.rows
          : [];
        allItems.push(...items.filter((it) => it.consumerId != null || it.wid != null));
        if (!resp.pagination?.hasNext) break;
        pageNumber++;
      }
      allItems.sort((a, b) => {
        const aOnline = (a.status || "").toUpperCase() === "ONLINE" ? 0 : 1;
        const bOnline = (b.status || "").toUpperCase() === "ONLINE" ? 0 : 1;
        if (aOnline !== bOnline) return aOnline - bOnline;
        return (a.consumerId ?? 0) - (b.consumerId ?? 0);
      });
      setInstances(allItems);
    } catch (e) {
      if (!isAbortError(e) && e.message !== "Sessão expirada.") setInstancesError(e.message);
    } finally {
      setInstancesLoading(false);
    }
  }, [onlyOnline, committedWid, committedConsumer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadInstances();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadInstances();
  }, [loadInstances]);

  function commitSearch() {
    setCommittedWid(searchWid);
    setCommittedConsumer(searchConsumer);
  }

  function handleSearchKeyDown(e) {
    if (e.key === "Enter") commitSearch();
  }

  const effectiveWid = wid.trim();

  const filteredInstances = instances.filter((it) => matchesFilter(it, instanceFilter));

  function clearSelection() {
    setSelectedInstance(null);
    setSelectedKey("");
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
    setWid(item.wid != null ? String(item.wid) : "");
    setConsumer(item.consumerId != null ? String(item.consumerId) : "");
    const rawQueue = item.queueName ?? `consumer_${item.consumerId}`;
    setQueueNames(rawQueue.replace(/ /g, "_"));
  }

  function applyShared(body, { includeWids = false } = {}) {
    if (includeWids && effectiveWid) body.wids = [effectiveWid];
    const ids = parseConsumerIds(consumer);
    if (ids.length) body.consumerIds = ids;
    if (queueNames.trim()) {
      body.queueNames = queueNames.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (messageKind) body.messageKind = messageKind;
    const [ks, ke] = DATE_BASIS[dateBasis] || DATE_BASIS.created;
    if (dateStart) body[ks] = toISO(dateStart);
    if (dateEnd) body[ke] = toISO(dateEnd);
    body._wid = effectiveWid || undefined;
    body._timeoutMs = timeoutMs();
  }

  function buildStatsBody() {
    const body = {
      recentMinutes: Number(recentMinutes) > 0 ? Number(recentMinutes) : 10,
      pageNumber: 1,
      pageSize: Math.min(Math.max(Number(pageSize) || 100, 1), 500),
      includeDetails: true,
      includeDaily,
      includeHourly,
      includeHealth: true,
      includeRecommendations: true,
      includeSmsnetContract: true,
      includePendingDetails: true,
      includeErrorDetails: true,
      includeSlowest: true,
      includeSamples: true,
    };
    applyShared(body, { includeWids: filterByWid });
    if (errorClass) body.errorClass = errorClass;
    if (errorContains.trim()) body.errorContains = errorContains.trim();
    if (previewType) body.previewType = previewType;
    if (phone.trim()) body.phone = phone.trim();
    return body;
  }

  function buildSearchBody(pageNumber = 1) {
    if (searchJSON.trim()) {
      try {
        const parsed = JSON.parse(searchJSON.trim());
        parsed._wid = effectiveWid || undefined;
        parsed._timeoutMs = timeoutMs();
        return parsed;
      } catch {
        throw new Error("JSON inválido no campo de busca avançada.");
      }
    }

    const body = {};

    const consumerNum = Number(consumer);
    if (consumer && consumerNum > 0) body.consumerId = consumerNum;

    if (queueNames.trim()) {
      const firstQueue = queueNames.split(",")[0].trim();
      if (firstQueue) body.queueName = firstQueue;
    }

    if (effectiveWid) body.wid = effectiveWid;

    if (searchPhone.trim()) body.phone = searchPhone.trim();

    const idSmsNum = Number(searchIdSms.trim());
    if (searchIdSms.trim() && idSmsNum > 0) body.idSms = idSmsNum;

    if (dateBasis === "created") {
      if (dateStart) body.dateCreatedStart = toISO(dateStart);
      if (dateEnd) body.dateCreatedEnd = toISO(dateEnd);
    }

    body.pageNumber = pageNumber;
    body.limit = Math.min(Number(searchLimit) || 50, 100);
    body.includeTotal = searchIncludeTotal;

    if (searchBody) body.searchBody = true;

    body._wid = effectiveWid || undefined;
    body._timeoutMs = timeoutMs();

    // Client-side validation
    if (!body.phone && !body.consumerId && !body.queueName && !body.idSms && !body.searchBody) {
      throw new Error("Informe telefone, consumer/fila, ID SMS ou texto.");
    }

    return body;
  }

  function cancelRequest() {
    abortCurrent();
  }

  async function run() {
    setError("");
    setCancelled(false);
    if (!effectiveWid) {
      setError("Selecione uma instância (WID) para autenticar.");
      return;
    }
    const ctrl = newController();
    setLoading(true);
    try {
      if (tab === "stats") {
        setStatsData(await postJSON("/api/gateway/stats", buildStatsBody(), ctrl.signal));
      } else if (tab === "search") {
        setSearchPage(1);
        setSearchData(await postJSON("/api/gateway/search", buildSearchBody(1), ctrl.signal));
      }
    } catch (e) {
      if (isAbortError(e)) {
        setCancelled(true);
      } else if (e.message.includes("missing_search_filter")) {
        setError("Filtro inválido: informe telefone, consumer/fila, ID SMS ou texto.");
      } else if (e.message.includes("message_search_timeout")) {
        setError("O gateway excedeu o timeout interno de busca (8s). Refine os filtros ou tente novamente.");
      } else {
        setError(e.message);
      }
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
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label htmlFor="timeout-sec" style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
              Timeout (s)
            </label>
            <input
              id="timeout-sec"
              type="number"
              min={TIMEOUT_MIN}
              max={TIMEOUT_MAX}
              value={timeoutSec}
              onChange={(e) => saveTimeout(e.target.value)}
              style={{
                width: 62,
                background: "var(--surface-3)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                padding: "5px 8px",
                fontSize: 13,
                fontFamily: "var(--mono)",
              }}
            />
          </div>
          <ThemeToggle />
          <button className="btn-ghost" onClick={logout}>
            Sair
          </button>
        </div>
      </div>

      <div className="container">
        {/* ── Instancebar ── */}
        <div className="instancebar">
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
              <option value="">— selecione uma instância —</option>
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
              {selectedInstance.name || selectedInstance.from || "—"}
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
          <button className={`tab ${tab === "search" ? "active" : ""}`} onClick={() => setTab("search")}>
            Busca de mensagens
          </button>
          <button className={`tab ${tab === "cancel" ? "active" : ""}`} onClick={() => setTab("cancel")}>
            Cancelar pendências
          </button>
        </div>

        {showQueryBar && (
          <div className="querybar">
            <div className="field mono">
              <label htmlFor="qb-wid">WhatsApp ID (wid)</label>
              <input
                id="qb-wid"
                value={wid}
                readOnly
                placeholder="— selecione uma instância —"
                style={READONLY_STYLE}
              />
            </div>
            <div className="field mono">
              <label htmlFor="qb-consumer">Consumer ID</label>
              <input
                id="qb-consumer"
                value={consumer}
                readOnly
                placeholder="— selecione uma instância —"
                style={READONLY_STYLE}
              />
            </div>
            <div className="field mono">
              <label htmlFor="qb-queue">Queue name</label>
              <input
                id="qb-queue"
                value={queueNames}
                readOnly
                placeholder="— selecione uma instância —"
                style={READONLY_STYLE}
              />
            </div>

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
                <div className="field" style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 8 }}>
                  <label className="check" style={{ textTransform: "none", letterSpacing: 0 }}>
                    <input
                      type="checkbox"
                      checked={filterByWid}
                      onChange={(e) => setFilterByWid(e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: "var(--accent)" }}
                    />
                    <span>
                      Filtrar por WID processador (claimed/sent)
                      <span
                        style={{ color: "var(--muted-2)", fontFamily: "var(--sans)", fontSize: 11.5, marginLeft: 8 }}
                        title="Mostra só o que este WID já processou; oculta mensagens pendentes (queued) ainda não claimadas."
                      >
                        — mostra só o que este WID já processou; oculta pendentes ainda não claimadas
                      </span>
                    </span>
                  </label>
                  <label className="check" style={{ textTransform: "none", letterSpacing: 0 }}>
                    <input
                      type="checkbox"
                      checked={includeDaily}
                      onChange={(e) => setIncludeDaily(e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: "var(--accent)" }}
                    />
                    <span>
                      Distribuição diária (byDay)
                      <span style={{ color: "var(--muted-2)", fontFamily: "var(--sans)", fontSize: 11.5, marginLeft: 8 }}>
                        — pode ser lento em grandes volumes
                      </span>
                    </span>
                  </label>
                  <label className="check" style={{ textTransform: "none", letterSpacing: 0 }}>
                    <input
                      type="checkbox"
                      checked={includeHourly}
                      onChange={(e) => setIncludeHourly(e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: "var(--accent)" }}
                    />
                    <span>
                      Distribuição horária (byHour)
                      <span style={{ color: "var(--muted-2)", fontFamily: "var(--sans)", fontSize: 11.5, marginLeft: 8 }}>
                        — pode ser lento em grandes volumes
                      </span>
                    </span>
                  </label>
                </div>
              </>
            )}

            {tab === "search" && (
              <>
                <div className="field mono">
                  <label>Telefone</label>
                  <input value={searchPhone} onChange={e => setSearchPhone(e.target.value)} placeholder="5511999999999" />
                </div>
                <div className="field mono">
                  <label>ID SMS</label>
                  <input value={searchIdSms} onChange={e => setSearchIdSms(e.target.value)} placeholder="117994005" inputMode="numeric" />
                </div>
                <div className="field mono">
                  <label>Limite (máx 100)</label>
                  <input value={searchLimit} onChange={e => setSearchLimit(e.target.value)} inputMode="numeric" />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1", display:"flex", flexDirection:"column", gap:6 }}>
                  <label className="check" style={{textTransform:"none",letterSpacing:0}}>
                    <input type="checkbox" checked={searchIncludeTotal} onChange={e => setSearchIncludeTotal(e.target.checked)} style={{width:14,height:14,accentColor:"var(--accent)"}} />
                    <span>Contar total (mais lento) <span style={{color:"var(--muted-2)",fontSize:11.5,marginLeft:6}}>— inclui total/totalPages na resposta</span></span>
                  </label>
                  <label className="check" style={{textTransform:"none",letterSpacing:0}}>
                    <input type="checkbox" checked={searchBody} onChange={e => setSearchBody(e.target.checked)} style={{width:14,height:14,accentColor:"var(--accent)"}} />
                    <span>Buscar no corpo da mensagem (searchBody) <span style={{color:"var(--muted-2)",fontSize:11.5,marginLeft:6}}>— para busca em texto, não só telefone/id</span></span>
                  </label>
                </div>
              </>
            )}

            <div className="actions">
              {loading ? (
                <button className="btn-ghost" onClick={cancelRequest} style={{ borderColor: "var(--crit)", color: "var(--crit)" }}>
                  Cancelar
                </button>
              ) : (
                <button className="btn" onClick={run}>
                  {actionLabel}
                </button>
              )}
              <span className="spacer" />
            </div>
          </div>
        )}

        {tab === "search" && (
          <details className="raw" style={{marginTop:14}}>
            <summary>Busca avançada (JSON do corpo)</summary>
            <textarea value={searchJSON} onChange={e => setSearchJSON(e.target.value)}
              placeholder='{ "phone": "5511999999999", "pageSize": 50 }'
              style={{width:"100%",minHeight:100,marginTop:12,background:"var(--surface)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:"7px",padding:12,fontFamily:"var(--mono)",fontSize:12.5}} />
          </details>
        )}

        <div style={{ marginTop: 18 }}>
          {error && <div className="error-box">{error}</div>}
          {cancelled && !error && (
            <div className="note" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: "var(--radius)", padding: "16px 18px", fontSize: 13.5 }}>
              Requisição cancelada.
            </div>
          )}

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
              !cancelled && <div className="empty">
                Selecione uma instância e clique em "Sincronizar relatório".
              </div>
            ))}

          {!loading && tab === "search" && (
            searchData ? (
              <SearchResultView
                data={searchData}
                searchPage={searchPage}
                onNextPage={async (nextPage) => {
                  setSearchPage(nextPage);
                  setLoading(true);
                  setError("");
                  try {
                    setSearchData(await postJSON("/api/gateway/search", buildSearchBody(nextPage), null));
                  } catch(e) {
                    if (e.message.includes("missing_search_filter")) {
                      setError("Filtro inválido: informe telefone, consumer/fila, ID SMS ou texto.");
                    } else if (e.message.includes("message_search_timeout")) {
                      setError("O gateway excedeu o timeout interno de busca (8s). Refine os filtros ou tente novamente.");
                    } else {
                      setError(e.message);
                    }
                  }
                  finally { setLoading(false); }
                }}
              />
            ) : (
              !cancelled && <div className="empty">Informe telefone, consumer/fila ou ID SMS e clique em "Buscar mensagens".</div>
            )
          )}

          {tab === "cancel" && (
            <CancelPanel
              wid={effectiveWid}
              consumer={consumer}
              queueNames={queueNames}
              timeoutSec={timeoutSec}
            />
          )}
        </div>
      </div>
    </div>
  );
}
