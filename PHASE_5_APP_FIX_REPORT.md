# Ftt-app-002 — Phase 5 App Fix Report

> এই round-এ App-এ 6টা bug fix + backend v6.9.2-এর নতুন feature (B5 fields, circuit breaker) UI-এ expose করা হচ্ছে। User-এর "মাঝে মাঝে signal আসে না" complaint-এর ৪টা distinct root cause চিহ্নিত: (১) `fetchInFlightRef` lock-up যা retry button silently ignore করছিল, (২) 15s timeout mobile network + backend cold start-এর জন্য অপর্যাপ্ত, (৩) pair-switch stale data দেখায়, (৪) client-side auto WIN/LOSS checker unnecessarily `/api/signal` call করে quota burn করছিল। Backend v6.9.2 এখন authoritative result-resolution করছে, তাই client-side auto-checker deprecated। কোনো UX/performance guarantee দেওয়া হচ্ছে না — এই fixes-এর impact user-এর নিজের usage-এ verify করতে হবে।

**Base commit:** `0c482a2` · **Backend:** v6.9.2 (`fttotcv6.umuhammadiswa.workers.dev`)
**Deploy:** কিছুই deploy হয়নি — কোনো `vercel --prod`, `git push`, workflow trigger নেই (Part 7 verified)।
**Diff:** 8 files, **835 insertions / 96 deletions** (6 modified, 3 new)
**Verification:** `npm run build` pass · `tsc --noEmit` 0 errors · smoke **53/53** · CB card render **11/11** · bundle **+10.9 KB** (budget <20 KB)

---

## 1. ⚠ তিনটে spec assumption live-এ ভুল প্রমাণিত

Implement করার আগে backend-এ curl করে দেখেছি। তিনটে জায়গায় prompt-এর assumption বাস্তবের সাথে মেলেনি — spec অন্ধভাবে follow করলে দুটো feature **নীরবে fail** করত।

### 1.1 🔴 `/api/history` array না, object — spec-এর polling code কখনো কাজ করত না

Prompt §3.4-এর code:
```js
const workerRecords: Array<{...}> = await res.json();
const worker = workerRecords.find(w => w.id === local.id);   // ← .find on an object
```

আসল response:
```json
{ "pair": "BTC/USD", "total": 50, "showing": 2, "decided": 1,
  "pending": 1, "winRate": 0, "signals": [ { "id": "sig_...", "result": "WIN", ... } ] }
```

`.find` is not a function → `catch {}` → silent। PENDING row কোনোদিন resolve হতো না, কোনো error ছাড়াই। **Fix:** `extractHistoryRecords()` — `{signals:[...]}` এবং bare array দুটোই handle করে, smoke test দিয়ে locked।

### 1.2 🟢 `entrySource` response-এ আছেই — History tab-only restriction অপ্রয়োজনীয়

Prompt বলেছিল *"entrySource — can't show from /api/signal response; Show in History tab only"*। কিন্তু live response-এ top-level field হিসেবে আছে:
```
top-level keys: [... 'cacheHits', 'entrySource', 'dataStatus']
entrySource: CACHE_PARTIAL
```
Backend Phase B §3.2-এ এটা response contract-এ যোগ করা হয়েছিল। **তাই hero card-এও badge দেখানো হচ্ছে**, শুধু History-তে না — spec-এর চেয়ে বেশি, কিন্তু user-এর পক্ষে।

### 1.3 🔴 §3.7-এর তিনটে target file **dead code** — edit করলে কিছুই দেখা যেত না

Prompt §3.7 বলেছে `SignalHero.tsx` / `MaterialSignalCard.tsx` / `HistoryView.tsx` edit করতে। কিন্তু:

```
$ grep -rn "SignalHero|MaterialSignalCard|HistoryView" src --include=*.tsx | grep import
(0 hits)
```

App.tsx-এ কেবল `PairSelector` আর `ScannerView` import হয় — বাকি সব component **App.tsx-এর ভেতরে locally redefined** (`MaterialSignalCard` line ~1014, `HistoryRow` line ~1208)। `src/components/`-এর ওই ৫টা file orphan (prompt-এর "5 duplicate .tsx files" note-এর সাথে মিলে যায়)।

