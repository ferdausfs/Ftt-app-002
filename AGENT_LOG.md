# AGENT_LOG

## 2026-07-29 — Phase 8: read the unified worker cache (NOT deployed)

### Scope
App-only. Base `97d8238`. 4 files: 2 modified, 1 new module, 1 test script.
574 insertions / 19 deletions. Backend untouched (Phase 7 cache already live).

### Live-verified first (§A.2) — spec was correct this time
All four A.2 curls matched: cache metadata complete (`cached`, `generatedAt`,
`generationAge`, `nextRefreshIn`, `generationId`, `stale`, `opportunistic`),
`preferCache=true` works, all-pairs list returns 14, and the four B5 fields
survive caching. Cache misses (USD/CHF, NZD/USD, EURUSD-OTC) answer 404 with
`scanned:false`, and `/api/signal` still serves them fresh.

**Measured `nextRefreshIn` before trusting it with the refresh timer.** Polled
BTC/USD every 15s for six minutes and caught two real cron boundaries: the
countdown reaches ~0 exactly as a new `generationId` appears (67->6 then new gen;
12 -> new gen). The field is reliable, so the auto-refresh loop is now driven by
it instead of a flat 60s tick.

### Changes
- `utils/signalCache.ts` (new) — routing, fallback, badge and timer maths as pure
  functions so they can be tested without a DOM. App.tsx stays one file.
- `App.tsx` — `fetchSignal(silent, forceFresh)`. Normal views call
  `fetchCachedSignal()` (`/api/signals/latest`); Force Refresh calls
  `fetchFreshSignal()` (`/api/signal`). Every Phase 5 guard is untouched:
  abort-and-supersede, monotonic seq, 25s timeout, conditional finally.
- Freshness pill with three states — cached ("Generated 47s ago · Next refresh in
  4m 13s" + short generationId), LIVE, and amber on-demand for a cache-miss
  fallback.
- Second toolbar button: 🔄 re-reads the cache, ⚡ forces an engine run.
- `useScanner.ts` — one `/api/signals/latest` read covers every scanned pair;
  anything uncovered (OTC, exotics) still goes through the existing `/api/batch`
  path, so scanner behaviour is unchanged for those.

### Two deliberate deviations from the spec sketch
- **Only 404 triggers the fresh fallback.** A 500 or a network error throws to the
  existing error UI. Falling back on any failure would have every view hammer the
  engine exactly when the backend is already unhealthy.
- **A 200 without a `signal` is treated as a miss** rather than rendered as an
  empty card.

### Subtle bug avoided
The auto-refresh effect used to reset `nextRefreshAtRef` to `now + 60000` on every
run. Leaving that would have silently erased the cron-synced schedule on each
re-render — the timer sync would have looked correct in code and behaved as a flat
60s poll in practice. The effect now only seeds the schedule when it is already in
the past.

### Verification
build pass · `tsc --noEmit` 0 errors · smoke **75/75** · bundle **+3.54 KB raw /
+0.99 KB gzip** (budget <10 KB). Smoke asserts routing URL-by-URL, the timer maths
against the measured values (253->256s, 0->8s floor, 99999->303s cap,
undefined/null/NaN/string->60s fallback), plus 8 Phase 5 and 4 Phase 6 regression
checks. Freshness pill rendered with compiled Tailwind: `verify/p8_pill.png`.

### Open
- A cache hit writes the cron's `id` into local history — intended (that is what
  makes App and Bot cross-verifiable), but it means one signal id can be reported
  from several devices; `/api/report` is last-write-wins.
- Auto-refresh is now effectively every 5 minutes rather than 60s, because that is
  how often the data actually changes. The countdown pill makes this visible.
- `preferCache=true` was deliberately not used: it hides whether a fallback
  happened, which would make the freshness badge lie.

---


## 2026-07-29 — Phase 6: Server Win Rate filters (pair scope + time range)

### Scope
- App-only. Base `28be83a`. Backend v6.9.2 untouched, nothing deployed/pushed.
- 4 files: 2 modified, 2 new (+1 test script). 912 insertions / 37 deletions.

