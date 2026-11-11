import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LOOKS } from '@/lib/hybrid-editorial';

export function LookArchive() {
  const [open, setOpen] = useState<number | null>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (open === null) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => {
      const row = rows.current[open];
      if (!row) return;
      const bounds = row.getBoundingClientRect();
      if (bounds.top < 120 || bounds.bottom > window.innerHeight) {
        window.scrollTo({ top: window.scrollY + bounds.top - 120, behavior: reduced ? 'instant' : 'smooth' });
      }
    }, reduced ? 0 : 400);
    return () => window.clearTimeout(timer);
  }, [open]);

  return <section id="arquivo-de-looks" className="look-archive site-width pb-14" aria-label="Looks da coleção">
    <div className="section-label"><p className="micro">[ Em movimento ]</p><p className="micro text-muted-foreground">Arquivo de looks / 01–{String(LOOKS.length).padStart(2, '0')}</p></div>
    <div className={`look-index ${open !== null ? 'has-open-look' : ''}`}>
      {LOOKS.map((image, i) => {
        const number = String(i + 1).padStart(2, '0');
        const expanded = open === i;
        return <Button key={image} ref={el => { rows.current[i] = el; }} variant="ghost" className={`look-index-row ${expanded ? 'is-open' : ''}`} aria-label={`Look ${number}`} aria-expanded={expanded} aria-controls={`look-preview-${number}`} onClick={() => setOpen(expanded ? null : i)}>
          <span className="look-index-summary">
            <span className="look-index-number">{number}</span>
            <span className="look-index-copy"><span className="look-index-title">LOOK {number}</span><span className="look-index-meta">Drop 01 / 2026</span></span>
            <img className="look-index-thumb" src={image} alt={`Look ${number}`} width={44} height={44} loading="lazy" decoding="async" />
          </span>
          <span id={`look-preview-${number}`} className="look-index-preview" aria-hidden={!expanded}>
            <span className="look-index-preview-inner"><img src={image} alt={`Look ${number}`} width={800} height={600} loading="lazy" decoding="async" /></span>
          </span>
        </Button>;
      })}
    </div>
    <p className="look-index-hint"><span className="look-hint-touch">Toque</span><span className="look-hint-click">Clique</span> em uma linha para abrir</p>
  </section>;
}