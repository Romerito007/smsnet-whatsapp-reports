"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import StatsReport from "@/components/StatsReport";
import CancelPanel from "@/components/CancelPanel";
import DataTable from "@/components/DataTable";
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

export default function Dashboard() {
  const router = useRouter();

  const [host, setHost] = useState("");
  const [port, setPort] = useState("");

  // Filtros compartilhados (stats / histórico / busca)
  const [wid, setWid] = useState("");
  const [consumer, setConsumer] = useState("");
  const [queueNames, setQueueNames] = useState("");
  const [messageKind, setMessageKind] = useState("");
  const [dateBasis, setDateBasis] = useState("created");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [recentMinutes, setRecentMinutes] = useState("10");
  const [pageSize, setPageSize] = useState("100");

  // Avançado (stats)
  const [errorClass, setErrorClass] = useState("");
  const [errorContains, setErrorContains] = useState("");
  const [previewType, setPreviewType] = useState("");
  const [phone, setPhone] = useState("");

  // Histórico
  const [historyId, setHistoryId] = useState("");
  const [historySize, setHistorySize] = useState("50");

  // Busca
  const [searchPhone, setSearchPhone] = useState("");
  const [searchLimit, setSearchLimit] = useState("50");
  const [searchJSON, setSearchJSON] = useState("");

  const [tab, setTab] = useState("stats");
  const [statsData, setStatsData] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [searchData, setSearchData] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/instances")
      .then((r) => r.json())
      .then((d) => {
        if (d.host) setHost(d.host);
        if (d.defaultPort) setPort(d.defaultPort);
      })
      .catch(() => {});
  }, []);

  const effectivePort = port.trim();

  function applyShared(body) {
    if (wid.trim()) body.wids = [wid.trim()];
    if (consumer.trim()) {
      const ids = consumer
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n));
      if (ids.length) body.consumerIds = ids;
    }
    if (queueNames.trim()) {
      body.queueNames = queueNames
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (messageKind) body.messageKind = messageKind;
    const [ks, ke] = DATE_BASIS[dateBasis] || DATE_BASIS.created;
    if (dateStart) body[ks] = toISO(dateStart);
    if (dateEnd) body[ke] = toISO(dateEnd);
    body._port = effectivePort;
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
    if (wid.trim() && body.wid == null && body.wids == null) body.wid = wid.trim();
    if (consumer.trim() && body.consumerId == null && body.consumerIds == null) {
      const id = Number(consumer.split(",")[0].trim());
      if (!isNaN(id)) body.consumerId = id;
    }
    if (searchPhone.trim() && body.phone == null) body.phone = searchPhone.trim();
    if (body.limit == null && Number(searchLimit) > 0) body.limit = Number(searchLimit);
    body._port = effectivePort;
    return body;
  }

  async function run() {
    setError("");
    if (!effectivePort) {
      setError("Informe a porta da instância.");
      return;
    }
    if (tab === "stats" && !consumer.trim()) {
      setError("Informe o consumer.");
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
        <button className="btn-ghost" onClick={logout}>
          Sair
        </button>
      </div>

      <div className="container">
        <div className="instancebar">
          <div className="field">
            <label htmlFor="gw-host">Host do gateway</label>
            <input
              id="gw-host"
              value={host}
              readOnly
              placeholder="carregando…"
            />
          </div>
          <div className="field mono">
            <label htmlFor="gw-port">Porta da instância *</label>
            <input
              id="gw-port"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="ex.: 10005"
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="tabs">
          <button
            className={`tab ${tab === "stats" ? "active" : ""}`}
            onClick={() => setTab("stats")}
          >
            Relatório de envios
          </button>
          <button
            className={`tab ${tab === "history" ? "active" : ""}`}
            onClick={() => setTab("history")}
          >
            Histórico por conversa
          </button>
          <button
            className={`tab ${tab === "search" ? "active" : ""}`}
            onClick={() => setTab("search")}
          >
            Busca de mensagens
          </button>
          <button
            className={`tab ${tab === "cancel" ? "active" : ""}`}
            onClick={() => setTab("cancel")}
          >
            Cancelar pendências
          </button>
        </div>

        {showQueryBar && (
          <div className="querybar">
            <div className="field mono">
              <label htmlFor="wid">WhatsApp ID (wid)</label>
              <input
                id="wid"
                value={wid}
                onChange={(e) => setWid(e.target.value)}
                placeholder="ex.: 12887"
              />
            </div>
            <div className="field mono">
              <label htmlFor="consumer">Consumer ID(s)</label>
              <input
                id="consumer"
                value={consumer}
                onChange={(e) => setConsumer(e.target.value)}
                placeholder="ex.: 2202, 1356"
              />
            </div>
            <div className="field mono">
              <label htmlFor="queue">Queue name(s)</label>
              <input
                id="queue"
                value={queueNames}
                onChange={(e) => setQueueNames(e.target.value)}
                placeholder="ex.: consumer_2202"
              />
            </div>
            <div className="field">
              <label htmlFor="kind">Tipo</label>
              <select
                id="kind"
                value={messageKind}
                onChange={(e) => setMessageKind(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="billing">Cobrança (billing)</option>
                <option value="group">Grupo / campanha</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="basis">Filtrar data por</label>
              <select
                id="basis"
                value={dateBasis}
                onChange={(e) => setDateBasis(e.target.value)}
              >
                <option value="created">created_at</option>
                <option value="sent">sent_at</option>
                <option value="updated">updated_at</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ds">Início</label>
              <input
                id="ds"
                type="datetime-local"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="de">Fim</label>
              <input
                id="de"
                type="datetime-local"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
              />
            </div>

            {tab === "stats" && (
              <>
                <div className="field mono">
                  <label htmlFor="rm">Janela recente (min)</label>
                  <input
                    id="rm"
                    value={recentMinutes}
                    onChange={(e) => setRecentMinutes(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="field mono">
                  <label htmlFor="ps">Page size</label>
                  <input
                    id="ps"
                    value={pageSize}
                    onChange={(e) => setPageSize(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="field">
                  <label htmlFor="ec">Classe de erro</label>
                  <select
                    id="ec"
                    value={errorClass}
                    onChange={(e) => setErrorClass(e.target.value)}
                  >
                    {ERROR_CLASSES.map((c) => (
                      <option key={c} value={c}>
                        {c === "" ? "Todas" : c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pt">Preview type</label>
                  <select
                    id="pt"
                    value={previewType}
                    onChange={(e) => setPreviewType(e.target.value)}
                  >
                    <option value="">Todos</option>
                    <option value="text">text</option>
                    <option value="image">image</option>
                    <option value="video">video</option>
                    <option value="document">document</option>
                  </select>
                </div>
                <div className="field mono">
                  <label htmlFor="ph">Telefone</label>
                  <input
                    id="ph"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="5511999999999"
                  />
                </div>
                <div className="field">
                  <label htmlFor="ecn">Erro contém</label>
                  <input
                    id="ecn"
                    value={errorContains}
                    onChange={(e) => setErrorContains(e.target.value)}
                    placeholder="ex.: 463"
                  />
                </div>
              </>
            )}

            {tab === "history" && (
              <>
                <div className="field mono">
                  <label htmlFor="hid">ID conversa / remotejid</label>
                  <input
                    id="hid"
                    value={historyId}
                    onChange={(e) => setHistoryId(e.target.value)}
                    placeholder="5511999999999"
                  />
                </div>
                <div className="field mono">
                  <label htmlFor="hsz">Quantidade</label>
                  <input
                    id="hsz"
                    value={historySize}
                    onChange={(e) => setHistorySize(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </>
            )}

            {tab === "search" && (
              <>
                <div className="field mono">
                  <label htmlFor="sph">Telefone</label>
                  <input
                    id="sph"
                    value={searchPhone}
                    onChange={(e) => setSearchPhone(e.target.value)}
                    placeholder="5511999999999"
                  />
                </div>
                <div className="field mono">
                  <label htmlFor="slm">Limite</label>
                  <input
                    id="slm"
                    value={searchLimit}
                    onChange={(e) => setSearchLimit(e.target.value)}
                    inputMode="numeric"
                  />
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
                Informe a porta, WID e/ou consumer e clique em "Sincronizar relatório".
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
            <CancelPanel port={effectivePort} consumer={consumer} />
          )}
        </div>
      </div>
    </div>
  );
}
