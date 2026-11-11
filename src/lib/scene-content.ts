import { PRODUCTS } from "./hybrid-catalog";

type ScenePoint = { slug: string; x: number; y: number };
type Scene = { code: string; image?: string; points: ScenePoint[] };

export const SCENES: Scene[] = [
  {
    code: "YBRD / ED_001",
    image: "/cenas/01.webp",
    points: [
      { slug: "camiseta-heavy-box-off-white", x: 25, y: 31 },
      { slug: "poltrona-tubular-verde", x: 72, y: 59 },
      { slug: "vaso-forma-areia", x: 55, y: 81 },
    ],
  },
  {
    code: "YBRD / ED_002",
    image: "/cenas/02.webp",
    points: [
      { slug: "moletom-concreto-verde", x: 29, y: 33 },
      { slug: "mesa-lateral-concreto", x: 75, y: 70 },
      { slug: "vaso-forma-areia", x: 77, y: 47 },
    ],
  },
  {
    code: "YBRD / ED_003",
    image: "/cenas/03.webp",
    points: [
      { slug: "calca-cargo-wide", x: 36, y: 64 },
      { slug: "tenis-hybrid-runner", x: 49, y: 86 },
      { slug: "poltrona-tubular-verde", x: 72, y: 45 },
    ],
  },
  {
    code: "YBRD / ED_004",
    image: "/cenas/04.webp",
    points: [
      { slug: "bone-six-panel-verde", x: 28, y: 30 },
      { slug: "camiseta-heavy-box-off-white", x: 64, y: 59 },
      { slug: "mesa-lateral-concreto", x: 44, y: 86 },
    ],
  },
  {
    code: "YBRD / ED_005",
    image: "/cenas/05.webp",
    points: [
      { slug: "camiseta-heavy-box-off-white", x: 47, y: 28 },
      { slug: "calca-cargo-wide", x: 48, y: 60 },
      { slug: "tenis-hybrid-runner", x: 46, y: 89 },
    ],
  },
  {
    code: "YBRD / ED_006",
    image: "/cenas/06.webp",
    points: [
      { slug: "poltrona-tubular-verde", x: 65, y: 32 },
      { slug: "vaso-forma-areia", x: 18, y: 51 },
      { slug: "mesa-lateral-concreto", x: 61, y: 72 },
    ],
  },
  {
    code: "YBRD / ED_007",
    image: "/cenas/07.webp",
    points: [
      { slug: "moletom-concreto-verde", x: 29, y: 37 },
      { slug: "bone-six-panel-verde", x: 41, y: 69 },
      { slug: "calca-cargo-wide", x: 77, y: 42 },
    ],
  },
  {
    code: "YBRD / ED_008",
    image: "/cenas/08.webp",
    points: [
      { slug: "tenis-hybrid-runner", x: 52, y: 78 },
      { slug: "poltrona-tubular-verde", x: 23, y: 47 },
      { slug: "vaso-forma-areia", x: 85, y: 55 },
    ],
  },
];

export function sceneProducts(index: number) {
  return (
    SCENES[index]?.points.flatMap((point) => {
      const product = PRODUCTS.find((item) => item.slug === point.slug);
      return product ? [{ ...point, product }] : [];
    }) ?? []
  );
}
