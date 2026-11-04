import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RING_COUNT, clampCard, curveCard, dragCard } from '@/lib/scene-ring-motion';

const CODES = Array.from({ length: RING_COUNT }, (_, i) => `YBRD / ED_${String(i + 1).padStart(3, '0')}`);

export function Card({ code, image }: { code: string; image: string | undefined }) {
  return <article className="ring-card"><div className="window-bar"><div className="window-dots" aria-hidden="true"><span /><span /><span /></div><span className="micro">{code}</span></div><div className="ring-card-stage">{image ? <img src={image} alt="" className="ring-card-image" /> : <span className="ring-card-plus" aria-hidden="true">+</span>}</div></article>;
}

export function SceneRing() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const flatRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [front, setFront] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [flat, setFlat] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const narrow = window.matchMedia('(max-width: 768px)');
    const sync = () => { setFlat(reduced.matches); setMobile(narrow.matches); };
    sync();
    reduced.addEventListener('change', sync);
    narrow.addEventListener('change', sync);
    return () => { reduced.removeEventListener('change', sync); narrow.removeEventListener('change', sync); };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setEntered(true); observer.disconnect(); }
    }, { threshold: 0.15 });
    observer.observe(scene);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (previous === null) return;
    const timer = window.setTimeout(() => setPrevious(null), 600);
    return () => window.clearTimeout(timer);
  }, [previous, front]);

  useEffect(() => {
    const track = flatRef.current;
    if (!flat || !track) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.intersectionRatio > 0.8 && entry.target instanceof HTMLElement) {
          const index = Number(entry.target.dataset.index);
          setFront(current => { if (current !== index) setPrevious(current); return index; });
        }
      });
    }, { root: track, threshold: 0.8 });
    Array.from(track.children).forEach(card => observer.observe(card));
    return () => observer.disconnect();
  }, [flat]);

  const select = (index: number) => {
    const next = clampCard(index);
    if (next !== front) { setPrevious(front); setFront(next); }
    if (flat) {
      const track = flatRef.current;
      const card = track?.children[next];
      if (track && card instanceof HTMLElement) track.scrollTo({ left: card.offsetLeft - track.offsetLeft - (track.clientWidth - card.clientWidth) / 2, behavior: 'instant' });
    }
  };

  return <div className="scene-curve" onKeyDown={event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); select(front + (event.key === 'ArrowRight' ? 1 : -1));
    }
  }}>
    <div className="section-label"><h2 className="section-title">Um look. Um espaço.</h2><span className="micro text-muted-foreground">[ SHOP THE SCENE / 08 ] {String(front + 1).padStart(2, '0')}—08</span></div>
    <div ref={sceneRef} className={`ring-scene ${entered ? 'scene-entered' : ''}`} tabIndex={0} role="group" aria-label="Cenas YBRD" onPointerDown={event => {
      if (flat || !event.isPrimary || event.button !== 0) return;
      drag.current = { x: event.clientX, start: front, moved: false }; suppressClick.current = false;
    }} onPointerMove={event => {
      const state = drag.current;
      if (!state) return;
      if (Math.abs(event.clientX - state.x) > 8) { state.moved = true; event.currentTarget.setPointerCapture(event.pointerId); }
    }} onPointerUp={event => {
      const state = drag.current;
      if (!state) return;
      if (state.moved) {
        const width = event.currentTarget.querySelector('.ring-card')?.getBoundingClientRect().width ?? 300;
        select(dragCard(state.start, event.clientX - state.x, width)); suppressClick.current = true;
      }
      drag.current = null;
    }} onPointerCancel={() => { drag.current = null; suppressClick.current = true; }}>
      {flat ? <div ref={flatRef} className="ring-flat">{CODES.map((code, i) => <div className="ring-flat-item" key={code} data-index={i}><Card code={code} image={undefined} /></div>)}</div> : <div className="curve-track" style={{ transform: `translateX(calc(${ -front } * var(--curve-step)))` }}>{CODES.map((code, i) => {
        const depth = curveCard(i - front, mobile);
        return <div key={code} className="curve-slot" style={{ transform: `translateX(calc(${i} * var(--curve-step))) rotateY(${depth.angle}deg) scale(${depth.scale})`, opacity: depth.opacity, zIndex: RING_COUNT - Math.abs(i - front) }}><Button variant="ghost" className="curve-card-button" aria-label={`Centralizar cena ${String(i + 1).padStart(2, '0')}`} aria-pressed={front === i} tabIndex={Math.abs(i - front) <= 1 ? 0 : -1} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } select(i); }}><div className="curve-entry" style={{ animationDelay: `${i * 70}ms` }}><Card code={code} image={undefined} /></div></Button></div>;
      })}</div>}
    </div>
    <div className="curve-controls"><Button variant="ghost" size="icon" className="curve-arrow" aria-label="Cena anterior" disabled={front === 0} onClick={() => select(front - 1)}><ArrowLeft /></Button><Button variant="ghost" size="icon" className="curve-arrow" aria-label="Próxima cena" disabled={front === RING_COUNT - 1} onClick={() => select(front + 1)}><ArrowRight /></Button></div>
    <div className="curve-caption micro text-muted-foreground" aria-live="polite" aria-atomic="true">{previous !== null && <div key={`out-${previous}`} className="caption-out" aria-hidden="true">{CODES[previous]?.split(' / ').map((line, i) => <span key={line} style={{ animationDelay: `${i * 60}ms` }}>{line}</span>)}</div>}<div key={front} className={previous !== null ? 'caption-in' : ''}>{CODES[front]?.split(' / ').map((line, i) => <span key={line} style={{ animationDelay: `${i * 60}ms` }}>{line}</span>)}</div></div>
  </div>;
}
