import { NextResponse } from "next/server";
import { createSession, SESSION_COOKIE } from "@/lib/session";

export async function POST(request) {
  const { username, password } = await request.json().catch(() => ({}));

  const user = process.env.PANEL_USERNAME;
  const pass = process.env.PANEL_PASSWORD;

  if (!user || !pass) {
    return NextResponse.json(
      { error: "Painel sem credenciais configuradas no servidor." },
      { status: 500 }
    );
  }

  if (username !== user || password !== pass) {
    return NextResponse.json(
      { error: "Usuário ou senha inválidos." },
      { status: 401 }
    );
  }

  const token = await createSession(username);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
