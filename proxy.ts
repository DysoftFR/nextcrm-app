import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

const intlMiddleware = createMiddleware(routing);

// Admin-only API paths — cookie presence checked here, role checked server-side
const ADMIN_ONLY_PATHS = [
  "/api/user/activateAdmin",
  "/api/user/deactivateAdmin",
  "/api/user/activate",
  "/api/user/deactivate",
  "/api/user/inviteuser",
  "/api/admin",
];

// Behind a reverse proxy, the Next.js standalone server constructs absolute
// URLs from its internal listening host:port. next-intl's redirects then leak
// that internal origin (e.g. "https://sales.example.com:3000/...") because
// neither the framework nor next-intl honour X-Forwarded-Host by default.
// Rewrite Location headers to the canonical public origin when one is
// configured via NEXT_PUBLIC_APP_URL.
function normalizeLocation(res: NextResponse, req: NextRequest): NextResponse {
  const location = res.headers.get("location");
  if (!location) return res;

  const publicOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (!publicOrigin) return res;

  let canonical: URL;
  try {
    canonical = new URL(publicOrigin);
  } catch {
    return res;
  }

  let target: URL;
  try {
    target = new URL(location, req.url);
  } catch {
    return res;
  }

  if (target.protocol !== canonical.protocol || target.host !== canonical.host) {
    target.protocol = canonical.protocol;
    target.host = canonical.host;
    target.port = canonical.port;
    res.headers.set("location", target.toString());
  }
  return res;
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Inngest webhook — pass through, Inngest handles its own auth via signing key
  if (path.startsWith("/api/inngest")) {
    return NextResponse.next();
  }

  // better-auth API routes — pass through to better-auth handler
  if (path.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(req);

  // Admin-only routes — require session cookie (role checked server-side)
  if (ADMIN_ONLY_PATHS.some((p) => path.startsWith(p))) {
    if (!sessionCookie) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Non-API routes — redirect to sign-in if no session cookie
  if (!path.startsWith("/api")) {
    if (!sessionCookie) {
      // Allow auth pages (sign-in, register, pending, inactive)
      const authPaths = ["/sign-in", "/register", "/pending", "/inactive"];
      const isAuthPage = authPaths.some((p) => path.includes(p));
      if (!isAuthPage) {
        return normalizeLocation(
          NextResponse.redirect(new URL("/sign-in", req.nextUrl)),
          req,
        );
      }
    }
  }

  // Non-API routes — delegate to next-intl
  return normalizeLocation(intlMiddleware(req), req);
}

export const config = {
  matcher: [
    // Admin-only API paths
    "/api/user/activateAdmin/:path*",
    "/api/user/deactivateAdmin/:path*",
    "/api/user/activate/:path*",
    "/api/user/deactivate/:path*",
    "/api/user/inviteuser",
    "/api/admin/:path*",
    // better-auth API
    "/api/auth/:path*",
    // All non-API routes (existing intl matcher)
    "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
  ],
};
