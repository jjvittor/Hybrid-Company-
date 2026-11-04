import { useEffect, useRef, useState } from 'react';
import { RING_COUNT as COUNT, RING_STEP as STEP, ROTATION_LERP, DRAG_SENSITIVITY, DRAG_FRICTION, SNAP_DELAY, SNAP_DURATION, scrollRotation, nearestCard, snapRotation, cardDepth } from '@/lib/scene-ring-motion';

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
  const stickyRef = useRef<HTMLDivElement>(null);
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
    const section = scene?.closest('section');
    const sticky = stickyRef.current;
    if (!scene || !tilt || !ring || !section || !sticky) return;

    let rotation = 0;
    let velocity = 0;
    let target = 0;
    let snap: { from: number; to: number; start: number } | null = null;
    let lastInteraction = performance.now();
    let settled = false;
    let dragging = false;
    let lastX = 0;
    let tiltX = 0;
    let tiltY = 0;
    let tiltXT = 0;
    let tiltYT = 0;
    const fine = window.matchMedia('(pointer: fine) and (min-width: 769px)').matches;

    const setRadius = () => {
      const card = cardRefs.current[0];
      if (card) ring.style.setProperty('--ring-radius', `${card.offsetWidth / (2 * Math.tan(Math.PI / COUNT))}px`);
    };
    setRadius();
    const ro = new ResizeObserver(setRadius);
    if (cardRefs.current[0]) ro.observe(cardRefs.current[0]);

    const onScroll = () => {
      const range = section.offsetHeight - sticky.offsetHeight;
      target = scrollRotation(range > 0 ? -section.getBoundingClientRect().top / range : 0);
      velocity = 0;
      snap = null;
      settled = false;
      lastInteraction = performance.now();
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return;
      dragging = true; lastX = e.clientX; velocity = 0; target = rotation; snap = null; settled = false;
      scene.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        target += dx * DRAG_SENSITIVITY;
        velocity = dx * DRAG_SENSITIVITY;
        lastInteraction = performance.now();
      } else if (fine) {
        const r = scene.getBoundingClientRect();
        tiltYT = Math.max(-3, Math.min(3, ((e.clientX - r.left) / r.width - 0.5) * 6));
        tiltXT = Math.max(-2, Math.min(2, -((e.clientY - r.top) / r.height - 0.5) * 4));
      }
    };
    const onUp = () => { dragging = false; lastInteraction = performance.now(); };
    const onLeave = () => { tiltXT = 0; tiltYT = 0; };
    scene.addEventListener('pointerdown', onDown);
    scene.addEventListener('pointermove', onMove);
    scene.addEventListener('pointerup', onUp);
    scene.addEventListener('pointercancel', onUp);
    scene.addEventListener('pointerleave', onLeave);

    let raf = 0;
    const tick = (now: number) => {
      if (!dragging) {
        if (Math.abs(velocity) >= 0.01) {
          target += velocity;
          velocity *= DRAG_FRICTION;
        } else velocity = 0;
        if (!snap && !settled && velocity === 0 && now - lastInteraction >= SNAP_DELAY) {
          snap = { from: target, to: nearestCard(target), start: now };
        }
        if (snap) {
          target = snapRotation(snap.from, snap.to, now - snap.start);
          if (now - snap.start >= SNAP_DURATION) { snap = null; settled = true; }
        }
      }
      rotation += (target - rotation) * ROTATION_LERP;
      tiltX += (tiltXT - tiltX) * 0.05;
      tiltY += (tiltYT - tiltY) * 0.05;
      tilt.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
      ring.style.transform = `rotateY(${rotation}deg)`;
      const frontIndex = ((Math.round(-rotation / STEP) % COUNT) + COUNT) % COUNT;
      cardRefs.current.forEach((card, i) => {
        if (!card) return;
        const depth = cardDepth(i * STEP + rotation);
        card.style.visibility = depth.hidden ? 'hidden' : 'visible';
        card.style.pointerEvents = depth.hidden ? 'none' : 'auto';
        card.style.opacity = String(depth.opacity);
        card.style.filter = `blur(${depth.blur}px)`;
        card.style.transform = `rotateY(${i * STEP}deg) translateZ(var(--ring-radius)) scale(${depth.scale})`;
      });
      setFront(prev => (prev === frontIndex ? prev : frontIndex));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        target = nearestCard(target) + (e.key === 'ArrowRight' ? -STEP : STEP);
        velocity = 0;
        snap = null;
        settled = false;
        lastInteraction = performance.now();
      }
    };
    scene.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      scene.removeEventListener('pointerdown', onDown);
      scene.removeEventListener('pointermove', onMove);
      scene.removeEventListener('pointerup', onUp);
      scene.removeEventListener('pointercancel', onUp);
      scene.removeEventListener('pointerleave', onLeave);
      scene.removeEventListener('keydown', onKey);
    };
  }, [flat]);

  return (
    <div ref={stickyRef} className={flat ? 'ring-accessible' : 'ring-sticky'}>
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
    </div>
  );
}
