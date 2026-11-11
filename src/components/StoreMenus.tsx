import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { YbrdLogo } from '@/components/YbrdLogo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { CAMPAIGNS } from '@/lib/hybrid-editorial';
import { MENU_FILTERS, PRODUCTS, matchesCategory } from '@/lib/hybrid-catalog';

export type StorePanel = 'shop' | 'collections';
type PanelProps = { panel: StorePanel; onNavigate: () => void; onSelectProducts?: (onlyNew: boolean) => void };
const collectionSlug = (department: string) => department === 'Morar' ? 'ybrd-home' : 'concreto-dourado';
const stagger = (index: number): CSSProperties => ({ animationDelay: `${index * 40}ms` });

function MenuContent({ panel, onNavigate, onSelectProducts }: PanelProps) {
  const [highlight, setHighlight] = useState<number | null>(null);
  const counts = {
    all: PRODUCTS.length,
    wear: PRODUCTS.filter(item => item.cat === 'Vestir').length,
    home: PRODUCTS.filter(item => item.cat === 'Morar').length,
    new: PRODUCTS.filter(item => item.tag === 'Novo').length,
  };
  const primary = [
    { label: 'Tudo', count: counts.all, department: null },
    { label: 'Vestir', count: counts.wear, department: 'Vestir' },
    { label: 'Morar', count: counts.home, department: 'Morar' },
    { label: 'Novidades', count: counts.new, department: null },
  ];
  const feature = highlight === 2 ? 1 : 0;
  if (panel === 'shop') return <div className="store-menu-shop">
    <div className="store-menu-primary">
      {primary.map((item, index) => {
        const content = <><span>{item.label}</span><span className="store-menu-count">{item.count}</span><ArrowUpRight aria-hidden="true" /></>;
        const props = {
          className: 'store-menu-large menu-enter-item',
          style: stagger(index),
          onClick: () => { if (index === 0 || index === 3) onSelectProducts?.(index === 3); onNavigate(); },
          onMouseEnter: () => setHighlight(index),
          onFocus: () => setHighlight(index),
        };
        return item.department
          ? <Link key={item.label} to="/colecoes/$colecao" params={{ colecao: collectionSlug(item.department) }} search={{}} {...props}>{content}</Link>
          : <Link key={item.label} to="/" hash="comprar" search={index === 3 ? { novidades: true } : {}} {...props}>{content}</Link>;
      })}
    </div>
    <div className="store-menu-subcategories">
      {(['Vestir', 'Morar'] as const).map(department => <div key={department}>
        <p className="micro store-menu-group">{department}</p>
        {MENU_FILTERS.filter(item => item.department === department).map((item, index) => {
          const count = PRODUCTS.filter(product => product.cat === department && matchesCategory(product, item.category)).length;
          if (!count) return null;
          return <Link key={item.category} to="/colecoes/$colecao" params={{ colecao: collectionSlug(department) }} search={{ categoria: item.category }} className="store-menu-small menu-enter-item" style={stagger(index + 4)} onClick={onNavigate}>
            <span>{item.label}</span><span>{count}</span>
          </Link>;
        })}
      </div>)}
    </div>
    <div className="store-menu-feature menu-enter-item" style={stagger(7)}>
      <div className="store-menu-feature-images">
        {CAMPAIGNS.map((campaign, index) => <img key={campaign.slug} src={campaign.image} alt={index === feature ? campaign.title : ''} aria-hidden={index !== feature} width={1024} height={1280} className={index === feature ? 'is-featured' : ''} />)}
      </div>
      <div className="store-menu-feature-caption">
        <p className="micro">{feature === 0 ? 'DROP 01 / CONCRETO DOURADO' : 'HYBRD / OBJETOS E MOBILIÁRIO'}</p>
        <Button asChild size="sm" className="micro rounded-full"><Link to="/colecoes/$colecao" params={{ colecao: CAMPAIGNS[feature].slug }} search={{}} onClick={onNavigate}>Ver <ArrowUpRight /></Link></Button>
      </div>
    </div>
  </div>;

  return <div className="store-menu-collections">
    <div className="store-menu-collection-list">
      {CAMPAIGNS.map((campaign, index) => <Link key={campaign.slug} to="/colecoes/$colecao" params={{ colecao: campaign.slug }} search={{}} className="store-menu-collection-link menu-enter-item" style={stagger(index)} onClick={onNavigate} onFocus={() => setHighlight(index)} onMouseEnter={() => setHighlight(index)}>
        <span className="store-menu-large"><span className="brand-display">{campaign.slug === 'ybrd-home' ? <YbrdLogo brand="hybrd" /> : campaign.title}</span><ArrowUpRight aria-hidden="true" /></span>
        <span className="micro">{index === 0 ? 'Drop 01 / 2026' : 'Objetos e mobiliário'}</span>
      </Link>)}
      <div className="store-menu-collection-link is-disabled menu-enter-item" style={stagger(2)} aria-disabled="true">
        <span className="store-menu-large">Drop 02</span><span className="micro">Em breve</span>
      </div>
      <Link to="/" hash="arquivo-de-looks" search={{}} className="store-menu-collection-link menu-enter-item" style={stagger(3)} onClick={onNavigate} onFocus={() => setHighlight(null)} onMouseEnter={() => setHighlight(null)}>
        <span className="store-menu-large"><span>Arquivo de looks</span><ArrowUpRight aria-hidden="true" /></span><span className="micro">01–03</span>
      </Link>
    </div>
    <div className="store-menu-campaigns">
      {CAMPAIGNS.map((campaign, index) => <Link key={campaign.slug} to="/colecoes/$colecao" params={{ colecao: campaign.slug }} search={{}} onClick={onNavigate} onMouseEnter={() => setHighlight(index)} onFocus={() => setHighlight(index)} className="store-menu-campaign menu-enter-item" style={stagger(index + 4)}>
        <img src={campaign.image} alt={campaign.title} width={1024} height={1280} style={{ opacity: highlight === null || highlight === index ? 1 : 0.5 }} />
        <span className="micro">{index === 0 ? 'DROP 01 / CONCRETO DOURADO' : 'HYBRD / OBJETOS E MOBILIÁRIO'}</span>
      </Link>)}
    </div>
  </div>;
}