**Fix:** App.tsx-এর **live** definitions-এ badge বসিয়েছি। Dead file তিনটে ছুঁইনি — Part 2-এর "No dead-file cleanup" non-goal মেনে।

---

## 2. Fix list

| # | Bug | কী করেছি | File |
|---|---|---|---|
| 1 | `fetchInFlightRef` lock-up | early-return → **abort-and-supersede**; monotonic `fetchSeqRef` ঠিক করে কে state লিখতে পারবে | `App.tsx:150-175` |
| 2 | 15s timeout | App **25s**, scanner (দুই site) **20s** | `App.tsx:167`, `useScanner.ts:196,220` |
| 3 | pair-switch race | drop হলে `console.warn` + seq guard | `App.tsx:186-193` |
| 4 | client auto-checker | পুরো loop delete → History tab-এ `/api/history` reconciliation (45s) | `App.tsx:365-425` |
| 5 | XAU/USD | scanner default, favorites, PairSelector Commodities সরানো + **stale localStorage filter** | 3 files |
| 6 | pair-switch stale data | `setSignalData(null)` + `setError(null)` | `App.tsx:243-252` |
| 7 | cbShadow / NO_TRADE | নতুন `CircuitBreakerCard` + response wiring | `CircuitBreakerCard.tsx` (new) |
| — | B5 display | `coreConfidence` / `structureVerdict` / `aiStatus` / `entrySource` — hero + history | `App.tsx`, `signalMeta.ts` (new) |
| — | Health widget | Settings tab-এ worker health row | `HealthPill.tsx` (new) |

### BUG #1 — কেন abort-and-supersede

আগের code যেকোনো in-flight fetch-এ **সম্পূর্ণ early-return** করত: no spinner, no error, no request। User-এর কাছে button মরা লাগত। এখন পুরনোটা abort হয়ে নতুনটা দখল নেয়। তিনটে জিনিস সাথে দরকার ছিল, নাহলে নতুন bug:

- **seq guard** — দেরিতে আসা পুরনো response নতুন data overwrite করতে পারবে না
- **error suppression** — superseded request-এর `AbortError` user-কে "Request timed out" দেখাবে না (নাহলে প্রতিবার Retry-তে ভুয়া error flash করত)
- **conditional finally** — পুরনো request `loading=false` করে চালু request-এর spinner নিভিয়ে দিতে পারবে না

চারটে semantics smoke test-এ model করা আছে (`fetchSignal supersede model`)।

### BUG #4 — auto-checker কেন সরল

প্রতি check-এ `/api/signal` call হতো **শুধু current price পড়তে** — অর্থাৎ পুরো signal generation (candles + Cerebras + Groq + engine), TwelveData quota খরচ সহ। উপরন্তু per 30s tick শুধু `due[0]`, তাই ৫টা expired signal resolve হতে ১৫০s।

Backend v6.9.2 এখন cron `*/2` + B0-3 retry ladder দিয়ে authoritative resolve করে। App এখন display layer: History tab খোলা থাকলে ৪৫s অন্তর `/api/history` reconcile করে।

Reconciliation-এর নিয়ম (সব smoke-tested):
- manual result **কখনো** overwrite হয় না
- `UNKNOWN` (worker গিয়ে দিয়েছে) → row PENDING থাকে, user নিজে report করতে পারেন
- B5 field backfill হয়, কিন্তু local value থাকলে সেটাই থাকে
- কিছু না বদলালে **same array reference** return — অপ্রয়োজনীয় re-render নেই

Manual WIN/LOSS report flow (`reportSignalResult`) অক্ষত।

### BUG #5 — spec-এর চেয়ে একটু বেশি

Spec শুধু তিনটে list থেকে XAU সরাতে বলেছিল। কিন্তু **যে user-দের localStorage-এ আগে থেকেই `ftt_favorites: [...,"XAU/USD"]` আছে তাদের কিছুই ঠিক হতো না** — favourite টা রয়ে যেত, চাপলেই "Invalid pair"। তাই load-এ `isSupportedPair` filter যোগ করেছি (XAU/XAG/WTI/XPT/XPD)।

