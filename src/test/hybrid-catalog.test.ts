import { describe, expect, it } from "vitest";
import { CATEGORIES, MENU, SET_PRODUCTS } from "@/lib/hybrid-catalog";

describe("Hybrid departments", () => {
  it("uses the requested main menu", () => {
    expect(MENU).toEqual(["Comprar tudo (48)", "Coleções", "Agenda"]);
  });
  it("groups clothing under Vestir", () => {
    expect(CATEGORIES.filter(c => c.department === "Vestir").map(c => c.n)).toEqual(["Camisetas", "Moletons", "Calças", "Bonés", "Calçados"]);
  });
  it("groups furniture and objects under Morar", () => {
    expect(CATEGORIES.filter(c => c.department === "Morar").map(c => c.n)).toEqual(["Mobiliário", "Objetos", "Iluminação"]);
  });
  it("pairs a clothing piece with an object", () => {
    expect(SET_PRODUCTS.map(p => p.category)).toEqual(["Camisetas", "Objetos"]);
  });
});