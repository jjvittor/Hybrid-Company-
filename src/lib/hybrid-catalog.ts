import tee from "@/assets/cutouts/tee.png";
import hoodie from "@/assets/cutouts/hoodie.png";
import cargo from "@/assets/cutouts/cargo.png";
import sneaker from "@/assets/cutouts/sneaker.png";
import chair from "@/assets/cutouts/chair.png";
import vase from "@/assets/cutouts/vase.png";
import cap from "@/assets/cutouts/cap.png";
import table from "@/assets/cutouts/table.png";

export type Department = "Vestir" | "Morar";
export type Product = { slug: string; description: string; name: string; price: number; img: string; cat: Department; category: string; tag?: "Novo" };
export const PRODUCTS: Product[] = [
  { slug: "camiseta-heavy-box-off-white", description: "Camiseta off-white de silhueta box, com proporções amplas.", name: "Camiseta Heavy Box Off-White", price: 189, img: tee, cat: "Vestir", category: "Camisetas", tag: "Novo" },
  { slug: "poltrona-tubular-verde", description: "Poltrona com estrutura tubular verde e assento claro.", name: "Poltrona Tubular Verde", price: 2490, img: chair, cat: "Morar", category: "Mobiliário", tag: "Novo" },
  { slug: "moletom-concreto-verde", description: "Moletom verde com capuz e bolso frontal.", name: "Moletom Concreto Verde", price: 429, img: hoodie, cat: "Vestir", category: "Moletons" },
  { slug: "vaso-forma-areia", description: "Vaso em tom areia, com corpo arredondado e alça lateral.", name: "Vaso Forma Areia", price: 249, img: vase, cat: "Morar", category: "Objetos", tag: "Novo" },
  { slug: "calca-cargo-wide", description: "Calça cargo de perna ampla, com bolsos laterais.", name: "Calça Cargo Wide", price: 399, img: cargo, cat: "Vestir", category: "Calças" },
  { slug: "mesa-lateral-concreto", description: "Mesa lateral de linhas simples e tom de concreto.", name: "Mesa Lateral Concreto", price: 890, img: table, cat: "Morar", category: "Mobiliário" },
  { slug: "bone-six-panel-verde", description: "Boné verde de seis painéis com aba curva.", name: "Boné Six Panel Verde", price: 159, img: cap, cat: "Vestir", category: "Bonés" },
  { slug: "tenis-hybrid-runner", description: "Tênis com silhueta inspirada em modelos de corrida.", name: "Tênis Hybrid Runner", price: 699, img: sneaker, cat: "Vestir", category: "Calçados" },
];
export const MENU = [`Comprar tudo (${PRODUCTS.length})`, "Coleções", "Agenda"] as const;
export const CATEGORIES = [
  { n: "Camisetas", img: tee, department: "Vestir" },
  { n: "Moletons", img: hoodie, department: "Vestir" },
  { n: "Calças", img: cargo, department: "Vestir" },
  { n: "Bonés", img: cap, department: "Vestir" },
  { n: "Calçados", img: sneaker, department: "Vestir" },
  { n: "Mobiliário", img: chair, department: "Morar" },
  { n: "Objetos", img: vase, department: "Morar" },
  { n: "Iluminação", img: table, department: "Morar" },
] as const;
export const SHOP_CATEGORIES = CATEGORIES.filter(category =>
  PRODUCTS.some(product => product.cat === category.department && product.category === category.n),
);
export const SET_PRODUCTS = PRODUCTS.filter(p => p.category === "Camisetas" || p.category === "Objetos");
export const SET_TOTAL = SET_PRODUCTS.reduce((total, p) => total + p.price, 0);

export function productSizes(product: Product): readonly string[] {
  if (product.cat === "Morar" || product.category === "Bonés") return [];
  return product.category === "Calçados" ? ["38", "39", "40", "41", "42"] : ["P", "M", "G", "GG"];
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
}

export function searchProducts(query: string) {
  const terms = normalizeSearch(query).trim().split(/\s+/);
  return PRODUCTS.filter(product => {
    const fields = normalizeSearch(`${product.name} ${product.category} ${product.cat}`);
    return terms.every(term => fields.includes(term));
  });
}

export const MENU_FILTERS = [
  { label: "Camisetas", category: "Camisetas", department: "Vestir" },
  { label: "Moletons", category: "Moletons", department: "Vestir" },
  { label: "Calças", category: "Calças", department: "Vestir" },
  { label: "Bonés", category: "Bonés", department: "Vestir" },
  { label: "Tênis", category: "Calçados", department: "Vestir" },
  { label: "Poltronas", category: "Poltronas", department: "Morar" },
  { label: "Vasos", category: "Vasos", department: "Morar" },
] as const;

export function matchesCategory(product: Product, category: string) {
  if (category === "Poltronas") return product.slug.startsWith("poltrona-");
  if (category === "Vasos") return product.slug.startsWith("vaso-");
  return product.category === category;
}
