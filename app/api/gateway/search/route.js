import { NextResponse } from "next/server";
import { gatewayFetch } from "@/lib/gateway";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const instance = body._instance;
  delete body._instance;
  try {
    const { ok, status, data } = await gatewayFetch(
      "/messages/search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      instance
    );
    return NextResponse.json(data ?? { error: "Resposta vazia do gateway." }, {
      status: ok ? 200 : status,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
