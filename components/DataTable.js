"use client";

import { fmt, prettyKey, isNumericKey } from "./format";

const STATUS_KEYS = ["status", "oldStatus", "newStatus"];
const ACTION_KEYS = ["suggestedAction", "suggested_action"];
const WRAP_KEYS = ["lastError", "last_error", "reason", "message", "note", "error"];

function columnsFromRows(rows, prefer) {
  const seen = new Set();
  const cols = [];
  // honor a preferred order first
  for (const k of prefer || []) {
    if (rows.some((r) => r && Object.prototype.hasOwnProperty.call(r, k))) {
      cols.push(k);
      seen.add(k);
    }
  }
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
  }
  return cols;
}

export default function DataTable({ rows, prefer, max = 200 }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  // Scalar arrays (e.g. list of strings) → single column
  if (rows.every((r) => typeof r !== "object" || r === null)) {
    return (
      <div className="table-wrap">
        <table className="data">
          <tbody>
            {rows.slice(0, max).map((r, i) => (
              <tr key={i}>
                <td className="wrap">{fmt(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const cols = columnsFromRows(rows, prefer);
  const shown = rows.slice(0, max);

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c}>{prettyKey(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i}>
              {cols.map((c) => {
                const val = row ? row[c] : undefined;
                if (STATUS_KEYS.includes(c) && typeof val === "string") {
                  return (
                    <td key={c}>
                      <span className={`badge ${val}`}>{val}</span>
                    </td>
                  );
                }
                if (ACTION_KEYS.includes(c)) {
                  return (
                    <td key={c} className="wrap">
                      <span className="pill-action">{fmt(val)}</span>
                    </td>
                  );
                }
                if (WRAP_KEYS.includes(c)) {
                  return (
                    <td key={c} className="wrap">
                      {fmt(val)}
                    </td>
                  );
                }
                const numeric = typeof val === "number" || isNumericKey(c);
                return (
                  <td key={c} className={numeric ? "num" : ""}>
                    {fmt(val)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
