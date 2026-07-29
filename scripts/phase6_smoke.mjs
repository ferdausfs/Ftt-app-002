/**
 * Phase 6 smoke tests — node scripts/phase6_smoke.mjs
 *
 * Covers the Server Win Rate filter logic:
 *   - filter persistence / defensive parsing
 *   - All Pairs aggregation maths
 *   - date-window cutoffs (local midnight, 168h)
 *   - /api/history payload shape tolerance (Phase 5 regression guard)
 *   - the 50-row retention cap that makes windowed counts a lower bound
 *
 * No DOM, no network. Helpers are imported from the real source.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; failures.push(name); console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
function eq(name, a, b) {
  ok(name, JSON.stringify(a) === JSON.stringify(b),
     'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}
function close(name, a, b, tol = 1e-9) {
  ok(name, Math.abs(a - b) <= tol, 'expected ~' + b + ', got ' + a);
}

// ── load real TS helpers (types erased, imports resolved manually) ─────
const cache = new Map();
function loadModule(relPath) {
  if (cache.has(relPath)) return cache.get(relPath);
  const src = readFileSync(path.join(root, relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  cache.set(relPath, module.exports);
  const dir = path.dirname(relPath);
  const require = (id) => {
    if (!id.startsWith('.')) return {};
    const resolved = path.normalize(path.join(dir, id)).replace(/\.js$/, '') + '.ts';
    return loadModule(resolved);
  };
  const fn = new vm.Script(`(function(module,exports,require){${js}\n})`).runInThisContext();
  fn(module, module.exports, require);
  cache.set(relPath, module.exports);
  return module.exports;
}

const wr = loadModule('src/utils/serverWr.ts');

console.log('── filter persistence & parsing ───────────────────────────');
{
  eq('default filter matches pre-Phase-6 behaviour',
     wr.DEFAULT_SERVER_WR_FILTER, { pairScope: 'selected', timeRange: 'all' });
  eq('localStorage key', wr.SERVER_WR_FILTER_KEY, 'ftt_server_wr_filter');

  eq('round-trips a saved value',
     wr.parseServerWrFilter('{"pairScope":"all","timeRange":"7d"}'),
     { pairScope: 'all', timeRange: '7d' });
  eq('accepts an object as well as a string',
     wr.parseServerWrFilter({ pairScope: 'all', timeRange: 'today' }),
     { pairScope: 'all', timeRange: 'today' });

  // a stale or hand-edited value must never crash the History tab
  eq('malformed JSON -> default', wr.parseServerWrFilter('{nope'), wr.DEFAULT_SERVER_WR_FILTER);
  eq('null -> default', wr.parseServerWrFilter(null), wr.DEFAULT_SERVER_WR_FILTER);
  eq('unknown scope value -> default scope',
     wr.parseServerWrFilter('{"pairScope":"hackers","timeRange":"7d"}'),
     { pairScope: 'selected', timeRange: '7d' });
  eq('unknown range value -> default range',
     wr.parseServerWrFilter('{"pairScope":"all","timeRange":"decade"}'),
     { pairScope: 'all', timeRange: 'all' });

  ok('sameFilter true for equal', wr.sameFilter({ pairScope: 'all', timeRange: '7d' }, { pairScope: 'all', timeRange: '7d' }));
  ok('sameFilter false for differing', !wr.sameFilter({ pairScope: 'all', timeRange: '7d' }, { pairScope: 'all', timeRange: 'today' }));
  ok('sameFilter false for null', !wr.sameFilter(null, { pairScope: 'all', timeRange: '7d' }));

  // cache key must separate per-pair views but not duplicate the all-pairs one
  ok('cache key is pair-specific for selected scope',
     wr.filterCacheKey({ pairScope: 'selected', timeRange: 'all' }, 'EUR/USD')
     !== wr.filterCacheKey({ pairScope: 'selected', timeRange: 'all' }, 'BTC/USD'));
  eq('cache key ignores pair for all scope',
     wr.filterCacheKey({ pairScope: 'all', timeRange: '7d' }, 'EUR/USD'),
     wr.filterCacheKey({ pairScope: 'all', timeRange: '7d' }, 'BTC/USD'));
}

console.log('\n── All Pairs aggregation (spec §3.1 formula) ──────────────');
{
  // real shape from the live /api/stats index
  const pairs = [
    { pair: 'SOL/USD', wins: 11, losses: 5, totalSignals: 16, lastUpdated: '2026-07-21T01:26:22.248Z' },
    { pair: 'EUR/USD', wins: 5, losses: 3, totalSignals: 8, lastUpdated: '2026-07-29T02:00:00.000Z' },
    { pair: 'BTC/USD', wins: 183, losses: 208, totalSignals: 391, lastUpdated: '2026-07-28T05:00:09.946Z' },
  ];
  const agg = wr.aggregateAllPairs(pairs);
  eq('total wins summed', agg.totalWins, 199);
  eq('total losses summed', agg.totalLosses, 216);
  eq('decided denominator = wins + losses', agg.totalSignals, 415);
  close('aggregate win rate', agg.winRate, 199 / 415);
  eq('pair count', agg.pairCount, 3);
  eq('lastUpdated = most recent contributor', agg.lastUpdated, '2026-07-29T02:00:00.000Z');
  eq('pairCount counts only contributing pairs', agg.pairCount, 3);

  // robustness
  const messy = wr.aggregateAllPairs([
    { pair: 'A/B' },                                   // no counters at all
    { pair: 'C/D', wins: null, losses: undefined },    // nulls
    { pair: 'E/F', wins: '4', losses: '1' },           // strings from JSON
  ]);
  eq('missing/null counters treated as 0 and excluded', messy.pairCount, 1);
  eq('numeric strings coerced', messy.totalWins, 4);
  eq('empty list -> zero, not NaN', wr.aggregateAllPairs([]).winRate, 0);
  eq('zero decided -> WR 0 not NaN', wr.aggregateAllPairs([{ pair: 'X/Y', wins: 0, losses: 0 }]).winRate, 0);
}

console.log('\n── date cutoffs (spec §3.3) ───────────────────────────────');
{
  const now = new Date('2026-07-29T14:30:00Z').getTime();
  eq('all time -> 0 (no cutoff)', wr.windowCutoff('all', now), 0);

  const sevenD = wr.windowCutoff('7d', now);
  eq('7d cutoff is exactly 168h back', now - sevenD, 7 * 24 * 60 * 60 * 1000);

  const today = wr.windowCutoff('today', now);
  const d = new Date(today);
  ok('today cutoff is local midnight',
     d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0,
     d.toString());
  ok('today cutoff is not in the future', today <= now);
  ok('today cutoff is within the last 24h', now - today < 24 * 60 * 60 * 1000);
  ok('today is more recent than 7d', today > sevenD);
}

console.log('\n── windowed counting from /api/history ────────────────────');
{
  const now = Date.now();
  const hoursAgo = h => new Date(now - h * 3600 * 1000).toISOString();
  const payload = {
    pair: 'BTC/USD', total: 6, showing: 6,
    signals: [
      { id: '1', timestamp: hoursAgo(1), result: 'WIN' },
      { id: '2', timestamp: hoursAgo(2), result: 'LOSS' },
      { id: '3', timestamp: hoursAgo(3), result: 'UNKNOWN' },   // must not count
      { id: '4', timestamp: hoursAgo(4), result: null },        // pending, must not count
      { id: '5', timestamp: hoursAgo(200), result: 'WIN' },     // outside 7d
      { id: '6', timestamp: hoursAgo(300), result: 'LOSS' },    // outside 7d
    ],
  };

  const c7 = wr.countWindowed(payload, wr.windowCutoff('7d', now));
  eq('7d window counts only in-window decided', { w: c7.wins, l: c7.losses }, { w: 1, l: 1 });
  eq('UNKNOWN/pending excluded from decided', c7.decided, 2);
  eq('recordsConsidered counts all in-window rows', c7.recordsConsidered, 4);

  const cAll = wr.countWindowed(payload, 0);
  eq('all-time counts every decided row', cAll.decided, 4);

  // Phase 5 regression: the endpoint returns an object, not a bare array
  const bare = wr.countWindowed(payload.signals, 0);
  eq('bare array payload also parses', bare.decided, 4);
  eq('null payload -> zeros, no throw', wr.countWindowed(null, 0).decided, 0);
  eq('garbage payload -> zeros', wr.countWindowed({ oops: true }, 0).decided, 0);
  eq('unparseable timestamp skipped',
     wr.countWindowed({ signals: [{ id: 'x', timestamp: 'not-a-date', result: 'WIN' }] }, 0).decided, 0);
}

console.log('\n── 50-row retention cap => lower-bound detection ──────────');
{
  const now = Date.now();
  const hoursAgo = h => new Date(now - h * 3600 * 1000).toISOString();

  // A busy pair at the cap whose oldest retained row is only 24h old cannot
  // answer "last 7 days" — older rows have been evicted server-side.
  const capped = { signals: Array.from({ length: 50 }, (_, i) => ({
    id: 'c' + i, timestamp: hoursAgo(i * 0.5), result: i % 2 ? 'WIN' : 'LOSS',
  })) };
  const c7 = wr.countWindowed(capped, wr.windowCutoff('7d', now));
  ok('at-cap pair with recent oldest row is flagged incomplete', !c7.complete);
  ok('count is still returned (as a lower bound)', c7.decided === 50);

  // A quiet pair below the cap is authoritative
  const small = { signals: [
    { id: 'a', timestamp: hoursAgo(1), result: 'WIN' },
    { id: 'b', timestamp: hoursAgo(300), result: 'LOSS' },
  ] };
  ok('below-cap pair is complete', wr.countWindowed(small, wr.windowCutoff('7d', now)).complete);

  // At the cap but the oldest row predates the cutoff => window fully covered
  const cappedOld = { signals: Array.from({ length: 50 }, (_, i) => ({
    id: 'o' + i, timestamp: hoursAgo(i * 20), result: 'WIN',
  })) };
  ok('at-cap pair whose oldest row predates cutoff is complete',
     wr.countWindowed(cappedOld, wr.windowCutoff('today', now)).complete);

  // combine: any truncated pair taints the aggregate
  const combined = wr.combineWindowed([
    { pair: 'BTC/USD', count: c7 },
    { pair: 'SOL/USD', count: wr.countWindowed(small, wr.windowCutoff('7d', now)) },
    { pair: 'DEAD/USD', count: null },   // fetch failed
  ]);
  ok('aggregate marked incomplete when any pair truncated', !combined.coverage.complete);
  eq('truncated pairs listed', combined.coverage.truncatedPairs, ['BTC/USD']);
  eq('failed pair contributes nothing', combined.totalWins + combined.totalLosses, c7.decided + 1);
  eq('all-complete aggregate reports complete',
     wr.combineWindowed([{ pair: 'X/Y', count: wr.countWindowed(small, 0) }]).coverage.complete, true);
  eq('empty combine -> WR 0 not NaN', wr.combineWindowed([]).winRate, 0);
}

console.log('\n── card subtitles (spec §4.3) ─────────────────────────────');
{
  const f = (pairScope, timeRange) => wr.filterSubtitle({ pairScope, timeRange }, 'EUR/USD');
  eq('selected + all keeps the original wording', f('selected', 'all'), 'All users · EUR/USD');
  eq('all + all', f('all', 'all'), 'All pairs · All time');
  eq('all + today', f('all', 'today'), 'All pairs · Today');
  eq('all + 7d', f('all', '7d'), 'All pairs · Last 7 days');
  eq('selected + today', f('selected', 'today'), 'EUR/USD · Today');
  eq('selected + 7d', f('selected', '7d'), 'EUR/USD · Last 7 days');
}

console.log('\n── 5-min view cache (spec §3.4 throttle) ──────────────────');
{
  // Model the cache the effect uses: key -> {at, state}, TTL 5 min, and a
  // manual retry that must bypass a fresh entry.
  const TTL = 5 * 60 * 1000;
  const cache = new Map();
  let fetches = 0;
  let lastReload = 0;

  const enter = (filter, pair, now, reloadKey = 0) => {
    const key = wr.filterCacheKey(filter, pair);
    const hit = cache.get(key);
    const fresh = hit && now - hit.at < TTL;
    if (fresh && reloadKey === lastReload) return { served: 'cache', value: hit.state };
    lastReload = reloadKey;
    fetches++;
    const state = { pair, filter, stats: { totalSignals: fetches } };
    cache.set(key, { at: now, state });
    return { served: 'network', value: state };
  };

  const t0 = 1_000_000;
  const all7d = { pairScope: 'all', timeRange: '7d' };
  eq('first entry hits the network', enter(all7d, 'EUR/USD', t0).served, 'network');
  eq('re-entry within TTL is served from cache', enter(all7d, 'EUR/USD', t0 + 60_000).served, 'cache');
  eq('all-pairs cache is pair-independent', enter(all7d, 'BTC/USD', t0 + 61_000).served, 'cache');
  eq('a different window is a different key', enter({ pairScope: 'all', timeRange: 'today' }, 'EUR/USD', t0 + 62_000).served, 'network');
  eq('selected scope is pair-specific',
     enter({ pairScope: 'selected', timeRange: 'all' }, 'EUR/USD', t0).served, 'network');
  eq('...and a different pair refetches',
     enter({ pairScope: 'selected', timeRange: 'all' }, 'BTC/USD', t0 + 1000).served, 'network');
  eq('entry past TTL refetches', enter(all7d, 'EUR/USD', t0 + TTL + 1).served, 'network');
  eq('manual retry bypasses a fresh cache',
     enter(all7d, 'EUR/USD', t0 + TTL + 2, 1).served, 'network');
  ok('fan-out avoided on cached re-entry (network calls stayed low)', fetches === 6, 'fetches=' + fetches);
}

console.log('\n── wiring assertions ──────────────────────────────────────');
{
  const app = readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
  ok('FilterChipRow imported', app.includes("import { FilterChipRow }"));
  ok('two chip rows rendered', (app.match(/<FilterChipRow/g) || []).length === 2);
  ok('filter state wired', app.includes('serverWrFilter') && app.includes('setServerWrFilter'));
  ok('effect re-runs on filter change', app.includes('[activeTab, selectedPair, serverWrFilter, serverWrReloadKey]'));
  ok('retry bumps the reload key', app.includes('setServerWrReloadKey(k => k + 1)'));
  ok('all-pairs failure falls back to selected pair', app.includes('All Pairs view unavailable'));
  ok('half-failure guard present', app.includes('Math.ceil(pairs.length / 2)'));
  ok('aggregate type guard used', app.includes('isAggregateStats'));
  ok('5-min view cache wired', app.includes('SERVER_WR_CACHE_TTL_MS') && app.includes('serverWrCacheRef'));
  ok('only successful views are cached', app.includes('if (next.stats) serverWrCacheRef.current.set'));
  ok('Phase 5 extractHistoryRecords reused', readFileSync(path.join(root, 'src/utils/serverWr.ts'), 'utf8')
     .includes("from './signalMeta'"));

  // Phase 5 fixes must survive untouched (spec §8)
  ok('Phase 5: 25s signal timeout intact', app.includes('controller.abort(), 25000'));
  ok('Phase 5: CB card intact', app.includes('CircuitBreakerCard'));
  ok('Phase 5: health pill intact', app.includes('<HealthPill />'));
  ok('Phase 5: history reconciliation intact', app.includes('reconcileHistory'));
  const scanner = readFileSync(path.join(root, 'src/hooks/useScanner.ts'), 'utf8');
  ok('Phase 5: scanner 20s timeouts intact', (scanner.match(/controller\.abort\(\), 20000/g) || []).length === 2);
  ok('Phase 5: XAU still absent', !/'XAU\/USD'/.test(app + scanner));
}

console.log('\n───────────────────────────────────────────────────────────');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
if (fail > 0) { console.log('\nFailures:'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
console.log('ALL PHASE 6 SMOKE TESTS PASSED');
