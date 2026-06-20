"use client";

import { useState } from "react";
import DataTable from "./DataTable";
import { fmt } from "./format";

function parseIds(str) {
  return (str || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}
function splitCsv(str) {
  return (str || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function postCancel(body) {
  const res = await fetch("/api/gateway/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Sessão expirada.");
  }
  const data = await res.json().catch(() => ({ error: "Resposta inválida." }));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}.`);
  return data;
}

export default function CancelPanel({ port, wid, consumer, instanceHasNoConsumer }) {
  const [consumerIds, setConsumerIds] = useState(consumer || "");
  const [queueNames, setQueueNames] = useState("");
  const [messageKind, setMessageKind] = useState("billing");
  const [stQueued, setStQueued] = useState(true);
  const [stRetryable, setStRetryable] = useState(true);
  const [includeSending, setIncludeSending] = useState(false);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState("deleted");

  const [dryResult, setDryResult] = useState(null);
  const [execResult, setExecResult] = useState(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  function build(dryRun) {
    if (!wid) throw new Error("Selecione a instância (WID) para autenticar.");
    if (!port) throw new Error("Informe a porta da instância.");
    const ids = instanceHasNoConsumer ? [] : parseIds(consumerIds);
    const queues = splitCsv(queueNames);
    if (ids.length === 0 && queues.length === 0) {
      throw new Error("Informe Consumer ID(s) ou Queue name(s).");
    }
    if (!reason.trim()) throw new Error("Informe o motivo (reason).");

    const statuses = [];
    if (stQueued) statuses.push("queued");
    if (stRetryable) statuses.push("retryable");
    if (includeSending) statuses.push("sending");

    const body = {
      dryRun,
      mode,
      reason: reason.trim(),
      statuses: statuses.length ? statuses : ["queued", "retryable"],
    };
    if (ids.length) body.consumerIds = ids;
    if (queues.length) body.queueNames = queues;
    if (messageKind) body.messageKind = messageKind;
    if (includeSending) body.includeSending = true;
    if (phone.trim()) body.phone = phone.trim();
    if (port) body._port = port;
    if (wid) body._wid = wid;
    return body;
  }

  async function runDry() {
    setError("");
    setExecResult(null);
    setLoading("dry");
    try {
      setDryResult(await postCancel(build(true)));
    } catch (e) {
      setError(e.message);
      setDryResult(null);
    } finally {
      setLoading("");
    }
  }

  async function runExec() {
    setError("");
    try {
      build(false); // valida antes de confirmar
    } catch (e) {
      setError(e.message);
      return;
    }
    const total = dryResult?.affectedTotal;
    const ok = window.confirm(
      `Cancelar (${mode}) ${total != null ? total : "?"} mensagem(ns)?\n\n` +
        `WID: ${wid} · Porta: ${port}\nMotivo: ${reason.trim()}\n\n` +
        "Esta ação altera os registros no gateway."
    );
    if (!ok) return;
    setLoading("exec");
    try {
      setExecResult(await postCancel(build(false)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading("");
    }
  }

  const canExec = dryResult && dryResult.affectedTotal > 0 && reason.trim() && !loading;

  return (
    <div>
      <div className="warn-box">
        Ação administrativa: faz cancelamento lógico (sem DELETE físico). Sempre rode
        a simulação primeiro e confira o total afetado antes de executar.
      </div>

      <div className="querybar" style={{ marginTop: 14 }}>
        <div className="field mono">
          <label>Consumer ID(s)</label>
          <input
            value={consumerIds}
            onChange={(e) => setConsumerIds(e.target.value)}
            placeholder="ex.: 2681"
          />
        </div>
        <div className="field mono">
          <label>Queue name(s)</label>
          <input
            value={queueNames}
            onChange={(e) => setQueueNames(e.target.value)}
            placeholder="ex.: consumer_2681"
          />
        </div>
        <div className="field">
          <label>Tipo</label>
          <select value={messageKind} onChange={(e) => setMessageKind(e.target.value)}>
            <option value="">Todos</option>
            <option value="billing">billing</option>
            <option value="group">group</option>
          </select>
        </div>
        <div className="field mono">
          <label>Telefone (opcional)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="558398084868"
          />
        </div>
        <div className="field">
          <label>Modo</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="deleted">deleted</option>
            <option value="canceled">canceled</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Motivo (reason) — obrigatório</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="manual support cancel — consumer 2681 / wid 3005 / phone 558398084868"
          />
        </div>

        <div className="checkrow" style={{ gridColumn: "1 / -1" }}>
          <label className="check">
            <input
              type="checkbox"
              checked={stQueued}
              onChange={(e) => setStQueued(e.target.checked)}
            />
            queued
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={stRetryable}
              onChange={(e) => setStRetryable(e.target.checked)}
            />
            retryable
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={includeSending}
              onChange={(e) => setIncludeSending(e.target.checked)}
            />
            incluir sending (cuidado)
          </label>
        </div>

        <div className="actions">
          <button className="btn-ghost" onClick={runDry} disabled={!!loading}>
            {loading === "dry" ? "Simulando…" : "Simular (dry-run)"}
          </button>
          <button className="btn danger" onClick={runExec} disabled={!canExec}>
            {loading === "exec" ? "Executando…" : "Executar cancelamento"}
          </button>
          <span className="spacer" />
        </div>
      </div>

      {error && (
        <div className="error-box" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      {dryResult && (
        <div style={{ marginTop: 20 }}>
          <div className="cards">
            <div className="card warn">
              <div className="label">Afetados (simulação)</div>
              <div className="value">{fmt(dryResult.affectedTotal)}</div>
            </div>
            <div className="card">
              <div className="label">Modo</div>
              <div className="value" style={{ fontSize: 16 }}>
                {dryResult.mode}
              </div>
            </div>
          </div>
          {Array.isArray(dryResult.before) && dryResult.before.length > 0 && (
            <div className="section">
              <h3>Antes</h3>
              <DataTable rows={dryResult.before} prefer={["status", "total"]} />
            </div>
          )}
          {Array.isArray(dryResult.samples) && dryResult.samples.length > 0 && (
            <div className="section">
              <h3>
                Amostra <span className="count">{dryResult.samples.length}</span>
              </h3>
              <DataTable rows={dryResult.samples} />
            </div>
          )}
        </div>
      )}

      {execResult && (
        <div style={{ marginTop: 20 }}>
          <div className="health healthy">
            <span className="signal" />
            <span className="state">
              Cancelamento executado — {fmt(execResult.affectedTotal)} afetada(s)
            </span>
          </div>
          {Array.isArray(execResult.after) && execResult.after.length > 0 && (
            <div className="section">
              <h3>Depois</h3>
              <DataTable rows={execResult.after} prefer={["status", "lastErrorClass", "total"]} />
            </div>
          )}
          <details className="raw">
            <summary>JSON bruto</summary>
            <pre>{JSON.stringify(execResult, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