### Two spec assumptions checked against live data first
- **`totalSignals` does NOT include UNKNOWN** (spec §3.1 said it does). Verified on
  all 13 pairs: `wins + losses == totalSignals` everywhere, because the worker's
  `updatePairStats` early-returns on UNKNOWN. No practical difference today; kept
  `wins + losses` as the WR denominator so it stays honest if that ever changes.
- **`/api/history` retains only 50 rows per pair and has no pagination.**
  `limit=100/200` still return 50; `offset`/`cursor`/`page`/`before` are all
  ignored. For busy pairs 50 rows spans ~24h (BTC 23.8h, ETH 22.3h, BNB 24.8h),
  so a "Last 7 Days" figure is unobtainable for 7 of 13 pairs — only 27% (185/683)
  of all decided signals are reachable through history at all. Shipping the count
  silently would have presented a truncated number as the truth.

### Changes
- `components/FilterChipRow.tsx` (new) — chip row per spec §4.1, plus `aria-pressed`
  and a disabled state.
- `utils/serverWr.ts` (new) — pure logic, testable without a DOM: defensive filter
  parsing, local-midnight / 168h cutoffs, all-pairs aggregation, windowed counting,
  and **coverage detection** (a pair at the 50-row cap whose oldest retained row is
  newer than the cutoff is flagged incomplete).
- `App.tsx` — four fetch routes keyed on (pairScope, timeRange):
  selected+all → `/api/stats?pair=X` (unchanged Phase 2 path);
  all+all → `/api/stats` aggregate; selected+window → one history call;
  all+window → `/api/stats` then ~13 parallel history calls.
  Adds a 5-minute per-view cache (spec §3.4) keyed by scope/pair/window that caches
  only successful results and is bypassed by manual retry; a selected-pair fallback
  when the All Pairs view fails; and a retry when ≥50% of the fan-out fails.
- Card renders aggregate vs per-pair via an `isAggregateStats()` guard, with a
  dynamic subtitle and an amber "At least N — server keeps only the 50 most recent
  signals per pair" note whenever coverage is incomplete. Confidence-adj is hidden
  outside the lifetime per-pair view, where it is the only meaningful reading.

### Verification
- build pass · `tsc --noEmit` 0 errors (it caught a real bug: I referenced
  `state.filter.window`, a property that does not exist).
- `scripts/phase6_smoke.mjs`: **79/79** — parsing, aggregation, cutoffs, payload
  shapes (Phase 5 regression guard), cap detection, subtitles, cache TTL/retry
  bypass, and six assertions that the Phase 5 fixes are still intact.
- Live 4-route validation against the real backend: all+all matches an independent
  recompute exactly (311W/372L, 45.5%); all+7d returns 79W/80L flagged incomplete
  for 6 pairs. Fan-out measured at 40-300ms, not the 1-2s the spec assumed.
- Chip row rendered with real React: 6/6. Screenshot in `verify/p6_ui.png`.

### Budget miss (reported, not hidden)
Bundle grew **+8.07 KB raw** against a <5 KB budget (gzip +2.62 KB, inside budget).
Measured split: ~7.3 KB core feature, ~0.6 KB truncation warning, ~0.4 KB cache.
Removed genuinely dead weight (`perPairBreakdown` was computed but never rendered,
−309 B); did not cut the truncation warning, since dropping it would still leave
7.7 KB and would make the feature dishonest.

### Open
- 7d truncation: shipped as a labelled lower bound. Alternatives are disabling the
  chip for busy pairs, or a backend change (larger retention / windowed stats endpoint).
- "All Time" comes from lifetime `/api/stats` counters while windows come from
  capped history — same card, two different data qualities.
- `src/types.ts` untouched: `ServerPairStats`/`ServerStatsState` live in App.tsx,
  not types.ts (spec §6 assumed otherwise), so the new types went beside them.


## 2026-07-28 — Phase 5 app bug-fix round (6 bugs + B5 display + circuit breaker UI)

### Scope
- App-only. Base `0c482a2`. Backend v6.9.2 untouched, nothing deployed/pushed.
- 8 files: 5 modified, 3 new, +1 test script. 835 insertions / 96 deletions.

