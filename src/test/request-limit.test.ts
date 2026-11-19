// @vitest-environment node
import { expect, it } from "vitest";
import { createRequestLimit } from "../lib/request-limit.server";

const req = (ip: string) =>
  new Request("https://loja.test", {
    method: "POST",
    headers: { "cf-connecting-ip": ip },
  });

it("compartilha a janela por IP entre páginas e APIs, liberando cada vaga em 60 segundos", () => {
  const limit = createRequestLimit();
  const visitor = req("192.0.2.1");
  expect(limit(visitor, "/", 0)).toBe(0);
  for (let i = 1; i < 60; i++) expect(limit(visitor, "/api/conta/status", 900)).toBe(0);
  expect(limit(visitor, "/checkout", 1000)).toBe(59);
  expect(limit(visitor, "/checkout", 60000)).toBe(0);
  expect(limit(visitor, "/", 60000)).toBe(1);
});

it("limita o conjunto de visitantes e reserva capacidade para pagamentos e manutenção", () => {
  const limit = createRequestLimit();
  for (let i = 0; i < 10; i++) {
    const visitor = req("192.0.2." + i);
    for (let j = 0; j < 60; j++) expect(limit(visitor, "/", 0)).toBe(0);
  }
  const other = req("192.0.2.11");
  expect(limit(other, "/", 0)).toBe(60);
  for (const [route, capacity] of [
    ["webhook-mercado-pago", 120],
    ["tarefas", 12],
  ] as const) {
    const path = "/api/loja/" + route;
    for (let j = 0; j < capacity; j++) expect(limit(other, path, 0)).toBe(0);
    expect(limit(other, path, 0)).toBe(60);
  }
  expect(limit(other, "/", 60000)).toBe(0);
});
