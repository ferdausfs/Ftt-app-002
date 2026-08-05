# CHANGES.md — Modular Refactor

> **Commit:** `53d49b6` (merge `ab25548` on main)
> **Date:** 2026-08-05

---

## Verification Proof

```bash
# tsc — 0 errors
npx -p typescript tsc --noEmit   # 0 errors

# Build — pass
npm run build                     # ✓ built in 2.65s, dist/index.html 354.18 kB

# GitHub push confirmed
git ls-remote origin HEAD         # ab25548cf8078686878a8b96c63545fe186d0e27
git ls-remote origin main         # ab25548cf8078686878a8b96c63545fe186d0e27
git ls-remote origin arena/019fd26f-ftt-app-002  # ab25548...

# Mode/Fill/SL-TP chips in dist DOM — confirmed
grep -o '⏱ FTT\|💹 FX\|🔄 BOTH\|⚡ INSTANT\|⏳ PENDING\|fill — not yet resolved\|SL \|TP ' dist/index.html
# ⏳ PENDING, TP, 💹 FX, 🔄 BOTH, ⏱ FTT, ⚡ INSTANT, fill — not yet resolved, SL — all present
```

---

## File-by-File Changes

### App.tsx: 1920 → 486 lines (-1434)
- All `function` components extracted to subdirectories
- State machine only: tab routing, derived state, handlers
- Imports 15 modular components + 3 hooks

### New: `src/lib/` (2 files)
| File | Lines | Purpose |
|---|---|---|
| `api.ts` | 82 | Typed API client: fetchSignal, fetchHistory, reportResult, fetchPairStats, fetchAllStats, fetchBatch |
| `formatters.ts` | 39 | Pure formatters: formatServerWinRate, getCryptoAlternativePair, formatTimeLabel, formatHourMinute |

### New: `src/hooks/` (4 files)
| File | Lines | Purpose |
|---|---|---|
| `useSignal.ts` | 240 | Signal state + fetch + history entries + auto-refresh loop |
| `useHistory.ts` | 90 | History reconciliation, polling, report/clear actions |
| `useServerStats.ts` | 195 | Server WR filter state + 4-route compute + cache |
| `useLocalStorage.ts` | 27 | Generic localStorage-backed useState |

### New: `src/components/signal/` (5 files)
| File | Lines | Purpose |
|---|---|---|
| `MaterialSignalCard.tsx` | 132 | Main signal hero card (moved from App.tsx) |
| `ConfidenceRing.tsx` | 33 | SVG confidence ring (moved from inline) |
| `ModeChip.tsx` | 18 | ⏱ FTT / 💹 FX / 🔄 BOTH chip |
| `FillBadge.tsx` | 27 | ⚡ INSTANT / ⏳ PENDING badge |
| `SltpChip.tsx` | 22 | SL / TP chips for FX/BOTH mode |

### New: `src/components/history/` (3 files)
| File | Lines | Purpose |
|---|---|---|
| `HistoryRow.tsx` | 111 | History list row with swipe-delete + WIN/LOSS buttons |
| `ServerStatsCard.tsx` | 100 | Server Win Rate card with Honesty UI |
| `StatCard.tsx` | 10 | Mini stat card (Total/Wins/Losses/Win%) |

### New: `src/components/settings/` (1 file)
| File | Lines | Purpose |
|---|---|---|
| `SettingRow.tsx` | 33 | Settings row with icon, toggle, value |

### New: `src/components/common/` (2 files)
| File | Lines | Purpose |
|---|---|---|
| `NavButton.tsx` | 31 | Bottom nav button with badge |
| `MarketClosedCard.tsx` | 64 | Market closed state card |

### New: `src/components/analysis/` (4 files)
| File | Lines | Purpose |
|---|---|---|
| `TimeframeCard.tsx` | 45 | Per-timeframe analysis card |
| `IndicatorGrid.tsx` | 68 | Technical indicator grid with TF switcher |
| `GaugeBar.tsx` | 21 | RSI/Stoch gauge bar |
| `MiniStat.tsx` | 10 | Mini stat tile |

---

## Features Preserved (none lost)

- ✅ Signal card — direction, confidence ring, grade, entry, expiry, HTF, regime, structure
- ✅ **Mode chip** — ⏱ FTT / 💹 FX / 🔄 BOTH (always visible, defaults when omitted)
- ✅ **Fill badge** — ⚡ INSTANT / ⏳ PENDING (with distance %) / "fill — not yet resolved" fallback
- ✅ **SL/TP chips** — SL + TP prices, risk:reward ratio (FX/BOTH modes only)
- ✅ Scanner — batch scanning, notifications, consumed state
- ✅ Board — dashboard view
- ✅ History — entry hit/miss, reconciliation, manual WIN/LOSS, swipe-delete, detail modal
- ✅ Analysis — multi-timeframe cards + indicator grid (RSI, Stoch, EMA, MACD, ADX)
- ✅ Settings — auto-refresh, signal mode, clear history, health pill
- ✅ Ticker — edge-fade marquee
- ✅ **Honesty UI** — n-backed win-rate, breakeven, no fake 75%, coverage warnings
- ✅ Market closed / circuit breaker states
- ✅ Pair picker with search + favorites
- ✅ Error boundary, a11y (focus-visible, aria-labels, reduced-motion)

---

## Architecture

```
src/
├── App.tsx                         # State machine (486 lines)
├── lib/                            # Framework-agnostic modules
│   ├── api.ts                      #   Typed API client
│   └── formatters.ts               #   Pure formatting functions
├── hooks/                          # Custom React hooks
│   ├── useSignal.ts                #   Signal fetch + history state
│   ├── useHistory.ts               #   History reconciliation + polling
│   ├── useServerStats.ts           #   Server WR filter compute + cache
│   ├── useLocalStorage.ts          #   Generic localStorage state
│   └── useScanner.ts               #   Scanner batch state machine
├── components/
│   ├── signal/                     #   Signal card + sub-components
│   │   ├── MaterialSignalCard.tsx  #     Hero card
│   │   ├── ConfidenceRing.tsx      #     SVG ring
│   │   ├── ModeChip.tsx            #     ⏱ FTT / 💹 FX / 🔄 BOTH
│   │   ├── FillBadge.tsx           #     ⚡ INSTANT / ⏳ PENDING
│   │   └── SltpChip.tsx            #     SL / TP
│   ├── history/                    #   History tab
│   │   ├── HistoryRow.tsx          #     Row with actions
│   │   ├── ServerStatsCard.tsx     #     Server WR + Honesty UI
│   │   └── StatCard.tsx            #     Mini stat
│   ├── settings/                   #   Settings tab
│   │   └── SettingRow.tsx          #     Row with toggle
│   ├── common/                     #   Shared across tabs
│   │   ├── NavButton.tsx           #     Bottom nav
│   │   └── MarketClosedCard.tsx    #     Market closed state
│   ├── analysis/                   #   Analysis tab
│   │   ├── TimeframeCard.tsx       #     Per-TF card
│   │   ├── IndicatorGrid.tsx       #     Indicators + TF switcher
│   │   ├── GaugeBar.tsx            #     RSI/Stoch bar
│   │   └── MiniStat.tsx            #     Mini stat tile
│   └── (existing)                  #   Other components preserved
├── utils/                          #   Pure logic (unchanged)
│   ├── cn.ts                       #     Tailwind merge
│   ├── notify.ts                   #     Browser notifications
│   ├── serverWr.ts                 #     WR filter logic
│   └── signalMeta.ts               #     AI status, badges, history
├── types.ts                        #   Domain types (unchanged)
└── config.ts                       #   API_BASE (unchanged)
```
