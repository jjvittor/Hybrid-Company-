import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Search, User, Heart, ShoppingBag, Menu, X, ArrowRight, ChevronLeft, ChevronRight,
  Truck, RefreshCw, ShieldCheck, MessageCircle, Instagram,
} from "lucide-react";
import hero from "@/assets/hero.jpg";
import banner from "@/assets/banner.jpg";
import p1 from "@/assets/p1.jpg";
import p2 from "@/assets/p2.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hybrid Co. — Streetwear brasileiro | Loja oficial" },
      { name: "description", content: "Camisetas, moletons, calças, tênis e acessórios Hybrid Co. Frete grátis acima de R$ 399, 6x sem juros e 5% off no Pix." },
      { property: "og:title", content: "Hybrid Co. — Streetwear brasileiro" },
      { property: "og:description", content: "Drops, lançamentos e coleções da Hybrid Co. Feito na rua, pensado no Brasil." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const MENU = ["Novidades", "Roupas", "Calçados", "Acessórios", "Coleções", "Sobre"];
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Product = { name: string; price: number; img: string; alt: string; tag?: "Novo" | "Últimas unidades"; cat: "Roupas" | "Calçados" | "Acessórios" };
const PRODUCTS: Product[] = [
  { name: "Camiseta Heavy Box Off-White", price: 189, img: p1, alt: hero, tag: "Novo", cat: "Roupas" },
  { name: "Tênis Hybrid Runner Preto", price: 699, img: p2, alt: banner, tag: "Últimas unidades", cat: "Calçados" },
  { name: "Moletom Concreto Preto", price: 429, img: hero, alt: p1, tag: "Novo", cat: "Roupas" },
  { name: "Boné Six Panel Preto", price: 159, img: p2, alt: hero, cat: "Acessórios" },
  { name: "Jaqueta Utility Verde", price: 589, img: banner, alt: p1, tag: "Novo", cat: "Roupas" },
  { name: "Calça Cargo Wide", price: 399, img: hero, alt: p2, cat: "Roupas" },
  { name: "Camiseta Básica Cru", price: 149, img: p1, alt: banner, cat: "Roupas" },
  { name: "Kit Boné + Meia", price: 199, img: p2, alt: p1, tag: "Últimas unidades", cat: "Acessórios" },
];

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Announcement />
      <Header />
      <Hero />
      <Categories />
      <ProductSection title="Lançamentos" products={PRODUCTS.slice(0, 8)} />
      <CollabBanner />
      <BestSellers />
      <Lookbook />
      <Community />
      <Benefits />
      <Newsletter />
      <Footer />
    </div>
  );
}

function Announcement() {
  const msgs = ["Frete grátis acima de R$ 399", "Parcele em até 6x sem juros", "Pix com 5% de desconto"];
  return (
    <div className="h-6 overflow-hidden bg-primary text-primary-foreground text-[11px] font-semibold uppercase tracking-[0.2em]">
      <div className="animate-ticker">
        {msgs.map((m) => <p key={m} className="flex h-6 items-center justify-center">{m}</p>)}
      </div>
    </div>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", f);
    return () => window.removeEventListener("scroll", f);
  }, []);
  return (
    <>
      <header className={`sticky top-0 z-40 bg-background/95 backdrop-blur transition-shadow ${scrolled ? "border-b border-border" : ""}`}>
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 md:h-16 md:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <button aria-label="Abrir menu" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
            <button aria-label="Buscar"><Search className="size-5" /></button>
          </div>
          <a href="/" className="font-display-tight text-2xl md:text-3xl lg:order-first">Hybrid Co.</a>
          <nav className="hidden gap-7 text-xs font-semibold uppercase tracking-widest lg:flex">
            {MENU.map((m) => <a key={m} href="#" className="hover:text-highlight transition-colors">{m}</a>)}
          </nav>
          <div className="flex items-center gap-4">
            <button aria-label="Buscar" className="hidden lg:block"><Search className="size-5" /></button>
            <button aria-label="Conta" className="hidden sm:block"><User className="size-5" /></button>
            <button aria-label="Favoritos" className="hidden sm:block"><Heart className="size-5" /></button>
            <button aria-label="Carrinho" className="relative">
              <ShoppingBag className="size-5" />
              <span className="absolute -right-2 -top-2 grid size-4 place-items-center rounded-full bg-highlight text-[10px] font-bold text-highlight-foreground">2</span>
            </button>
          </div>
        </div>
      </header>
      <div className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`}>
        <div onClick={() => setOpen(false)} className={`absolute inset-0 bg-primary/50 transition-opacity ${open ? "opacity-100" : "opacity-0"}`} />
        <aside className={`absolute left-0 top-0 h-full w-[82%] max-w-sm bg-background p-6 transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex items-center justify-between">
            <span className="font-display-tight text-2xl">Hybrid Co.</span>
            <button aria-label="Fechar menu" onClick={() => setOpen(false)}><X className="size-5" /></button>
          </div>
          <nav className="mt-10 flex flex-col gap-5">
            {MENU.map((m) => <a key={m} href="#" className="font-display-tight text-4xl">{m}</a>)}
          </nav>
          <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-sm">
            <a href="#" className="flex items-center gap-2"><User className="size-4" /> Minha conta</a>
            <a href="#" className="flex items-center gap-2"><Heart className="size-4" /> Favoritos</a>
          </div>
        </aside>
      </div>
    </>
  );
}

