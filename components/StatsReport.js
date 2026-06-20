"use client";

import DataTable from "./DataTable";
import { fmt, prettyKey } from "./format";

const PRIMARY = [
  { key: "total", label: "Total" },
  { key: "sentTotal", label: "Enviadas", cls: "ok" },
  { key: "pendingTotal", label: "Pendentes", cls: "warn" },
  { key: "retryableTotal", label: "Retryable", cls: "warn" },
  { key: "failedFinalTotal", label: "Falhas finais", cls: "crit" },
  { key: "successRatePercent", label: "Sucesso", cls: "accent", suffix: "%" },
];

const SECONDARY = [
  { key: "queuedTotal", label: "Em fila" },
  { key: "sendingTotal", label: "Enviando" },
  { key: "droppedTotal", label: "Descartadas" },
  { key: "deletedTotal", label: "Deletadas" },
  { key: "canceledTotal", label: "Canceladas" },
  { key: "nullStatusTotal", label: "Status nulo" },
  { key: "failureRatePercent", label: "Falha", suffix: "%", cls: "crit" },
  { key: "retryableRatePercent", label: "Retry", suffix: "%", cls: "warn" },
];

const THROUGHPUT = [
  { key: "recentSentPerMinute", label: "Envios/min" },
  { key: "recentFailurePerMinute", label: "Falhas/min", cls: "crit" },
  { key: "estimatedMinutesToDrain", label: "Min p/ esvaziar" },
  { key: "estimatedFinishAt", label: "Fim estimado" },
  { key: "staleSendingTotal", label: "Sending travado", cls: "warn" },
  { key: "nextRetryBlockedTotal", label: "Retry bloqueado", cls: "warn" },
  { key: "avgSendSeconds", label: "Latência média (s)" },
  { key: "p95SendSeconds", label: "Latência p95 (s)" },
];

const SECTIONS = [
  { key: "byStatus", title: "Por status", prefer: ["status", "total"] },
  {
    key: "byError",
    title: "Por classe de erro",
    prefer: ["errorClass", "lastErrorClass", "class", "total", "suggestedAction"],
  },
  { key: "byWid", title: "Por WID", prefer: ["wid", "total"] },
  { key: "byQueue", title: "Por fila / consumer", prefer: ["queueName", "consumerId", "total"] },
  { key: "byConsumer", title: "Por consumer", prefer: ["consumerId", "total"] },
  { key: "byKind", title: "Por tipo de mensagem", prefer: ["messageKind", "kind", "total"] },
  { key: "activeSenders", title: "Senders ativos" },
  { key: "byDay", title: "Distribuição diária", prefer: ["day", "date"] },
  { key: "byHour", title: "Distribuição horária", prefer: ["hour"] },
  { key: "pendingDetails", title: "Pendências" },
  { key: "retryableDetails", title: "Retryables" },
  { key: "failedFinalDetails", title: "Falhas finais" },
  { key: "nullStatusDetails", title: "Status nulo / legado" },
  { key: "errorDetails", title: "Detalhes de erro" },
  { key: "slowest", title: "Envios mais lentos" },
];

