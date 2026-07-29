# Ftt-app-002 — Phase 6 Report — Server Win Rate Filters

> এই round-এ Server Win Rate card-এ ২টা filter যোগ করা হচ্ছে: **Pair scope** (All Pairs / Selected Pair) এবং **Time range** (All Time / Today / Last 7 Days)। Backend v6.9.2-এ কোনো change লাগেনি — `/api/stats` (no pair) দিয়ে All Pairs aggregate এবং `/api/history?pair=X&limit=50` দিয়ে date-window derivation করা হচ্ছে। কোনো accuracy improvement claim না — এটা শুধু বিদ্যমান data-কে filterable করার UI feature। "All Pairs + Today/7d" combination-এ 13 parallel history fetch লাগে (~1-2s spinner), যা user-initiated filter change-এ acceptable, কিন্তু heavy background polling হিসাবে না।

**Base commit:** `28be83a` (Phase 5) · **Backend:** v6.9.2, unchanged
**Deploy:** কিছুই deploy হয়নি — no `vercel --prod`, no `git push` (Part 8 verified)
**Diff:** 4 files, **912 insertions / 37 deletions** (2 modified, 2 new)
**Verification:** build pass · `tsc --noEmit` 0 errors · smoke **79/79** · chip render **6/6** · live 4-route validation pass

---

## 1. ⚠ দুইটা spec assumption live-এ ভুল — একটা feature-এর honesty-তে হাত দেয়

Phase 5-এর মতোই code লেখার আগে backend-এ curl করেছি।

### 1.1 🟡 `totalSignals` UNKNOWN **include করে না** — spec §3.1 ভুল

Spec বলেছিল: *"`totalSignals` field in each pair also includes UNKNOWN"*। ১৩টা pair-এই মিলিয়ে দেখলাম:

```
SOL/USD    wins=11   losses=5    totalSignals=16   wins+losses=16
BTC/USD    wins=183  losses=208  totalSignals=391  wins+losses=391
...
pairs where totalSignals != wins+losses: 0 / 13
```

কারণ worker-এর `updatePairStats` UNKNOWN-এ early-return করে, তাই UNKNOWN কখনো stats-এ ঢোকেই না। **Impact:** এই round-এ practical পার্থক্য নেই (দুটো সংখ্যা identical), কিন্তু spec-এর "decided-only prefer করো" সিদ্ধান্তটা আমি রেখেছি — `wins + losses` ব্যবহার করছি, যাতে worker ভবিষ্যতে UNKNOWN count করা শুরু করলেও WR denominator সৎ থাকে।

### 1.2 🔴 `/api/history` মাত্র ৫০ row রাখে + pagination নেই → **"Last 7 Days" ১৩টার মধ্যে ৭টা pair-এ অসম্পূর্ণ**

এটাই এই round-এর আসল আবিষ্কার। Spec ধরে নিয়েছিল `limit=50` দিয়ে window cover হবে। বাস্তবে:

```
$ limit=50 -> 50 rows | limit=100 -> 50 rows | limit=200 -> 50 rows      (hard cap)
$ ?offset=50 / ?cursor=1 / ?page=2 / ?before=... -> সবগুলো ignored        (no pagination)
```

Worker `MAX_SIGNALS_PER_PAIR = 50` রাখে, তাই busy pair-এ ৫০ row মানে **অল্প কয়েক ঘণ্টা**:

| pair | rows | oldest retained | 7d cover? |
|---|---:|---|---|
| BTC/USD | 50 | 23.8h ago | ❌ TRUNCATED |
| ETH/USD | 50 | 22.3h ago | ❌ TRUNCATED |
| BNB/USD | 50 | 24.8h ago | ❌ TRUNCATED |
| EUR/USD | 50 | 106.7h ago | ❌ TRUNCATED |
| SOL/USD | 13 | 226h ago | ✅ complete |

**সব decided signal-এর মাত্র 27.1% (185/683) history দিয়ে reachable।**

**Impact:** "All Pairs + Last 7 Days" চাইলে সত্যিকারের সংখ্যা পাওয়া **অসম্ভব** — backend change ছাড়া। Spec এটা ধরেনি, আর চুপচাপ implement করলে card একটা truncated সংখ্যা এমনভাবে দেখাত যেন সেটাই সত্য।

**আমি যা করেছি:** সংখ্যাটা দেখাচ্ছি, কিন্তু **lower bound হিসেবে label করে**। `countWindowed()` detect করে pair টা cap-এ আছে কিনা **এবং** তার oldest retained row cutoff-এর পরে কিনা — দুটোই সত্য হলে window-এর ভেতরের row evict হয়ে গেছে। তখন card-এ amber note:

