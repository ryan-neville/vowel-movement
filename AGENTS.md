# Browser compatibility

Every change must work in current Chrome, Edge, Firefox, and Safari on desktop, and in Safari on iOS and Chrome on Android. Treat Firefox and iOS Safari as first-class targets, not afterthoughts. This is a public portfolio — it is viewed on whatever browser a recruiter happens to open, and a layout that only holds together in Chrome is not done.

## Before writing code

Check support for any CSS property, selector, or web API you are about to introduce. If it is newer than roughly the last two years, or if support differs across the four engines (Blink, Gecko, WebKit), either pick an older equivalent or add a fallback. Do not assume a feature is safe because it is common in Chrome-first code.

## CSS and layout

- **Viewport height**: `100vh` (and Tailwind's `min-h-screen`) is wrong on mobile Safari — it excludes the collapsing toolbar, so full-height sections get clipped. Use `min-h-[100dvh]` / `h-dvh`. [components/Hero.tsx:10](components/Hero.tsx#L10) still uses `min-h-screen` and should move to `dvh` next time it is touched.
- **Autoprefixer covers stylesheets, not inline styles.** PostCSS adds vendor prefixes to [app/globals.css](app/globals.css) automatically, but React `style={{...}}` objects bypass it entirely — write `WebkitBackdropFilter`, `WebkitBackgroundClip`, `WebkitTransformStyle` by hand there.
- **`::-webkit-scrollbar` is WebKit/Blink only.** The custom scrollbar in [app/globals.css:27-36](app/globals.css#L27-L36) does nothing in Firefox. Pair any scrollbar styling with the standard `scrollbar-width` / `scrollbar-color` properties so Firefox gets a deliberate result rather than the default.
- **`background-attachment: fixed` is broken on iOS** (it jitters or renders at the wrong scale). Keep the mobile-scroll / desktop-fixed split already in [app/globals.css:38-46](app/globals.css#L38-L46) for any new parallax surface.
- **`backdrop-filter`** needs the `-webkit-` twin, and is a real performance cliff on mobile GPUs — this page deliberately serves a flat translucent fill below `md` and only enables the blur from `md` up ([app/globals.css:75-97](app/globals.css#L75-L97)). New frosted surfaces must follow that same pattern, not add another always-on blur. Firefox also composites it imperfectly, so never rely on the blur alone for legibility.
- **`background-clip: text`** requires both `-webkit-background-clip: text` and `-webkit-text-fill-color: transparent` to render in Safari — see the `.gradient-text` utility.
- **Animating `grid-template-rows` `0fr → 1fr`** (the `.nav-collapse` disclosure) is comparatively recent and was the last thing to land in Safari. Verify that transition in Safari specifically whenever the mobile menu changes; if it snaps instead of easing, fall back to a max-height transition.
- Container queries and `:has()` are supported across all four engines and are fine to use; `@container style()` queries and `field-sizing` are not — avoid them.

## Motion

- Keep animation on `opacity` and `transform` only. Animating layout properties drops off the compositor and janks badly on mobile Safari.
- Every new animation must be covered by the `prefers-reduced-motion` block at [app/globals.css:234-251](app/globals.css#L234-L251). If it cannot be neutralised by the blanket duration override — a transform-based reveal, say — add an explicit reset there.
- Anything JS-driven needs a no-JS resting state, like the `<noscript>` reveal override in [app/layout.tsx](app/layout.tsx). Content must never depend on hydration to become visible.

## Touch and pointer input

- Anything tappable needs a **minimum 44×44 px hit area** and `touch-manipulation` to suppress the iOS 300 ms double-tap-zoom delay. The mobile menu toggle at [components/Navbar.tsx:67](components/Navbar.tsx#L67) is only `p-2` around a 24 px icon — grow the padding or add `min-h-[44px] min-w-[44px]` when you next touch it.
- **Pair every hover affordance with an `active:` state.** Mobile browsers have no hover, and iOS Safari leaves sticky `:hover` styles stuck on after a tap. The `hover:scale-105` buttons in [components/Hero.tsx:86-95](components/Hero.tsx#L86-L95) currently have no touch equivalent; the mobile nav links at [components/Navbar.tsx:90](components/Navbar.tsx#L90) show the right pattern with `active:text-amber-400`.
- `group-hover:` underline animations are desktop-only decoration by nature — never let them carry information a touch user needs.
- Keep keyboard equivalents for any gesture-only interaction, and preserve visible focus states — desktop Firefox and Safari users navigate by keyboard.
- If a `viewport` export is added to [app/layout.tsx](app/layout.tsx), never set `maximum-scale` or `user-scalable=no`; blocking pinch-zoom is an accessibility regression.

## JavaScript and web APIs

- Guard browser-only APIs behind a `typeof window !== 'undefined'` check — this app server-renders, and `localStorage`, `matchMedia`, and `navigator` do not exist during SSR.
- **Feature-detect, never sniff the user agent.** [components/Reveal.tsx:15-18](components/Reveal.tsx#L15-L18) is the pattern: it checks `typeof IntersectionObserver === 'undefined'` and falls through to showing the content. Any new observer or platform API needs the same working no-API path.
- Wrap `localStorage` reads and writes in `try/catch` — Safari Private Browsing and iOS storage pressure make them throw, and an uncaught throw takes the whole render down.
- Prefer widely-supported syntax over the newest additions. Anything that reached all four engines two or more years ago is safe (`at`, `findLast`, `toSorted`, `structuredClone`, `Object.groupBy`, `Array.fromAsync`). Still uneven, and to be avoided or polyfilled: `Temporal`, `Promise.try`, decorators, and the View Transitions API (missing in Firefox).
- Serve images through `next/image` so Next handles format negotiation — do not hand-roll `<picture>` with AVIF/WebP guesses.

## Verification

Before calling a UI change complete, confirm it in **at least two different engines** (e.g. Edge/Chrome plus Firefox), and check the mobile layout at a 375 px-wide viewport with touch emulation on. `npm run dev:lan` binds to `0.0.0.0` for testing against a real phone on the LAN — use it for anything touching the hero background, the mobile menu, scroll reveals, or viewport sizing, since device emulation does not reproduce iOS Safari's compositing, toolbar, or `background-attachment` behaviour. State which browsers you actually checked; if you could not verify one, say so rather than implying you did.

## The flashcard submodule

[projects/japanese-flashcard-app](projects/japanese-flashcard-app) is a **git submodule** with its own repository and its own `AGENTS.md`. Its files are compiled by this project's Tailwind config, so a change there affects both, but edits belong to that repo and follow its rules — including its own browser-compatibility section, which covers the 3D card flip. Do not commit changes to submodule files from this repository.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