### BUG #7 — Circuit Breaker card

Backend trip করলে response-এ `circuitBreaker: {tripped, cooldownUntil, lossStreak, wouldBeSignal, cbShadow}` আসে। Card-এ: কারণ, live countdown, resume time, এবং **suppressed direction** (server-side shadow row হিসেবে logged, traded না) — সাথে দুটো safe alternative pair।

Precedence: **market-closed > circuit-breaker > normal signal**। CB tripped হলে normal card render হয় না, নাহলে user একই সাথে "NO_TRADE" card আর CB card দুটোই দেখতেন।

---

## 3. Verification

### 3.1 Build + types (Part 4.1, 4.5)
```
✓ 1763 modules transformed
dist/index.html  316.57 kB │ gzip: 89.52 kB   ✓ built in 2.74s
npx tsc --noEmit  →  0 errors  (strict: true)

baseline   : 305.35 kB raw / 86.98 kB gzip
this round : 316.57 kB raw / 89.52 kB gzip
delta      : +11.22 kB raw / +2.54 kB gzip   →  PASS (<20 KB budget)
```

### 3.2 Grep bans (Part 4.2, 4.3, Part 7)

| Check | Result |
|---|---|
| `15000` / `12000` timeouts | **0 hits** — now 25000 (App) / 20000 ×2 (scanner) |
| selectable `'XAU/USD'` / `'XAG/USD'` / `'WTI/USD'` | **0 hits** |
| `vercel --prod` / `git push` / `vercel deploy` | **0 hits** |
| `package.json` / `package-lock.json` diff | **empty** — no new deps |
| client auto-checker (`due[0]`, `checkExpired`) | **0 hits** — removed |

`XAU` literal-এর ৪টে hit বাকি: ৩টে comment, আর `UNSUPPORTED_PREFIXES` (stale-favourite filter)। কোনোটাই selectable pair না।

### 3.3 Smoke — 53/53 (`verify/smoke_output.txt`)

`node scripts/phase5_smoke.mjs` — DOM/network ছাড়া, real source থেকে helper import করে:

| Group | কী verify হলো |
|---|---|
| history payload | `{signals:[...]}` parse, bare array, null, garbage → সব safe |
| reconciliation | WIN/LOSS apply · UNKNOWN pending রাখে · manual result অক্ষত · B5 backfill · local value priority · reference stability |
| deriveAiStatus | dual-AI (BOTH_AGREE/AIs_DISAGREE/BOTH_UNAVAILABLE) + OTC (agree/disagree) + missing |
| badges | consensus/split/offline mapping, SKIPPED hidden |
| unsupported pairs | XAU/XAG/WTI reject (lowercase সহ), EUR/BTC/OTC keep, stale favourite filter |
| supersede model | abort-not-ignore · superseded writes nothing · newest wins · spinner once · no phantom error |
| timeout budget | 25s/20s present, 15s/12s absent, auto-checker gone, manual report retained |

### 3.4 CircuitBreakerCard — real React render, 11/11

কোনো pair এই মুহূর্তে cooldown-এ নেই, তাই mock payload দিয়ে `renderToStaticMarkup` করে যাচাই করেছি: heading, pair+streak, `3h 24m` countdown, COOLDOWN chip, suppressed SELL, alternatives, **muted pair নিজে suggest হয় না**, expired cooldown → "Refreshing…" (negative time না), invalid date → graceful fallback, handler ছাড়া button hidden।

Compiled Tailwind CSS দিয়ে screenshot নিয়ে visually confirm করেছি (`verify/cb_card.png`) — amber risk-control theme, Market Closed card-এর সাথে sibling।

### 3.5 Manual smoke checklist (Part 4.4) — user-এর device-এ যা দেখা উচিত

