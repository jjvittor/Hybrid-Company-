import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  RING_COUNT,
  SLIDE_DURATION,
  clampCard,
  circularDistance,
  curveCard,
  dragOffset,
  inertialCard,
} from "@/lib/scene-ring-motion";
import { SCENES, sceneProducts } from "@/lib/scene-content";
import type { Product } from "@/lib/hybrid-catalog";

export function Card({ code, image }: { code: string; image: string | undefined }) {
  return (
    <article className="ring-card">
      <div className="window-bar">
        <div className="window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="micro">{code}</span>
      </div>
      <div className="ring-card-stage">
        {image ? (
          <img src={image} alt="" className="ring-card-image" draggable={false} />
        ) : (
          <span className="ring-card-plus" aria-hidden="true">
            +
          </span>
        )}
      </div>
    </article>
  );
}

type DragState = {
  x: number;
  y: number;
  start: number;
  lastX: number;
  lastTime: number;
  velocity: number;
  moved: boolean;
  pointer: number;
};
const money = (amount: number) =>
  amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function SceneRing({ onProductSelect }: { onProductSelect?: (product: Product) => void }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [position, setPosition] = useState(0);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const front = clampCard(position);
  const [previous, setPrevious] = useState<number | null>(null);
  const [reduced, setReduced] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [entered, setEntered] = useState(false);
  const [settled, setSettled] = useState(false);
  const [openSpot, setOpenSpot] = useState<number | null>(null);
  const [enlarged, setEnlarged] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia("(max-width: 768px)");
    const sync = () => {
      setReduced(motion.matches);
      setMobile(narrow.matches);
    };
    sync();
    motion.addEventListener("change", sync);
    narrow.addEventListener("change", sync);
    return () => {
      motion.removeEventListener("change", sync);
      narrow.removeEventListener("change", sync);
      if (clickTimer.current) clearTimeout(clickTimer.current);
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(scene);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSettled(false);
    setOpenSpot(null);
    const timer = window.setTimeout(
      () => {
        setSettled(true);
        setPrevious(null);
      },
      reduced ? 120 : SLIDE_DURATION,
    );
    return () => window.clearTimeout(timer);
  }, [position, reduced, dragging, entered]);

  useEffect(() => {
    if (openSpot === null) return;
    const outside = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-scene-hotspot]"))
        setOpenSpot(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [openSpot]);

  const select = (index: number) => {
    const next = clampCard(index);
    setOpenSpot(null);
    if (next === front) return;
    setPrevious(front);
    setSettled(false);
    setPosition((current) => current + circularDistance(next, clampCard(current)));
  };

  const changeByKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      select(front + (event.key === "ArrowRight" ? 1 : -1));
    }
    if (event.key === "Escape" && openSpot !== null) {
      event.preventDefault();
      event.stopPropagation();
      setOpenSpot(null);
      sceneRef.current?.querySelector<HTMLButtonElement>('[data-scene-central="true"]')?.focus();
    }
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (state.moved) {
      suppressClick.current = true;
      if (clickTimer.current) clearTimeout(clickTimer.current);
      clickTimer.current = setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      if (!cancelled) {
        const velocity = performance.now() - state.lastTime < 100 ? state.velocity : 0;
        select(inertialCard(state.start, event.clientX - state.x, velocity));
      }
    }
    setOffset(0);
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const focusCentral = () => {
    sceneRef.current
      ?.querySelector<HTMLButtonElement>('[data-scene-central="true"]')
      ?.focus({ preventScroll: true });
  };
  const currentScene = SCENES[front]!;

  return (
    <div
      className={`scene-curve ${dragging ? "scene-dragging" : ""} ${reduced ? "scene-reduced" : ""}`}
      onKeyDown={changeByKey}
    >
      <div className="section-label">
        <h2 className="section-title">Um look. Um espaço.</h2>
        <span className="micro text-muted-foreground">
          [ SHOP THE SCENE / 08 ]{" "}
          <span key={front} className="scene-counter-in">
            {String(front + 1).padStart(2, "0")}—08
          </span>
        </span>
      </div>
      <div
        ref={sceneRef}
        className={`ring-scene ${entered ? "scene-entered" : ""}`}
        tabIndex={0}
        role="group"
        aria-label="Cenas YBRD"
        onPointerDown={(event) => {
          if (
            !event.isPrimary ||
            event.button !== 0 ||
            (event.target as Element).closest("[data-scene-hotspot]")
          )
            return;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            start: front,
            lastX: event.clientX,
            lastTime: performance.now(),
            velocity: 0,
            moved: false,
            pointer: event.pointerId,
          };
          suppressClick.current = false;
        }}
        onPointerMove={(event) => {
          const state = drag.current;
          if (!state || state.pointer !== event.pointerId) return;
          const dx = event.clientX - state.x;
          const dy = event.clientY - state.y;
          if (!state.moved && Math.abs(dy) > Math.max(8, Math.abs(dx))) {
            drag.current = null;
            return;
          }
          if (Math.abs(dx) > 8) {
            state.moved = true;
            setDragging(true);
            setOpenSpot(null);
            event.currentTarget.setPointerCapture(event.pointerId);
            const now = performance.now();
            state.velocity = (event.clientX - state.lastX) / Math.max(1, now - state.lastTime);
            state.lastX = event.clientX;
            state.lastTime = now;
            setOffset(dragOffset(dx));
          }
        }}
        onPointerUp={(event) => finishDrag(event)}
        onPointerCancel={(event) => finishDrag(event, true)}
        onLostPointerCapture={(event) => {
          if (drag.current) finishDrag(event, true);
        }}
      >
        <div className="curve-track">
          {SCENES.flatMap((scene, index) =>
            [-1, 0, 1].map((copy) => {
              const baseDistance = circularDistance(index, front) + copy * RING_COUNT;
              const distance = baseDistance + offset;
              const depth = curveCard(distance, mobile);
              const central = baseDistance === 0;
              const products = central ? sceneProducts(index) : [];
              const activePoint = openSpot === null ? undefined : products[openSpot];
              // Keep physical keys stable as cards cross the circular boundary.
              const physicalIndex = position + baseDistance;
              return (
                <div
                  key={physicalIndex}
                  className="curve-slot"
                  data-central={central}
                  data-side={Math.sign(baseDistance)}
                  aria-hidden={copy !== 0 ? true : undefined}
                  style={{
                    transform: `translateX(calc(${distance} * var(--curve-step))) rotateY(${depth.angle}deg) scale(${depth.scale})`,
                    transitionDuration: dragging ? "0ms" : `${reduced ? 120 : SLIDE_DURATION}ms`,
                    opacity: depth.opacity,
                    zIndex: RING_COUNT - Math.min(RING_COUNT, Math.abs(baseDistance)),
                  }}
                >
                  <div className="curve-card-wrap">
                    <Button
                      variant="ghost"
                      className="curve-card-button"
                      data-scene-central={central}
                      aria-label={
                        central
                          ? `Ampliar cena ${String(index + 1).padStart(2, "0")}`
                          : `Centralizar cena ${String(index + 1).padStart(2, "0")}`
                      }
                      aria-pressed={central}
                      aria-haspopup={central ? "dialog" : undefined}
                      tabIndex={copy === 0 && Math.abs(baseDistance) <= 1 ? 0 : -1}
                      onClick={() => {
                        if (suppressClick.current) {
                          suppressClick.current = false;
                          return;
                        }
                        if (central) {
                          setOpenSpot(null);
                          setEnlarged(true);
                        } else select(index);
                      }}
                    >
                      <div className="curve-entry" style={{ animationDelay: `${index * 70}ms` }}>
                        <Card code={scene.code} image={scene.image} />
                      </div>
                    </Button>
                    {central && settled && !dragging && entered && (
                      <div className="scene-hotspots">
                        {products.map((point, pointIndex) => (
                          <div
                            key={point.slug}
                            className="scene-hotspot"
                            data-scene-hotspot
                            style={
                              {
                                left: `${point.x}%`,
                                top: `${point.y}%`,
                                "--point-delay": `${pointIndex * 60}ms`,
                              } as CSSProperties
                            }
                          >
                            <button
                              type="button"
                              className="scene-product-point"
                              aria-label={`Ver ${point.product.name} na cena`}
                              aria-expanded={openSpot === pointIndex}
                              aria-controls={`scene-product-${index}-${pointIndex}`}
                              onClick={() =>
                                setOpenSpot(openSpot === pointIndex ? null : pointIndex)
                              }
                            >
                              +
                            </button>
                          </div>
                        ))}
                        {activePoint && (
                          <div
                            data-scene-hotspot
                            className="scene-product-bubble"
                            id={`scene-product-${index}-${openSpot}`}
                            role="group"
                            aria-label={activePoint.product.name}
                            style={
                              activePoint.y < 45
                                ? { top: `calc(${activePoint.y}% + 30px)`, bottom: "auto" }
                                : { bottom: `calc(${100 - activePoint.y}% + 30px)` }
                            }
                          >
                            <p>{activePoint.product.name}</p>
                            <p className="micro">{money(activePoint.product.price)}</p>
                            <Link
                              to="/"
                              hash={`produto-${activePoint.product.slug}`}
                              search={{}}
                              onClick={() => {
                                setOpenSpot(null);
                                onProductSelect?.(activePoint.product);
                              }}
                            >
                              Ver peça <ArrowRight className="size-3" />
                            </Link>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            }),
          )}
        </div>
      </div>
      <div className="curve-controls">
        <Button
          variant="ghost"
          size="icon"
          className="curve-arrow"
          aria-label="Cena anterior"
          onClick={() => select(front - 1)}
        >
          <ArrowLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="curve-arrow"
          aria-label="Próxima cena"
          onClick={() => select(front + 1)}
        >
          <ArrowRight />
        </Button>
      </div>
      <div
        className="curve-caption micro text-muted-foreground"
        aria-live="polite"
        aria-atomic="true"
      >
        {previous !== null && (
          <div key={`out-${previous}`} className="caption-out" aria-hidden="true">
            {SCENES[previous]?.code.split(" / ").map((line, index) => (
              <span key={line} style={{ animationDelay: `${index * 60}ms` }}>
                {line}
              </span>
            ))}
          </div>
        )}
        <div key={front} className={previous !== null ? "caption-in" : ""}>
          {currentScene.code.split(" / ").map((line, index) => (
            <span key={line} style={{ animationDelay: `${index * 60}ms` }}>
              {line}
            </span>
          ))}
        </div>
      </div>
      <Dialog.Root open={enlarged} onOpenChange={setEnlarged}>
        <Dialog.Portal>
          <Dialog.Overlay className="scene-lightbox-overlay" />
          <Dialog.Content
            className="scene-lightbox"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setEnlarged(false);
            }}
            onKeyDown={changeByKey}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              focusCentral();
            }}
          >
            <Dialog.Title className="sr-only">Cena ampliada</Dialog.Title>
            <Dialog.Description className="sr-only">
              Use as setas para trocar de cena e Escape para fechar.
            </Dialog.Description>
            <Dialog.Close className="scene-lightbox-close" aria-label="Fechar visualização">
              <X />
            </Dialog.Close>
            <div className="scene-lightbox-card">
              <Card code={currentScene.code} image={currentScene.image} />
            </div>
            <div className="scene-lightbox-controls">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cena anterior ampliada"
                onClick={() => select(front - 1)}
              >
                <ArrowLeft />
              </Button>
              <p className="micro" aria-live="polite">
                <span key={front} className="scene-counter-in">
                  {String(front + 1).padStart(2, "0")} / 08
                </span>
              </p>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Próxima cena ampliada"
                onClick={() => select(front + 1)}
              >
                <ArrowRight />
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
