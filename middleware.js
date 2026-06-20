import { NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "./lib/session";

const PUBLIC_PATHS = ["/login"];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // O endpoint de login precisa ficar aberto para autenticar.
  if (pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  // APIs protegidas respondem 401 em JSON quando não autenticadas.
  if (pathname.startsWith("/api/")) {
    if (!session) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!session && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (session && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
