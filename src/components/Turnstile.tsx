import { useEffect, useRef, useState } from "react";

type Widget = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Widget;
  }
}

let loader: Promise<Widget> | undefined;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loader ??= new Promise<Widget>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error()));
    script.onerror = () => {
      script.remove();
      reject(new Error());
    };
    document.head.append(script);
  }).catch((error) => {
    loader = undefined;
    throw error;
  });
  return loader;
}

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const sitekey = import.meta.env["VITE_YBRD_TURNSTILE_SITE_KEY"];
  useEffect(() => {
    if (!sitekey) return;
    let active = true;
    let widget: { api: Widget; id: string } | undefined;
    void loadTurnstile()
      .then((api) => {
        if (!active || !ref.current) return;
        widget = {
          api,
          id: api.render(ref.current, {
            sitekey,
            action: "ybrd-account",
            language: "pt-br",
            size: "flexible",
            callback: onToken,
            "expired-callback": () => onToken(""),
            "error-callback": () => {
              onToken("");
              setFailed(true);
            },
          }),
        };
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (widget) widget.api.remove(widget.id);
    };
  }, [onToken, sitekey]);
  return (
    <div>
      <div ref={ref} />
      {(!sitekey || failed) && (
        <p role="alert" className="text-sm">
          A verificação de segurança está indisponível.
        </p>
      )}
    </div>
  );
}
