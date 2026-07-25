# AGENT_LOG

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