> **At least 159** — the server keeps only the 50 most recent signals per pair, so older results inside this window are no longer retrievable (EUR/USD, BTC/USD, BNB/USD +3 more).

Pair টা cap-এর নিচে থাকলে, বা oldest row cutoff-এর আগের হলে, count exact — তখন কোনো warning নেই। "Today" window-এ **কোনো pair truncate হয় না**, তাই ওই view পুরো নির্ভরযোগ্য।

---

## 2. কী বানানো হলো

| Item | File | কী |
|---|---|---|
| Chip row | `components/FilterChipRow.tsx` (new) | spec §4.1 অনুযায়ী, সাথে `aria-pressed` + disabled state |
| Filter logic | `utils/serverWr.ts` (new) | parse/persist, cutoff, aggregation, windowed count, coverage detection |
| Orchestration | `App.tsx` | ৪-route state machine, 5-min cache, fallback, retry |
| Card branching | `App.tsx` `ServerStatsCard` | aggregate vs per-pair, dynamic subtitle, coverage warning |
| Types | `App.tsx` | `ServerAggregateStats` + `isAggregateStats()` guard |

### 2.1 চারটে route

| Filter | Endpoint | Requests |
|---|---|---|
| selected + all | `/api/stats?pair=X` | 1 (অপরিবর্তিত Phase 2 path) |
| all + all | `/api/stats` | 1 |
| selected + today/7d | `/api/history?pair=X&limit=50` | 1 |
| all + today/7d | `/api/stats` → per-pair history | 1 + 13 parallel |

### 2.2 Spec-এর চেয়ে বেশি যা করেছি (কারণসহ)

- **Coverage detection + warning** (§1.2) — নাহলে "7 Days" মিথ্যা বলত
- **`parseServerWrFilter()` defensive** — localStorage-এ পুরনো/hand-edited value থাকলে History tab crash করত; unknown value silently default-এ পড়ে
- **`isSupportedPair` filter** pair list-এ — Phase 5-এ XAU সরানো হয়েছে, কিন্তু `/api/stats` এখনো পুরনো pair ফেরত দিতে পারে; fan-out যেন সেগুলোতে request না করে
- **5-min view cache** (spec §3.4 চেয়েছিল, "ref/state" বলেছিল) — `filterCacheKey` দিয়ে keyed, শুধু **সফল** result cache হয়, manual retry bypass করে
- **Timeout budget route-ভিত্তিক** — fan-out route-এ 20s, single-request route-এ 10s

### 2.3 Phase 5 fixes অক্ষত

Smoke test আলাদা করে assert করে: 25s signal timeout, scanner 20s ×2, CB card, health pill, `reconcileHistory`, XAU filter — ৬টাই intact।

---

## 3. Verification

### 3.1 Build + types
```
✓ 1766 modules transformed
dist/index.html  324.88 kB │ gzip: 92.23 kB   ✓ built in 2.83s
npx tsc --noEmit  →  0 errors (strict)
```

`tsc` একটা আসল bug ধরেছে — আমি `state.filter.window` লিখেছিলাম, যে property `ServerWrFilter`-এ নেই।

### 3.2 ⚠ Build size — budget miss, reported

| | raw | gzip |
|---|---:|---:|
| baseline `28be83a` | 316,616 B | 89,293 B |
| Phase 6 | 324,877 B | 91,980 B |
| **delta** | **+8,261 B (+8.07 KB)** | **+2,687 B (+2.62 KB)** |

**Spec budget ছিল <5 KB। Raw delta তার প্রায় দ্বিগুণ।** লুকাচ্ছি না। Measured breakdown (প্রতিটা টুকরো বাদ দিয়ে build করে):

- **~7.3 KB** core feature — ৪-route orchestration, aggregation, chip row, card branching, error/fallback/retry
- **~0.6 KB** truncation warning (§1.2)
- **~0.4 KB** 5-min cache (spec §3.4)

Budget মেলাতে কিছু **কাটিনি**, কারণ কাটার মতো একমাত্র জিনিস ছিল truncation warning (0.6 KB) — সেটা বাদ দিলেও 7.7 KB, তবু over, আর feature-টা তখন মিথ্যা বলত। তবে সত্যিকারের dead weight সরিয়েছি: `perPairBreakdown` compute হচ্ছিল কিন্তু কোথাও render হতো না (**−309 B**)।

Gzip delta **+2.62 KB** — যা আসলে wire-এ যায় — budget-এর ভেতরে।

### 3.3 Smoke — 79/79 (`verify/smoke_output.txt`)

