import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test, mock, afterEach } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { TrafficBudget, withTrafficBudget, runMaintenance } from "../deploy/traffic-budget.mjs";

// Use an actual SQLite engine; only the Cloudflare binding transport is in memory.
function store() {
  const db = new DatabaseSync(":memory:");
  let alarm = null;
  const storage = {
    sql: {
      exec(statement, ...args) {
        const stmt = db.prepare(statement);
        if (/^select/i.test(statement)) return { one: () => stmt.get(...args) };
        stmt.run(...args);
      },
    },
    transactionSync(work) {
      db.exec("BEGIN");
      try {
        const value = work();
        db.exec("COMMIT");
        return value;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    getAlarm: async () => alarm,
    setAlarm: async (value) => {
      alarm = value;
    },
  };
  return { db, storage };
}
const origin = { fetch: async () => new Response("page") };
function binding() {
  const stores = new Map();
  const objects = new Map();
  return {
    stores,
    objects,
    idFromName: (name) => name,
    get(name) {
      if (!stores.has(name)) stores.set(name, store());
      if (!objects.has(name)) objects.set(name, new TrafficBudget(stores.get(name)));
      return { fetch: (url, init) => objects.get(name).fetch(new Request(url, init)) };
    },
  };
}
const req = (ip, path = "/", extraHeaders = {}) =>
  new Request("https://loja.example.test" + path, {
    method: "POST",
    headers: { "cf-connecting-ip": ip, ...extraHeaders },
  });
afterEach(() => mock.timers.reset());

test("workers independentes observam a mesma janela após recriar o objeto", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-19T12:00:00Z") });
  const space = binding(),
    env = { YBRD_TRAFFIC: space },
    a = withTrafficBudget(origin),
    b = withTrafficBudget(origin);
  const visitor = req("192.0.2.1");
  for (let i = 0; i < 60; i++) assert.equal((await (i % 2 ? a : b)(visitor, env, {})).status, 200);
  space.objects.clear();
  const full = await b(visitor, env, {});
  assert.equal(full.status, 429);
  assert.equal(full.headers.get("cache-control"), "no-store");
  assert.equal(full.headers.get("x-frame-options"), "DENY");
  assert.equal(full.headers.get("retry-after"), "60");
  assert.equal((await a(req("192.0.2.2"), env, {})).status, 200);
  const db = space.stores.get("visitors").db;
  assert.equal(db.prepare("SELECT count(*) AS n FROM hits WHERE client=?").get("192.0.2.1").n, 0);
  mock.timers.tick(60_000);
  await space.objects.get("visitors").alarm();
  assert.equal(db.prepare("SELECT count(*) AS n FROM hits").get().n, 0);
  assert.equal((await a(visitor, env, {})).status, 200);
});
test("a cota compartilhada de visitantes preserva notificações e manutenção", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-19T12:00:00Z") });
  const env = {
      YBRD_TRAFFIC: binding(),
      YBRD_MP_TEST_WEBHOOK_SECRET: "chave-ficticia-do-provedor",
      YBRD_COMMERCE_CRON_SECRET: "c".repeat(32),
    },
    worker = withTrafficBudget(origin);
  const space = env.YBRD_TRAFFIC;
  space.get("visitors");
  // Seed the counter at its documented boundary instead of generating traffic.
  space.stores
    .get("visitors")
    .db.prepare(
      "WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<600) INSERT INTO hits SELECT ?,i FROM n",
    )
    .run(Date.now());
  assert.equal((await worker(req("192.0.2.3"), env, {})).status, 429);
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", env.YBRD_MP_TEST_WEBHOOK_SECRET)
    .update(`id:123;request-id:fixture;ts:${timestamp};`)
    .digest("hex");
  const notification = req("192.0.2.3", "/api/loja/webhook-mercado-pago?data.id=123", {
    "x-request-id": "fixture",
    "x-signature": `ts=${timestamp},v1=${signature}`,
  });
  assert.equal((await worker(notification, env, {})).status, 200);
  const maintenance = req("192.0.2.3", "/api/loja/tarefas", {
    authorization: "Bearer " + env.YBRD_COMMERCE_CRON_SECRET,
  });
  assert.equal((await worker(maintenance, env, {})).status, 200);
  mock.timers.tick(60_000);
  assert.equal((await worker(req("192.0.2.3"), env, {})).status, 200);
});
test("cotas reservadas exigem autenticação antes de consultar o contador", async () => {
  const space = binding();
  const app = { fetch: mock.fn() };
  for (const route of ["/api/loja/webhook-mercado-pago", "/api/loja/tarefas"]) {
    const reply = await withTrafficBudget(app)(
      req("192.0.2.9", route),
      { YBRD_TRAFFIC: space },
      {},
    );
    assert.equal(reply.status, 401);
  }
  assert.equal(space.stores.size, 0);
  assert.equal(app.fetch.mock.callCount(), 0);
});
test("falha do contador interrompe a requisição antes da aplicação", async () => {
  const app = { fetch: mock.fn() };
  const res = await withTrafficBudget(app)(req("192.0.2.5"), {}, {});
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(app.fetch.mock.callCount(), 0);
});
test("cron usa a rota interna autorizada apenas com vendas habilitadas", async () => {
  const calls = [];
  const app = {
    fetch: async (request) => {
      calls.push(request);
      return new Response(null, { status: 204 });
    },
  };
  await runMaintenance(app, {}, {});
  assert.equal(calls.length, 0);
  const env = {
    YBRD_CHECKOUT_ENABLED: "true",
    YBRD_SITE_ORIGIN: "https://loja.example.test",
    YBRD_COMMERCE_CRON_SECRET: "a".repeat(32),
  };
  await runMaintenance(app, env, {});
  assert.equal(calls[0].url, "https://loja.example.test/api/loja/tarefas");
  assert.equal(calls[0].headers.get("authorization"), "Bearer " + env.YBRD_COMMERCE_CRON_SECRET);
  await assert.rejects(runMaintenance(app, { ...env, YBRD_COMMERCE_CRON_SECRET: "" }, {}));
});
