<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the hybrid catalog and department/category groupings in a browser-safe data module, so home navigation, category previews and curated sets share one source.
- Bundle selection is a frontend-only preview until commerce is connected; never imply that a payment or order has been processed.

- Keep home-specific Aero treatments in global semantic CSS tokens and shared Button variants; generated campaign images and catalog cutouts stay separate so real product images can replace them without changing catalog logic.
- Keep utility dialogs and collection selection client-only previews until services are connected; newsletter and account UI must not claim persisted registration.
- Keep home campaign, look-archive and hotspot content separate from catalog product data; hotspot positions use named CSS classes so replacement media does not alter commerce logic.
- Keep look-archive expansion local to its section component and source images from the shared editorial list, so opening a look never opens a campaign or affects commerce.
- Keep showcase installment arithmetic in the browser-safe utilities module, so displayed amounts can be tested without changing cart logic.
- Keep scene-strip curvature and circular navigation arithmetic in a browser-safe module; use stable physical copies offscreen so modulo-eight navigation never animates a recycled card across the strip.
- Keep mobile-only home presentation behind the existing narrow-screen breakpoint; page-scroll chat visibility uses the shared browser-safe predicate so its threshold is testable independently of rendering.