filter parsing (malformed/unknown/null) · aggregation (string coercion, empty, zero-decided → 0 not NaN) · cutoffs (local midnight, exact 168h) · payload shapes (object/array/null/garbage — Phase 5 regression guard) · **cap detection** (at-cap+recent = incomplete, below-cap = complete, at-cap+old = complete) · subtitles ৬টা combination · **cache** (TTL hit/expiry, key separation, retry bypass) · Phase 5 survival ৬টা।

### 3.4 Live 4-route validation

শিপ করা helper-গুলো **সত্যিকারের backend data**-য় চালিয়ে independent recompute-এর সাথে মিলিয়েছি:

```
all + all : helper 311W 372L WR=45.5%  |  independent 311W 372L WR=45.5%  MATCH
all + today: 17W 20L WR=45.9% decided=37   coverage complete: true
all + 7d   : 79W 80L WR=49.7% decided=159  coverage complete: false
             truncated: EUR/USD, BTC/USD, BNB/USD, ETH/USD, USD/JPY, GBP/USD
selected(EUR/USD) + today: 3W 1L complete=true
selected(EUR/USD) + 7d   : 6W 7L complete=false
```

**Fan-out cost বাস্তবে 40-300ms**, spec-এর অনুমান 1-2s। ১৩টা request parallel + worker-side cached।

### 3.5 UI render
Chip row real React-এ render করে 6/6 assertion pass (accent fill, outline, `aria-pressed` দুই দিক, labels)। Compiled Tailwind দিয়ে screenshot: `verify/p6_ui.png` — chips + truncated 7d card + normal per-pair card।

---

## 4. Known limitations

1. **"Last 7 Days" busy pair-এ lower bound** — §1.2। UI বলে দেয়, কিন্তু সত্যিকারের সংখ্যা backend change ছাড়া পাওয়া যাবে না।
2. **"All Time" per-pair vs windowed inconsistent source** — All Time `/api/stats` (lifetime counter, exact) থেকে, window `/api/history` (৫০-row cap) থেকে। তাই "All Time = 683" কিন্তু "7 Days = 159" — একই ধরনের সংখ্যা না, যদিও পাশাপাশি দেখায়।
3. **Fan-out cache in-memory only** — page reload-এ যায়। localStorage-এ রাখলে stale WR দেখানোর ঝুঁকি, তাই ইচ্ছাকৃত।
4. **`/api/stats` pair list-নির্ভর** — কোনো pair-এর stats entry না থাকলে fan-out-এ আসবে না, যদিও history থাকতে পারে।
5. **Timezone** — "Today" browser-এর local midnight (user Asia/Riyadh, UTC+3), কিন্তু worker timestamp UTC। ঠিকই আছে, তবে UTC+3-এ "today" মানে UTC-র আগের দিন 21:00 থেকে।
6. **`retryable` fan-out-এ partial failure হলেও set হয়** — ১টা pair fail করলেও Retry দেখায়, যদিও সংখ্যা মোটামুটি ঠিক।

---

## 5. OPEN QUESTIONS

1. **7d truncation — কীভাবে সমাধান চান?** তিনটে পথ: (ক) এখনকার মতো lower-bound label, (খ) busy pair-এ "7 Days" chip disable, (গ) backend-এ `MAX_SIGNALS_PER_PAIR` বাড়ানো বা windowed-stats endpoint (Phase B scope)। আমি (ক) shipped করেছি কারণ এটা কিছু ভাঙে না আর সৎ।
2. **Build size 8.07 KB (budget 5 KB)** — accept করবেন, নাকি truncation warning/cache বাদ দিয়ে ছোট করব? আমার সুপারিশ: accept — gzip 2.62 KB, আর কাটলে feature কম সৎ হবে।
3. **"All Time" আর window-এর source আলাদা** (§4.2) — card-এ এটা explicit বলা উচিত কিনা, নাকি বর্তমান subtitle যথেষ্ট।
4. **Pair chip শুধু ২টা option** — spec অনুযায়ী All / selected। Favourites (৩টা pair) scope চাইলে পরের round।

---

## 6. Files

**Modified (2):** `src/App.tsx` · `scripts/` (new dir)
**New (3):** `src/components/FilterChipRow.tsx` · `src/utils/serverWr.ts` · `scripts/phase6_smoke.mjs`

`src/types.ts` **ছোঁয়া হয়নি** — spec §6 বলেছিল types ওখানে যোগ করতে, কিন্তু `ServerPairStats`/`ServerStatsState` আসলে `App.tsx`-এ locally defined (Phase 5-এ verified, `types.ts`-এ নেই)। তাই নতুন type সেখানেই রেখেছি যেখানে পুরনোগুলো আছে — অন্যথায় একই concept দুই file-এ ভাগ হয়ে যেত।

Local reproduce:
```
npm install
npm run build
npx tsc --noEmit
node scripts/phase6_smoke.mjs
```
