# Ftt-app-002 — Phase 7 Report — Frontend Design Polish Pass

> Role: **Frontend Designer**. Full visual polish across the app: consistency
> of color, typography, surfaces, empty/loading states, micro-interactions,
> and accessibility. **Zero behavior changes** — no fetch logic, no state
> management, no endpoint wiring touched. The repo's existing smoke suites
> pass untouched (53/53 + 79/79), plus a new 51-assertion real-app render
> harness (`verify/design_render.mjs`).

**Base commit:** `c861382` (chips always visible) · **Backend:** untouched
**Deploy:** nothing deployed, nothing pushed · `npm run build` pass
**Diff:** 13 source/config files + 2 new verify files · **Bundle:** +0.97 KB raw / +0.19 KB gzip

---

## 1. The two structural discoveries

### 1.1 `index.html` was a stale 345 KB build artifact

The committed `index.html` was an old `vite-plugin-singlefile` output, not the
source entry. Proof of staleness: the previous commit's fix (`fillStatus`
chips, "INSTANT — take now") has **0 occurrences** in it. Consequences:

- `npm run dev` served the old bundle — any source change was invisible in dev
- A fresh clone looked correct but ran behind the code

Fix: `index.html` is now the canonical 18-line Vite entry (meta, manifest,
icons, title preserved). `npm run build` still emits the inlined single file to
`dist/index.html`. This was a prerequisite for the polish pass to be visible at
all.

### 1.2 Undefined CSS classes in live components

`ios-card`, `ios-blur-strong`, `haptic-tap`, `tick-item` were referenced by
live components but had **no definitions** in `index.css`. Most visibly, the
pair-picker bottom sheet rendered with a transparent body (no surface, no
blur) and its rows had no press feedback. Fixed by defining `.sheet-surface`,
`.ios-card`, `.haptic-tap` in the design system and pointing the live
components at them.

---

## 2. What shipped (design decisions)

| Area | Decision |
|---|---|
| Semantic palette | One token per meaning: `--c-buy #00e676`, `--c-sell #ff5252`, `--c-info #42a5f5`, `--c-warn #ffb74d`, `--c-otc #ff9800`, `--c-accent #4dd0e1`, `--c-purple #b39ddb` + `--rgb-*` triplets. All live screens migrated (≈200 literals). |
| Type floor | No label below 10 px; one `.label-caption` utility (10/0.12em/uppercase/600) replaces the scattered 8–9 px tracking combos. |
| Contrast | Meaningful labels `#6e6e73` → `#8e9099`; `#6e6e73` kept only for tertiary footnotes. |
| Surfaces | `.premium-card` = feature cards, `.surface-group` = lists (History/Settings/Scanner), `.sheet-surface` = sheets, `.md-surface*` = utility tiles; radius drift (16/18/20/24) converged to 20 px card / 16 px tile language. |
| States | Server-stats shimmer skeleton; visible empty-state icons; scanner input affordance + focus; honest scanner empty copy. |
| Motion | Press scale unified at 0.95; `haptic-tap` defined; hover brightness (desktop only); `prefers-reduced-motion` extended to shimmer/slide/fade/ticker. |
| A11y | Global `:focus-visible` ring; `aria-label`s on all icon-only buttons; `aria-pressed` chips (already present); `role="status"` loading. |
| Analysis tab | The empty "Multi-Timeframe Analysis" header card (a card shell around a title) became a proper section header with icon — one less dead surface. |
| Ticker | Edge fade so marquee items never hard-clip at screen edges. |

Deliberately **not** changed: layout geometry, tab order, fonts, the
BUY/SELL semantics, the CircuitBreaker amber accent bar (deep-orange gradient
is its identity; text/pills now use the warn token), dead component files
(they keep the old palette — documented in `DESIGN_AUDIT.md` §1.10 so a future
wire-up migrates them first).

---

## 3. Verification

```
npx tsc --noEmit                       → 0 errors
npm run build                          → pass (dist/index.html 353.7 kB, gzip 99.4 kB)
node scripts/phase5_smoke.mjs          → 53/53  (regression guard, untouched)
node scripts/phase6_smoke.mjs          → 79/79  (regression guard, untouched)
node verify/design_render.mjs          → 51/51  (new — see below)
```

### `verify/design_render.mjs` (new harness)

Mounts the **real App** in jsdom with the **real compiled CSS** (extracted from
`dist/index.html`, `@layer` flattened because jsdom can't evaluate layers) and a
mocked API, then walks the whole product:

- home hero BUY card (computed color = `rgb(0, 230, 118)`), AI/Structure/
  Sessions/EntryReason/Regime cards, INSTANT + SL/TP chips
- token unification: AI "Both Agree", structure "ALIGNED", history WIN badge
  all compute the same buy token; `:root` definitions resolve to the canonical
  hexes; server WR value = accent cyan
- `.label-caption` computes 10 px
- circuit-breaker card (COOLDOWN pill, suppressed SELL) and market-closed card
  (crypto CTA), entered/left through real UI interaction (pair picker)
- picker sheet has a real surface background; detail modal opens with P&L
- analysis tab (timeframe cards + indicator grid), history (server WR 55.6%,
  seeded WIN/PENDING rows), settings (worker health 17 keys), scanner, board

Dev dependency added for it: `jsdom` (+types). It is a test-only dependency;
nothing runtime changed.

---

## 4. Open / notes

- **Dead files** (`SignalHero`, `IndicatorGrid`, `TimeframeCard`, `BottomNav`,
  `HistoryView`, `AIInsights`, `SessionWidget`, `MaterialSignalCard`,
  `CountdownTimer`) still carry the old 4-green palette and iOS hexes. Wiring
  any of them up would reintroduce the inconsistency — migrate to `--c-*`
  first. Cleanup of the dead files themselves remains a non-goal.
- `dist/index.html` is the deployable single file; the repo root `index.html`
  is now the source entry. If a deploy pipeline copies the built file into the
  root, that step should be re-pointed at `dist/index.html` (or the copy made
  only at release time).
- jsdom computed styles return raw `var(--c-*)` for class-applied tokens (no
  var() resolution in stylesheet rules); the harness asserts the token is
  applied + the token resolves, which together prove the color.
