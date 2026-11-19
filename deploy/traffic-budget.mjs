import { createHmac } from "node:crypto";

const quotas = new Map([
  ["visitors", { total: 600, perIP: 60 }],
  ["payments", { total: 120, perIP: 120 }],
  ["maintenance", { total: 12, perIP: 12 }],
]);

const errorHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000",
};

function laneFor(request) {
  if (request.method === "POST") {
    const path = new URL(request.url).pathname;
    if (path === "/api/loja/webhook-mercado-pago") return "payments";
    if (path === "/api/loja/tarefas") return "maintenance";
  }
  return "visitors";
}

function unavailable() {
  return Response.json(
    { message: "Serviço temporariamente indisponível." },
    {
      status: 503,
      headers: { ...errorHeaders, "Retry-After": "5" },
    },
  );
}

export function withTrafficBudget(origin) {
  // Cache only exhaustion of a whole lane. A single busy IP cannot close it.
  const fullUntil = new Map();
  return async (request, env, context) => {
    const lane = laneFor(request);
    const remaining = (fullUntil.get(lane) ?? 0) - Date.now();
    if (remaining > 0) return limited(Math.ceil(remaining / 1000));
    try {
      const space = env.YBRD_TRAFFIC;
      const budget = space.get(space.idFromName(lane));
      const response = await budget.fetch("https://budget.internal/" + lane, {
        method: "POST",
        headers: { "x-client": request.headers.get("cf-connecting-ip") || "unknown" },
      });
      if (response.status === 429) {
        const retry = Math.max(1, Math.min(60, Number(response.headers.get("Retry-After")) || 1));
        const globalRetry = Number(response.headers.get("x-budget-full"));
        if (globalRetry > 0) fullUntil.set(lane, Date.now() + Math.min(globalRetry, 60) * 1000);
        return limited(retry);
      }
      if (response.status !== 204) return unavailable();
    } catch {
      return unavailable();
    }
    return origin.fetch(request, env, context);
  };
}

// A named object owns each lane across all Worker instances. Only accepted
// requests occupy rows; a denied request cannot grow the table or extend a ban.
export class TrafficBudget {
  constructor(state) {
    this.storage = state.storage;
    this.sql = state.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS hits (at INTEGER NOT NULL, client TEXT NOT NULL)");
    this.sql.exec("CREATE INDEX IF NOT EXISTS hits_at ON hits(at)");
    this.sql.exec("CREATE INDEX IF NOT EXISTS hits_client ON hits(client, at)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY, salt TEXT NOT NULL)");
    this.sql.exec("INSERT OR IGNORE INTO config VALUES (1, hex(randomblob(32)))");
    this.salt = this.sql.exec("SELECT salt FROM config WHERE id=1").one().salt;
  }

  async fetch(request) {
    const quota = quotas.get(new URL(request.url).pathname.slice(1));
    if (request.method !== "POST" || !quota) return new Response(null, { status: 404 });
    const ip = request.headers.get("x-client") || "unknown";
    const client = createHmac("sha256", this.salt).update(ip).digest("hex");
    let fullFor = 0;
    const retry = this.storage.transactionSync(() => {
      const now = Date.now();
      this.sql.exec("DELETE FROM hits WHERE at <= ?", now - 60_000);
      const all = this.sql.exec("SELECT count(*) AS n, min(at) AS oldest FROM hits").one();
      const own = this.sql
        .exec("SELECT count(*) AS n, min(at) AS oldest FROM hits WHERE client=?", client)
        .one();
      if (all.n >= quota.total)
        fullFor = Math.max(1, Math.ceil((all.oldest + 60_000 - now) / 1000));
      if (all.n >= quota.total || own.n >= quota.perIP) {
        const oldest = Math.max(
          all.n >= quota.total ? all.oldest : -Infinity,
          own.n >= quota.perIP ? own.oldest : -Infinity,
        );
        return Math.max(1, Math.ceil((oldest + 60_000 - now) / 1000));
      }
      this.sql.exec("INSERT INTO hits VALUES (?, ?)", now, client);
      return 0;
    });
    if (retry) return limited(retry, fullFor);
    if ((await this.storage.getAlarm()) === null) await this.storage.setAlarm(Date.now() + 60_000);
    return new Response(null, { status: 204 });
  }

  async alarm() {
    this.sql.exec("DELETE FROM hits WHERE at <= ?", Date.now() - 60_000);
    const next = this.sql.exec("SELECT min(at) AS oldest FROM hits").one().oldest;
    if (next !== null) await this.storage.setAlarm(next + 60_000);
  }
}

function limited(retry, fullFor = 0) {
  return Response.json(
    { message: "Muitas solicitações. Tente novamente em instantes." },
    {
      status: 429,
      headers: {
        ...errorHeaders,
        "Retry-After": String(retry),
        ...(fullFor ? { "x-budget-full": String(fullFor) } : {}),
      },
    },
  );
}

export async function runMaintenance(origin, env, ctx) {
  if (env.YBRD_CHECKOUT_ENABLED !== "true") return;
  if (
    !env.YBRD_COMMERCE_CRON_SECRET ||
    env.YBRD_COMMERCE_CRON_SECRET.length < 32 ||
    !env.YBRD_SITE_ORIGIN ||
    new URL(env.YBRD_SITE_ORIGIN).protocol !== "https:"
  )
    throw new Error("Manutenção da loja indisponível.");
  const request = new Request(new URL("/api/loja/tarefas", env.YBRD_SITE_ORIGIN), {
    method: "POST",
    headers: { authorization: "Bearer " + env.YBRD_COMMERCE_CRON_SECRET },
  });
  const result = await origin.fetch(request, env, ctx);
  if (!result.ok) throw new Error("Manutenção da loja indisponível.");
}
