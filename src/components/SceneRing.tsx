import { useEffect, useRef, useState } from 'react';

const COUNT = 8;
const STEP = 360 / COUNT;
const CODES = Array.from({ length: COUNT }, (_, i) => `YBRD / ED_${String(i + 1).padStart(3, '0')}`);

export function RingCard({ code, image }: { code: string; image?: string | undefined }) {
  return (
    <article className="ring-card">
      <div className="window-bar">
        <div className="window-dots" aria-hidden="true"><span /><span /><span /></div>
        <span className="micro text-[10px]">{code}</span>
      </div>
      <div className="ring-card-stage">
        {image ? <img src={image} alt="" className="ring-card-image" /> : <span className="ring-card-plus" aria-hidden="true">+</span>}
      </div>
    </article>
  );
}

export function SceneRing() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [front, setFront] = useState(0);
  const [flat, setFlat] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setFlat(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (flat) return;
    const scene = sceneRef.current;
    const tilt = tiltRef.current;
    const ring = ringRef.current;
    if (!scene || !tilt || !ring) return;

    let rotation = 0;
    let velocity = 0;
    let target: number | null = null;
    let dragging = false;
    let lastX = 0;
    let idle = 0;
    let tiltX = 0;
    let tiltY = 0;
    let tiltXT = 0;
    let tiltYT = 0;
    const fine = window.matchMedia('(pointer: fine)').matches;

    const setRadius = () => {
      const card = cardRefs.current[0];
      if (card) ring.style.setProperty('--ring-radius', `${card.offsetWidth / (2 * Math.tan(Math.PI / COUNT))}px`);
    };
    setRadius();
    const ro = new ResizeObserver(setRadius);
    if (cardRefs.current[0]) ro.observe(cardRefs.current[0]);

    const onWheel = (e: WheelEvent) => { e.preventDefault(); velocity += e.deltaY * 0.06; target = null; idle = 0; };
    scene.addEventListener('wheel', onWheel, { passive: false });

    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; velocity = 0; target = null; scene.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        rotation += dx * 0.3;
        velocity = dx * 0.3;
        idle = 0;
      } else if (fine) {
        const r = scene.getBoundingClientRect();
        tiltYT = ((e.clientX - r.left) / r.width - 0.5) * 12;
        tiltXT = -((e.clientY - r.top) / r.height - 0.5) * 8;
      }
    };
    const onUp = () => { dragging = false; };
    const onLeave = () => { tiltXT = 0; tiltYT = 0; };
    scene.addEventListener('pointerdown', onDown);
    scene.addEventListener('pointermove', onMove);
    scene.addEventListener('pointerup', onUp);
    scene.addEventListener('pointercancel', onUp);
    scene.addEventListener('pointerleave', onLeave);

    let raf = 0;
    const tick = () => {
      if (!dragging) {
        if (target !== null) {
          rotation += (target - rotation) * 0.14;
          if (Math.abs(target - rotation) < 0.05) { rotation = target; target = null; }
        } else {
          rotation += velocity;
          velocity *= 0.94;
          if (Math.abs(velocity) < 0.05) {
            idle += 1;
            if (idle > 8) {
              const snap = Math.round(rotation / STEP) * STEP;
              rotation += (snap - rotation) * 0.14;
              if (Math.abs(snap - rotation) < 0.05) rotation = snap;
            }
          } else {
            idle = 0;
          }
        }
      }
      tiltX += (tiltXT - tiltX) * 0.08;
      tiltY += (tiltYT - tiltY) * 0.08;
      tilt.style.transform = `rotateX(${-8 + tiltX}deg) rotateY(${tiltY}deg)`;
      ring.style.transform = `rotateY(${rotation}deg)`;
      const frontIndex = ((Math.round(-rotation / STEP) % COUNT) + COUNT) % COUNT;
      cardRefs.current.forEach((card, i) => {
        if (!card) return;
        const diff = Math.abs(((i * STEP + rotation) % 360 + 540) % 360 - 180);
        const t = Math.min(diff / 180, 1);
        card.style.opacity = String(1 - 0.55 * t);
        card.style.transform = `rotateY(${i * STEP}deg) translateZ(var(--ring-radius)) scale(${1 - 0.18 * t})`;
      });
      setFront(prev => (prev === frontIndex ? prev : frontIndex));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const base = target ?? Math.round(rotation / STEP) * STEP;
        target = base + (e.key === 'ArrowRight' ? -STEP : STEP);
        velocity = 0;
      }
    };
    scene.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.removeEventListener('wheel', onWheel);
      scene.removeEventListener('pointerdown', onDown);
      scene.removeEventListener('pointermove', onMove);
      scene.removeEventListener('pointerup', onUp);
      scene.removeEventListener('pointercancel', onUp);
      scene.removeEventListener('pointerleave', onLeave);
      scene.removeEventListener('keydown', onKey);
    };
  }, [flat]);

  return (
    <>
      <div className="section-label">
        <h2 className="section-title">Um look. Um espaço.</h2>
        <span className="micro text-muted-foreground">[ Shop the scene / 08 ] {String(front + 1).padStart(2, '0')}—08</span>
      </div>
      {flat ? (
        <div className="ring-flat">
          {CODES.map(code => <RingCard key={code} code={code} image={undefined} />)}
        </div>
      ) : (
        <>
          <div ref={sceneRef} className="ring-scene" tabIndex={0} role="group" aria-label="Carrossel 3D de cenas YBRD. Use as setas do teclado para girar.">
            <div ref={tiltRef} className="ring-tilt">
              <div ref={ringRef} className="ring">
                {CODES.map((code, i) => (
                  <div key={code} ref={el => { cardRefs.current[i] = el; }} className="ring-card-slot" style={{ transform: `rotateY(${i * STEP}deg) translateZ(var(--ring-radius, 300px))` }}>
                    <RingCard code={code} image={undefined} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="micro mt-6 text-center text-muted-foreground" aria-live="polite">{CODES[front]}</p>
        </>
      )}
    </>
  );
}
