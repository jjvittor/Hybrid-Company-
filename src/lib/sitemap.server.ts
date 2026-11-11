import { PRODUCTS } from "./hybrid-catalog";
import { CAMPAIGNS } from "./hybrid-editorial";

export function storefrontSitemap(url: URL) {
  const configured = process.env["YBRD_SITE_ORIGIN"];
  const origin = configured && new URL(configured).origin === configured ? configured : url.origin;
  const paths = [
    "/",
    ...CAMPAIGNS.map((c) => `/colecoes/${c.slug}`),
    ...PRODUCTS.map((p) => `/produto/${p.slug}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${new URL(path, origin).href.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</loc></url>`).join("")}</urlset>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