### Three spec assumptions that were wrong live (checked by curl before coding)
- **`/api/history` returns an object, not an array** — `{pair, total, signals:[...]}`.
  The spec's polling snippet called `.find()` on it inside a `try/catch`, so
  PENDING rows would have silently never resolved. Handled by
  `extractHistoryRecords()` (accepts both shapes), locked with a smoke test.
- **`entrySource` IS on the `/api/signal` response** (top-level, verified
  `CACHE_PARTIAL`), so it is shown on the hero card too — the spec assumed it was
  history-only.
- **`SignalHero.tsx` / `MaterialSignalCard.tsx` / `HistoryView.tsx` are dead files** —
  zero imports; App.tsx redefines those components internally. Editing them per
  §3.7 would have shipped invisible changes. Badges went into App.tsx's live
  definitions; the orphan files were left alone (dead-file cleanup = non-goal).

### Changes
- **BUG #1** `fetchSignal`: early-return-on-in-flight → abort-and-supersede, plus a
  monotonic `fetchSeqRef` so only the newest request writes state, aborted older
  requests raise no user-visible error, and the spinner is released once. This was
  the "retry button does nothing" complaint.
- **BUG #2** timeouts: App 15s → **25s**; scanner both sites 12s → **20s**.
- **BUG #3** pair-switch race: kept the drop (correct), added `console.warn` + seq guard.
- **BUG #4** client-side auto WIN/LOSS checker **removed**. It called `/api/signal`
  (full generation + AI + quota) just to read a price, and handled only `due[0]`
  per 30s tick. Backend cron `*/2` + B0-3 retry ladder is now authoritative; the app
  reconciles from `/api/history` every 45s while the History tab is open. Manual
  WIN/LOSS reporting untouched. Rules: never overwrite a manual result, `UNKNOWN`
  stays PENDING, B5 fields backfilled without clobbering, same-reference return
  when nothing changed.
- **BUG #5** XAU/USD removed from scanner defaults, favourites and the PairSelector
  Commodities group (backend answers "Invalid pair"). Also added an
  `isSupportedPair` filter on favourites load — otherwise an existing user's stale
  localStorage entry would have kept the broken pair forever.
- **BUG #6** pair switch now clears `signalData`/`error` before refetching (no more
  5-8s of the previous pair's numbers under the new pair's name).
- **BUG #7** new `CircuitBreakerCard.tsx` for backend v6.9.2 cooldown: reason, live
  countdown, resume time, the suppressed direction (`wouldBeSignal`, logged
  server-side as a shadow row, not traded), and two safe alternatives. Precedence is
  market-closed > circuit-breaker > normal signal.
- **B5 display**: `coreConfidence` (shown only when it differs from displayed
  confidence by >=5), `structureVerdict.overall`, derived `aiStatus`, `entrySource` —
  on the hero card and on history rows, all optional so pre-upgrade localStorage
  entries render unchanged.
- **HealthPill.tsx** in Settings: `apiKeysLoaded` (17 live) + `quotaUsedToday`.
- **signalMeta.ts** (new): pure helpers extracted so they are testable without a DOM.
  Not an App.tsx refactor — that stays one file.

### Verification
- `npm run build` pass · `tsc --noEmit` 0 errors (strict).
- Bundle 305.35 → 316.57 kB raw (+11.22 kB), gzip 86.98 → 89.52 kB. Budget <20 KB: PASS.
- `scripts/phase5_smoke.mjs`: **53/53** — history payload shapes, reconciliation
  rules, aiStatus derivation (dual-AI + OTC), badge mapping, unsupported-pair
  filtering, the supersede model behind BUG #1, and the timeout budget.
  The suite caught a real miss: the scanner 12s → 20s change was not applied on the
  first pass.
- CircuitBreakerCard rendered with real React + compiled Tailwind: **11/11**
  (countdown format, expired → "Refreshing…" not negative time, invalid date
  fallback, muted pair never suggested as its own alternative). Screenshot in
  `verify/cb_card.png`.

### Open
- CB card never seen against live data — no pair is currently in cooldown. Forcing
  one means writing two real losses via `/api/report`, so it was not done.
- `/health` `rotationIdx` stays 0 across samples — looks like a backend KV
  `rr:idx` issue, not app-side. Worth a look in the next worker round.
- 45s history poll is more eager than the 120s worker cron; 60-90s would cut
  requests with little added latency.