- [ ] Retry button in-flight fetch-এর মধ্যেও সাথে সাথে respond করে (spinner restart)
- [ ] Pair switch করলে পুরনো data সাথে সাথে চলে যায় (skeleton দেখায়, ভুল pair-এর number না)
- [ ] Settings tab-এ "Worker Health — 17 keys · quota N"
- [ ] Hero card-এ Structure / AI / Core / data-source badge
- [ ] History row-এ B5 line (পুরনো entry-তে থাকবে না — expected)
- [ ] History tab খোলা রাখলে PENDING → WIN/LOSS নিজে থেকে update (worker resolve করার পর, ≤45s)
- [ ] CB card — কোনো pair 2 loss খেলে (এখন live-এ trip করা নেই, তাই forced test দরকার)

---

## 4. Known limitations

1. **CB card live-এ verify করা যায়নি** — এই মুহূর্তে কোনো pair cooldown-এ নেই (`XRP/USD`, `DOGE/USD`, `DOT/USD` তিনটেই NO_TRADE কিন্তু `circuitBreaker: None`)। Mock payload + real React render দিয়ে verify করা, production data দিয়ে না।
2. **`rotationIdx` live-এ সবসময় 0** — তিনবার `/health` sample করে দেখেছি বদলায় না। Backend-এর দিকের observation (key rotation counter হয়তো advance করছে না), app-এর bug না। HealthPill তাই `apiKeysLoaded` + `quotaUsedToday` দেখায়, rotationIdx দেখায় না।
3. **History reconciliation শুধু History tab খোলা থাকলে** — এটা ইচ্ছাকৃত (quota + battery), কিন্তু মানে হলো tab না খুললে PENDING count stale থাকবে।
4. **`aiStatus` history-তে দুই source থেকে** — capture-এর সময় response থেকে, পরে `/api/history` backfill থেকে। Worker আর app একই derivation ব্যবহার করে, কিন্তু আলাদা codebase — drift করলে দুটো আলাদা string দেখাতে পারে।
5. **25s timeout একটা estimate** — backend p90 measure করা হয়নি Bangladesh mobile network থেকে। যদি এখনো timeout হয়, পরের round-এ মাপতে হবে, আন্দাজে বাড়ানো ঠিক হবে না।
6. **`signalMeta.ts` নতুন file** — App.tsx refactor না (non-goal), কিন্তু কিছু pure helper সরানো হয়েছে যাতে test করা যায়। App.tsx এখনো এক file, 1401 → ~1470 লাইন।
7. **Dead component files রয়ে গেছে** — `SignalHero.tsx` ইত্যাদি ৫টা orphan file untouched (non-goal)। মানে repo-তে এখন B5 badge-এর দুটো version: live (App.tsx) আর dead (components/)। Cleanup আলাদা round।

---

## 5. OPEN QUESTIONS

1. **§3.7-এর dead file তিনটে** — আমি App.tsx-এর live definition-এ badge বসিয়েছি। যদি আসল উদ্দেশ্য হয়ে থাকে "ওই component-গুলো আবার wire করা", সেটা আলাদা refactor round দরকার — এই round-এ App.tsx refactor explicitly non-goal ছিল।
2. **CB card force-test** — কোনো pair-এ ইচ্ছা করে 2 loss report করে (`/api/report?id=...&result=LOSS` ×2) card-টা production-এ দেখা যাবে। এটা live stats-এ real loss লিখে দেবে, তাই আমি চালাইনি। আপনি চাইলে throwaway pair-এ করা যায়।
3. **`rotationIdx` 0-তে আটকে** — backend issue মনে হচ্ছে (Phase B-তে KV `rr:idx` fire-and-forget লেখা হয়)। App-side scope না, কিন্তু পরের backend round-এ দেখার মতো।
4. **History poll interval 45s** — spec-এর number। Worker cron `*/2` (120s), তাই 45s poll কিছুটা over-eager; 60-90s করলে request কমত, resolution latency তেমন বাড়ত না।

---

## 6. Files

**Modified (5):** `src/App.tsx` · `src/types.ts` · `src/hooks/useScanner.ts` · `src/components/PairSelector.tsx`
**New (3):** `src/components/CircuitBreakerCard.tsx` · `src/components/HealthPill.tsx` · `src/utils/signalMeta.ts`
**Tooling (1):** `scripts/phase5_smoke.mjs`

Local reproduce:
```
npm install
npm run build
npx tsc --noEmit
node scripts/phase5_smoke.mjs
```
