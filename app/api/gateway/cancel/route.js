import { NextResponse } from "next/server";
import { gatewayFetch } from "@/lib/gateway";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const port = body._port;
  delete body._port;

  if (!body.reason || !String(body.reason).trim()) {
    return NextResponse.json({ error: "Informe o motivo (reason)." }, { status: 400 });
  }
  const hasConsumers = Array.isArray(body.consumerIds) && body.consumerIds.length > 0;
  const hasQueues = Array.isArray(body.queueNames) && body.queueNames.length > 0;
  if (!hasConsumers && !hasQueues) {
    return NextResponse.json(
      { error: "Informe consumerIds ou queueNames." },
      { status: 400 }
    );
  }

  try {
    const { ok, status, data } = await gatewayFetch(
      "/queued-ledger/cancel",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      port
    );
    return NextResponse.json(data ?? { error: "Resposta vazia do gateway." }, {
      status: ok ? 200 : status,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
