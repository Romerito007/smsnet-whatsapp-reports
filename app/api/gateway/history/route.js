import { NextResponse } from "next/server";
import { gatewayFetch } from "@/lib/gateway";

export async function POST(request) {
  const { id, size, _port, _wid, _host, _timeoutMs } = await request.json().catch(() => ({}));

  if (!_wid) {
    return NextResponse.json(
      { error: "Selecione a instância (WID) para autenticar." },
      { status: 400 }
    );
  }
  if (!id) {
    return NextResponse.json(
      { error: "Informe o id da conversa/remotejid." },
      { status: 400 }
    );
  }

  const sz = Number(size) > 0 ? Number(size) : 50;
  try {
    const { ok, status, data } = await gatewayFetch(
      `/messages/history/${encodeURIComponent(id)}/${sz}`,
      { method: "GET" },
      { wid: _wid, port: _port, host: _host, timeoutMs: _timeoutMs }
    );
    return NextResponse.json(data ?? { error: "Resposta vazia do gateway." }, {
      status: ok ? 200 : status,
    });
  } catch (e) {
    console.error("history route error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
