import { NextResponse } from "next/server";
import { listInstances } from "@/lib/gateway";

export async function GET() {
  try {
    return NextResponse.json({ instances: listInstances() });
  } catch (e) {
    return NextResponse.json({ instances: [], error: e.message });
  }
}