## 2026-07-25 — Phase 2 scanner batching + server stats

### Scope
- App-only Phase 2 endpoint wiring.
- Implemented scanner `/api/batch` usage and History tab `/api/stats` server win-rate display.
- Did not wire `/api/history` or `/api/pairs`.
- Worker repo was not changed.

### Changes
- Reworked `src/hooks/useScanner.ts` so `scanAll()` chunks scanner pairs in groups of 3 and runs `/api/batch?pairs=...` calls in parallel instead of sequential single-pair calls.
- Added normalized pair matching for batch result keys so local keys like `EURUSD-OTC` can match worker-normalized keys like `EUR/USD-OTC`.
- Added fallback handling for missing, invalid, or skipped batch entries: invalid/skipped pairs fall back through the existing single-pair `/api/signal` flow, and full batch network failures mark every pair in that group as `error`.
- Preserved scanner notification de-dupe and consumed state behavior by sharing the same signal-result processing path for batch and single-pair fallback results.
- Added History tab server stats fetch for the currently selected pair only, and only while the History tab is active.
- Added a small Server Win Rate section labeled separately from local device-only history stats; failed/slow stats calls are caught and the server section is hidden without breaking the History tab.

### Verification
- Live default scanner chunks verified as 6 pairs → 2 batch calls instead of 6 sequential calls.
- Batch chunk 1 returned `HTTP/2 200`, `processedPairs: 3`, result keys `EUR/USD`, `GBP/USD`, `USD/JPY`.
- Batch chunk 2 returned `HTTP/2 200`, result keys `AUD/USD`, `EUR/USD-OTC`, and `invalidPairs: ['XAU/USD']`; invalid pairs are handled through fallback/single-pair error state instead of being silently dropped.
- Deliberate invalid batch `BTC/USD,NOTAPAIR,ETH/USD` returned `invalidPairs: ['NOTAPAIR']`, confirming invalid handling path.
- Deliberate 4-pair batch returned `skippedPairs: ['GBP/USD']`, confirming skipped-pair condition that the app falls back for if encountered.
- Live `/api/stats?pair=btcusd` returned `HTTP/2 200` with stats: `totalSignals: 283`, `wins: 127`, `losses: 156`, `winRate: 0.449`, `sampleSize: 20`, `dynamicConfidenceAdjustment: -5`.
- Live `/api/stats?pair=notapair` returned `HTTP/2 400`; app code treats non-OK stats responses as catchable failures and hides the server stats section.
- `npx tsc --noEmit` passed.
- `npm run build` passed and printed `✓ built in 2.69s`.

## 2026-07-25 — Premium Market Closed UI state

### Scope
- App-only UI update for valid worker responses where Forex is closed and `signal` is `null`.
- Worker repo was not changed.

### Changes
- Added market-closed response fields to `SignalData`: `message`, `nextOpen`, `nextOpenReadable`, `opensIn`, `advice`, and `cryptoAlternative`; `session` is optional because closed responses do not include session data.
- Updated `fetchSignal` so `marketStatus: 'CLOSED'` + `signal: null` is treated as a valid success response instead of throwing `Invalid response`.
- Guarded history-entry creation with `data.signal && ...` so closed responses cannot crash or create fake history entries.
- Added a premium `MarketClosedCard` with status, next-open time, `opensIn`, advice text, and a primary action button that extracts the crypto pair from `cryptoAlternative` and switches to `BTC/USD` fallback if needed.
- Kept the existing red error banner for real network, timeout, or malformed-response errors only.

### Verification
- Live EUR/USD check returned `HTTP/2 200`, `marketStatus: CLOSED`, `signal: null`, `opensIn: 1d 11h 1m`, and `cryptoAlternative: Try /api/signal?pair=BTC/USD`; this now renders the closed card path instead of the generic error path.
- Live BTC/USD check returned `HTTP/2 200`, `marketStatus: OPEN`, and a real signal object; this remains on the normal signal UI path.
- Invalid pair check returned `HTTP/2 400`, so `response.ok` remains false and the existing network/error banner path is preserved for real errors.
- `npx tsc --noEmit` passed.
- `npm run build` passed and printed `✓ built in 2.44s`.

