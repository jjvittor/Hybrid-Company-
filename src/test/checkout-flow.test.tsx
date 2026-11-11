import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ComponentType } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Route } from "@/routes/checkout";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  navigate: vi.fn(),
  refresh: vi.fn(),
  clear: vi.fn(),
}));
const item = { slug: "camiseta-heavy-box-off-white", size: "G", quantity: 1 };
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => mocks.navigate,
  Link: ({ to, ...props }: ComponentProps<"a"> & { to: string }) => <a href={to} {...props} />,
}));
vi.mock("@/lib/commerce", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/commerce")>()),
  commerceRequest: mocks.request,
}));
vi.mock("@/components/StorefrontCart", () => ({
  useStorefrontCart: () => ({
    cart: [{ ...item, product: { name: "Camiseta Heavy Box Off-White", priceCentavos: 18900 } }],
    commerce: { enabled: true, pixPercent: 5 },
    subtotalCentavos: 18900,
    refresh: mocks.refresh,
    clear: mocks.clear,
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

it("revisa o total e reutiliza a chave do pedido quando o primeiro envio falha", async () => {
  const shipping = { id: "teste", nome: "Entrega de teste", precoCentavos: 2500, prazoDias: 5 };
  const id = "b255196e-f28a-4122-9ff5-9081829659a2";
  let attempts = 0;
  mocks.request.mockImplementation(async (operation: string) => {
    if (operation === "pagamento-config")
      return { pix: true, cartao: false, boleto: false, publicKey: null, mock: true };
    if (operation === "cep")
      return { rua: "Rua Teste", bairro: "Centro", cidade: "São Paulo", uf: "SP" };
    if (operation === "frete") return { options: [shipping], subtotalCentavos: 18900 };
    if (operation === "revisao")
      return {
        itens: [],
        subtotal_centavos: 18900,
        frete_centavos: 2500,
        desconto_centavos: 945,
        total_centavos: 20455,
        parcelas_maximas: 1,
        cupom_id: null,
        termos_versao: "teste",
        frete: shipping,
        reviewToken: "a".repeat(64),
      };
    if (operation === "pagar") {
      if (attempts++ === 0) throw new Error("Conexão interrompida. Tente novamente.");
      return {
        id,
        numero: "YBRD-000001",
        status: "aguardando_pagamento",
        acesso: "b".repeat(64),
        repetido: true,
      };
    }
    throw new Error("Rota de teste não configurada.");
  });
  const Checkout = Route.options.component as ComponentType;
  render(<Checkout />);
  const fill = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
  const click = async (name: string) => {
    const button = await screen.findByRole("button", { name });
    await act(async () => {
      fireEvent.click(button);
    });
  };
  fill("E-mail", "cliente@example.test");
  fill("CPF", "52998224725");
  await click("Continuar");
  fill("CEP", "01001000");
  await click("Buscar CEP");
  await waitFor(() =>
    expect(screen.getByLabelText("Rua", { exact: true })).toHaveValue("Rua Teste"),
  );
  fill("Destinatário", "Cliente Teste");
  fill("Telefone", "11912345678");
  fill("Número", "10");
  await click("Calcular entrega");
  await screen.findByRole("radio", { name: /Entrega de teste/ });
  await click("Continuar");
  await click("Revisar pedido");
  const accept = await screen.findByRole("checkbox", { name: /Li e aceito/ });
  expect(screen.getByRole("button", { name: "Pagar" })).toBeDisabled();
  fireEvent.click(accept);
  await click("Pagar");
  await screen.findByText("Conexão interrompida. Tente novamente.");
  await click("Pagar");
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/pedido/$id/confirmado",
      params: { id },
      search: { acesso: "b".repeat(64) },
    }),
  );
  const calls = mocks.request.mock.calls.filter(([name]) => name === "pagar");
  expect(calls).toHaveLength(2);
  expect(calls[0]![1].idempotencia).toBe(calls[1]![1].idempotencia);
  expect(calls[0]![1].items).toEqual([item]);
  expect(calls[0]![1].aceitouTermos).toBe(true);
  expect(mocks.clear).toHaveBeenCalledWith([item]);
});
