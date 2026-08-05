/**
 * Design-polish render verification — node verify/design_render.mjs
 *
 * Mounts the REAL app (src/App.tsx + components) in jsdom with the REAL
 * compiled CSS (extracted from dist/index.html) and a mocked API, then
 * walks every tab and state:
 *   - home hero (BUY card) + AI/structure/sessions cards
 *   - circuit-breaker card, market-closed card
 *   - analysis tab, history tab (+ server win-rate card, detail modal),
 *     scanner, board, settings, pair picker sheet
 *   - computed-style assertions for the new design tokens
 *
 * Run `npm run build` first (dist/index.html must be fresh).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distHtml = readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
const cssMatch = distHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/);
if (!cssMatch) { console.error('FAIL  no <style> found in dist/index.html — run npm run build first'); process.exit(1); }
const compiledCss = flattenCss(cssMatch[1]);

// jsdom's CSSOM cannot evaluate @layer/@media/@supports wrappers, so flatten
// them: keep every inner rule, drop @property/@import/@charset. This makes the
// compiled Tailwind rules apply so computed-style assertions are meaningful.
function flattenCss(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const n = css.length;
  let out = '';
  let i = 0;
  const readBlock = (start) => {
    let depth = 1, j = start + 1;
    while (j < n && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    return css.slice(start + 1, j - 1);
  };
  // scan a prelude up to the next top-level '{' or ';', respecting
  // parentheses (e.g. @import url(...) contains ';') and quoted strings
  const scanPrelude = (start) => {
    let depth = 0, quote = null, j = start;
    while (j < n) {
      const c = css[j];
      if (quote) {
        if (c === quote && css[j - 1] !== '\\') quote = null;
      } else if (c === '\'' || c === '"') {
        quote = c;
      } else if (c === '(') {
        depth++;
      } else if (c === ')') {
        depth = Math.max(0, depth - 1);
      } else if (c === ';' && depth === 0) {
        return { end: j, kind: ';' };
      } else if (c === '{' && depth === 0) {
        return { end: j, kind: '{' };
      }
      j++;
    }
    return { end: j, kind: 'eof' };
  };
  while (i < n) {
    if (css[i] === '@') {
      const { end, kind } = scanPrelude(i);
      if (kind === ';' || kind === 'eof') { i = end + 1; continue; }
      const prelude = css.slice(i, end).trim();
      const inner = readBlock(end);
      i = end + inner.length + 2;
      if (prelude.startsWith('@property')) continue;
      if (prelude.startsWith('@layer')) { out += flattenCss(inner); continue; }
      if (prelude.startsWith('@keyframes')) { out += prelude + '{' + inner + '}'; continue; }
      // @media / @supports / anything else: unwrap
      out += flattenCss(inner);
      continue;
    }
    const brace = css.indexOf('{', i);
    if (brace === -1) { out += css.slice(i); break; }
    const inner = readBlock(brace);
    out += css.slice(i, brace) + '{' + inner + '}';
    i = brace + inner.length + 2;
  }
  return out;
}


// ── fixtures ────────────────────────────────────────────────────────────────
const now = Date.now();
const tf = (dir, up, down, price) => ({
  direction: dir,
  score: { up, down, diff: up - down },
  confluence: up + down,
  alignedWithHTF: dir === 'BUY',
  expiry: {
    candles: 1, candleSize: '1m', totalMinutes: 5,
    humanReadable: '5 min', countdown: { secondsLeft: 280, minutesLeft: 4, label: '4m 40s' },
  },
  entry: { price, candleTime: new Date(now).toISOString(), candleDirection: dir === 'BUY' ? 'BULLISH' : 'BEARISH' },
  indicators: {
    rsi: '58.2', stochK: '62', stochD: '59', williamsR: '-35',
    ema5: '1.0841', ema13: '1.0835', ema55: '1.0821', emaAlignment: 'FULL_BULL_STACK',
    macdLine: '0.0004', macdSignal: '0.0002', macdHist: '0.0002',
    adx: '28', plusDI: '22', minusDI: '14',
    bbUpper: '1.0860', bbMiddle: '1.0832', bbLower: '1.0804', bbBandwidth: '0.0052', bbPercentB: '0.64',
    r2val: '1.0880', r1: '1.0855', pivot: '1.0830', s1: '1.0805', s2: '1.0780',
  },
});

const buySignal = {
  id: 'sig_test_eur_1', signalId: 'sig_test_eur_1',
  pair: 'EUR/USD', assetType: 'Forex', marketStatus: 'OPEN',
  entrySource: 'FRESH_API', timestamp: new Date(now).toISOString(),
  session: { sessions: ['London', 'New York'], overlap: 'London/New York overlap', quality: 'HIGH', hour: 14 },
  signal: {
    finalSignal: 'BUY', confidence: '78', coreConfidence: 72,
    grade: { grade: 'A', label: 'Strong', description: 'High-quality setup' },
    marketRegime: 'TRENDING', regimeAdvice: 'Trade in the direction of the trend.',
    higherTFTrend: 'BUY', entryReason: 'BOS above the previous high with HTF alignment.',
    filtersApplied: ['D2_TREND_BLOCK', 'MIN_CONFIDENCE'],
    mode: 'ftt', fillStatus: 'INSTANT', fxLevels: { entry: 1.0841, sl: 1.0791, tp: 1.0891, rr: 2 },
    method: 'v6.9.2_engine',
    aiValidation: {
      status: 'OK', agrees: true, combinedAgreed: true,
      cerebras: { status: 'OK', signal: 'BUY', confidence: 80, model: 'cerebras', reason: 'trend up' },
      groq: { status: 'OK', signal: 'BUY', confidence: 76, model: 'groq', reason: 'momentum up' },
      combined: { status: 'OK', signal: 'BUY', confidence: 78, agreement: 'BOTH_AGREE', reason: 'Both models confirm the long bias from structure and momentum.' },
    },
    structureVerdict: {
      direction: 'BUY', strength: 'STRONG', overall: 'ALIGNED',
      perTimeframe: {
        '5min': { verdict: 'AGREE', bias: 'BULLISH', structureDirection: 'BUY', multiplier: 1, detail: '' },
        '15min': { verdict: 'AGREE', bias: 'BULLISH', structureDirection: 'BUY', multiplier: 1, detail: '' },
        '1h': { verdict: 'NEUTRAL', bias: 'RANGE', structureDirection: 'NEUTRAL', multiplier: 0, detail: '' },
      },
    },
    bestTimeframe: {
      timeframe: '5min', direction: 'BUY', score: 12, confluence: 9,
      expiry: { humanReadable: '5 min', countdown: { secondsLeft: 280, minutesLeft: 4, label: '4m 40s' } },
    },
    recommendations: { '1min': tf('BUY', 8, 4, 1.0841), '5min': tf('BUY', 9, 3, 1.0841), '15min': tf('SELL', 4, 7, 1.0841) },
    timeframeAnalysis: {
      '1min': { direction: 'BUY', score: { up: 8, down: 4, diff: 4 }, confluence: 12, expiry: tf('BUY', 8, 4, 1.0841).expiry, entry: tf('BUY', 8, 4, 1.0841).entry, indicators: tf('BUY', 8, 4, 1.0841).indicators },
      '5min': { direction: 'BUY', score: { up: 9, down: 3, diff: 6 }, confluence: 13, expiry: tf('BUY', 9, 3, 1.0841).expiry, entry: tf('BUY', 9, 3, 1.0841).entry, indicators: tf('BUY', 9, 3, 1.0841).indicators },
      '15min': { direction: 'SELL', score: { up: 4, down: 7, diff: -3 }, confluence: 9, expiry: tf('SELL', 4, 7, 1.0841).expiry, entry: tf('SELL', 4, 7, 1.0841).entry, indicators: tf('SELL', 4, 7, 1.0841).indicators },
    },
    votes: { BUY: 2, SELL: 0, NO_TRADE: 0, total: 2, weightedBuy: 2, weightedSell: 0, weightedNoTrade: 0 },
  },
};

const cbSignal = {
  ...buySignal, id: 'sig_test_btc_1', signalId: 'sig_test_btc_1', pair: 'BTC/USD',
  assetType: 'Crypto',
  circuitBreaker: { tripped: true, cooldownUntil: new Date(now + 3.6e6).toISOString(), lossStreak: 3, wouldBeSignal: 'SELL' },
  signal: { ...buySignal.signal, finalSignal: 'NO_TRADE', confidence: '0', grade: { grade: 'F', label: 'Cooldown', description: '' } },
};

const closedSignal = {
  id: 'sig_test_gbp_1', signalId: 'sig_test_gbp_1', pair: 'GBP/USD', assetType: 'Forex',
  marketStatus: 'CLOSED', signal: null, message: 'Forex market is currently closed.',
  nextOpen: new Date(now + 9e6).toISOString(), nextOpenReadable: 'Next open 00:00 UTC',
  opensIn: '9h 0m', advice: 'Wait for forex to reopen, or switch to crypto markets which run 24/7.',
  cryptoAlternative: 'Try /api/signal?pair=BTC/USD',
};

const pairFor = (clean) => {
  const map = { btcusd: 'BTC/USD', gbpusd: 'GBP/USD', eurusd: 'EUR/USD' };
  return map[clean] || (clean.length === 6 ? `${clean.slice(0, 3).toUpperCase()}/${clean.slice(3).toUpperCase()}` : clean);
};

function makeFetch() {
  return async (url) => {
    const u = new URL(url);
    const route = u.pathname;
    const pairParam = (u.searchParams.get('pair') || '').toLowerCase().replace(/[^a-z]/g, '');
    const delay = () => new Promise(r => setTimeout(r, 5));

    if (route === '/api/signal') {
      await delay();
      const payload = pairParam === 'btcusd' ? cbSignal : pairParam === 'gbpusd' ? closedSignal : { ...buySignal, pair: pairFor(pairParam) };
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(payload)) };
    }
    if (route === '/api/batch') {
      await delay();
      return { ok: true, status: 200, json: async () => ({ results: {}, processedPairs: 0, invalidPairs: [], skippedPairs: [] }) };
    }
    if (route === '/api/history') {
      await delay();
      return { ok: true, status: 200, json: async () => ({ pair: pairFor(pairParam), total: 0, signals: [] }) };
    }
    if (route === '/api/stats') {
      await delay();
      if (pairParam) {
        return { ok: true, status: 200, json: async () => ({
          pair: pairFor(pairParam),
          stats: { totalSignals: 180, wins: 100, losses: 80, winRate: 0.556, sampleSize: 20, dynamicConfidenceAdjustment: -5, lastUpdated: new Date(now - 6e4).toISOString() },
        }) };
      }
      return { ok: true, status: 200, json: async () => ({
        pairs: [
          { pair: 'EUR/USD', wins: 100, losses: 80, totalSignals: 180, winRate: 0.556, lastUpdated: new Date(now - 6e4).toISOString() },
          { pair: 'BTC/USD', wins: 183, losses: 208, totalSignals: 391, winRate: 0.468, lastUpdated: new Date(now - 6e4).toISOString() },
          { pair: 'GBP/USD', wins: 40, losses: 45, totalSignals: 85, winRate: 0.471, lastUpdated: new Date(now - 6e4).toISOString() },
        ],
      }) };
    }
    if (route === '/health') {
      return { ok: true, status: 200, json: async () => ({ status: 'healthy', version: '6.9.2', apiKeysLoaded: 17, quotaUsedToday: 1234 }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

// ── jsdom + globals ─────────────────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true,
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.Notification = undefined;
globalThis.confirm = () => true;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.fetch = makeFetch();

const styleEl = dom.window.document.createElement('style');
styleEl.type = 'text/css';
styleEl.textContent = compiledCss;
dom.window.document.head.appendChild(styleEl);

// seed local history: one WIN, one pending-not-yet-expired
const seedHistory = [
  { id: 'sig_win_1', pair: 'EUR/USD', direction: 'BUY', confidence: '78', timeframe: '5min', entryPrice: 1.0841, exitPrice: 1.0891, timestamp: now - 3600e3, result: 'WIN', grade: 'A', reportable: true },
  { id: 'sig_pend_1', pair: 'BTC/USD', direction: 'SELL', confidence: '60', timeframe: '5min', entryPrice: 65000, timestamp: now - 600e3, result: 'PENDING', expiryTime: now + 300e3, reportable: true },
];
globalThis.localStorage.setItem('ftt_history', JSON.stringify(seedHistory));

// ── bundle + mount ──────────────────────────────────────────────────────────
const outfile = path.join(root, 'verify', '.design_bundle.mjs');
await build({
  entryPoints: [path.join(root, 'verify', 'design_entry.tsx')],
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic',
  outfile, logLevel: 'silent', minify: false,
});
const { mountApp } = await import(outfile + '?t=' + Date.now());

// ── tiny test framework ─────────────────────────────────────────────────────
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; failures.push(name); console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const byText = (tag, text) => {
  const els = document.querySelectorAll(tag);
  for (const el of els) { if (el.textContent?.trim().includes(text)) return el; }
  return null;
};
const allText = (tag, text) => {
  const out = [];
  for (const el of document.querySelectorAll(tag)) { if (el.textContent?.includes(text)) out.push(el); }
  return out;
};
// deepest element whose trimmed text equals `text` exactly (avoids matching
// ancestor containers whose textContent merely contains the string)
const exactText = (tag, text) => {
  const els = [...document.querySelectorAll(tag)].filter(el => el.textContent?.trim() === text);
  return els.length ? els[els.length - 1] : null;
};
function click(el) { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); }

// ── run ─────────────────────────────────────────────────────────────────────
const errors = [];
const origError = console.error;
console.error = (...args) => { errors.push(args.join(' ')); origError(...args); };

mountApp();
await sleep(700);

// HOME — hero BUY card
ok('header brand renders', !!byText('h1', 'SignalPro'));
ok('6-tab nav renders', document.querySelectorAll('nav button').length >= 6);
const heroBuy = document.querySelector('.text-\\[44px\\]') || byText('div', 'BUY');
ok('hero shows BUY', !!heroBuy);
if (heroBuy) {
  const cs = getComputedStyle(heroBuy);
  ok('hero BUY uses token green', cs.color === 'rgb(0, 230, 118)', `got ${cs.color}`);
}
const dirLabel = document.querySelector('.label-caption');
if (dirLabel) {
  const cs = getComputedStyle(dirLabel);
  ok('label-caption is 10px', cs.fontSize === '10px', `got ${cs.fontSize} (${dirLabel.textContent.trim()})`);
}
// scope-scoped pair row search: look inside the picker sheet only.
// The innermost div containing the pair text is the PairItem row (ancestors
// also contain the text, so take the LAST match in document order).
const pickerSheet = () => document.querySelector('.fixed.inset-0 .relative');
const pickerRow = (pair) => {
  const sheet = pickerSheet();
  if (!sheet) return null;
  const divs = [...sheet.querySelectorAll('div')].filter(d => d.textContent.includes(pair));
  return divs.length ? divs[divs.length - 1] : null;
};
ok('AI Analysis card', !!byText('div', 'AI Analysis'));
ok('Market Structure card', !!byText('div', 'Market Structure'));
ok('Market Sessions card', !!byText('div', 'Market Sessions'));
ok('Entry Reasoning card', !!byText('div', 'Entry Reasoning'));
ok('Market Regime card', !!byText('div', 'Market Regime'));
ok('fill-status chip (INSTANT — take now)', !!byText('span', 'INSTANT — take now'));
ok('SL/TP chips render', !!byText('span', 'SL 1.0791') && !!byText('span', 'TP 1.0891'));
// palette unification: every positive badge computes the SAME green
const agreeBadge = exactText('div', '✓ Both Agree');
if (agreeBadge) {
  const cs = getComputedStyle(agreeBadge);
  // jsdom returns the raw token for class-applied var() rules; the token
  // resolving to #00e676 is asserted separately against the :root definition.
  ok('AI agree badge uses buy token', cs.color === 'var(--c-buy)', `got ${cs.color}`);
}
const alignedBadge = exactText('div', '✓ ALIGNED');
if (alignedBadge) {
  const cs = getComputedStyle(alignedBadge);
  ok('structure ALIGNED badge uses buy token', cs.color === 'var(--c-buy)', `got ${cs.color}`);
}
const winBadgeCheck = byText('span', '✅ WIN');
if (winBadgeCheck) {
  const cs = getComputedStyle(winBadgeCheck);
  ok('history WIN badge uses buy green', cs.color === 'rgb(0, 230, 118)', `got ${cs.color}`);
}

// ANALYSIS tab
click(byText('button', 'Analysis'));
await sleep(150);
ok('analysis header', !!byText('h2', 'Multi-Timeframe Analysis'));
ok('timeframe card 5MIN', !!byText('div', '5MIN'));
ok('technical indicators section', !!byText('h3', 'Technical Indicators'));
ok('indicator momentum card', !!byText('span', 'Momentum'));
ok('indicator RSI row', !!byText('span', 'RSI'));

// HISTORY tab
click(byText('button', 'History'));
await sleep(400);
ok('history heading', !!byText('h2', 'Signal History'));
ok('local history heading', !!byText('h3', 'Your Local History'));
ok('server win rate card', !!byText('div', 'Server Win Rate'));
ok('server win rate 55.6%', !!byText('div', '55.6%'));
const wrValue = exactText('div', '55.6%');
if (wrValue) {
  const cs = getComputedStyle(wrValue);
  ok('server WR value uses accent cyan', cs.color === 'rgb(77, 208, 225)', `got ${cs.color}`);
}
// token definitions must resolve to the canonical hexes
const rootStyle = getComputedStyle(document.documentElement);
ok('--c-buy resolves to #00e676', rootStyle.getPropertyValue('--c-buy').trim() === '#00e676', `got ${rootStyle.getPropertyValue('--c-buy').trim()}`);
ok('--c-sell resolves to #ff5252', rootStyle.getPropertyValue('--c-sell').trim() === '#ff5252', `got ${rootStyle.getPropertyValue('--c-sell').trim()}`);
ok('--c-info resolves to #42a5f5', rootStyle.getPropertyValue('--c-info').trim() === '#42a5f5', `got ${rootStyle.getPropertyValue('--c-info').trim()}`);
ok('seeded WIN row', !!byText('div', '✅ WIN'));
ok('seeded PENDING row', !!byText('div', '⏳'));
// detail modal — click the WIN badge; the click bubbles to the row
const winBadge = byText('span', '✅ WIN');
click(winBadge);
await sleep(150);
ok('detail modal opens', !!byText('div', 'Entry Price') && !!byText('div', 'Exit Price'));
ok('detail modal P&L row', !!byText('div', 'Price Move'));
click(document.querySelector('[aria-label="Close details"]'));
await sleep(100);

// SETTINGS tab
click(byText('button', 'Settings'));
await sleep(300);
ok('settings heading', !!byText('h2', 'Settings'));
ok('auto refresh row', !!byText('div', 'Auto Refresh'));
ok('worker health row', !!byText('div', 'Worker Health'));
ok('health keys pill (17 keys)', !!byText('span', '17 keys'));
ok('version row', !!byText('div', 'Version'));

// SCANNER tab
click(byText('button', 'Scanner'));
await sleep(500);
ok('scanner header', !!byText('div', 'Live Scanner'));
ok('scanner add input', !!document.querySelector('input[aria-label="Add scanner pair"]'));
ok('scanner pair rows appear', allText('div', 'EUR/USD').length >= 1);

// BOARD tab
click(byText('button', 'Board'));
await sleep(500);
ok('board header', !!byText('div', 'Board · All Pairs'));
ok('board EUR/USD card', !!byText('span', 'EUR/USD'));
ok('board win-rate bar renders (WR)', !!byText('span', 'WR'));
ok('board honesty note', !!byText('div', 'Read honestly'));

// PAIR PICKER + circuit-breaker + market-closed states
click(byText('button', 'Signal'));
await sleep(300);
const pairChip = allText('button', 'EUR/USD')[0];
click(pairChip);
await sleep(200);
ok('pair picker opens', !!byText('h2', 'Select Pair'));
const sheet = document.querySelector('.sheet-surface');
if (sheet) {
  const bg = getComputedStyle(sheet).backgroundColor;
  ok('sheet has real surface bg', bg.includes('20'), `got ${bg}`);
}
// switch to BTC/USD → circuit breaker
const btcRow = pickerRow('BTC/USD');
click(btcRow);
await sleep(500);

ok('circuit breaker card renders', !!byText('h2', 'Circuit Breaker Active'));
ok('cb cooldown pill', !!byText('div', 'COOLDOWN'));
ok('cb suppressed signal shown', !!byText('span', 'SELL'));
// exit the CB state via its alternative-pair button, then switch to GBP/USD
click(allText('button', 'EUR/USD')[0]);
await sleep(500);
ok('hero restored after CB exit', !!byText('div', 'BUY'));
click(allText('button', 'EUR/USD')[0]);
await sleep(200);
click(pickerRow('GBP/USD'));
await sleep(500);
ok('market closed card renders', !!byText('h2', 'Forex Market Closed'));
ok('closed switch-to-crypto CTA', !!byText('button', 'Switch to BTC/USD (24/7)'));

// ── summary ────────────────────────────────────────────────────────────────
const reactErrors = errors.filter(e => /Uncaught|Minified React error|Element type is invalid|Objects are not valid/i.test(e));
console.log(`\n${pass} passed, ${fail} failed` + (reactErrors.length ? `, ${reactErrors.length} react errors` : ''));
if (reactErrors.length) { console.log('React errors:'); reactErrors.slice(0, 5).forEach(e => console.log('  ' + e.slice(0, 200))); }
console.log('Failures:', failures.join(' | '));
// App timers (auto-refresh tick, ticker, health poll) keep jsdom's event loop
// alive forever — exit explicitly once the verdict is in.
process.exit(fail > 0 || reactErrors.length ? 1 : 0);
