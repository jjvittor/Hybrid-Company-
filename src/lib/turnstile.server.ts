export async function verifyTurnstile(
  token: string,
  hostname: string,
  ip: string,
  action: "ybrd-account" | "ybrd-checkout",
) {
  const secret = process.env["YBRD_TURNSTILE_SECRET"];
  if (!secret) throw new Error("Turnstile unavailable");
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Turnstile unavailable");
  const data = await response.json();
  return data.success === true && data.hostname === hostname && data.action === action;
}
