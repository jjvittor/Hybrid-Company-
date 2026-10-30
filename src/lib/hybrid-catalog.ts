import tee from "@/assets/cutouts/tee.png";
import hoodie from "@/assets/cutouts/hoodie.png";
import cargo from "@/assets/cutouts/cargo.png";
import sneaker from "@/assets/cutouts/sneaker.png";
import chair from "@/assets/cutouts/chair.png";
import vase from "@/assets/cutouts/vase.png";
import cap from "@/assets/cutouts/cap.png";
import table from "@/assets/cutouts/table.png";

export const MENU = ["Novidades", "Vestir", "Morar", "Coleções", "Sobre"] as const;
export type Department = "Vestir" | "Morar";
export type Product = { name: string; price: number; img: string; cat: Department; category: string; tag?: "Novo" };
export const PRODUCTS: Product[] = [
  { name: "Camiseta Heavy Box Off-White", price: 189, img: tee, cat: "Vestir", category: "Camisetas", tag: "Novo" },
  { name: "Poltrona Tubular Verde", price: 2490, img: chair, cat: "Morar", category: "Mobiliário", tag: "Novo" },
  { name: "Moletom Concreto Verde", price: 429, img: hoodie, cat: "Vestir", category: "Moletons" },
  { name: "Vaso Forma Areia", price: 249, img: vase, cat: "Morar", category: "Objetos", tag: "Novo" },
  { name: "Calça Cargo Wide", price: 399, img: cargo, cat: "Vestir", category: "Calças" },
  { name: "Mesa Lateral Concreto", price: 890, img: table, cat: "Morar", category: "Mobiliário" },
  { name: "Boné Six Panel Verde", price: 159, img: cap, cat: "Vestir", category: "Bonés" },
  { name: "Tênis Hybrid Runner", price: 699, img: sneaker, cat: "Vestir", category: "Calçados" },
];
export const CATEGORIES = [
  { n: "Camisetas", img: tee, department: "Vestir" },
  { n: "Moletons", img: hoodie, department: "Vestir" },
  { n: "Calças", img: cargo, department: "Vestir" },
  { n: "Bonés", img: cap, department: "Vestir" },
  { n: "Calçados", img: sneaker, department: "Vestir" },
  { n: "Mobiliário", img: chair, department: "Morar" },
  { n: "Objetos", img: vase, department: "Morar" },
] as const;
export const SET_PRODUCTS = PRODUCTS.filter(p => p.category === "Camisetas" || p.category === "Objetos");
export const SET_TOTAL = SET_PRODUCTS.reduce((total, p) => total + p.price, 0);