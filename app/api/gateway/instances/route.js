import { NextResponse } from "next/server";
import { gatewayFetch } from "@/lib/gateway";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const port = body._port ?? process.env.GATEWAY_BOOTSTRAP_PORT;
  const wid = body._wid ?? process.env.GATEWAY_BOOTSTRAP_WID;
  delete body._port;
  delete body._wid;

  if (!wid) {
    return NextResponse.json(
      {
        error:
          "Informe _wid no body ou configure GATEWAY_BOOTSTRAP_WID no servidor para listar instâncias.",
      },
      { status: 400 }
    );
  }

  try {
    const { ok, status, data } = await gatewayFetch(
      "/instances/list",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      { wid, port }
    );
    return NextResponse.json(data ?? { error: "Resposta vazia do gateway." }, {
      status: ok ? 200 : status,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
