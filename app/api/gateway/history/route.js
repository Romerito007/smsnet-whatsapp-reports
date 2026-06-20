import { NextResponse } from "next/server";
import { gatewayFetch } from "@/lib/gateway";

export async function POST(request) {
  const { id, size, _instance } = await request.json().catch(() => ({}));
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
      _instance
    );
    return NextResponse.json(data ?? { error: "Resposta vazia do gateway." }, {
      status: ok ? 200 : status,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
