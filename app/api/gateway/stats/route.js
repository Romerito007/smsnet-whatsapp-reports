import { NextResponse } from "next/server";
import { gatewayFetch } from "@/lib/gateway";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const wid = body._wid;
  const timeoutMs = body._timeoutMs;
  delete body._wid;
  delete body._port;
  delete body._host;
  delete body._timeoutMs;

  if (!wid) {
    return NextResponse.json(
      { error: "Selecione a instância (WID) para autenticar." },
      { status: 400 }
    );
  }

  try {
    const { ok, status, data } = await gatewayFetch(
      "/queued-ledger/stats",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      { wid, timeoutMs }
    );
    return NextResponse.json(data ?? { error: "Resposta vazia do gateway." }, {
      status: ok ? 200 : status,
    });
  } catch (e) {
    console.error("stats route error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
