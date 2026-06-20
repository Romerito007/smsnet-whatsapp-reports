import { NextResponse } from "next/server";
import { gatewayInfo } from "@/lib/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(gatewayInfo());
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