## 2026-07-25 — Phase 3 app fixes: price fallback, API config, PWA icons

### Scope
- Phase 3 app-only fixes approved after Phase 1 live deployment.
- Worker repo was not changed in this phase.
- Unused duplicate components were reviewed only as a proposal item; no component wiring/deletion was done.

### Changes
- Fixed the auto WIN/LOSS checker in `src/App.tsx` so it only compares against a real recommendation entry price and no longer falls back to `bestTimeframe.score` as a fake price.
- Added shared `src/config.ts` with `API_BASE` and imported it from `src/App.tsx` and `src/hooks/useScanner.ts` to remove duplicated hardcoded API base constants.
- Regenerated all PWA manifest icon files from the existing 1024x1024 source icon at exact declared sizes: 72, 96, 128, 144, 152, 192, 384, and 512.

### Verification
- Confirmed the auto checker now uses `data.signal?.recommendations?.['1min']?.entry?.price ?? null`; when no price exists, the existing `currentPrice == null` guard skips result marking.
- Icon dimensions and file sizes were verified after regeneration.
- `npx tsc --noEmit` passed.
- `npm run build` passed and printed `✓ built in 2.71s`.

## 2026-07-25 — Phase 1 deployment/live verification close-out

### Deployment confirmation
- Worker commit range `783da63..b7df4b5` (workflow file added) is live on Cloudflare.
- Worker fix commit range `ca0afc6..783da63` is live on Cloudflare.
- App commit range `a3f0710..22b7b92` is live.

### Live verification copied from deployment check
```bash
curl -s "https://fttotcv6.umuhammadiswa.workers.dev/api/signal?pair=btcusd"
# → response contained "id": "sig_1784961540601_yhq50"

curl -s "https://fttotcv6.umuhammadiswa.workers.dev/api/report?id=sig_1784961540601_yhq50&result=WIN"
# → {"success":true,"signalId":"sig_...","pair":"BTC/USD","result":"WIN","message":"Result recorded. Stats updated."}
```

### Notes
- Worker repo now has `.github/workflows/deploy.yml`; future worker pushes auto-deploy through CI, so manual `wrangler deploy` is no longer required.
- Transparency note: during verification, real signal ID `sig_1784961540601_yhq50` was marked as `WIN`, so BTC/USD production win-rate stats include this one test result. This is minor production data pollution but should remain documented.

## 2026-07-25 — Phase 1 `/api/report` endpoint ID fix

### Scope
- Phase 1 only: fixed the worker/app signal ID mismatch that made `/api/report` return `404 Signal ID not found` for app-created history IDs.
- Phase 2 and Phase 3 items were not implemented.

### Worker repo: `Ftt-Otc-v6`
- Added signal ID generation in `src/handlers/signal.js` before building successful non-`NO_TRADE` signal responses.
- Included the generated worker ID in the signal response as top-level `id`.
- Passed the same ID into `saveSignalToHistory(...)`, so the response ID and KV history ID match.
- Updated `src/history/stats.js` so `saveSignalToHistory(signal, pair, isOTC, env, signalId)` stores the caller-provided ID and skips saving if no ID is provided.

### App repo: `Ftt-app-002`
- Added optional `id` / `signalId` fields to `SignalData`.
- Updated history entry creation to use `data.id || data.signalId` from the worker as `HistoryEntry.id`.
- Added local-only fallback IDs only when the worker returns no ID; those entries are marked `reportable: false`.
- Hid/disabled report buttons for local-only entries and showed a visible local-only warning.
- Replaced silent `/api/report` failures with `console.warn(...)` plus visible sync status/failure messages in the history row.
- Left scanner `signalKey` as a local notification de-dupe key and documented that it is intentionally not used for `/api/report`.

### Verification
- Worker JS syntax check passed with `node --check` for changed worker files.
- Local KV contract test passed: a generated `sig_...` ID was saved into history and `/api/report?id=<same-id>&result=WIN` returned `200` success through `handleReport`.
- App production build passed with `npm run build` and printed `✓ built in 2.74s`.

### Notes
- Live Cloudflare deployment was not performed from this workspace; no deployment credentials were available here.
- Live endpoint verification of the new response `id` should be run after deploying the worker changes.