export function StoreMenus({ panel, onPanelChange, mobileOpen, onMobileChange, onAgenda, signedIn, onSelectProducts }: {
  panel: StorePanel | null;
  onPanelChange: (panel: StorePanel | null) => void;
  mobileOpen: boolean;
  onMobileChange: (open: boolean) => void;
  onAgenda: () => void;
  signedIn: boolean;
  onSelectProducts: (onlyNew: boolean) => void;
}) {
  const nav = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const pointerFocus = useRef(false);
  const [rendered, setRendered] = useState<StorePanel | null>(panel);
  const [top, setTop] = useState(108);
  const [accordion, setAccordion] = useState<StorePanel | null>('shop');
  const lastPanel = useRef<StorePanel>('shop');
  if (panel) lastPanel.current = panel;

  const close = (restore = false) => {
    onPanelChange(null);
    if (restore) {
      pointerFocus.current = true;
      triggers.current[lastPanel.current === 'shop' ? 0 : 1]?.focus({ preventScroll: true });
      queueMicrotask(() => { pointerFocus.current = false; });
    }
  };

  useEffect(() => {
    if (panel) { setRendered(panel); return; }
    const timer = window.setTimeout(() => setRendered(null), 180);
    return () => window.clearTimeout(timer);
  }, [panel]);

  useEffect(() => {
    if (!panel) return;
    const header = nav.current?.closest('header');
    const position = () => setTop(header?.getBoundingClientRect().bottom ?? 108);
    position();
    const observer = new ResizeObserver(position);
    if (header) observer.observe(header);
    window.addEventListener('resize', position);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!nav.current?.contains(target) && !content.current?.contains(target)) close();
    };
    const focusOutside = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!nav.current?.contains(target) && !content.current?.contains(target)) close();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', focusOutside);
    document.addEventListener('keydown', escape);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', focusOutside);
      document.removeEventListener('keydown', escape);
    };
  }, [panel]);

  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1024px)');
    const sync = () => { if (wide.matches) onMobileChange(false); else onPanelChange(null); };
    wide.addEventListener('change', sync);
    return () => wide.removeEventListener('change', sync);
  }, [onMobileChange, onPanelChange]);

  const focusItems = () => Array.from(content.current?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? []);
  const panelKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = focusItems();
    const index = items.indexOf(document.activeElement as HTMLAnchorElement);
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1) + items.length) % items.length;
      items[next]?.focus();
    }
    if (event.key === 'Tab' && event.shiftKey && index === 0) {
      event.preventDefault();
      triggers.current[panel === 'shop' ? 0 : 1]?.focus();
    } else if (event.key === 'Tab' && !event.shiftKey && index === items.length - 1) {
      event.preventDefault();
      close();
      nav.current?.querySelector<HTMLButtonElement>('[data-agenda]')?.focus();
    }
  };

  return <>
    <nav ref={nav} className="hidden items-center gap-6 lg:flex" aria-label="Menu principal">
      {(['shop', 'collections'] as const).map((kind, index) => <Button key={kind} ref={node => { triggers.current[index] = node; }} variant="ghost" className="micro store-menu-trigger px-0" aria-expanded={panel === kind} aria-controls={`store-panel-${kind}`} onPointerDown={() => { pointerFocus.current = true; }} onFocus={() => { if (!pointerFocus.current) onPanelChange(kind); }} onClick={() => { onPanelChange(panel === kind ? null : kind); pointerFocus.current = false; }} onKeyDown={event => {
        if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey && panel)) {
          event.preventDefault(); onPanelChange(kind);
          requestAnimationFrame(() => content.current?.querySelector<HTMLAnchorElement>('a[href]')?.focus());
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); triggers.current[1 - index]?.focus();
        }
      }}>
        {kind === 'shop' ? `Comprar tudo (${PRODUCTS.length})` : 'Coleções'}<ChevronDown className="size-3" />
      </Button>)}
      <Button data-agenda variant="ghost" className="micro px-0" onClick={() => { close(); onAgenda(); }}>Agenda<ArrowUpRight className="size-3" /></Button>
    </nav>
    {rendered && typeof document !== 'undefined' && createPortal(
      <div className="store-menu-layer" aria-hidden={!panel} inert={!panel} style={{ '--store-menu-top': `${top}px` } as CSSProperties} data-state={panel ? 'open' : 'closed'}>
        <div className="store-menu-scrim" aria-hidden="true" onPointerDown={event => { event.stopPropagation(); close(true); }} />
        <div ref={content} id={`store-panel-${rendered}`} className="store-menu-panel" role="region" aria-label={rendered === 'shop' ? 'Comprar tudo' : 'Coleções'} onKeyDown={panelKeys}>
          <div className="store-menu-container"><MenuContent key={rendered} panel={rendered} onNavigate={() => close()} onSelectProducts={onSelectProducts} /></div>
        </div>
      </div>, document.body,
    )}
    <Sheet open={mobileOpen} onOpenChange={onMobileChange}>
      <SheetContent side="right" closeLabel="Fechar menu" className="store-mobile-menu" onCloseAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLButtonElement>('[aria-label="Abrir menu"]')?.focus(); }}>
        <SheetHeader>
          <SheetTitle className="wordmark text-left"><YbrdLogo /></SheetTitle>
          <SheetDescription className="sr-only">Comprar tudo e coleções da Ybrd</SheetDescription>
        </SheetHeader>
        <div className="store-mobile-accordions">
          {(['shop', 'collections'] as const).map(kind => <section key={kind}>
            <button type="button" className="store-mobile-accordion" aria-expanded={accordion === kind} aria-controls={`mobile-panel-${kind}`} onClick={() => setAccordion(accordion === kind ? null : kind)}>
              <span>{kind === 'shop' ? `Comprar tudo (${PRODUCTS.length})` : 'Coleções'}</span><ChevronDown aria-hidden="true" />
            </button>
            {accordion === kind && <div id={`mobile-panel-${kind}`}><MenuContent panel={kind} onNavigate={() => onMobileChange(false)} onSelectProducts={onSelectProducts} /></div>}
          </section>)}
        </div>
        <footer className="store-mobile-footer">
          <Link to={signedIn ? '/minha-conta' : '/entrar'} onClick={() => onMobileChange(false)}>Minha conta</Link>
          <button type="button" onClick={() => { onMobileChange(false); onAgenda(); }}>Agenda <ArrowUpRight className="size-4" /></button>
        </footer>
      </SheetContent>
    </Sheet>
  </>;
}
