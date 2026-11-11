import { CartContents } from "@/components/CartContents";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StoreMenus } from "@/components/StoreMenus";
import { YbrdLogo } from "@/components/YbrdLogo";
import {
  SHOP_CATEGORIES,
  PRODUCTS,
  searchProducts,
  matchesCategory,
  type Product,
  type Department,
} from "@/lib/hybrid-catalog";
import { CAMPAIGNS, EDITORIALS, type Campaign } from "@/lib/hybrid-editorial";
import { SceneRing } from "@/components/SceneRing";
import { LookArchive } from "@/components/LookArchive";
import { useStorefrontCart } from "@/components/StorefrontCart";
import { brl, PreviewPurchase, ProductPreview } from "@/components/ProductPreview";
import { useAccount } from "@/components/AccountProvider";
import { installmentAmount } from "@/lib/utils";
import {
  Search,
  User,
  ShoppingBag,
  Menu,
  X,
  Plus,
  ArrowUpRight,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  Minus,
  Check,
} from "lucide-react";

const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });

function WindowBar({ title }: { title: string }) {
  return (
    <div className="window-bar">
      <div className="window-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <span className="micro text-[10px]">{title}</span>
      <Plus className="size-3" />
    </div>
  );
}

export function Storefront({
  collection,
  collectionCategory,
  product,
  newOnly = false,
}: {
  newOnly?: boolean;
  collection?: Campaign;
  collectionCategory?: string | null;
  product?: Product;
} = {}) {
  const { user } = useAccount();
  const [notice, setNotice] = useState(true);
  const [mega, setMega] = useState<"shop" | "collections" | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [utility, setUtility] = useState<"search" | "cart" | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const { cart, commerce } = useStorefrontCart();
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const [info, setInfo] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [activeCampaign, setActiveCampaign] = useState(0);
  const campaignTrack = useRef<HTMLDivElement>(null);
  const [onlyNew, setOnlyNew] = useState(newOnly);
  const [department, setDepartment] = useState<Department | "Todos">("Todos");
  const [category, setCategory] = useState<string | null>(null);
  const [current, setCurrent] = useState(1);
  const [emailOk, setEmailOk] = useState(false);
  const [dropOk, setDropOk] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 768px)");
    const updateAnnouncement = () => {
      document.documentElement.style.setProperty("--announcement-scroll", `${window.scrollY}px`);
    };
    const updateMobile = () => setMobile(narrow.matches);
    updateAnnouncement();
    updateMobile();
    window.addEventListener("scroll", updateAnnouncement, { passive: true });
    narrow.addEventListener("change", updateMobile);
    return () => {
      window.removeEventListener("scroll", updateAnnouncement);
      narrow.removeEventListener("change", updateMobile);
      document.documentElement.style.removeProperty("--announcement-scroll");
    };
  }, []);
  const explore = (d: Department | "Todos", c: string | null = null) => {
    setOnlyNew(false);
    setDepartment(d);
    setCategory(c);
    setCurrent(1);
    setMega(null);
    setDrawer(false);
    requestAnimationFrame(() => {
      if (track.current) track.current.scrollLeft = 0;
      scrollTo("comprar");
    });
  };
  const openProduct = (item: Product) => setSelected(item);
  const openBagAfterAdd = () => {
    setSelected(null);
    setUtility("cart");
  };
  const isHome = !collection && !product;
  const activeDepartment = collection?.department ?? department;
  const activeCategory = collection ? collectionCategory : category;
  const visible = PRODUCTS.filter(
    (p) =>
      (activeDepartment === "Todos" || p.cat === activeDepartment) &&
      (!activeCategory || matchesCategory(p, activeCategory)) &&
      (!onlyNew || p.tag === "Novo"),
  );
  const showcaseTitle = onlyNew
    ? "Novidades"
    : collection
      ? `Comprar ${collection.title}`
      : (activeCategory ?? (activeDepartment === "Todos" ? "Comprar tudo" : activeDepartment));
  const goToCampaign = (index: number) => {
    const carousel = campaignTrack.current;
    const slide = carousel?.children[index];
    if (!carousel || !slide) return;
    const left =
      carousel.scrollLeft +
      slide.getBoundingClientRect().left -
      carousel.getBoundingClientRect().left;
    carousel.scrollTo({
      left,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  const searchResults = searchProducts(query);
  const moveTrack = (direction: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({
      left: direction * (el.clientWidth / (window.innerWidth < 768 ? 1.4 : 4) + 16),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  const footerColumns: { title: string; links: { l: string; go?: () => void }[] }[] = [
    {
      title: "Comprar",
      links: [
        { l: "Tudo", go: () => explore("Todos") },
        { l: "Vestir", go: () => explore("Vestir") },
        { l: "Morar", go: () => explore("Morar") },
      ],
    },
    { title: "Marca", links: [{ l: "Sobre" }, { l: "Agenda" }, { l: "Contato" }] },
    { title: "Ajuda", links: [{ l: "Trocas e devoluções" }, { l: "Envio" }, { l: "Pagamento" }] },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="site-header-stack sticky top-0 z-40" data-menu-open={mega !== null}>
        {notice && (
          <div className="announcement-bar relative flex h-8 items-center justify-center bg-footer px-10 text-background">
            <p className="micro truncate text-[9px] md:text-[10px]">Prévia Ybrd / Vestir + Morar</p>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 size-7 hover:bg-background/10 hover:text-background"
              aria-label="Fechar aviso"
              onClick={() => setNotice(false)}
            >
              <X className="size-3" />
            </Button>
          </div>
        )}
        <header className="nav-shell relative">
          <div className="header-row site-width flex h-[76px] items-center justify-between gap-4">
            <Link to="/" className="wordmark" aria-label="YBRD início">
              <YbrdLogo />
            </Link>
            <StoreMenus
              panel={mega}
              onPanelChange={setMega}
              mobileOpen={drawer}
              onMobileChange={setDrawer}
              signedIn={!!user}
              onSelectProducts={(value) => {
                setOnlyNew(value);
                setDepartment("Todos");
                setCategory(null);
                setCurrent(1);
              }}
              onAgenda={() => setInfo("Agenda")}
            />
            <div className="flex items-center gap-1 md:gap-3">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Buscar"
                title="Buscar"
                onClick={() => {
                  setMega(null);
                  setUtility("search");
                }}
              >
                <Search className="size-[18px]" />
              </Button>
              <Button asChild variant="ghost" size="icon" className="relative size-8 sm:size-9">
                <Link
                  to={user ? "/minha-conta" : "/entrar"}
                  aria-label={user ? "Minha conta" : "Entrar"}
                  title={user ? "Minha conta" : "Entrar"}
                >
                  <User className="size-[18px]" />
                  {user && (
                    <span
                      className="absolute right-1 top-1 inline-block size-1.5 rounded-full bg-signal"
                      aria-hidden="true"
                    />
                  )}
                </Link>
              </Button>
              <Button
                variant="ghost"
                className="micro gap-2 px-2"
                aria-label={`Sacola, ${cartCount} ${cartCount === 1 ? "item" : "itens"}`}
                title="Sacola"
                onClick={() => setUtility("cart")}
              >
                <ShoppingBag className="size-[18px]" />
                <span key={cartCount} className="cart-count">
                  ({cartCount})
                </span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Abrir menu"
                onClick={() => setDrawer(true)}
              >
                <Menu />
              </Button>
            </div>
          </div>
        </header>
      </div>
      <main>
        {product ? (
          <ProductPreview product={product} onAdded={openBagAfterAdd} />
        ) : (
          <>
            {collection ? (
              <section className="collection-hero site-width">
                <div className="collection-intro">
                  <Link to="/" className="micro inline-flex items-center gap-2">
                    <ArrowLeft className="size-3.5" /> Voltar à home
                  </Link>
                  <p className="micro mt-5 text-muted-foreground">
                    {collection.code} / {collection.label}
                  </p>
                  <h1 className="collection-title mt-2">
                    {collection.slug === "ybrd-home" ? (
                      <YbrdLogo brand="hybrd" />
                    ) : (
                      collection.title
                    )}
                  </h1>
                  <p className="mt-3 max-w-sm text-sm text-muted-foreground">
                    {collection.description}
                  </p>
                </div>
                <div className="campaign-frame">
                  <WindowBar title={collection.code} />
                  <img
                    src={collection.image}
                    alt={collection.title}
                    width={1024}
                    height={1280}
                    className="collection-image"
                    fetchPriority="high"
                  />
                </div>
              </section>
            ) : (
              <section aria-label="Campanhas YBRD" className="pb-10">
                <div className="hero-horizon">
                  <div className="horizon-grid-clip" aria-hidden="true">
                    <div className="horizon-grid" />
                  </div>
                  <div className="site-width relative flex items-center justify-between">
                    <div>
                      <p className="micro mb-2 text-muted-foreground">
                        Um futuro em comum / São Paulo, Brasil
                      </p>
                      <h1 className="hero-brand">
                        <YbrdLogo />
                      </h1>
                      <p className="hero-subtitle mt-2 font-mono text-[11px]">
                        Roupas e objetos para quem veste e mora com a mesma atitude.
                      </p>
                      <nav
                        className="hero-shortcuts mt-3 flex flex-wrap gap-2"
                        aria-label="Explorar departamentos"
                      >
                        {CAMPAIGNS.map((c, index) => (
                          <Button
                            asChild
                            key={c.slug}
                            variant={index === 0 ? "glossy" : "ghost"}
                            className={`micro rounded-full px-4 ${index === 0 ? "" : "border border-foreground"}`}
                          >
                            <Link to="/colecoes/$colecao" params={{ colecao: c.slug }} search={{}}>
                              {c.department}
                              <ArrowUpRight />
                            </Link>
                          </Button>
                        ))}
                      </nav>
                    </div>
                    <div className="hidden items-center gap-7 md:flex">
                      <p className="micro text-right">
                        Streetwear + Living
                        <br />
                        Coleções em conexão
                        <br />
                        Est. Brasil / 2026
                      </p>
                      <span className="hero-cross text-blue" aria-hidden="true">
                        ✳
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  className="campaign-switch site-width"
                  role="group"
                  aria-label="Alternar campanha"
                >
                  {CAMPAIGNS.map((c, i) => (
                    <Button
                      key={c.slug}
                      size="sm"
                      variant="ghost"
                      className="micro campaign-switch-button"
                      aria-controls="campaign-track"
                      aria-pressed={activeCampaign === i}
                      onClick={() => goToCampaign(i)}
                    >
                      <span aria-hidden="true">0{i + 1}</span> {c.title}
                    </Button>
                  ))}
                </div>
                <div
                  id="campaign-track"
                  ref={campaignTrack}
                  className="site-width campaign-grid"
                  onScroll={(event) => {
                    const carousel = event.currentTarget;
                    const max = carousel.scrollWidth - carousel.clientWidth;
                    setActiveCampaign(max > 0 && carousel.scrollLeft > max / 2 ? 1 : 0);
                  }}
                >
                  {CAMPAIGNS.map((c, i) => (
                    <article key={c.slug} className="campaign-frame">
                      <WindowBar title={c.code} />
                      <div className="campaign-card-content relative">
                        <img
                          decoding="async"
                          src={c.image}
                          alt={`${c.title}: streetwear e mobiliário cromado na mesma cena`}
                          width={1024}
                          height={1280}
                          loading={i === 0 ? "eager" : "lazy"}
                          fetchPriority={i === 0 ? "high" : "auto"}
                          className="campaign-image"
                        />
                        <div className="campaign-caption">
                          <div>
                            <p className="micro mb-2">
                              {c.label} <span className="text-blue">↗</span>
                            </p>
                            <h2 className="brand-display">
                              {c.slug === "ybrd-home" ? <YbrdLogo brand="hybrd" /> : c.title}
                            </h2>
                          </div>
                          <div className="campaign-actions flex flex-wrap gap-2">
                            <Button asChild size="sm" className="micro rounded-full px-5">
                              <Link
                                to="/colecoes/$colecao"
                                params={{ colecao: c.slug }}
                                search={{}}
                                aria-label={`Comprar ${c.title}`}
                              >
                                Comprar <ArrowUpRight />
                              </Link>
                            </Button>
                            <Button
                              variant="link"
                              size="sm"
                              className="micro border-0 px-2"
                              onClick={() => setCampaign(c)}
                            >
                              Campanha <Plus />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            <section id="comprar" className="site-width pb-16">
              <div className="section-label">
                <div>
                  <p className="micro mb-2 text-muted-foreground">
                    {collection ? collection.label : "Seleção híbrida / Vestir + Morar"}
                  </p>
                  <h2 className="section-title">{showcaseTitle}</h2>
                </div>
                <span className="micro">
                  {String(visible.length ? current : 0).padStart(2, "0")} /{" "}
                  {String(visible.length).padStart(2, "0")}
                </span>
              </div>
              <div className="department-tabs mb-5 flex flex-wrap items-center gap-3">
                {collection
                  ? [
                      undefined,
                      ...SHOP_CATEGORIES.filter(
                        (item) => item.department === collection.department,
                      ).map((item) => item.n),
                      ...(activeCategory &&
                      !SHOP_CATEGORIES.some((item) => item.n === activeCategory)
                        ? [activeCategory]
                        : []),
                    ].map((item) => (
                      <Button
                        asChild
                        key={item ?? "all"}
                        variant="ghost"
                        className={`micro h-7 rounded-none border-b px-0 ${activeCategory === (item ?? null) ? "border-foreground" : "border-transparent text-muted-foreground"}`}
                      >
                        <Link
                          to="/colecoes/$colecao"
                          params={{ colecao: collection.slug }}
                          search={item ? { categoria: item } : {}}
                          activeOptions={{ exact: true }}
                          resetScroll={false}
                          aria-current={activeCategory === (item ?? null) ? "page" : undefined}
                        >
                          {item ?? "Tudo"}
                        </Link>
                      </Button>
                    ))
                  : (["Todos", "Vestir", "Morar"] as const).map((d) => (
                      <Button
                        key={d}
                        variant="ghost"
                        className={`micro h-7 rounded-none border-b px-0 ${department === d ? "border-foreground" : "border-transparent text-muted-foreground"}`}
                        aria-pressed={department === d}
                        onClick={() => explore(d)}
                      >
                        {d}
                      </Button>
                    ))}
                {!collection && category && (
                  <Button
                    variant="chrome"
                    className="micro h-7"
                    onClick={() => explore(department)}
                  >
                    {category}
                    <X />
                  </Button>
                )}
              </div>
              <div className="showcase-arrows mb-4 flex items-center justify-between">
                <Button
                  variant="chrome"
                  size="icon"
                  aria-label="Produtos anteriores"
                  onClick={() => moveTrack(-1)}
                >
                  <ArrowLeft />
                </Button>
                <Button
                  variant="chrome"
                  size="icon"
                  aria-label="Próximos produtos"
                  onClick={() => moveTrack(1)}
                >
                  <ArrowRight />
                </Button>
              </div>
              <p className="micro mb-4 text-muted-foreground">
                Peças em edição limitada. Quando acabam, não voltam.
              </p>
              {visible.length ? (
                <div
                  ref={track}
                  className="product-track"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const first = el.firstElementChild;
                    if (first)
                      setCurrent(
                        Math.min(
                          visible.length,
                          Math.round(el.scrollLeft / (first.clientWidth + 16)) + 1,
                        ),
                      );
                  }}
                >
                  {visible.map((p) => (
                    <article key={p.slug} id={`produto-${p.slug}`} className="product-card">
                      <div className="mb-2 flex justify-between">
                        <span className="micro text-muted-foreground">{p.cat}</span>
                        {p.tag && (
                          <span className="new-product-tag micro text-[10px] text-signal">
                            [ Novo ]
                          </span>
                        )}
                      </div>
                      <div className="product-stage">
                        <Button
                          variant="ghost"
                          className="absolute inset-0 h-full w-full rounded-none p-0"
                          aria-label={`Ver ${p.name}`}
                          onClick={() => openProduct(p)}
                        >
                          <img
                            decoding="async"
                            src={p.img}
                            alt={p.name}
                            width={480}
                            height={600}
                            loading="lazy"
                            className="product-cutout aero-cutout"
                          />
                        </Button>
                      </div>
                      <h3 className="mt-3 font-sans text-sm font-medium">
                        <Link
                          to="/produto/$produto"
                          params={{ produto: p.slug }}
                          className="hover:underline"
                        >
                          {p.name}
                        </Link>
                      </h3>
                      <p className="micro text-muted-foreground">
                        {commerce.enabled
                          ? (() => {
                              const live = commerce.products.find((item) => item.slug === p.slug);
                              return live?.available
                                ? `Restam ${live.available} de ${live.editionTotal}`
                                : "Esgotado";
                            })()
                          : "Prévia"}
                      </p>
                      <p className="micro mt-2">
                        <span className="bg-highlight px-1">
                          {brl(
                            commerce.products.find((item) => item.slug === p.slug)?.priceCentavos ??
                              p.priceCentavos,
                          )}
                        </span>
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {!commerce.enabled &&
                          `Simulação: 6x de ${brl(installmentAmount(p.priceCentavos))}`}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="micro mt-3 rounded-full"
                        disabled={
                          commerce.enabled &&
                          !commerce.products.find((item) => item.slug === p.slug)?.available
                        }
                        onClick={() => openProduct(p)}
                      >
                        {commerce.enabled &&
                        !commerce.products.find((item) => item.slug === p.slug)?.available
                          ? "Esgotado"
                          : "Adicionar à sacola"}
                      </Button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="py-10 text-sm text-muted-foreground">Nenhum produto nesta seleção.</p>
              )}
            </section>
          </>
        )}
        {isHome && (
          <>
            <section className="site-width pb-16" id="look">
              <SceneRing
                onProductSelect={(item) => {
                  explore("Todos");
                  requestAnimationFrame(() => {
                    const card = document.getElementById(`produto-${item.slug}`);
                    card?.scrollIntoView({
                      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                        ? "instant"
                        : "smooth",
                      block: "center",
                    });
                    card
                      ?.querySelector<HTMLButtonElement>("button")
                      ?.focus({ preventScroll: true });
                  });
                }}
              />
            </section>
            <LookArchive />
            <section id="editoriais" className="site-width pb-16">
              <div className="section-label">
                <p className="micro">[ Outros pontos de encontro ]</p>
                <p className="micro text-muted-foreground">YBRD Journal / 2026</p>
              </div>
              <div className="editorial-grid">
                {EDITORIALS.map((e, i) => (
                  <article key={e.title}>
                    <div className="campaign-frame">
                      <img
                        decoding="async"
                        src={e.image}
                        alt={e.title}
                        width={1024}
                        height={1280}
                        loading="lazy"
                        className="editorial-image"
                      />
                      <span className="editorial-number micro absolute left-4 top-3">
                        [ 0{i + 1} ]
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="micro font-mono">{e.title}</h3>
                      <Button
                        variant="chrome"
                        size="sm"
                        className={`micro rounded-full ${i === 3 ? "editorial-upcoming" : ""}`}
                        disabled={i === 3}
                        onClick={() => (i === 1 ? explore("Morar", "Objetos") : setInfo(e.title))}
                      >
                        {mobile && i < 2 ? "Explorar" : e.action}
                        {i !== 3 && <ArrowUpRight />}
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{e.subtitle}</p>
                  </article>
                ))}
              </div>
            </section>
            <section id="manifesto" className="site-width pb-20" aria-label="Sobre a YBRD">
              <div className="section-label">
                <p className="micro">[ SOBRE A YBRD ]</p>
                <p className="micro text-muted-foreground">Manifesto / 2026</p>
              </div>
              <h2 className="mt-2 max-w-3xl text-2xl uppercase md:text-4xl">
                Feito pra ser único. Pensado pra ser híbrido.
              </h2>
              <p className="mt-4 max-w-xl text-sm text-muted-foreground">
                A YBRD nasce no streetwear e se expande para o esporte e para os objetos da casa.
                Peças numeradas, em edição limitada, para quem veste e mora com a mesma atitude.
              </p>
              <div className="mt-10 grid gap-8 sm:grid-cols-3">
                {[
                  { n: "01", t: "ÚNICO", d: "Cada peça é numerada e não se repete." },
                  { n: "02", t: "HÍBRIDO", d: "Roupa, esporte e objetos sob o mesmo olhar." },
                  { n: "03", t: "BRASIL", d: "Pensada e produzida com identidade local." },
                ].map((item) => (
                  <div key={item.n} className="border-t border-border pt-4">
                    <p className="micro">
                      <span className="text-muted-foreground">{item.n} /</span> {item.t}
                    </p>
                    <p className="mt-3 text-sm text-muted-foreground">{item.d}</p>
                  </div>
                ))}
              </div>
            </section>
            <section id="drop" className="bg-footer text-background" aria-label="Próximo drop">
              <div className="site-width py-14">
                <p className="micro text-footer-muted">[ LISTA DE INTERESSE / PRÉVIA ]</p>
                <h2 className="section-title mt-3 max-w-2xl">Próximo drop</h2>
                <p className="mt-3 text-sm text-footer-muted">
                  Formulário de demonstração. Os e-mails não são salvos.
                </p>
                {dropOk ? (
                  <p role="status" className="mt-6 max-w-md text-sm text-footer-muted">
                    E-mail validado no teste do formulário.
                  </p>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setDropOk(true);
                    }}
                    className="mt-6 flex max-w-md flex-col gap-4 sm:flex-row sm:items-end"
                  >
                    <input
                      type="email"
                      required
                      aria-label="Seu e-mail para o Drop 02"
                      placeholder="Seu e-mail"
                      className="h-10 min-w-0 flex-1 border-b border-background/30 bg-transparent text-sm outline-none focus:border-aqua"
                    />
                    <Button type="submit" className="micro shrink-0 rounded-full px-6">
                      Testar formulário <ArrowRight />
                    </Button>
                  </form>
                )}
              </div>
            </section>
          </>
        )}
      </main>
      <footer className="bg-footer text-background">
        <div className="site-width py-12">
          <div className="mb-10 flex items-end justify-between gap-6">
            <p className="wordmark footer-brand">
              <YbrdLogo />
            </p>
            <Button
              variant="ghost"
              className="micro text-background hover:bg-background/10 hover:text-background"
              aria-label="Voltar ao topo"
              onClick={() =>
                window.scrollTo({
                  top: 0,
                  behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                    ? "instant"
                    : "smooth",
                })
              }
            >
              <span className="hidden sm:inline">Voltar ao topo</span>
              <ArrowUp />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.25fr_1fr]">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              {footerColumns.map((col) => (
                <div key={col.title}>
                  <p className="micro mb-4">{col.title}</p>
                  <ul className="space-y-2">
                    {col.links.map(({ l, go }) => (
                      <li key={l}>
                        {!isHome && col.title === "Comprar" ? (
                          <Button
                            asChild
                            variant="ghost"
                            className="h-auto whitespace-normal p-0 text-left text-xs font-normal text-footer-muted hover:bg-transparent hover:text-background"
                          >
                            {l === "Tudo" ? (
                              <Link to="/" hash="comprar">
                                Tudo
                              </Link>
                            ) : (
                              <Link
                                to="/colecoes/$colecao"
                                params={{
                                  colecao: l === "Vestir" ? CAMPAIGNS[0].slug : CAMPAIGNS[1].slug,
                                }}
                                search={{}}
                              >
                                {l}
                              </Link>
                            )}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            className="h-auto whitespace-normal p-0 text-left text-xs font-normal text-footer-muted hover:bg-transparent hover:text-background"
                            onClick={() => (go ? go() : setInfo(l))}
                          >
                            {l}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div>
                <p className="micro mb-4">Ybrd</p>
                <Link to="/" hash="manifesto" className="text-xs text-footer-muted">
                  Conheça a marca ↗
                </Link>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setEmailOk(true);
              }}
            >
              <label htmlFor="email" className="micro block">
                Lista de interesse / Formulário de demonstração
              </label>
              {emailOk ? (
                <p role="status" className="mt-5 text-sm text-footer-muted">
                  E-mail validado no teste do formulário.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex gap-3">
                    <input
                      type="email"
                      id="email"
                      aria-label="Seu e-mail"
                      required
                      placeholder="Seu e-mail"
                      className="h-10 min-w-0 flex-1 border-b border-background/30 bg-transparent text-sm outline-none focus:border-aqua"
                    />
                    <Button type="submit" className="micro rounded-full px-6">
                      Testar <ArrowRight />
                    </Button>
                  </div>
                  <label className="mt-4 flex items-start gap-2 text-[11px] text-footer-muted">
                    <input type="checkbox" required className="mt-0.5 accent-aqua" />
                    <span>
                      Li e aceito a{" "}
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto p-0 text-[11px] text-footer-muted underline hover:bg-transparent hover:text-background"
                        onClick={() => setInfo("Privacidade")}
                      >
                        política de privacidade
                      </Button>
                      .
                    </span>
                  </label>
                </>
              )}
            </form>
          </div>
          <div className="micro mt-12 flex flex-wrap justify-between gap-3 border-t border-background/20 pt-5 text-[10px] text-footer-muted">
            <p>© 2026 YBRD COMPANY / SÃO PAULO, BRASIL</p>
          </div>
        </div>
      </footer>
      <Dialog
        open={utility === "search"}
        onOpenChange={(open) => {
          if (!open) setUtility(null);
        }}
      >
        <DialogContent className="max-h-[85svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{utility === "search" ? "Buscar" : "Sua sacola"}</DialogTitle>
            <DialogDescription>Vestir + Morar / Ybrd</DialogDescription>
          </DialogHeader>
          {utility === "search" && (
            <>
              <input
                aria-label="Buscar produtos"
                type="search"
                maxLength={120}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Camiseta, mobiliário, vaso…"
                className="h-11 rounded-md border border-input bg-background px-4 outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="space-y-2">
                {searchResults.length ? (
                  searchResults.map((item) => (
                    <Button
                      key={item.slug}
                      variant="ghost"
                      className="h-auto w-full justify-start whitespace-normal text-left"
                      onClick={() => {
                        setUtility(null);
                        openProduct(item);
                      }}
                    >
                      <img
                        decoding="async"
                        src={item.img}
                        alt=""
                        width={56}
                        height={56}
                        loading="lazy"
                        className="size-14 object-contain"
                      />
                      <span className="text-sm">
                        {item.name}
                        <span className="micro mt-1 block text-muted-foreground">
                          {brl(item.priceCentavos)}
                        </span>
                      </span>
                      <ArrowUpRight className="ml-auto" />
                    </Button>
                  ))
                ) : (
                  <p role="status" className="text-sm">
                    Nenhum produto encontrado.
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Sheet
        open={utility === "cart"}
        onOpenChange={(open) => {
          if (!open) setUtility(null);
        }}
      >
        <SheetContent closeLabel="Fechar sacola" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="mb-5">
            <SheetTitle>Sua sacola</SheetTitle>
            <SheetDescription>Vestir + Morar / Ybrd</SheetDescription>
          </SheetHeader>
          <CartContents onNavigate={() => setUtility(null)} />
          <a
            href="/sacola"
            className="micro mt-4 inline-block underline"
            onClick={() => setUtility(null)}
          >
            Abrir página da sacola
          </a>
        </SheetContent>
      </Sheet>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="product-detail max-h-[90svh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base leading-relaxed">{selected.name}</DialogTitle>
                <DialogDescription>
                  {selected.cat} / {selected.category}
                </DialogDescription>
              </DialogHeader>
              <div className="bg-card p-5">
                <img
                  decoding="async"
                  src={selected.img}
                  alt={selected.name}
                  loading="lazy"
                  className="mx-auto h-52 object-contain"
                  width={480}
                  height={600}
                />
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link
                  to="/produto/$produto"
                  params={{ produto: selected.slug }}
                  onClick={() => setSelected(null)}
                >
                  Ver página do produto <ArrowUpRight />
                </Link>
              </Button>
              <PreviewPurchase
                key={selected.slug}
                quickView
                product={selected}
                onAdded={openBagAfterAdd}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={campaign !== null}
        onOpenChange={(v) => {
          if (!v) setCampaign(null);
        }}
      >
        <DialogContent className="max-h-[90svh] max-w-3xl overflow-y-auto">
          {campaign && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{campaign.title}</DialogTitle>
                <DialogDescription>Campanha 2026 / Um futuro em comum.</DialogDescription>
              </DialogHeader>
              <img
                decoding="async"
                src={campaign.image}
                alt={campaign.title}
                loading="lazy"
                width={1024}
                height={1280}
                className="max-h-[60svh] w-full object-contain"
              />
              <Button asChild>
                <Link
                  to="/colecoes/$colecao"
                  params={{ colecao: campaign.slug }}
                  search={{}}
                  onClick={() => setCampaign(null)}
                >
                  Explorar coleção <ArrowUpRight />
                </Link>
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={info !== null}
        onOpenChange={(v) => {
          if (!v) setInfo(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg">{info}</DialogTitle>
            <DialogDescription>
              {info === "Contato"
                ? "O canal oficial de atendimento será informado quando estiver disponível."
                : info === "Agenda"
                  ? "Pop-ups e encontros do coletivo. Datas e locais serão anunciados em breve."
                  : info === "Sobre"
                    ? "A YBRD conecta streetwear, mobiliário e objetos em um mesmo universo criativo. Matérias diferentes. Um futuro em comum."
                    : info === "Colaborações"
                      ? "Novos encontros entre moda, design e arte. A próxima colaboração será anunciada em breve."
                      : "As informações oficiais serão apresentadas na abertura da loja."}
            </DialogDescription>
          </DialogHeader>
          <Button variant="outline" onClick={() => setInfo(null)}>
            Entendi <Check />
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
