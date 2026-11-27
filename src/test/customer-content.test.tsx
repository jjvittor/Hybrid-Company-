import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AccountField } from "@/components/AccountFields";
import { securityHeaders } from "@/lib/security-headers";

it("exibe o nome e a mensagem do cadastro como texto literal", () => {
  const nome = 'Ana <em data-cliente="sim">Silva</em>';
  const { container } = render(
    <AccountField label="Nome" name="nome" value={nome} error={nome} readOnly />,
  );
  expect(screen.getByLabelText("Nome")).toHaveValue(nome);
  expect(screen.getByRole("alert")).toHaveTextContent(nome);
  expect(container.querySelector("[data-cliente]")).toBeNull();
});

it("restringe os scripts e os objetos no painel de pedidos", () => {
  const request = new Request("https://loja.example.test/admin/pedidos");
  const response = securityHeaders(request, new Response(), "nonce-do-teste");
  const policy = response.headers.get("Content-Security-Policy")?.split("; ");
  const scripts = policy?.find((rule) => rule.startsWith("script-src "));
  expect(scripts).toContain("'nonce-nonce-do-teste'");
  expect(scripts).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
  expect(policy).toContain("object-src 'none'");
});