function Btn({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <a href="#" className={`group inline-flex items-center gap-3 px-7 py-4 text-xs font-bold uppercase tracking-[0.2em] transition-colors ${light ? "bg-background text-foreground hover:bg-highlight hover:text-highlight-foreground" : "bg-primary text-primary-foreground hover:bg-highlight hover:text-highlight-foreground"}`}>
      {children}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
    </a>
  );
}

function Hero() {
  const slides = [
    { img: hero, kicker: "Coleção Verão 26", title: "Concreto\nDourado", sub: "Peças pesadas para dias quentes na cidade." },
    { img: banner, kicker: "Drop 04", title: "Sob o\nViaduto", sub: "Utilitário, técnico, feito pra rua." },
  ];
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % slides.length), 6000); return () => clearInterval(t); }, []);
  return (
    <section className="relative h-[calc(100svh-5rem)] min-h-[520px] overflow-hidden bg-primary">
      {slides.map((s, k) => (
        <div key={k} className={`absolute inset-0 transition-opacity duration-1000 ${k === i ? "opacity-100" : "opacity-0"}`}>
          <img src={s.img} alt={s.kicker} width={1600} height={1920} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[1440px] px-4 pb-12 text-primary-foreground md:px-8 md:pb-16">
            <p className="text-xs font-semibold uppercase tracking-[0.3em]">{s.kicker}</p>
            <h1 className="font-display-tight mt-3 whitespace-pre-line text-[22vw] md:text-[11vw] lg:text-[9rem]">{s.title}</h1>
            <p className="mt-4 max-w-sm text-sm opacity-90 md:text-base">{s.sub}</p>
            <div className="mt-6"><Btn light>Ver coleção</Btn></div>
          </div>
        </div>
      ))}
      <div className="absolute bottom-6 right-4 z-10 flex gap-2 md:right-8">
        {slides.map((_, k) => (
          <button key={k} aria-label={`Campanha ${k + 1}`} onClick={() => setI(k)} className={`h-1 transition-all ${k === i ? "w-10 bg-primary-foreground" : "w-5 bg-primary-foreground/40"}`} />
        ))}
      </div>
    </section>
  );
}

function SectionHead({ title, cta = "Ver tudo" }: { title: string; cta?: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 md:mb-10">
      <h2 className="font-display-tight text-5xl md:text-7xl">{title}</h2>
      <a href="#" className="shrink-0 border-b border-foreground pb-1 text-xs font-bold uppercase tracking-widest hover:text-highlight hover:border-highlight">{cta}</a>
    </div>
  );
}

