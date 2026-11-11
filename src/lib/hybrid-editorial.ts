import campaign from '@/assets/retro-campaign.jpg';
import home from '@/assets/retro-home.jpg';
import look from '@/assets/retro-look.jpg';
import studio from '@/assets/retro-studio.jpg';
import p1 from '@/assets/p1.jpg';
import p2 from '@/assets/p2.jpg';
import scene from '@/assets/hybrid-scene.jpg';
import set from '@/assets/hybrid-set.jpg';
export const CAMPAIGNS = [
  { image: campaign, slug: 'concreto-dourado', title: 'Concreto Dourado', label: 'Drop 01', code: 'YBRD / CD—001', department: 'Vestir', description: 'Streetwear em edição limitada. Formas amplas e tons de concreto.' },
  { image: home, slug: 'ybrd-home', title: 'Ybrd Home', label: 'Objetos e mobiliário', code: 'YBRD / HH—002', department: 'Morar', description: 'Mobiliário e objetos para levar o universo da Ybrd para casa.' },
] as const;
export type Campaign = (typeof CAMPAIGNS)[number];
export const LOOKS = [campaign, home, look, studio, p1, p2, scene, set];
export const SCENE = look;
export const EDITORIALS = [
  { title: 'Colaborações', subtitle: 'Ideias em comum. Novas formas.', action: 'Comprar', image: campaign },
  { title: 'Objetos', subtitle: 'Presença em cada detalhe.', action: 'Comprar', image: home },
  { title: 'Agenda', subtitle: 'Encontros fora da tela.', action: 'Ver', image: look },
  { title: 'Loja física', subtitle: 'Imagem conceitual.', action: 'Em breve', image: studio },
];
export const HOTSPOTS = [
  { productIndex: 0, className: 'hotspot-tee' },
  { productIndex: 4, className: 'hotspot-cargo' },
  { productIndex: 1, className: 'hotspot-chair' },
  { productIndex: 3, className: 'hotspot-vase' },
];
