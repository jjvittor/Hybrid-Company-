import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Storefront } from "@/components/Storefront";
import { PREVIEW_CART_KEY, StorefrontCartProvider } from "@/components/StorefrontCart";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ to, ...props }: ComponentProps<"a"> & { to: string }) => <a href={to} {...props} />,
}));

beforeEach(() => {
  localStorage.removeItem(PREVIEW_CART_KEY);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const Home = Storefront;

describe("Prévia da home", () => {
  it("abre o menu no primeiro clique e devolve o foco ao fechar com Escape", () => {
    render(<Home />, { wrapper: StorefrontCartProvider });
    const menu = within(screen.getByRole("navigation", { name: "Menu principal" }));
    const trigger = menu.getByRole("button", { name: /Comprar tudo/ });

    fireEvent.mouseOver(trigger);
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const category = screen.getByRole("link", { name: /Camisetas/ });
    category.focus();
    fireEvent.keyDown(category, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("abre o menu de celular com acesso à conta", () => {
    render(<Home />, { wrapper: StorefrontCartProvider });
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByRole("link", { name: "Minha conta" })).toHaveAttribute(
      "href",
      "/entrar",
    );
  });

  it("busca uma peça, escolhe tamanho e remove o item da sacola de demonstração", () => {
    render(<Home />, { wrapper: StorefrontCartProvider });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar produtos" }), {
      target: { value: "heavy" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /Camiseta Heavy Box/ }),
    );

    expect(screen.getByRole("button", { name: "Adicionar à sacola" })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Tamanho" }), { target: { value: "G" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar à sacola" }));

    const bag = within(screen.getByRole("dialog", { name: "Sua sacola" }));
    expect(bag.getByText(/Tamanho G/)).toBeInTheDocument();
    expect(bag.getByText(/Pedidos e pagamentos ainda não estão disponíveis/)).toBeInTheDocument();
    fireEvent.click(bag.getByRole("button", { name: /Remover Camiseta/ }));
    expect(bag.getByText("Sua sacola está vazia.")).toBeInTheDocument();
  });

  it("restaura a sacola e mantém quantidade e tamanho por variante", () => {
    localStorage.setItem(
      PREVIEW_CART_KEY,
      JSON.stringify([
        { slug: "camiseta-heavy-box-off-white", size: "G", quantity: 2 },
        { slug: "camiseta-heavy-box-off-white", size: "GG", quantity: 1 },
        { slug: "camiseta-heavy-box-off-white", size: "XL", quantity: 50 },
      ]),
    );
    const page = render(<Home />, { wrapper: StorefrontCartProvider });
    fireEvent.click(screen.getByRole("button", { name: "Sacola, 3 itens" }));
    const bag = within(screen.getByRole("dialog", { name: "Sua sacola" }));
    const group = within(
      bag.getByRole("group", { name: "Quantidade de Camiseta Heavy Box Off-White, G" }),
    );
    fireEvent.click(group.getByRole("button", { name: "Aumentar quantidade" }));
    expect(group.getByText("3")).toBeInTheDocument();
    page.unmount();

    render(<Home />, { wrapper: StorefrontCartProvider });
    expect(screen.getByRole("button", { name: "Sacola, 4 itens" })).toBeInTheDocument();
  });

  it("abre a política de privacidade sem enviar o formulário preenchido", () => {
    render(<Home />, { wrapper: StorefrontCartProvider });
    const footer = within(screen.getByRole("contentinfo"));
    fireEvent.change(footer.getByRole("textbox", { name: "Seu e-mail" }), {
      target: { value: "teste@example.com" },
    });
    fireEvent.click(footer.getByRole("checkbox"));
    fireEvent.click(footer.getByRole("button", { name: "política de privacidade" }));

    expect(screen.getByRole("dialog", { name: "Privacidade" })).toBeInTheDocument();
    expect(footer.queryByRole("status")).not.toBeInTheDocument();
  });
});