function Categories() {
  const cats = [
    { n: "Camisetas", img: p1, pos: "center" }, { n: "Moletons", img: hero, pos: "50% 35%" },
    { n: "Calças", img: hero, pos: "50% 80%" }, { n: "Bonés", img: p2, pos: "85% 60%" },
    { n: "Tênis", img: p2, pos: "20% 55%" }, { n: "Acessórios", img: banner, pos: "40% 20%" },
  ];
  return (
    <section className="mx-auto max-w-[1440px] px-4 py-14 md:px-8 md:py-24">
      <SectionHead title="Categorias" cta="Ver todas" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
        {cats.map((c) => (
          <a key={c.n} href="#" className="group relative aspect-[4/5] overflow-hidden bg-card">
            <img src={c.img} alt={c.n} loading="lazy" style={{ objectPosition: c.pos }} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/60 to-transparent" />
            <span className="font-display-tight absolute bottom-3 left-3 text-3xl text-primary-foreground md:bottom-5 md:left-5 md:text-5xl">{c.n}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function ProductCard({ p }: { p: Product }) {
  return (
    <a href="#" className="group block">
      <div className="relative aspect-[4/5] overflow-hidden bg-card">
        <img src={p.img} alt={p.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500 group-hover:opacity-0" />
        <img src={p.alt} alt="" loading="lazy" className="absolute inset-0 h-full w-full scale-105 object-cover opacity-0 transition-all duration-500 group-hover:scale-100 group-hover:opacity-100" />
        {p.tag && (
          <span className={`absolute left-2 top-2 px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${p.tag === "Novo" ? "bg-background text-foreground" : "bg-highlight text-highlight-foreground"}`}>{p.tag}</span>
        )}
        <button aria-label="Favoritar" onClick={(e) => e.preventDefault()} className="absolute right-2 top-2 grid size-8 place-items-center bg-background/80 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"><Heart className="size-4" /></button>
      </div>
      <div className="mt-3 space-y-1">
        <h3 className="text-sm font-medium leading-tight group-hover:underline underline-offset-4">{p.name}</h3>
        <p className="text-sm font-bold">{brl(p.price)}</p>
        <p className="text-xs text-muted-foreground">ou 6x de {brl(p.price / 6)} sem juros</p>
      </div>
    </a>
  );
}

function ProductSection({ title, products }: { title: string; products: Product[] }) {
  return (
    <section className="mx-auto max-w-[1440px] px-4 pb-14 md:px-8 md:pb-24">
      <SectionHead title={title} />
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:gap-x-4 md:gap-y-10 md:overflow-visible md:px-0">
        {products.map((p) => <div key={p.name} className="w-[68%] shrink-0 snap-start sm:w-[42%] md:w-auto"><ProductCard p={p} /></div>)}
      </div>
    </section>
  );
}

function CollabBanner() {
  return (
    <section className="grid bg-primary text-primary-foreground md:grid-cols-2">
      <img src={banner} alt="Hybrid Co. x Viaduto Skate Crew" loading="lazy" width={1600} height={1024} className="aspect-[4/3] h-full w-full object-cover md:aspect-auto" />
      <div className="flex flex-col justify-center px-6 py-14 md:px-16 md:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-highlight">Colaboração</p>
        <h2 className="font-display-tight mt-4 text-6xl md:text-8xl">Hybrid Co.<br />× Viaduto</h2>
        <p className="mt-6 max-w-md text-sm opacity-80 md:text-base">Uma cápsula feita com a crew que cresceu andando debaixo do concreto. Jaquetas utility, bonés e calças pensadas pra cair e levantar.</p>
        <div className="mt-8"><Btn light>Ver collab</Btn></div>
      </div>
    </section>
  );
}

function BestSellers() {
  const tabs = ["Todos", "Roupas", "Calçados", "Acessórios"] as const;
  const [t, setT] = useState<(typeof tabs)[number]>("Todos");
  const list = [...PRODUCTS].reverse().filter((p) => t === "Todos" || p.cat === t);
  return (
    <section className="mx-auto max-w-[1440px] px-4 py-14 md:px-8 md:py-24">
      <SectionHead title="Mais vendidos" />
      <div className="mb-6 flex gap-5 overflow-x-auto border-b border-border">
        {tabs.map((x) => (
          <button key={x} onClick={() => setT(x)} className={`-mb-px shrink-0 border-b-2 pb-3 text-xs font-bold uppercase tracking-widest transition-colors ${t === x ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{x}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-4 md:gap-x-4">
        {list.slice(0, 4).map((p) => <ProductCard key={p.name} p={p} />)}
      </div>
    </section>
  );
}

function Lookbook() {
  return (
    <section className="mx-auto max-w-[1440px] px-4 pb-14 md:px-8 md:pb-24">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:grid-rows-2 md:gap-3">
        <img src={hero} alt="Lookbook 1" loading="lazy" className="col-span-2 row-span-2 aspect-[4/5] h-full w-full object-cover md:aspect-auto" />
        <img src={banner} alt="Lookbook 2" loading="lazy" className="col-span-2 aspect-[16/9] h-full w-full object-cover" />
        <img src={p1} alt="Lookbook 3" loading="lazy" className="aspect-square h-full w-full object-cover" />
        <img src={p2} alt="Lookbook 4" loading="lazy" className="aspect-square h-full w-full object-cover" />
      </div>
      <div className="mt-10 grid gap-6 md:mt-16 md:grid-cols-2 md:gap-16">
        <h2 className="font-display-tight text-5xl md:text-7xl">Nem só rua.<br />Nem só estúdio.<br /><span className="text-highlight">Híbrido.</span></h2>
        <div className="flex flex-col justify-end gap-6">
          <p className="text-base leading-relaxed text-muted-foreground md:text-lg">A Hybrid Co. nasceu em São Paulo, entre o skate, o rap e as noites de laje. Fazemos roupa pesada, de modelagem ampla e acabamento honesto — pra quem vive a cidade de verdade.</p>
          <div><Btn>Conheça a marca</Btn></div>
        </div>
      </div>
    </section>
  );
}

function Community() {
  const imgs = [hero, p1, banner, p2, banner, hero];
  return (
    <section className="border-t border-border py-14 md:py-24">
      <div className="mx-auto max-w-[1440px] px-4 md:px-8">
        <SectionHead title="Comunidade" cta="@hybridco" />
        <p className="-mt-3 mb-6 text-sm text-muted-foreground md:-mt-6 md:mb-10">Marque <strong className="text-foreground">@hybridco</strong> para aparecer aqui.</p>
        <div className="grid grid-cols-3 gap-1 md:grid-cols-6">
          {imgs.map((s, k) => (
            <a key={k} href="https://instagram.com" target="_blank" rel="noreferrer" className="group relative aspect-square overflow-hidden">
              <img src={s} alt={`Post da comunidade ${k + 1}`} loading="lazy" style={{ objectPosition: `${20 + k * 12}% 40%` }} className="h-full w-full object-cover" />
              <div className="absolute inset-0 grid place-items-center bg-primary/50 opacity-0 transition-opacity group-hover:opacity-100"><Instagram className="size-6 text-primary-foreground" /></div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function Benefits() {
  const b = [
    { i: Truck, t: "Frete para todo o Brasil", d: "Grátis acima de R$ 399" },
    { i: RefreshCw, t: "Troca fácil", d: "Primeira troca grátis em 30 dias" },
    { i: ShieldCheck, t: "Pagamento seguro", d: "Pix, cartão e boleto" },
    { i: MessageCircle, t: "Atendimento via WhatsApp", d: "Seg. a sex., 9h às 18h" },
  ];
  return (
    <section className="border-y border-border">
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 md:grid-cols-4">
        {b.map(({ i: I, t, d }, k) => (
          <div key={t} className={`flex flex-col gap-3 p-6 md:p-10 ${k % 2 === 0 ? "border-r" : ""} ${k < 2 ? "border-b md:border-b-0" : ""} md:border-r border-border last:border-r-0`}>
            <I className="size-6" strokeWidth={1.5} />
            <p className="text-sm font-bold uppercase tracking-wide">{t}</p>
            <p className="text-xs text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Newsletter() {
  const [ok, setOk] = useState(false);
  return (
    <section className="mx-auto max-w-[1440px] px-4 py-16 md:px-8 md:py-28">
      <div className="grid gap-8 md:grid-cols-2 md:items-end">
        <h2 className="font-display-tight text-5xl md:text-7xl">Receba lançamentos e drops em primeira mão</h2>
        <form onSubmit={(e) => { e.preventDefault(); setOk(true); }} className="flex flex-col gap-3">
          {ok ? <p className="text-sm font-semibold">Pronto! Você está na lista. 🔥</p> : (
            <div className="flex border-b-2 border-foreground">
              <input type="email" required placeholder="Seu melhor e-mail" className="min-w-0 flex-1 bg-transparent py-4 text-base outline-none placeholder:text-muted-foreground" />
              <button className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest hover:text-highlight">Assinar <ArrowRight className="size-4" /></button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Sem spam. Só drop.</p>
        </form>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    { t: "Institucional", l: ["Sobre", "Contato", "Trabalhe conosco"] },
    { t: "Ajuda", l: ["Trocas e devoluções", "Frete", "Perguntas frequentes", "Guia de medidas"] },
    { t: "Categorias", l: ["Camisetas", "Moletons", "Calças", "Bonés", "Tênis", "Acessórios"] },
    { t: "Redes sociais", l: ["Instagram", "TikTok", "YouTube", "Spotify"] },
  ];
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="mx-auto max-w-[1440px] px-4 pt-14 md:px-8 md:pt-20">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          {cols.map((c) => (
            <div key={c.t}>
              <p className="mb-4 text-xs font-bold uppercase tracking-widest">{c.t}</p>
              <ul className="space-y-2 text-sm opacity-70">{c.l.map((x) => <li key={x}><a href="#" className="hover:opacity-100 hover:text-highlight">{x}</a></li>)}</ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col gap-6 border-t border-primary-foreground/15 pt-8 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {["Pix", "Visa", "Mastercard", "Elo", "Amex", "Boleto"].map((x) => <span key={x} className="border border-primary-foreground/25 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider">{x}</span>)}
          </div>
          <div className="flex gap-2">
            {["SSL Seguro", "Site Blindado"].map((x) => <span key={x} className="flex items-center gap-1.5 border border-primary-foreground/25 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider"><ShieldCheck className="size-3.5" />{x}</span>)}
          </div>
        </div>
        <p className="font-display-tight mt-14 select-none text-[24vw] leading-[0.8] md:text-[19vw]">Hybrid Co.</p>
        <div className="flex flex-col gap-1 border-t border-primary-foreground/15 py-6 text-[11px] opacity-60 md:flex-row md:justify-between">
          <p>Hybrid Co. Comércio de Vestuário Ltda. — CNPJ 00.000.000/0001-00</p>
          <p>Rua Augusta, 0000 — Consolação, São Paulo/SP</p>
          <p>© 2026 Hybrid Co. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}

export { ChevronLeft, ChevronRight };
