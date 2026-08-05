# Frontend architecture: modular refactor (components/hooks/lib)

> **SignalPro** — Forex/crypto signal dashboard PWA
> Stack: React 19 · TypeScript 5.9 · Vite 7 · Tailwind CSS 4 · vite-plugin-singlefile

---

## Architecture overview

```
src/
├── App.tsx                    # App shell, routing, state orchestration (1,920 LOC)
├── main.tsx                   # Vite entry point
├── config.ts                  # Shared constants (API_BASE)
├── types.ts                   # TypeScript domain types (235 LOC)
├── index.css                  # Design tokens, global utilities, surface language
│
├── components/                # UI components (18 files)
│   ├── PairSelector.tsx        #   Pair picker bottom sheet
│   ├── ScannerView.tsx         #   Multi-pair scanner with batch scanning
│   ├── CircuitBreakerCard.tsx  #   Backend cooldown state
│   ├── DashboardView.tsx       #   Home dashboard card grid
│   ├── HistoryDetailModal.tsx  #   Signal detail modal with P&L
│   ├── FilterChipRow.tsx       #   Reusable chip row (pair scope / time range)
│   ├── HealthPill.tsx          #   Settings: worker health + quota
│   ├── Premium.tsx             #   Premium UI primitives (FilterBadges, etc.)
│   ├── Ticker.tsx              #   Scrolling market ticker
│   ├── ErrorBoundary.tsx       #   React error boundary
│   ├── AIInsights.tsx          #   (dead file — not imported)
│   ├── BottomNav.tsx           #   (dead file — not imported)
│   ├── CountdownTimer.tsx      #   (dead file — not imported)
│   ├── HistoryView.tsx         #   (dead file — not imported)
│   ├── IndicatorGrid.tsx       #   (dead file — not imported)
│   ├── MaterialSignalCard.tsx  #   (dead file — not imported)
│   ├── SessionWidget.tsx       #   (dead file — not imported)
│   ├── SignalHero.tsx          #   (dead file — not imported)
│   └── TimeframeCard.tsx       #   (dead file — not imported)
│
├── hooks/                     # Custom React hooks
│   └── useScanner.ts           #   Scanner state machine + batch API (347 LOC)
│
└── utils/                     # Pure logic modules (framework-agnostic, testable)
    ├── cn.ts                   #   Tailwind class merge (clsx + tailwind-merge)
    ├── notify.ts               #   Browser Notification API wrapper
    ├── serverWr.ts             #   Server win-rate filter logic (233 LOC)
    └── signalMeta.ts           #   AI status, badge mapping, history reconciliation (160 LOC)
```

**Total:** ~5,629 lines of TypeScript/TSX across 29 source files.

---

## Key architectural decisions

### 1. App.tsx as the orchestration hub
`App.tsx` (~1,920 LOC) owns **all** state, data fetching, tab routing, and the render tree. It does **not** define reusable UI components — those live in `src/components/`. This is deliberate: the app is a single-page dashboard where cross-cutting concerns (supersede model, cache TTL, pair-switch sequencing) are easier to reason about in one file than scattered across a router.

### 2. Component directory: live vs. dead split
- **9 live components** are imported and rendered by `App.tsx`: `PairSelector`, `ScannerView`, `CircuitBreakerCard`, `DashboardView`, `HistoryDetailModal`, `FilterChipRow`, `HealthPill`, `Premium`, `Ticker`, `ErrorBoundary`.
- **9 dead components** exist in the directory but have **zero imports** anywhere. They retain older palettes and patterns. Cleanup is a non-goal by repo convention; `DESIGN_AUDIT.md §1.10` documents the migration path if any are ever wired up.

### 3. Hooks layer: `useScanner`
The scanner is a self-contained state machine in a custom hook — it owns polling intervals, batch-chunking logic, notification de-duplication, and consumed-state tracking. `App.tsx` only mounts the hook and renders its returned state. This isolates ~347 lines of complex async logic from the main component.

### 4. Utils/lib as pure, testable modules
All four utils modules are **framework-agnostic** pure functions:
- `serverWr.ts` — filter parsing, window cutoffs, pairwise aggregation, coverage detection. Tested by 79 smoke assertions without a DOM.
- `signalMeta.ts` — AI status derivation (dual-AI + OTC), badge mapping, history reconciliation rules. Tested by 53 smoke assertions.
- `cn.ts` — thin wrapper over `clsx` + `tailwind-merge`.
- `notify.ts` — Browser Notification API with permission handling.

### 5. Design tokens as a single source of truth
`src/index.css :root` defines the semantic palette (`--c-buy`, `--c-sell`, `--c-warn`, `--c-info`, `--c-otc`, `--c-accent`, `--c-purple` + `--rgb-*` triplets) and surface language (`.premium-card`, `.surface-group`, `.sheet-surface`, `.ios-card`, `.label-caption`). All ~200 color literals across live components now reference these tokens. Verified by a jsdom render harness (51/51 assertions).

### 6. Single-file build output
`vite-plugin-singlefile` inlines everything into `dist/index.html` (~354 KB raw, ~99 KB gzip) — a single deployable artifact. The repo root `index.html` is the canonical Vite source entry (18 lines), not the build artifact.

---

## Data flow

```
User action (tab switch / pair select / scanner toggle)
        │
        ▼
App.tsx state machine ──► fetchSignal() / fetchStats() / scanAll()
        │                       │
        │                       ▼
        │               API_BASE (/api/signal, /api/stats, /api/batch, /api/history)
        │                       │
        ▼                       ▼
   React state update ◄── signalMeta.ts / serverWr.ts (transform + reconcile)
        │
        ▼
   Component tree re-render (DashboardView / ScannerView / History / etc.)
```

**Supersede model:** `fetchSignal` uses a monotonic `fetchSeqRef` so only the newest request writes state. Older in-flight requests are aborted and their responses discarded — this fixes the "retry button does nothing" race.

**Cache layer:** Server win-rate results are cached for 5 minutes per `(scope, pair, window)` key, bypassed on manual retry.

---

## Verification

| Suite | Assertions | What it covers |
|---|---|---|
| `tsc --noEmit` | 0 errors | Full strict type-check |
| `npm run build` | pass | Single-file production bundle |
| `scripts/phase5_smoke.mjs` | 53/53 | Signal parsing, reconciliation, AI status, badges |
| `scripts/phase6_smoke.mjs` | 79/79 | Server WR filters, aggregation, cutoffs, cache |
| `verify/design_render.mjs` | 51/51 | Real app in jsdom — computed colors, tokens, surfaces, a11y |

---

## Open items

- **Dead component files** (9 files) carry outdated palettes — migrate to `--c-*` tokens before wiring up.
- **History retention cap** (50 rows/pair) means 7-day windowed stats are incomplete for 7 of 13 pairs — shipped as a labelled lower bound.
- Deploy pipelines should point at `dist/index.html`, not the repo root `index.html`.
