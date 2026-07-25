# AGENT_LOG

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
