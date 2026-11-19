// Each Worker instance has a bounded queue. Expiring an entry also releases its IP.
function minuteWindow(total: number, perIp: number) {
  const entries: { ip: string; expires: number }[] = [];
  const byIp = new Map<string, number>();

  return (ip: string, now: number) => {
    while (entries.length && entries[0]!.expires <= now) {
      const oldest = entries.shift()!;
      const remaining = byIp.get(oldest.ip)! - 1;
      if (remaining) byIp.set(oldest.ip, remaining);
      else byIp.delete(oldest.ip);
    }

    const used = byIp.get(ip) ?? 0;
    const oldest = entries.length >= total ? entries[0] : undefined;
    const oldestForIp = used >= perIp ? entries.find((entry) => entry.ip === ip) : undefined;
    const retryAt = Math.max(oldest?.expires ?? 0, oldestForIp?.expires ?? 0);
    if (retryAt > now) return Math.ceil((retryAt - now) / 1000);

    entries.push({ ip, expires: now + 60_000 });
    byIp.set(ip, used + 1);
    return 0;
  };
}

export function createRequestLimit() {
  const visitors = minuteWindow(600, 60);
  const payments = minuteWindow(120, 120);
  const maintenance = minuteWindow(12, 12);

  return (request: Request, pathname: string, now = Date.now()) => {
    const ipHeader = process.env["YBRD_TRUSTED_IP_HEADER"] ?? "cf-connecting-ip";
    const address = request.headers.get(ipHeader);
    const ip = address && address.length <= 45 ? address : "unknown";
    if (request.method === "POST") {
      if (pathname === "/api/loja/webhook-mercado-pago") return payments(ip, now);
      if (pathname === "/api/loja/tarefas") return maintenance(ip, now);
    }
    return visitors(ip, now);
  };
}
