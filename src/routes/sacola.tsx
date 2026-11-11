import { createFileRoute, Link } from "@tanstack/react-router";
import { CartContents } from "@/components/CartContents";
import { YbrdLogo } from "@/components/YbrdLogo";

export const Route = createFileRoute("/sacola")({
  head: () => ({
    meta: [{ title: "Sacola — Ybrd" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: BagPage,
});
function BagPage() {
  return (
    <main className="site-width mx-auto max-w-2xl space-y-6 py-8">
      <Link to="/" className="wordmark" aria-label="YBRD início">
        <YbrdLogo />
      </Link>
      <h1 className="section-title">Sua sacola</h1>
      <CartContents />
    </main>
  );
}
