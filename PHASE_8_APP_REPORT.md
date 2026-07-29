# Ftt-app-002 — Phase 8 Report — Cache Unification (App)

> এই round-এ App switches from per-user-view fresh engine calls to reading the unified worker cache (`/api/signals/latest`)। প্রতি 60s auto-refresh এখন cache read (0 backend credit) instead of a fresh engine run। User একই signal দেখবে যা Bot দেখবে (Phase 9 এলে), same `id`, same `generatedAt`, cross-verifiable। Force Refresh button retained for on-demand fresh generation। কোনো WR/accuracy change নেই — শুধু latency (~200ms cache-hit vs 5-8s fresh) + quota discipline (100 users viewing = 0 extra backend credit)।

**Base:** `97d8238` (Phase 6) · **Backend:** v6.9.2 + Phase 7 cache (live, verified)
**Deploy:** কিছুই না — no `vercel --prod`, no `git push`
**Diff:** 4 files, **574 insertions / 19 deletions** (2 modified, 1 new module, 1 test script)
**Verification:** build pass · `tsc --noEmit` 0 errors · smoke **75/75** · bundle **+3.54 KB** (budget <10 KB)

---

## 1. Live-verification (§A.2) — সব মিলেছে, একটা জিনিস মেপে দেখেছি

এবার spec-এর assumption গুলো **সঠিক** ছিল (Phase 5-এ ৩টা, Phase 6-এ ২টা, Phase 7-এ ৫টা ভুল পেয়েছিলাম — এবার শূন্য)। প্রতিটা curl করে যাচাই করেছি:

| Check | Result |
|---|---|
| `/api/signals/latest?pair=BTC/USD` shape | ✅ সব cache metadata আছে: `cached`, `generatedAt`, `generationAge`, `nextRefreshIn`, `generationId`, `stale`, `opportunistic` |
| `?preferCache=true` on `/api/signal` | ✅ `cached:true, forceRefresh:false, generationAge:209` |
| All-pairs list | ✅ `pairCount:14`, সব 14টা SCAN_PAIRS |
| 4টা B5 field cached signal-এ | ✅ `coreConfidence:98`, `structureVerdict:MIXED`, `aiValidation.combined`, `entrySource:CACHE_PARTIAL` |
| Cache miss (USD/CHF, NZD/USD, EURUSD-OTC) | ✅ HTTP 404 + `scanned:false` |
| Miss-এর পর `/api/signal` fallback | ✅ কাজ করে, `cached:false, forceRefresh:true` |

### 1.1 🔬 `nextRefreshIn` timer-sync-এর ভিত্তি — তাই মেপে দেখেছি

A.4.1 পুরো auto-refresh timer এই একটা field-এর উপর দাঁড় করায়। ভুল হলে App হয় খুব আগে poll করত (quota নষ্ট) নয় দেরিতে (বাসি data)। **৬ মিনিট ধরে ১৫s অন্তর poll করে দুটো আসল cron boundary ধরেছি:**

```
09:04:59  gid=...vng16f  age=233s  nextRefreshIn= 67s
09:05:59  gid=...vng16f  age=294s  nextRefreshIn=  6s
09:06:15  gid=...n87mbt  age= 16s  nextRefreshIn=284s   <-- NEW GENERATION
...
09:10:46  gid=...n87mbt  age=288s  nextRefreshIn= 12s
09:11:01  gid=...kecppo  age=  2s  nextRefreshIn=298s   <-- NEW GENERATION
```

**Countdown ঠিক ০-তে পৌঁছালেই নতুন `generationId` আসে।** Field নির্ভরযোগ্য, timer sync design সঠিক।

---

## 2. যা করা হলো

| # | Item | কী |
|---|---|---|
| A1 | normal view → cache | `fetchCachedSignal()` — `/api/signals/latest?pair=X` |
| A2 | force refresh → fresh | `fetchFreshSignal()` — `/api/signal?pair=X` |
| A3 | timer sync | `computeRefreshDelayMs(nextRefreshIn)` — server clock drives the loop |
| A4 | freshness pill | ৩টে state: cached / LIVE / on-demand |
| A5 | Force Refresh button | ⚡ icon পাশে, cache re-read আলাদা 🔄 |
| A6 | scanner | এক cache read সব covered pair-এ, বাকিরা batch fallback |
| A7 | types | `CachedSignalData` + `CacheMeta` |
| A8 | cache miss | 404 → auto-fallback fresh, amber "On-demand" label |

### 2.1 কেন `signalCache.ts` আলাদা module

Routing/fallback/timer maths পুরোটা pure function — DOM ছাড়াই test করা যায় (75টা assertion)। App.tsx এক file-ই আছে (§A.6 non-goal মানা)।

### 2.2 দুটো জায়গায় spec-এর চেয়ে সতর্ক হয়েছি

**(ক) শুধু 404-এ fallback, অন্য error-এ না।** Spec §A.4.3-এ `else throw` ছিল — সেটাই রেখেছি। ৫০০ বা network error-এ fresh generation চালালে backend down থাকলে App প্রতিটা view-তে engine hammer করত। এখন 500 → error UI, 404 → fallback।

**(খ) `signal`-হীন 200-ও miss ধরা হয়।** Worker কোনোদিন `{cached:true}` কিন্তু signal ছাড়া ফেরত দিলে card খালি render হতো। এখন সেটা fallback trigger করে।

