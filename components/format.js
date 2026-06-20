const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function fmt(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString("pt-BR");
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "string") {
    if (ISO_RE.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toLocaleString("pt-BR");
    }
    return v;
  }
  if (Array.isArray(v)) return v.map(fmt).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function isNumericKey(k) {
  return /total$|count$|percent$|rate$|seconds$|perminute$|score$|minutes$|num/i.test(
    k.replace(/[^a-z]/gi, "")
  );
}

export function prettyKey(k) {
  return k
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
