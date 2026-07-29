/**
 * Phase 5 smoke tests — node scripts/phase5_smoke.mjs
 *
 * Covers the logic that is easy to get silently wrong and impossible to eyeball:
 *   - /api/history reconciliation (payload shape, UNKNOWN handling, no-clobber)
 *   - aiStatus derivation for both the dual-AI and OTC pipelines
 *   - unsupported-symbol filtering (XAU/XAG/WTI)
 *   - the fetchSignal supersede semantics behind BUG #1 (modelled, see below)
 *
 * No DOM, no React, no network. The helpers are imported from the real source
 * via a tiny esbuild-less TS strip (they are plain functions with types only).
 */

import assert from 'node:assert';
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

// ── load the real helpers (transpile TS -> JS in-memory) ───────────────
function loadModule(relPath) {
  const src = readFileSync(path.join(root, relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  // the only import is a type-only one, erased by transpile
  const fn = new vm.Script(`(function(module, exports, require){${js}\n})`).runInThisContext();
  fn(module, module.exports, () => ({}));
  return module.exports;
}

const meta = loadModule('src/utils/signalMeta.ts');

console.log('── /api/history payload shape ─────────────────────────────');
{
  // The live endpoint returns an object, not an array. This is the bug that
  // would have made the spec's polling snippet a silent no-op.
  const real = { pair: 'BTC/USD', total: 50, showing: 2, signals: [{ id: 'a', result: 'WIN' }] };
  eq('extracts rows from { signals: [...] }', meta.extractHistoryRecords(real).length, 1);
  eq('tolerates a bare array too', meta.extractHistoryRecords([{ id: 'a' }]).length, 1);
  eq('null payload -> []', meta.extractHistoryRecords(null).length, 0);
  eq('garbage payload -> []', meta.extractHistoryRecords({ nope: 1 }).length, 0);
}

console.log('\n── reconcileHistory ───────────────────────────────────────');
{
  const local = [
    { id: 'a', result: 'PENDING' },
    { id: 'b', result: 'PENDING' },
    { id: 'c', result: 'WIN' },      // already decided by the user
    { id: 'd', result: 'PENDING' },  // worker has no record of it
  ];
  const records = [
    { id: 'a', result: 'LOSS', structureVerdict: 'MIXED', aiStatus: 'BOTH_AGREE', coreConfidence: 96, entrySource: 'CACHE_PARTIAL' },
    { id: 'b', result: 'UNKNOWN' },  // worker gave up
    { id: 'c', result: 'LOSS' },     // must NOT overwrite the manual WIN
  ];
  const out = meta.reconcileHistory(local, records);

  eq('WIN/LOSS applied to pending row', out[0].result, 'LOSS');
  eq('resolved row marked autoChecked', out[0].autoChecked, true);
  eq('resolved row marked synced', out[0].reportStatus, 'synced');
  eq('B5 fields backfilled', out[0].coreConfidence, 96);
  eq('entrySource backfilled', out[0].entrySource, 'CACHE_PARTIAL');
  eq('UNKNOWN leaves row pending', out[1].result, 'PENDING');
  eq('manual result never overwritten', out[2].result, 'WIN');
  eq('row absent from worker untouched', out[3].result, 'PENDING');

  // referential stability => no wasted React render
  const noop = meta.reconcileHistory(local, [{ id: 'zzz', result: 'WIN' }]);
  ok('same reference when nothing changed', noop === local);
  ok('new reference when something changed', out !== local);

  // local values win over worker values during backfill
  const withLocal = [{ id: 'a', result: 'PENDING', coreConfidence: 11 }];
  const merged = meta.reconcileHistory(withLocal, [{ id: 'a', result: 'WIN', coreConfidence: 99 }]);
  eq('existing local B5 value not clobbered', merged[0].coreConfidence, 11);
}

console.log('\n── deriveAiStatus ─────────────────────────────────────────');
{
  const d = (ai) => meta.deriveAiStatus({ signal: { aiValidation: ai } });
  eq('dual-AI consensus', d({ combined: { status: 'OK', agreement: 'BOTH_AGREE' } }), 'BOTH_AGREE');
  eq('dual-AI split', d({ combined: { status: 'OK', agreement: 'AIs_DISAGREE' } }), 'AIs_DISAGREE');
  eq('both offline', d({ combined: { status: 'BOTH_UNAVAILABLE' } }), 'BOTH_UNAVAILABLE');
  eq('explicitly skipped', d({ status: 'SKIPPED' }), 'SKIPPED');
  eq('OTC agree', d({ status: 'OK', agrees: true }), 'OTC_AGREE');
  eq('OTC disagree', d({ status: 'OK', agrees: false }), 'OTC_DISAGREE');
  eq('no aiValidation at all', d(undefined), undefined);
  eq('missing signal object', meta.deriveAiStatus({}), undefined);
}

console.log('\n── aiStatusBadge ──────────────────────────────────────────');
{
  ok('BOTH_AGREE -> green consensus', meta.aiStatusBadge('BOTH_AGREE').label.includes('Consensus'));
  ok('AIs_DISAGREE -> split', meta.aiStatusBadge('AIs_DISAGREE').label.includes('Split'));
  ok('BOTH_UNAVAILABLE -> offline', meta.aiStatusBadge('BOTH_UNAVAILABLE').label.includes('Offline'));
  eq('SKIPPED hidden', meta.aiStatusBadge('SKIPPED'), null);
  eq('undefined hidden', meta.aiStatusBadge(undefined), null);
}

console.log('\n── unsupported symbols (BUG #5) ───────────────────────────');
{
  ok('XAU/USD rejected', !meta.isSupportedPair('XAU/USD'));
  ok('XAG/USD rejected', !meta.isSupportedPair('XAG/USD'));
  ok('WTI/USD rejected', !meta.isSupportedPair('WTI/USD'));
  ok('lowercase xauusd rejected', !meta.isSupportedPair('xauusd'));
  ok('EUR/USD kept', meta.isSupportedPair('EUR/USD'));
  ok('BTC/USD kept', meta.isSupportedPair('BTC/USD'));
  ok('EURUSD-OTC kept', meta.isSupportedPair('EURUSD-OTC'));
  ok('non-string rejected', !meta.isSupportedPair(null));
  const saved = ['EUR/USD', 'XAU/USD', 'BTC/USD'];
  eq('stale favourite filtered on load', saved.filter(meta.isSupportedPair), ['EUR/USD', 'BTC/USD']);
}

console.log('\n── entry source labels ────────────────────────────────────');
{
  eq('FRESH_API label', meta.ENTRY_SOURCE_LABEL['FRESH_API'], 'Fresh data');
  eq('CACHE_PARTIAL label', meta.ENTRY_SOURCE_LABEL['CACHE_PARTIAL'], 'Partly cached');
  eq('CACHE_ALL label', meta.ENTRY_SOURCE_LABEL['CACHE_ALL'], 'Cached data');
}

// ── BUG #1 semantics, modelled ─────────────────────────────────────────
// Mirrors the guard structure now in fetchSignal: abort-and-supersede instead
// of early-return, with a monotonic sequence deciding who may write state.
console.log('\n── fetchSignal supersede model (BUG #1/#2) ────────────────');
{
  function makeFetcher() {
    const state = { inFlight: false, seq: 0, aborted: 0, writes: [], loading: false, error: null };
    const start = (label, { failWith } = {}) => {
      if (state.inFlight) state.aborted++;          // abort the older request
      state.inFlight = true;
      const mySeq = ++state.seq;
      state.loading = true;
      return {
        settle() {
          if (mySeq !== state.seq) return;          // superseded: write nothing
          if (failWith) state.error = failWith;
          else state.writes.push(label);
          state.inFlight = false;
          state.loading = false;
        },
      };
    };
    return { state, start };
  }

  // old behaviour: second tap during an in-flight fetch was dropped entirely
  const f = makeFetcher();
  const autoRefresh = f.start('auto');
  const userRetry = f.start('retry');       // user taps Retry mid-flight
  eq('older request is aborted, not ignored', f.state.aborted, 1);
  autoRefresh.settle();                      // late arrival must be discarded
  eq('superseded response writes nothing', f.state.writes, []);
  userRetry.settle();
  eq('newest response wins', f.state.writes, ['retry']);
  eq('spinner released exactly once', f.state.loading, false);

  // an aborted older request must not surface a timeout error to the user
  const g = makeFetcher();
  const slow = g.start('slow', { failWith: 'Request timed out. Tap retry.' });
  const fresh = g.start('fresh');
  slow.settle();
  eq('aborted older request shows no error', g.state.error, null);
  fresh.settle();
  eq('fresh request still renders', g.state.writes, ['fresh']);
}

console.log('\n── timeout budget ─────────────────────────────────────────');
{
  const app = readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
  const scanner = readFileSync(path.join(root, 'src/hooks/useScanner.ts'), 'utf8');
  ok('App fetchSignal timeout is 25s', app.includes('controller.abort(), 25000'));
  ok('no 15s timeout left in App', !app.includes('controller.abort(), 15000'));
  ok('scanner timeouts raised to 20s', (scanner.match(/controller\.abort\(\), 20000/g) || []).length === 2);
  ok('no 12s timeout left in scanner', !scanner.includes('controller.abort(), 12000'));
  ok('client auto-checker removed', !app.includes('const entry = due[0]'));
  ok('history poll present', app.includes('/api/history?pair='));
  ok('manual report flow retained', app.includes('reportSignalResult'));
}

console.log('\n───────────────────────────────────────────────────────────');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
if (fail > 0) { console.log('\nFailures:'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
console.log('ALL PHASE 5 SMOKE TESTS PASSED');
