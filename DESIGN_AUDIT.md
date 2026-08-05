# Design Audit — SignalPro (Ftt-app-002)

> Full visual polish pass · 2026-08-05 · No behavior changes
> Scope: all 4 tabs + scanner + board + sheets/modals · Live components only
> Verification: `tsc` 0 errors · build pass · Phase 5 smoke 53/53 · Phase 6 smoke 79/79
> · jsdom render harness **51/51** (`verify/design_render.mjs`)

---

## 1. What the audit found

### 1.1 🔴 The committed `index.html` was a stale single-file build

`index.html` (345 KB) contained an old inlined `vite-plugin-singlefile` bundle —
not the source entry. The last app fix ("chips always visible", `fillStatus`)
was **absent** from it (0 occurrences), so `npm run dev` served an outdated app
that silently hid source changes.

**Fixed:** `index.html` is now the canonical Vite entry (`<script type="module"
src="/src/main.tsx">`, 18 lines, meta/manifest/icons preserved). `npm run build`
regenerates the inlined single file into `dist/index.html` as before.

### 1.2 🔴 Four greens, four reds, three blues — no semantic palette

Every screen mixed rival palettes for the same meaning:

| Meaning | Was | Now (token) |
|---|---|---|
| BUY / WIN | `#00e676`, `#81c784`, `#30d158`, `#4caf50` | `--c-buy: #00e676` |
| SELL / LOSS | `#ff5252`, `#ef5350`, `#ff453a`, `#c62828` | `--c-sell: #ff5252` |
| Info blue | `#0a84ff`, `#42a5f5`, `#64b5f6`, `#0288d1` | `--c-info: #42a5f5` |
| OTC orange | `#ff9f0a`, `#ff9800` | `--c-otc: #ff9800` |
| Warn/amber | `#ffb400`, `#ffb74d` | `--c-warn: #ffb74d` |
| Neutral gray | `#bdbdbd`, `#9e9e9e` | `#9e9e9e` |

All live components now reference the tokens (`--c-*` + `--rgb-*` triplets for
alpha tints). The AI "Both Agree" badge, the structure "ALIGNED" badge, the
history WIN badge, and the hero BUY headline now resolve to the **same green**
(asserted by the render harness).

### 1.3 🔴 Undefined classes used by live components

`ios-card`, `ios-blur-strong`, `haptic-tap`, `tick-item` were referenced by live
code but never defined — the pair-picker sheet had **no surface background** and
no press feedback.

**Fixed:** `.sheet-surface` (blurred sheet shell), `.ios-card` (grouped list
card), `.haptic-tap` (standard press scale) added to the design system;
PairSelector/HistoryDetailModal now use the real sheet surface.

### 1.4 🟠 Micro-typography below readability floor

8–9 px labels were pervasive (hero key-data grid, stat cards, badges, nav). Now
every micro-label is ≥ 10 px via one shared `.label-caption` utility
(10 px / 0.12 em / uppercase / 600 / `--t-low`). The 7 px "auto" tag became 8 px.

### 1.5 🟠 Low-contrast secondary text

`#6e6e73` (~3.0:1 on card surfaces) was used for meaningful labels. Readable
labels moved to `--t-low` (`#8e9099`, ~4.3:1); truly tertiary footnotes
(timestamps, "This device only") keep `--t-faint`.

### 1.6 🟠 Surface/radius language drift

Card shells competed: `md-surface` (16), `premium-card` (20), `ios-card`,
inline `borderRadius:20` styles, board cards at 18 px. Unified:

- Grouped lists (History, Settings, Scanner) → `.surface-group` (20 px shell)
- Server Win Rate card → `premium-card` (matches tab siblings)
- Metric tiles → `rounded-2xl` everywhere they sit side by side
- Board cards → 20 px
- Repeated inline list-container styles deleted

### 1.7 🟠 Empty/loading states

- History: no skeleton for server stats — added shimmer tiles + caption
- Scanner empty-state icon was nearly invisible (`rgba(255,255,255,0.04)`) → visible gray
- History empty-state icon bumped similarly
- Scanner input had no background affordance → subtle surface + focus state
- Scanner empty copy claimed "Add 10–12 pairs" (misleading vs the 12 cap) → "Add pairs to start scanning"
- Home skeleton now matches the 24 px hero radius

### 1.8 🟠 Micro-interactions

- Press scale standardized to `active:scale-95` (was 0.9/0.95/0.98/0.99 mixed)
- `.haptic-tap` defined so picker rows finally give press feedback
- Desktop `:hover` brightness on buttons (additive, `@media (hover:hover)`)
- `prefers-reduced-motion` now disables shimmer/slide/fade/scale/ticker too