function Cards({ summary, defs }) {
  const cards = defs.filter((d) => summary[d.key] != null);
  if (!cards.length) return null;
  return (
    <div className="cards">
      {cards.map((d) => (
        <div key={d.key} className={`card ${d.cls || ""}`}>
          <div className="label">{d.label}</div>
          <div className="value">
            {fmt(summary[d.key])}
            {d.suffix && summary[d.key] != null ? d.suffix : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function KV({ obj }) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return null;
  return (
    <div className="table-wrap">
      <table className="data">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k}>
              <td className="wrap" style={{ color: "var(--muted)", width: 240 }}>
                {prettyKey(k)}
              </td>
              <td className={typeof v === "number" ? "num" : "wrap"}>
                {v !== null && typeof v === "object" && !Array.isArray(v) ? (
                  <KV obj={v} />
                ) : (
                  fmt(v)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children, count }) {
  return (
    <div className="section">
      <h3>
        {title}
        {count != null && <span className="count">{count}</span>}
      </h3>
      {children}
    </div>
  );
}

function NoteList({ items, variant }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <ul className={`notelist ${variant || ""}`}>
      {items.map((it, i) => (
        <li key={i}>{typeof it === "object" ? fmt(it) : it}</li>
      ))}
    </ul>
  );
}

const SEV_COLOR = {
  critical: "var(--crit)",
  warning: "var(--warn)",
  info: "var(--accent)",
};

function Diagnostics({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <ul className="notelist">
      {items.map((d, i) => {
        const sev = (d.severity || "info").toLowerCase();
        return (
          <li
            key={i}
            style={{ borderLeftColor: SEV_COLOR[sev] || "var(--accent)" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: d.message ? 6 : 0,
              }}
            >
              <span className="badge">{d.severity || "info"}</span>
              <strong>{d.title || d.code}</strong>
              {d.total ? (
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    color: "var(--muted-2)",
                    fontSize: 11,
                  }}
                >
                  {fmt(d.total)}
                </span>
              ) : null}
            </div>
            {d.message && (
              <div style={{ color: "var(--muted)", fontSize: 12.5 }}>
                {d.message}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function StatsReport({ data }) {
  if (!data) return null;
  if (data.error) {
    return <div className="error-box">{fmt(data.error)}</div>;
  }

  const summary = data.summary || {};
  const health = data.health || null;
  const healthState = (health?.state || health?.status || "").toLowerCase();
  const healthClass = ["healthy", "attention", "critical"].includes(healthState)
    ? healthState
    : "healthy";
  const reasons = health?.reasons;

  return (
    <div>
      {health && (
        <div className={`health ${healthClass}`}>
          <span className="signal" />
          <span className="state">{health.state || health.status || "—"}</span>
          {health.score != null && (
            <span className="score">score {fmt(health.score)}</span>
          )}
          {reasons && (
            <span className="reasons">
              {Array.isArray(reasons) ? reasons.join(" · ") : fmt(reasons)}
            </span>
          )}
        </div>
      )}

      <Cards summary={summary} defs={PRIMARY} />
      <Cards summary={summary} defs={SECONDARY} />

      {THROUGHPUT.some((d) => summary[d.key] != null) && (
        <Section title="Throughput e latência">
          <Cards summary={summary} defs={THROUGHPUT} />
        </Section>
      )}

      {SECTIONS.map((s) => {
        const val = data[s.key];
        if (!Array.isArray(val) || val.length === 0) return null;
        return (
          <Section key={s.key} title={s.title} count={val.length}>
            <DataTable rows={val} prefer={s.prefer} />
          </Section>
        );
      })}

      {data.recentSamples &&
        typeof data.recentSamples === "object" &&
        !Array.isArray(data.recentSamples) &&
        Object.entries(data.recentSamples).some(
          ([, v]) => Array.isArray(v) && v.length
        ) && (
          <Section title="Amostras recentes">
            {Object.entries(data.recentSamples).map(([k, v]) =>
              Array.isArray(v) && v.length ? (
                <div key={k} style={{ marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 8px" }}>
                    {prettyKey(k)} <span className="count">{v.length}</span>
                  </h3>
                  <DataTable rows={v} />
                </div>
              ) : null
            )}
          </Section>
        )}

      {Array.isArray(data.recentSamples) && data.recentSamples.length > 0 && (
        <Section title="Amostras recentes" count={data.recentSamples.length}>
          <DataTable rows={data.recentSamples} />
        </Section>
      )}

      {Array.isArray(data.diagnostics) && data.diagnostics.length > 0 && (
        <Section title="Diagnósticos">
          <Diagnostics items={data.diagnostics} />
        </Section>
      )}

      {Array.isArray(data.recommendations) && data.recommendations.length > 0 && (
        <Section title="Recomendações">
          <NoteList items={data.recommendations} variant="rec" />
        </Section>
      )}

      {data.smsnetContract && (
        <Section title="Contrato smsnet_message">
          <KV obj={data.smsnetContract} />
        </Section>
      )}

      <details className="raw">
        <summary>Resumo completo + JSON bruto</summary>
        <div style={{ marginTop: 12 }}>
          <KV obj={summary} />
        </div>
        <pre style={{ marginTop: 12 }}>{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  );
}
