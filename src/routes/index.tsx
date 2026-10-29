import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MENU, PRODUCTS, CATEGORIES, SET_PRODUCTS, SET_TOTAL, type Product, type Department } from "@/lib/hybrid-catalog";
import scene from "@/assets/hybrid-scene.jpg";
import setImage from "@/assets/hybrid-set.jpg";
import {
  Search, User, Heart, ShoppingBag, Menu, X, ArrowRight,
  Truck, RefreshCw, ShieldCheck, MessageCircle, Instagram,
} from "lucide-react";
import hero from "@/assets/hybrid-scene.jpg";
import banner from "@/assets/hybrid-set.jpg";
import p1 from "@/assets/tee.jpg";
import p2 from "@/assets/chair.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hybrid Co. — Vestir e Morar | Loja oficial" },
      { name: "description", content: "Roupas, mobiliário e objetos no mesmo universo estético. Conheça Concreto Dourado, a coleção para vestir e morar da Hybrid Co." },
      { property: "og:title", content: "Hybrid Co. — Vestir e Morar" },
      { property: "og:description", content: "Streetwear, mobiliário e objetos. Um mesmo olhar para o corpo e o espaço." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Index() {
  const [department, setDepartment] = useState<Department | "Todos">("Todos");
  const [cartOpen, setCartOpen] = useState(false);
  const [setAdded, setSetAdded] = useState(false);
  const [size, setSize] = useState("M");
  const [choosing, setChoosing] = useState(false);
  const go = (item: string) => {
    if (item === "Vestir" || item === "Morar" || item === "Novidades") {
      setDepartment(item === "Novidades" ? "Todos" : item);
      document.getElementById("novidades")?.scrollIntoView({ behavior: "smooth" });
    } else document.getElementById(item === "Coleções" ? "colecoes" : "sobre")?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Announcement />
      <Header onNavigate={go} onCart={() => { setChoosing(false); setCartOpen(true); }} count={setAdded ? 2 : 0} />
      <Hero onNavigate={go} />
      <Categories />
      <ProductSection title={department === "Todos" ? "Lançamentos" : department} products={PRODUCTS.filter(p => department === "Todos" || p.cat === department)} department={department} onDepartment={setDepartment} />
      <CompleteSet onBuy={() => { setChoosing(true); setCartOpen(true); }} />
      <BestSellers />
      <Lookbook />
      <Community />
      <Benefits />
      <Newsletter />
      <Footer />
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="rounded-[2px]">
          <DialogHeader>
            <DialogTitle>{choosing ? "Seu conjunto Concreto Dourado" : "Sua sacola"}</DialogTitle>
            <DialogDescription>{choosing || setAdded ? "Camiseta Heavy Box + Vaso Forma Areia" : "Sua sacola está vazia."}</DialogDescription>
          </DialogHeader>
          {(choosing || setAdded) && <>
            <div className="grid grid-cols-2 gap-4">{SET_PRODUCTS.map(p => <div key={p.name}><img src={p.img} alt={p.name} width={768} height={960} className="aspect-[4/5] w-full object-cover" /><p className="mt-2 text-sm">{p.name}</p><p className="mt-1 text-sm text-muted-foreground">{brl(p.price)}</p></div>)}</div>
            <label className="flex items-center justify-between text-sm">Tamanho da camiseta<select aria-label="Tamanho da camiseta" value={size} onChange={e => setSize(e.target.value)} className="rounded-[2px] border border-input bg-background px-4 py-2">{["P", "M", "G", "GG"].map(x => <option key={x}>{x}</option>)}</select></label>
            <p className="flex justify-between border-t border-border pt-4 text-sm font-semibold"><span>Total do conjunto</span><span>{brl(SET_TOTAL)}</span></p>
            {choosing ? <Button onClick={() => { setSetAdded(true); setChoosing(false); }}>Adicionar conjunto à sacola <ShoppingBag /></Button> : <p role="status" className="text-sm">Conjunto na sacola · Camiseta {size}</p>}
            <p className="text-xs text-muted-foreground">Prévia de compra. Pedidos e pagamentos ainda não estão disponíveis.</p>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Announcement() {
  const msgs = ["Frete grátis acima de R$ 399", "Parcele em até 6x sem juros", "Pix com 5% de desconto"];
  return (
    <div className="h-6 overflow-hidden border-b border-border bg-background text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.2em]">
      <div className="animate-ticker">
        {msgs.map((m) => <p key={m} className="flex h-6 items-center justify-center">{m}</p>)}
      </div>
    </div>
  );
}

function Header({ onNavigate, onCart, count }: { onNavigate: (item: string) => void; onCart: () => void; count: number }) {
  const [open, setOpen] = useState(false);
  return <>
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 md:h-20 md:px-8">
        <Button variant="ghost" size="icon" aria-label="Abrir menu" className="lg:hidden" onClick={() => setOpen(true)}><Menu /></Button>
        <a href="/" className="font-display-tight text-2xl md:text-3xl">Hybrid Co.</a>
        <nav aria-label="Menu principal" className="hidden gap-7 lg:flex">{MENU.map(m => <Button variant="ghost" key={m} onClick={() => onNavigate(m)} className="px-0 text-sm hover:bg-transparent hover:text-highlight">{m}</Button>)}</nav>
        <div className="flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="Buscar" className="hidden sm:inline-flex"><Search /></Button><Button variant="ghost" size="icon" aria-label="Conta" className="hidden sm:inline-flex"><User /></Button><Button variant="ghost" size="icon" aria-label="Carrinho" className="relative" onClick={onCart}><ShoppingBag />{count > 0 && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-highlight text-[10px] text-highlight-foreground">{count}</span>}</Button></div>
      </div>
    </header>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="rounded-[2px]"><DialogHeader><DialogTitle className="font-display-tight text-3xl">Hybrid Co.</DialogTitle><DialogDescription>Vestir e Morar</DialogDescription></DialogHeader><nav className="flex flex-col items-start gap-3">{MENU.map(m => <Button key={m} variant="ghost" className="text-xl" onClick={() => { setOpen(false); onNavigate(m); }}>{m}</Button>)}</nav></DialogContent></Dialog>
  </>;
}

function Btn({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return <Button asChild variant={light ? "outline" : "default"} className="h-12 px-6"><a href="#colecoes">{children}<ArrowRight /></a></Button>;
}

function Hero({ onNavigate }: { onNavigate: (item: string) => void }) {
  return (
    <section aria-label="Coleção Concreto Dourado" className="hybrid-hero relative overflow-hidden bg-background">
      <div className="hero-heading relative z-10 px-4 py-8 text-center md:absolute md:inset-x-0 md:top-10 md:p-0">
        <p className="text-xs text-muted-foreground md:text-foreground">Coleção 26 · Vestir e Morar</p>
        <h1 className="font-display-tight mt-4 text-5xl md:text-7xl">Concreto<br className="md:hidden" /> Dourado</h1>
        <p className="mt-4 text-sm text-muted-foreground md:text-foreground">Um mesmo olhar. Do corpo ao espaço.</p>
      </div>
      <img src={scene} alt="Coleção Concreto Dourado: streetwear à esquerda, poltrona e vaso à direita, na mesma cena" width={1920} height={1024} fetchPriority="high" className="hero-scene w-full object-cover md:absolute md:inset-0 md:h-full" />
      <div className="relative z-10 mx-auto grid w-full max-w-[1440px] grid-cols-2 border-t border-border md:absolute md:inset-x-0 md:bottom-0 md:border-t-0">
        {[{ n: "Vestir", d: "Heavy cotton. Silhueta ampla." }, { n: "Morar", d: "Formas puras. Novas matérias." }].map((x, i) => <div key={x.n} className={`flex flex-col items-start gap-2 bg-background/85 px-4 py-5 md:flex-row md:items-center md:justify-between md:px-8 md:py-6 ${i === 0 ? "border-r border-border" : ""}`}><div><p className="font-display-tight text-2xl">{x.n}</p><p className="mt-2 hidden text-xs text-muted-foreground sm:block">{x.d}</p></div><Button variant="ghost" onClick={() => onNavigate(x.n)} className="h-9 px-0 text-xs hover:bg-transparent hover:text-highlight">Explorar {x.n.toLowerCase()}<ArrowRight /></Button></div>)}
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
  const [active, setActive] = useState(0);
  const current = CATEGORIES[active];
  if (!current) return null;
  return <section className="border-y border-border">
    <div className="mx-auto flex max-w-[1440px] items-center justify-between border-b border-border px-4 py-5 md:px-8"><p className="text-xs text-muted-foreground">Categorias</p><p className="text-xs text-muted-foreground">Vestir / Morar</p></div>
    <div className="mx-auto grid max-w-[1440px] md:grid-cols-2">
      <div className="px-4 py-10 md:px-12 md:py-16"><h2 className="font-display-tight mb-8 text-4xl md:text-5xl">Seu universo</h2><ul>{CATEGORIES.map((c, k) => <li key={c.n} className="border-t border-border last:border-b"><Button variant="ghost" onMouseEnter={() => setActive(k)} onFocus={() => setActive(k)} onClick={() => setActive(k)} aria-pressed={active === k} className={`h-14 w-full justify-between rounded-none px-0 text-left hover:bg-transparent md:h-16 ${active === k ? "text-highlight" : "text-foreground"}`}><span className="text-xl font-normal md:text-2xl">{c.n}</span><span className="flex items-center gap-4"><span className="text-xs font-normal text-muted-foreground">{c.department}</span><ArrowRight className={active === k ? "opacity-100" : "opacity-0"} /></span></Button></li>)}</ul></div>
      <div className="relative aspect-[4/5] overflow-hidden bg-card md:aspect-auto"><img src={current.img} alt={current.n} width={768} height={960} loading="lazy" className="h-full w-full object-cover" /><p className="absolute bottom-4 left-4 rounded-[2px] bg-background/85 px-3 py-2 text-xs text-foreground md:bottom-6 md:left-6">{current.department} / {current.n}</p></div>
    </div>
  </section>;
}

function ProductCard({ p }: { p: Product }) {
  const [favorite, setFavorite] = useState(false);
  return <article className="group">
    <div className="relative aspect-[4/5] overflow-hidden bg-card"><img src={p.img} alt={p.name} width={768} height={960} loading="lazy" className="h-full w-full object-cover transition-opacity duration-200 group-hover:opacity-90" />{p.tag && <span className="absolute left-3 top-3 rounded-[2px] bg-background/85 px-2 py-1 text-[11px]">{p.tag}</span>}<Button variant="ghost" size="icon" aria-label={`Favoritar ${p.name}`} aria-pressed={favorite} onClick={() => setFavorite(!favorite)} className="absolute right-2 top-2 bg-background/75"><Heart className={favorite ? "fill-highlight text-highlight" : ""} /></Button></div>
    <div className="mt-4 space-y-1.5"><p className="text-xs text-muted-foreground">{p.cat} / {p.category}</p><h3 className="text-sm font-medium">{p.name}</h3><p className="text-sm font-semibold text-highlight">{brl(p.price)}</p><p className="text-xs text-muted-foreground">ou 6x de {brl(p.price / 6)} sem juros</p></div>
  </article>;
}

function ProductSection({ title, products, department, onDepartment }: { title: string; products: Product[]; department: Department | "Todos"; onDepartment: (d: Department | "Todos") => void }) {
  return <section id="novidades" className="mx-auto max-w-[1440px] scroll-mt-24 px-4 py-16 md:px-8 md:py-24"><div className="mb-8 flex flex-wrap items-end justify-between gap-6"><h2 className="font-display-tight text-5xl md:text-6xl">{title}</h2><div className="flex gap-5">{(["Todos", "Vestir", "Morar"] as const).map(d => <Button key={d} variant="ghost" onClick={() => onDepartment(d)} aria-pressed={department === d} className={`rounded-none border-b px-0 hover:bg-transparent ${department === d ? "border-highlight text-highlight" : "border-transparent text-muted-foreground"}`}>{d}</Button>)}</div></div><div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-4 md:gap-x-4 md:gap-y-10">{products.map(p => <ProductCard key={p.name} p={p} />)}</div></section>;
}

function CompleteSet({ onBuy }: { onBuy: () => void }) {
  return <section id="colecoes" className="scroll-mt-24 border-y border-border bg-secondary"><div className="mx-auto max-w-[1440px] px-4 py-14 md:px-8 md:py-20"><div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><h2 className="max-w-xl text-3xl font-medium leading-tight md:text-4xl">Complete o look,<br />complete o espaço</h2><p className="text-sm text-muted-foreground">Concreto Dourado · Seleção híbrida 01</p></div><img src={setImage} alt="Camiseta off-white e vaso de cerâmica em uma composição de concreto e verde-escuro" width={1536} height={1024} loading="lazy" className="aspect-[3/2] w-full object-cover md:aspect-[2/1]" /><div className="mt-8 grid gap-8 md:grid-cols-2 md:items-end"><div><p className="font-display-tight text-3xl">Matéria em comum</p><p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">Algodão encorpado e cerâmica natural. Duas peças, a mesma presença.</p><p className="mt-4 text-sm">Camiseta Heavy Box + Vaso Forma Areia</p></div><div className="flex flex-wrap items-center gap-6 md:justify-end"><div><p className="text-xs text-muted-foreground">Conjunto de 2 peças</p><p className="mt-1 text-xl font-semibold text-highlight">{brl(SET_TOTAL)}</p></div><Button className="h-12 px-6" onClick={onBuy}>Comprar o conjunto<ShoppingBag /></Button></div></div></div></section>;
}

function BestSellers() {
  const tabs = ["Todos", "Vestir", "Morar"] as const;
  const [t, setT] = useState<(typeof tabs)[number]>("Todos");
  const list = [...PRODUCTS].reverse().filter((p) => t === "Todos" || p.cat === t);
  return (
    <section className="mx-auto max-w-[1440px] px-4 py-14 md:px-8 md:py-24">
      <SectionHead title="Mais vendidos" />
      <div className="mb-6 flex gap-5 overflow-x-auto border-b border-border">
        {tabs.map((x) => (
          <Button variant="ghost" key={x} onClick={() => setT(x)} className={`-mb-px shrink-0 border-b-2 pb-3 text-xs font-bold uppercase tracking-widest transition-colors ${t === x ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{x}</Button>
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
    <section id="sobre" className="mx-auto max-w-[1440px] scroll-mt-24 px-4 pb-14 md:px-8 md:pb-24">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:grid-rows-2 md:gap-3">
        <img src={hero} alt="Lookbook 1" loading="lazy" className="col-span-2 row-span-2 aspect-[4/5] h-full w-full object-cover md:aspect-auto" />
        <img src={banner} alt="Lookbook 2" loading="lazy" className="col-span-2 aspect-[16/9] h-full w-full object-cover" />
        <img src={p1} alt="Lookbook 3" loading="lazy" className="aspect-square h-full w-full object-cover" />
        <img src={p2} alt="Lookbook 4" loading="lazy" className="aspect-square h-full w-full object-cover" />
      </div>
      <div className="mt-10 grid gap-6 md:mt-16 md:grid-cols-2 md:gap-16">
        <h2 className="font-display-tight text-5xl md:text-7xl">Vestir.<br />Morar.<br /><span className="text-highlight">Hybrid Co.</span></h2>
        <div className="flex flex-col justify-end gap-6">
          <p className="text-base leading-relaxed text-muted-foreground md:text-lg">Entre o corpo e o espaço, existe um mesmo jeito de viver. Roupas de silhueta ampla, mobiliário de formas essenciais e objetos com presença. Matérias diferentes, um universo em comum.</p>
          
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
              <div className="absolute inset-0 grid place-items-center bg-background/60 opacity-0 transition-opacity group-hover:opacity-100"><Instagram className="size-6 text-foreground" /></div>
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
        <h2 className="text-3xl font-medium leading-tight md:text-4xl">Receba lançamentos e drops em primeira mão</h2>
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
    { t: "Vestir e Morar", l: ["Camisetas", "Moletons", "Calças", "Bonés", "Calçados", "Mobiliário", "Objetos"] },
    { t: "Redes sociais", l: ["Instagram", "TikTok", "YouTube", "Spotify"] },
  ];
  return (
    <footer className="border-t border-border bg-secondary text-secondary-foreground">
      <div className="mx-auto max-w-[1440px] px-4 pt-14 md:px-8 md:pt-20">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          {cols.map((c) => (
            <div key={c.t}>
              <p className="mb-4 text-xs font-bold uppercase tracking-widest">{c.t}</p>
              <ul className="space-y-2 text-sm text-muted-foreground">{c.l.map((x) => <li key={x}><a href="#" className="transition-colors hover:text-highlight">{x}</a></li>)}</ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col gap-6 border-t border-border pt-8 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {["Pix", "Visa", "Mastercard", "Elo", "Amex", "Boleto"].map((x) => <span key={x} className="rounded-sm border border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{x}</span>)}
          </div>
          <div className="flex gap-2">
            {["SSL Seguro", "Site Blindado"].map((x) => <span key={x} className="flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><ShieldCheck className="size-3.5" />{x}</span>)}
          </div>
        </div>
        <p className="font-display-tight mt-14 select-none text-7xl leading-none md:text-9xl">Hybrid Co.</p>
        <div className="flex flex-col gap-1 border-t border-border py-6 text-[11px] text-muted-foreground md:flex-row md:justify-between">
          <p>Hybrid Co. Comércio de Vestuário Ltda. — CNPJ 00.000.000/0001-00</p>
          <p>Rua Augusta, 0000 — Consolação, São Paulo/SP</p>
          <p>© 2026 Hybrid Co. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}

