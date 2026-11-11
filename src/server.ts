import "./lib/error-capture";

import { handleAccount } from "./lib/account-http.server";
import { nonceHeader, securityHeaders } from "./lib/security-headers";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error("[YBRD] Falha na renderização.");
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const nonce = crypto.randomUUID().replaceAll("-", "");
    const url = new URL(request.url);
    let response: Response;
    try {
      if (url.pathname.startsWith("/api/conta/")) {
        response = await handleAccount(request, url.pathname.slice("/api/conta/".length));
      } else {
        const headers = new Headers(request.headers);
        headers.set(nonceHeader, nonce);
        const handler = await getServerEntry();
        // Vite can pass a proxied Request across its SSR boundary. Rebuild from
        // public fields so Node's constructor does not read private state on it.
        const forwarded = new Request(request.url, {
          method: request.method,
          headers,
          ...(request.body ? { body: request.body, duplex: "half" as const } : {}),
        });
        response = await normalizeCatastrophicSsrResponse(await handler.fetch(forwarded, env, ctx));
      }
    } catch {
      console.error("[YBRD] Falha na requisição.");
      response = new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return securityHeaders(request, response, nonce);
  },
};
