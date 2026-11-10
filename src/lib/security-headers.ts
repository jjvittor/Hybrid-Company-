export const nonceHeader = "x-ybrd-csp-nonce";
export function securityHeaders(request: Request, response: Response, nonce: string) {
  const headers = new Headers(response.headers);
  const url = new URL(request.url);
  const turnstile = "https://challenges.cloudflare.com";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${turnstile}`,
    // The existing store and Radix components use dynamic style attributes.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    `frame-src ${turnstile}`,
    `connect-src 'self' ${turnstile}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  headers.set("Content-Security-Policy", policy.join("; "));
  headers.set("X-Content-Type-Options", "nosniff");
  if (!headers.has("Referrer-Policy"))
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-Frame-Options", "DENY");
  if (url.protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000");
  if (
    url.pathname.startsWith("/api/conta/") ||
    /^\/(?:entrar|criar-conta|recuperar-senha|redefinir-senha|minha-conta|auth|reset-password)\/?$/.test(
      url.pathname,
    ) ||
    headers.get("content-type")?.includes("text/html")
  )
    headers.set("Cache-Control", "no-store");
  if (
    /^\/(?:entrar|criar-conta|recuperar-senha|redefinir-senha|minha-conta|auth|reset-password)\/?$/.test(
      url.pathname,
    )
  ) {
    headers.set("Referrer-Policy", "no-referrer");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
