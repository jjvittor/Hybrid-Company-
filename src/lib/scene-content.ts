import { PRODUCTS } from './hybrid-catalog';

type ScenePoint = { slug: string; x: number; y: number };
type Scene = { code: string; image?: string; points: ScenePoint[] };

// The existing scene cards are intentionally blank. Product positions belong to
// each scene so photography can be assigned later without changing interactions.
export const SCENES: Scene[] = [
  { code: 'YBRD / ED_001', points: [
    { slug: 'camiseta-heavy-box-off-white', x: 28, y: 32 },
    { slug: 'poltrona-tubular-verde', x: 65, y: 58 },
    { slug: 'vaso-forma-areia', x: 43, y: 76 },
  ] },
  { code: 'YBRD / ED_002', points: [
    { slug: 'moletom-concreto-verde', x: 35, y: 29 },
    { slug: 'mesa-lateral-concreto', x: 70, y: 55 },
    { slug: 'vaso-forma-areia', x: 32, y: 75 },
  ] },
  { code: 'YBRD / ED_003', points: [
    { slug: 'calca-cargo-wide', x: 30, y: 42 },
    { slug: 'tenis-hybrid-runner', x: 64, y: 77 },
    { slug: 'poltrona-tubular-verde', x: 67, y: 34 },
  ] },
  { code: 'YBRD / ED_004', points: [
    { slug: 'bone-six-panel-verde', x: 37, y: 25 },
    { slug: 'camiseta-heavy-box-off-white', x: 68, y: 48 },
    { slug: 'mesa-lateral-concreto', x: 32, y: 73 },
  ] },
  { code: 'YBRD / ED_005', points: [
    { slug: 'camiseta-heavy-box-off-white', x: 30, y: 35 },
    { slug: 'calca-cargo-wide', x: 66, y: 60 },
    { slug: 'tenis-hybrid-runner', x: 40, y: 78 },
  ] },
  { code: 'YBRD / ED_006', points: [
    { slug: 'poltrona-tubular-verde', x: 68, y: 38 },
    { slug: 'vaso-forma-areia', x: 30, y: 56 },
    { slug: 'mesa-lateral-concreto', x: 65, y: 77 },
  ] },
  { code: 'YBRD / ED_007', points: [
    { slug: 'moletom-concreto-verde', x: 32, y: 32 },
    { slug: 'bone-six-panel-verde', x: 69, y: 49 },
    { slug: 'calca-cargo-wide', x: 42, y: 74 },
  ] },
  { code: 'YBRD / ED_008', points: [
    { slug: 'tenis-hybrid-runner', x: 66, y: 77 },
    { slug: 'poltrona-tubular-verde', x: 33, y: 42 },
    { slug: 'vaso-forma-areia', x: 68, y: 30 },
  ] },
];

export function sceneProducts(index: number) {
  return SCENES[index]?.points.flatMap(point => {
    const product = PRODUCTS.find(item => item.slug === point.slug);
    return product ? [{ ...point, product }] : [];
  }) ?? [];
}
