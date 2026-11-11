import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { commerceRequest } from "@/lib/commerce";
import type { MerchantPolicies } from "@/lib/checkout";

export const Route = createFileRoute("/politicas")({
  head: () => ({ meta: [{ title: "Políticas da loja — Ybrd" }] }),
  component: Policies,
});
function Policies() {
  const [policies, setPolicies] = useState<MerchantPolicies | null>(null);
  const [message, setMessage] = useState("Carregando políticas.");
  useEffect(() => {
    const controller = new AbortController();
    void commerceRequest<MerchantPolicies>("politicas", {}, controller.signal)
      .then(setPolicies)
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage("As políticas da loja serão publicadas antes da abertura das vendas.");
      });
    return () => controller.abort();
  }, []);
  return (
    <main className="site-width max-w-3xl space-y-6 py-10">
      <Link to="/" className="micro underline">
        Voltar à loja
      </Link>
      <h1 className="section-title">Políticas da loja</h1>
      {policies ? (
        <>
          <address className="not-italic text-sm">
            <p>{policies.razaoSocial}</p>
            <p>{policies.documento}</p>
            <p>{policies.endereco}</p>
            <p>{policies.email}</p>
          </address>
          {(
            [
              ["termos", "Termos de uso"],
              ["troca", "Política de troca"],
              ["privacidade", "Privacidade"],
            ] as const
          ).map(([key, title]) => (
            <section key={key} id={key} className="border-t border-border pt-4">
              <h2 className="section-title">{title}</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{policies[key]}</p>
            </section>
          ))}
        </>
      ) : (
        <p role="status">{message}</p>
      )}
    </main>
  );
}
