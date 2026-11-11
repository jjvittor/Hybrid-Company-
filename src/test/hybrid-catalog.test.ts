import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  MENU,
  PRODUCTS,
  SET_PRODUCTS,
  SHOP_CATEGORIES,
  searchProducts,
} from "@/lib/hybrid-catalog";

describe("Hybrid departments", () => {
  it("shows the current catalog count in the main menu", () => {
    expect(MENU).toEqual([`Comprar tudo (${PRODUCTS.length})`, "Coleções", "Agenda"]);
  });
  it("groups clothing under Vestir", () => {
    expect(CATEGORIES.filter((c) => c.department === "Vestir").map((c) => c.n)).toEqual([
      "Camisetas",
      "Moletons",
      "Calças",
      "Bonés",
      "Calçados",
    ]);
  });
  it("groups furniture and objects under Morar", () => {
    expect(CATEGORIES.filter((c) => c.department === "Morar").map((c) => c.n)).toEqual([
      "Mobiliário",
      "Objetos",
      "Iluminação",
    ]);
  });
  it("only offers shop categories with products", () => {
    expect(SHOP_CATEGORIES.map((category) => category.n)).toEqual([
      "Camisetas",
      "Moletons",
      "Calças",
      "Bonés",
      "Calçados",
      "Mobiliário",
      "Objetos",
    ]);
  });
  it("pairs a clothing piece with an object", () => {
    expect(SET_PRODUCTS.map((p) => p.category)).toEqual(["Camisetas", "Objetos"]);
  });
});

it("busca por nome e categoria sem exigir acentos ou ordem fixa", () => {
  expect(searchProducts("tenis").map((item) => item.slug)).toEqual(["tenis-hybrid-runner"]);
  expect(searchProducts("mobiliario verde").map((item) => item.slug)).toEqual([
    "poltrona-tubular-verde",
  ]);
  expect(searchProducts("  wide  calcas ").map((item) => item.slug)).toEqual(["calca-cargo-wide"]);
});
