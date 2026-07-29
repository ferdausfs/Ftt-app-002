/**
 * Phase 8 smoke tests — node scripts/phase8_smoke.mjs
 *
 * Covers the cache-routing logic and the regressions that matter:
 *   - cache hit / fresh / 404-fallback routing (with call-by-call URL asserts)
 *   - freshness badge for all three states
 *   - timer sync maths against real observed nextRefreshIn values
 *   - scanner cache-first with batch fallback for uncovered pairs
 *   - Phase 5 + Phase 6 features still wired
 *
 * No DOM, no network.
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
const ok = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); } else { fail++; failures.push(n); console.log('FAIL  ' + n + (d ? ' — ' + d : '')); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));

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
    return loadModule(path.normalize(path.join(dir, id)) + '.ts');
  };
  new vm.Script(`(function(module,exports,require){${js}\n})`).runInThisContext()(module, module.exports, require);
  cache.set(relPath, module.exports);
  return module.exports;
}

const sc = loadModule('src/utils/signalCache.ts');

// ── fetch double that records every URL ────────────────────────────────
function makeFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    for (const [match, res] of routes) {
      if (String(url).includes(match)) return res();
    }
    throw new Error('unrouted: ' + url);
  };
  return { impl, calls };
}
const jsonRes = (body, status = 200) => () => ({
  ok: status >= 200 && status < 300, status, json: async () => body,
});

const signalBody = (extra = {}) => ({
  id: 'sig_1', pair: 'BTC/USD', marketStatus: 'OPEN',
  signal: { finalSignal: 'BUY', confidence: '87%' }, ...extra,
});

console.log('── routing: normal view reads the cache ───────────────────');
{
  const { impl, calls } = makeFetch([
    ['/api/signals/latest', jsonRes(signalBody({
      cached: true, generatedAt: '2026-07-29T09:01:05.778Z',
      generationAge: 208, nextRefreshIn: 92, generationId: 'gen_x', stale: false,
    }))],
  ]);
  const out = await sc.fetchCachedSignal('BTC/USD', { apiBase: 'http://w', fetchImpl: impl });
  eq('one request only', calls.length, 1);
  ok('hits the cache endpoint', calls[0].includes('/api/signals/latest?pair=btcusd'), calls[0]);
  ok('never touches /api/signal on a hit', !calls.some(c => c.includes('/api/signal?')));
  eq('source tagged cache', out.source, 'cache');
  eq('cached flag preserved', out.data.cached, true);
  eq('generationId preserved', out.data.generationId, 'gen_x');
}

console.log('\n── routing: 404 falls back to fresh generation ────────────');
{
  const { impl, calls } = makeFetch([
    ['/api/signals/latest', jsonRes({ error: true, stale: true, scanned: false }, 404)],
    ['/api/signal?', jsonRes(signalBody({ cached: false, forceRefresh: true }))],
  ]);
  const out = await sc.fetchCachedSignal('USD/CHF', { apiBase: 'http://w', fetchImpl: impl });
  eq('two requests', calls.length, 2);
  ok('cache tried first', calls[0].includes('/api/signals/latest'));
  ok('then fresh generation', calls[1].includes('/api/signal?pair=usdchf'));
  eq('flagged as cache-miss fallback', out.data.fallback, 'cache_miss');
  eq('source tagged', out.source, 'cache_miss_fallback');
  eq('cached false', out.data.cached, false);
}

console.log('\n── routing: non-404 errors surface (no silent fallback) ───');
{
  const { impl, calls } = makeFetch([['/api/signals/latest', jsonRes({}, 500)]]);
  let threw = null;
  try { await sc.fetchCachedSignal('BTC/USD', { apiBase: 'http://w', fetchImpl: impl }); }
  catch (e) { threw = e; }
  ok('500 throws rather than masking', !!threw, String(threw));
  eq('did not attempt a fresh run', calls.length, 1);
}

console.log('\n── routing: a 200 without a signal is treated as a miss ───');
{
  const { impl, calls } = makeFetch([
    ['/api/signals/latest', jsonRes({ cached: true, pair: 'BTC/USD' })],   // no .signal
    ['/api/signal?', jsonRes(signalBody())],
  ]);
  const out = await sc.fetchCachedSignal('BTC/USD', { apiBase: 'http://w', fetchImpl: impl });
  eq('fell through to fresh', calls.length, 2);
  ok('renders a real signal', !!out.data.signal);
}

console.log('\n── Force Refresh always runs the engine ───────────────────');
{
  const { impl, calls } = makeFetch([['/api/signal?', jsonRes(signalBody({ cached: false, forceRefresh: true }))]]);
  const out = await sc.fetchFreshSignal('BTC/USD', { apiBase: 'http://w', fetchImpl: impl });
  eq('single request', calls.length, 1);
  ok('never reads the cache', !calls.some(c => c.includes('/api/signals/latest')));
  eq('source tagged fresh', out.source, 'fresh');
  eq('cached false', out.data.cached, false);
}

console.log('\n── freshness badge (spec §A.5) ────────────────────────────');
{
  const cached = sc.freshnessBadge({ cached: true, generationAge: 47, nextRefreshIn: 253 });
  eq('cached label', cached.label, 'Generated 47s ago');
  eq('cached detail', cached.detail, 'Next refresh in 4m 13s');
  eq('cached kind', cached.kind, 'cached');

  const live = sc.freshnessBadge({ cached: false });
  eq('live label', live.label, 'LIVE');
  eq('live kind', live.kind, 'live');

  const miss = sc.freshnessBadge({ cached: false, fallback: 'cache_miss' });
  eq('on-demand kind', miss.kind, 'on_demand');
  ok('on-demand explains why', miss.detail.includes('not in scheduled scan'));
  ok('on-demand is amber', miss.className.includes('ffb74d'));

  eq('null in -> null out', sc.freshnessBadge(null), null);
  // age missing entirely must not render "NaN ago"
  const noAge = sc.freshnessBadge({ cached: true });
  ok('missing age degrades gracefully', !String(noAge.label).includes('NaN'), noAge.label);
}

console.log('\n── countdown formatting ───────────────────────────────────');
{
  eq('seconds', sc.formatCountdown(47), '47s');
  eq('exact minutes', sc.formatCountdown(240), '4m');
  eq('minutes + seconds', sc.formatCountdown(253), '4m 13s');
  eq('zero', sc.formatCountdown(0), '0s');
  eq('negative clamped', sc.formatCountdown(-5), '0s');
  eq('non-numeric', sc.formatCountdown(undefined), '—');
  eq('fresh age reads "just now"', sc.formatAge(2), 'just now');
  eq('older age', sc.formatAge(125), '2m 5s ago');
}

console.log('\n── auto-refresh timer sync (spec §A.4.1) ──────────────────');
{
  // observed live: nextRefreshIn counted 92 -> 6 then a new generation appeared
  eq('253s -> 256s delay', sc.computeRefreshDelayMs(253), 253 * 1000 + 3000);
  eq('92s -> 95s delay', sc.computeRefreshDelayMs(92), 95000);
  // never hammer the worker when the countdown is at/near zero
  eq('0s clamps to the 5s floor', sc.computeRefreshDelayMs(0), 5000 + 3000);
  eq('negative clamps to floor', sc.computeRefreshDelayMs(-30), 8000);
  // never sleep longer than one scan cycle
  eq('absurd value capped at one cycle', sc.computeRefreshDelayMs(99999), 300 * 1000 + 3000);
  // missing field -> legacy behaviour
  eq('undefined -> 60s fallback', sc.computeRefreshDelayMs(undefined), 60000);
  eq('null -> 60s fallback', sc.computeRefreshDelayMs(null), 60000);
  eq('NaN -> 60s fallback', sc.computeRefreshDelayMs(NaN), 60000);
  eq('string -> 60s fallback', sc.computeRefreshDelayMs('253'), 60000);
}

console.log('\n── scanner cache lookup ───────────────────────────────────');
{
  const all = { signals: { 'BTC/USD': signalBody(), 'EUR/USD': signalBody() } };
  ok('exact key hit', !!sc.pickFromLatestAll(all, 'BTC/USD'));
  ok('normalised spelling hit', !!sc.pickFromLatestAll(all, 'btcusd'));
  ok('uncovered pair misses', sc.pickFromLatestAll(all, 'EURUSD-OTC') === null);
  ok('empty payload safe', sc.pickFromLatestAll({}, 'BTC/USD') === null);
  ok('null payload safe', sc.pickFromLatestAll(null, 'BTC/USD') === null);

  const { impl } = makeFetch([['/api/signals/latest', jsonRes(all)]]);
  const fetched = await sc.fetchLatestAll({ apiBase: 'http://w', fetchImpl: impl });
  eq('all-pairs fetch returns the map', Object.keys(fetched.signals).length, 2);
}

console.log('\n── wiring + regressions ───────────────────────────────────');
{
  const app = readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
  const scanner = readFileSync(path.join(root, 'src/hooks/useScanner.ts'), 'utf8');

  // Phase 8
  ok('App routes normal views through the cache helper', app.includes('fetchCachedSignal('));
  ok('App has a force-fresh path', app.includes('fetchFreshSignal('));
  ok('Force Refresh button wired', app.includes('fetchSignal(false, true)'));
  ok('freshness pill rendered', app.includes('freshnessBadge(') && app.includes('freshness.label'));
  ok('timer driven by server countdown', app.includes('computeRefreshDelayMs('));
  ok('auto-refresh no longer hardcodes a 60s reset', !app.includes('nextRefreshAtRef.current = Date.now() + 60000'));
  ok('scanner reads the shared cache', scanner.includes('fetchLatestAll('));
  ok('scanner keeps the batch fallback', scanner.includes('fetchBatchGroup(group)'));

  // Phase 5 regressions
  ok('P5: 25s timeout intact', app.includes('controller.abort(), 25000'));
  ok('P5: abort-and-supersede intact', app.includes('fetchAbortRef.current.abort()'));
  ok('P5: seq guard intact', app.includes('mySeq !== fetchSeqRef.current'));
  ok('P5: CB card intact', app.includes('CircuitBreakerCard'));
  ok('P5: health pill intact', app.includes('<HealthPill />'));
  ok('P5: history reconciliation intact', app.includes('reconcileHistory'));
  ok('P5: XAU still absent', !/'XAU\/USD'/.test(app + scanner));
  ok('P5: scanner 20s timeouts intact', (scanner.match(/controller\.abort\(\), 20000/g) || []).length === 2);

  // Phase 6 regressions
  ok('P6: filter chips intact', (app.match(/<FilterChipRow/g) || []).length === 2);
  ok('P6: WR filter state intact', app.includes('serverWrFilter'));
  ok('P6: coverage warning intact', app.includes('50 most recent signals per pair'));
  ok('P6: 5-min WR cache intact', app.includes('SERVER_WR_CACHE_TTL_MS'));

  // bans
  ok('no deploy commands', !/vercel --prod|git push/.test(app + scanner));
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  ok('no new npm dependency', deps.length === 14, 'dep count = ' + deps.length);
}

console.log('\n───────────────────────────────────────────────────────────');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
if (fail > 0) { console.log('\nFailures:'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
console.log('ALL PHASE 8 SMOKE TESTS PASSED');