### 1.9 🟠 Accessibility

- Global `:focus-visible` ring (previously invisible keyboard focus)
- `aria-label` on icon-only buttons: refresh, picker close/search, scanner
  bell/scan/remove/add, detail close; `aria-pressed` chips already present
- `role="status"` on the server-stats loading block

### 1.10 🟡 Dead files keep their old palette — deliberately

`AIInsights`, `BottomNav`, `CountdownTimer`, `HistoryView`, `IndicatorGrid`,
`MaterialSignalCard`, `SessionWidget`, `SignalHero`, `TimeframeCard` are not
imported anywhere (verified against App.tsx imports). They were left untouched
(repo convention: dead-file cleanup is a non-goal) but retain the old 4-green
palette — **if one is ever wired up again, it must be migrated to the tokens
first.**

### 1.11 🟢 Ticker edge clipping

Marquee items hard-clipped at the screen edge → soft `mask-image` fade on both
sides. Behavior unchanged.

---

## 2. Design tokens (single source of truth)

Defined in `src/index.css :root`:

```
--c-buy #00e676 · --c-sell #ff5252 · --c-warn #ffb74d · --c-info #42a5f5
--c-otc #ff9800 · --c-accent #4dd0e1 · --c-purple #b39ddb
--t-high #e3e2e6 · --t-mid #b0b3b8 · --t-low #8e9099 · --t-faint #6e6e73
--rgb-* triplets for rgba(var(--rgb-buy), 0.12) style tints
```

Usage rules: solid colors as `text-[var(--c-*)]` / `bg-[var(--c-*)]/NN`
(color-mix); inline styles use `var(--c-*)` and `rgba(var(--rgb-*), NN)`.
Label language: `.label-caption`. Surfaces: `.premium-card` (feature cards),
`.surface-group` (lists), `.sheet-surface` (sheets), `.ios-card` (grouped rows),
`.md-surface*` (utility tiles).

---

## 3. Files changed

| File | Change |
|---|---|
| `index.html` | stale 345 KB build → 18-line Vite source entry |
| `src/index.css` | +99 lines: tokens, `.label-caption`, `.surface-group`, `.sheet-surface`, `.ios-card`, `.haptic-tap`, focus ring, hover, reduced-motion, ticker fade |
| `src/App.tsx` | palette→tokens, label floor 10 px, `.label-caption`, `.surface-group`, Analysis header card → real header, ServerStats skeleton, aria-labels, press-scale |
| `src/components/PairSelector.tsx` | sheet surface, token colors, aria-labels |
| `src/components/ScannerView.tsx` | surface-group, input affordance, empty state, aria-labels, tokens |
| `src/components/CircuitBreakerCard.tsx` | amber → warn token |
| `src/components/HistoryDetailModal.tsx` | sheet surface, win/loss → tokens |
| `src/components/HealthPill.tsx` | icon colors → tokens |
| `src/components/DashboardView.tsx` | 20 px cards, label bumps, LIVE badge |
| `src/components/Ticker.tsx` | edge-fade container |
| `src/components/Premium.tsx` | FilterBadges + shared exports → tokens |
| `vite.config.ts` | `host: 0.0.0.0`, `allowedHosts: true` (sandbox preview) |
| `package.json` | devDeps +`jsdom`, `@types/jsdom` (render harness) |
| `verify/design_render.mjs` (new) | real-app jsdom render harness, 51 assertions |

Bundle impact: raw **+0.97 KB**, gzip **+0.19 KB** (well inside the <5 KB
budget culture; the tokens add ~1 KB of CSS variables).

## 4. How it was verified

1. `npx tsc --noEmit` — 0 errors
2. `npm run build` — pass; grep of dist CSS confirms every token utility
   compiled (`color-mix(in oklab, var(--c-buy) 15%, transparent)` etc.)
3. `node scripts/phase5_smoke.mjs` — 53/53 (regression guard untouched)
4. `node scripts/phase6_smoke.mjs` — 79/79
5. `node verify/design_render.mjs` — mounts the real app in jsdom with the
   real compiled CSS + mocked API, walks all tabs/states, asserts rendered DOM
   and computed styles (hero green, badge tokens, label size, sheet surface,
   CB card, market-closed card, detail modal P&L, board, scanner, settings):
   **51/51**
6. Live preview (`npm run dev`) serves the current source via `/src/main.tsx`