### 2.3 Auto-refresh loop — একটা সূক্ষ্ম bug এড়ানো

পুরনো effect প্রতিবার `nextRefreshAtRef.current = Date.now() + 60000` reset করত। ওটা রেখে দিলে fetch-এর সেট করা cron-synced schedule **প্রতি re-render-এ মুছে যেত**, আর timer sync কাগজে-কলমে কাজ করেও বাস্তবে ৬০s-এ ফিরে যেত। এখন effect শুধু schedule **অতীত হলে** সেট করে।

---

## 3. Verification

### 3.1 Build + types + size
```
✓ 1768 modules transformed
dist/index.html  328.55 kB │ gzip: 93.01 kB   ✓ built in 2.90s
npx tsc --noEmit → 0 errors (strict)

baseline 324,924 B raw / 91,999 gzip
phase 8  328,554 B raw / 93,008 gzip
delta    +3,630 B (+3.54 KB) raw / +1,009 B (+0.99 KB) gzip   → PASS (<10 KB)
```

### 3.2 Smoke — 75/75 (`verify/smoke_output.txt`)

Routing (URL-by-URL assert: cache hit = ১টা request, `/api/signal` কখনো ছোঁয়া হয় না; 404 = cache তারপর fresh; 500 = throw; signal-হীন 200 = fallback) · Force Refresh cache পড়ে না · badge ৩ state + missing-age graceful · countdown formatting (47s / 4m / 4m 13s / negative / non-numeric) · **timer sync আসল মাপা মান দিয়ে** (253→256s, 92→95s, 0→floor 8s, 99999→cap 303s, undefined/null/NaN/string→60s) · scanner lookup · Phase 5 ৮টা + Phase 6 ৪টা regression · bans।

### 3.3 UI render
তিনটে freshness state compiled Tailwind দিয়ে render করে screenshot নিয়েছি (`verify/p8_pill.png`) — cyan "Generated 47s ago · Next refresh in 4m 13s · vng16f", red "LIVE — just generated", amber "On-demand — pair not in scheduled scan"।

---

## 4. Known limitations

1. **Cache hit-এ `id` cron-এর signal-এর** — App এখন সেই `id` history-তে লিখবে, যেটা Bot-ও দেখবে (এটাই উদ্দেশ্য)। কিন্তু মানে হলো একই signal একাধিক device-এ একই `id`-তে report হতে পারে; worker-এর `/api/report` last-write-wins।
2. **History dedup এখন cache cycle-নির্ভর** — একই `generationId` ৫ মিনিট ধরে সবাইকে পরিবেশিত হয়, তাই App-এর existing `if (prev.find(h => h.id === historyId))` guard-ই যথেষ্ট; কিন্তু ৫ মিনিটে একটার বেশি history row আর তৈরি হবে না per pair। আগে প্রতি 60s refresh-এ নতুন id আসত।
3. **Scanner-এর cache pass একটা extra request** — covered pair না থাকলে (সব OTC watchlist) একটা বাড়তি round trip, তারপর আগের মতোই batch। Negligible কিন্তু শূন্য না।
4. **Force Refresh rate-limited** — `/api/signal` worker-এ rate-limited (30/min)। বারবার ⚡ চাপলে 429 আসতে পারে; existing error UI দেখাবে।
5. **`stale` field ব্যবহার করা হয়নি** — worker 404 দিয়েই stale entry আটকায়, তাই client-side check অপ্রয়োজনীয়। Field type-এ আছে ভবিষ্যতের জন্য।

---

## 5. OPEN QUESTIONS

1. **Cache hit-এ history entry লেখা উচিত কি?** এখন লেখে (আগের behaviour অপরিবর্তিত)। কিন্তু cached signal ৫ মিনিট একই — মানে user App খুললেই ওই একই signal history-তে যোগ হবে, যদিও সে "নতুন trade" নেয়নি। Worker নিজেও scan-এ history লেখে (Phase 7), তাই **সম্ভাব্য duplicate**: worker-এর row আর App-এর row একই `id` → App-এর guard ধরবে, কিন্তু শুধু যদি id মেলে। যাচাই করেছি — মেলে। তবু নজরে রাখার মতো।
2. **`preferCache=true` ব্যবহার করিনি** — `/api/signals/latest` সরাসরি পড়ছি, কারণ ওটা explicit আর 404 দিয়ে miss জানায়। `preferCache` একই কাজ করে কিন্তু miss-এ নিজেই engine চালায়, তাই client জানতে পারত না যে fallback হয়েছে (badge ভুল হতো)। ইচ্ছাকৃত।
3. **Auto-refresh এখন ৫ মিনিটে একবার** (আগে ৬০s)। Cache ৫ মিনিটেই বদলায়, তাই বেশি poll অর্থহীন — কিন্তু user-এর কাছে "কম live" মনে হতে পারে। Countdown pill সেটা explicit করে।

---

## 6. §C.3 post-deploy check

Deploy-এর পর App History tab-এ সর্বশেষ BTC/USD entry-র `id` আর এটার output মিলবে:
```
curl -s ".../api/signals/latest?pair=BTC/USD" | jq -r '.id'
```
মিললে App-side unification সম্পূর্ণ।

Local reproduce:
```
npm install && npm run build && npx tsc --noEmit && node scripts/phase8_smoke.mjs
```
