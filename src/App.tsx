import { useState, useCallback } from 'react';
import {
  RefreshCw, Sparkles, TrendingUp, Layers, Trash2, Info, Code, Zap,
  AlertCircle, Clock, BarChart3, History, Settings, Globe2,
  Radar, LayoutGrid,
} from 'lucide-react';
import { cn } from './utils/cn';
import { PairSelector } from './components/PairSelector';
import { ScannerView } from './components/ScannerView';
import { CircuitBreakerCard } from './components/CircuitBreakerCard';
import { HealthPill } from './components/HealthPill';
import { FilterChipRow } from './components/FilterChipRow';
import { HistoryDetailModal } from './components/HistoryDetailModal';
import { Ticker } from './components/Ticker';
import { DashboardView } from './components/DashboardView';
import { PairScope, TimeRange } from './utils/serverWr';

// ── Modular imports ──
import { useSignal, TradableSignalData, HistoryEntry } from './hooks/useSignal';
import { useHistory } from './hooks/useHistory';
import { useServerStats } from './hooks/useServerStats';

// ── Signal components ──
import { MaterialSignalCard } from './components/signal/MaterialSignalCard';

// ── History components ──
import { HistoryRow } from './components/history/HistoryRow';
import { StatCard } from './components/history/StatCard';
import { ServerStatsCard } from './components/history/ServerStatsCard';

// ── Settings components ──
import { SettingRow } from './components/settings/SettingRow';

// ── Common components ──
import { NavButton } from './components/common/NavButton';
import { MarketClosedCard } from './components/common/MarketClosedCard';

// ── Analysis components ──
import { TimeframeCard } from './components/analysis/TimeframeCard';
import { IndicatorGrid } from './components/analysis/IndicatorGrid';

type Tab = 'home' | 'analysis' | 'history' | 'settings' | 'scanner' | 'board';

export default function App() {
  const {
    selectedPair, setSelectedPair,
    signalData, setSignalData,
    loading, error, setError,
    signalMode, setMode,
    autoRefresh, setAutoRefresh,
    lastUpdated, refreshCountdown,
    favorites, toggleFavorite,
    history, setHistory,
    doFetch,
  } = useSignal();

  const { handleReport, clearHistory } = useHistory('history', history, setHistory);

  const { serverWrFilter, setServerWrFilter, serverStatsState, retry: retryServerWr } = useServerStats(selectedPair, 'history');

  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedIndicatorTF, setSelectedIndicatorTF] = useState('5min');
  const [detailEntry, setDetailEntry] = useState<HistoryEntry | null>(null);

  // Derived state
  const pendingCount = history.filter(h => !h.result || h.result === 'PENDING').length;
  const wins = history.filter(h => h.result === 'WIN').length;
  const losses = history.filter(h => h.result === 'LOSS').length;
  const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0';

  // Handlers
  const handleScannerSignalClick = useCallback((pair: string) => {
    setSelectedPair(pair);
    setActiveTab('home');
  }, [setSelectedPair]);

  const handleMarketClosedSwitch = useCallback((pair: string) => {
    setError(null);
    setActiveTab('home');
    if (pair !== selectedPair) {
      setSignalData(null);
      setSelectedPair(pair);
    } else {
      doFetch();
    }
  }, [setError, setSelectedPair, setSignalData, selectedPair, doFetch]);

  const marketClosedData = signalData && (signalData.marketStatus === 'CLOSED' || signalData.signal === null)
    ? signalData : null;

  const circuitBreakerData = signalData?.circuitBreaker?.tripped && !marketClosedData
    ? {
        pair: signalData.pair,
        cooldownUntil: signalData.circuitBreaker.cooldownUntil,
        lossStreak: signalData.circuitBreaker.lossStreak,
        wouldBeSignal: signalData.circuitBreaker.wouldBeSignal,
      } : null;

  const tradableSignalData = signalData?.signal && signalData.session && !circuitBreakerData
    ? (signalData as TradableSignalData) : null;

  return (
    <div className="min-h-screen bg-[#08080a] text-[#e3e2e6] gradient-mesh">
      {/* ── Premium App Bar ── */}
      <header className="sticky top-0 z-40" style={{ background: 'rgba(8,8,10,0.7)', backdropFilter: 'blur(24px) saturate(180%)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="px-4 py-2.5 safe-top">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4dd0e1, #26a69a)', boxShadow: '0 4px 16px rgba(var(--rgb-accent),0.25)' }}>
                  <Sparkles className="w-5 h-5 text-[#00363a]" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#00e676] border-2 border-[#08080a]" style={{ boxShadow: '0 0 6px #00e676' }} />
              </div>
              <div>
                <h1 className="font-bold text-[17px] leading-tight tracking-tight">Signal<span style={{ color: '#4dd0e1' }}>Pro</span></h1>
                <p className="text-[10px] text-[var(--t-low)] uppercase tracking-[0.15em] font-medium">AI Trading Intelligence</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {autoRefresh && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl" style={{ background: 'rgba(0,230,118,0.06)' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-[#00e676]" style={{ boxShadow: '0 0 4px #00e676', animation: 'pulse 2s infinite' }} />
                  <span className="text-[10px] text-[var(--c-buy)] font-bold number-tabular">{refreshCountdown}s</span>
                </div>
              )}
              <button
                onClick={() => doFetch()}
                disabled={loading}
                aria-label="Refresh signal"
                className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 transition-transform"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.04)' }}
              >
                <RefreshCw className={cn("w-[18px] h-[18px] text-[#b0b3b8]", loading && "animate-spin")} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 py-4 pb-24">
        {activeTab === 'home' && (
          <div className="-mx-4 -mt-4 mb-3"><Ticker /></div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-3 flex items-center gap-3 p-4 bg-[#93000a]/20 border border-[#93000a]/30 rounded-2xl">
            <AlertCircle className="w-5 h-5 text-[#ffb4ab] flex-shrink-0" />
            <p className="text-sm text-[#ffb4ab] flex-1">{error}</p>
            <button onClick={() => doFetch()} className="text-xs font-medium text-[#ffb4ab] px-3 py-1.5 bg-[#93000a]/30 rounded-full">Retry</button>
          </div>
        )}

        {/* Loading */}
        {loading && !signalData && (
          <div className="space-y-3">
            <div className="h-64 bg-[#1e1e23] rounded-[24px] shimmer" />
            <div className="h-32 bg-[#1e1e23] rounded-2xl shimmer" />
          </div>
        )}

        {/* ── HOME TAB ── */}
        {activeTab === 'home' && marketClosedData && (
          <MarketClosedCard data={marketClosedData} onSwitchPair={handleMarketClosedSwitch} />
        )}
        {activeTab === 'home' && circuitBreakerData && (
          <CircuitBreakerCard
            pair={circuitBreakerData.pair}
            cooldownUntil={circuitBreakerData.cooldownUntil}
            lossStreak={circuitBreakerData.lossStreak}
            wouldBeSignal={circuitBreakerData.wouldBeSignal}
            onSwitchPair={handleMarketClosedSwitch}
          />
        )}
        {activeTab === 'home' && tradableSignalData && (
          <div className="space-y-3 fade-in">
            <MaterialSignalCard data={tradableSignalData} onPairClick={() => setPickerOpen(true)} />

            {/* AI Insights */}
            {tradableSignalData.signal.aiValidation?.combined && (
              <div className="premium-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#3a0069]/30 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-[#b39ddb]" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">AI Analysis</div>
                      <div className="text-xs text-[#b0b3b8]">{tradableSignalData.signal.aiValidation.combined.model || 'Multi-model'}</div>
                    </div>
                  </div>
                  <div className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium",
                    tradableSignalData.signal.aiValidation.agrees
                      ? "bg-[var(--c-buy)]/20 text-[var(--c-buy)]"
                      : "bg-[#ffb74d]/20 text-[#ffb74d]"
                  )}>
                    {tradableSignalData.signal.aiValidation.combined.agreement === 'BOTH_AGREE' ? '✓ Both Agree' : tradableSignalData.signal.aiValidation.agrees ? '✓ Agree' : '⚠ Divergent'}
                  </div>
                </div>
                <div className="flex gap-2 mb-3">
                  {(['cerebras','groq'] as const).map(model => {
                    const m = tradableSignalData.signal.aiValidation![model];
                    if (!m) return null;
                    const ok = m.status === 'OK';
                    return (
                      <div key={model} className={cn("flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium", ok ? "bg-[var(--c-buy)]/10 text-[var(--c-buy)]" : "bg-[var(--c-sell)]/10 text-[var(--c-sell)]")}>
                        <div className={cn("w-1.5 h-1.5 rounded-full", ok ? "bg-[var(--c-buy)]" : "bg-[var(--c-sell)]")} />
                        {model.charAt(0).toUpperCase() + model.slice(1)} {ok ? `${m.confidence}%` : m.status}
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-[#27272d] rounded-xl p-3">
                    <div className="text-xs text-[#b0b3b8] mb-1">AI Signal</div>
                    <div className={cn("text-lg font-medium",
                      tradableSignalData.signal.aiValidation.combined.signal === 'BUY' && "text-[var(--c-buy)]",
                      tradableSignalData.signal.aiValidation.combined.signal === 'SELL' && "text-[var(--c-sell)]"
                    )}>{tradableSignalData.signal.aiValidation.combined.signal}</div>
                  </div>
                  <div className="bg-[#27272d] rounded-xl p-3">
                    <div className="text-xs text-[#b0b3b8] mb-1">Confidence</div>
                    <div className="text-lg font-medium number-tabular">{tradableSignalData.signal.aiValidation.combined.confidence}%</div>
                  </div>
                </div>
                <p className="text-sm text-[#c4c6d0] leading-relaxed">{tradableSignalData.signal.aiValidation.combined.reason}</p>
                {tradableSignalData.signal.aiValidation.combined.concerns && (
                  <div className="mt-2 flex items-start gap-2 p-2.5 bg-[#ffb74d]/10 rounded-xl border border-[#ffb74d]/20">
                    <span className="text-[#ffb74d] text-xs mt-0.5">⚠</span>
                    <p className="text-xs text-[#ffb74d]/90 leading-relaxed">{tradableSignalData.signal.aiValidation.combined.concerns}</p>
                  </div>
                )}
              </div>
            )}

            {/* Structure Verdict */}
            {tradableSignalData.signal.structureVerdict && tradableSignalData.signal.structureVerdict.overall !== 'N/A' && (
              <div className="premium-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[var(--c-info)]/20 flex items-center justify-center"><Layers className="w-4 h-4 text-[var(--c-info)]" /></div>
                    <div>
                      <div className="text-sm font-medium">Market Structure</div>
                      <div className="text-xs text-[#b0b3b8]">BOS / CHoCH / Bias</div>
                    </div>
                  </div>
                  <div className={cn("px-3 py-1 rounded-full text-xs font-bold",
                    tradableSignalData.signal.structureVerdict.overall === 'ALIGNED' && "bg-[var(--c-buy)]/20 text-[var(--c-buy)]",
                    tradableSignalData.signal.structureVerdict.overall === 'AGAINST' && "bg-[var(--c-sell)]/20 text-[var(--c-sell)]",
                    tradableSignalData.signal.structureVerdict.overall === 'MIXED' && "bg-[#ffb74d]/20 text-[#ffb74d]",
                    tradableSignalData.signal.structureVerdict.overall === 'NEUTRAL' && "bg-[#9e9e9e]/20 text-[#9e9e9e]",
                  )}>
                    {tradableSignalData.signal.structureVerdict.overall === 'ALIGNED' && '✓ ALIGNED'}
                    {tradableSignalData.signal.structureVerdict.overall === 'AGAINST' && '✗ AGAINST'}
                    {tradableSignalData.signal.structureVerdict.overall === 'MIXED' && '~ MIXED'}
                    {tradableSignalData.signal.structureVerdict.overall === 'NEUTRAL' && '— NEUTRAL'}
                  </div>
                </div>
                <div className="flex items-center justify-between mb-3 bg-[#27272d] rounded-xl p-3">
                  <div className="text-xs text-[#b0b3b8]">Structure says</div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-bold",
                      tradableSignalData.signal.structureVerdict.direction === 'BUY' && "text-[var(--c-buy)]",
                      tradableSignalData.signal.structureVerdict.direction === 'SELL' && "text-[var(--c-sell)]",
                      (tradableSignalData.signal.structureVerdict.direction === 'NEUTRAL' || tradableSignalData.signal.structureVerdict.direction === 'MIXED') && "text-[#9e9e9e]",
                    )}>{tradableSignalData.signal.structureVerdict.direction}</span>
                    {tradableSignalData.signal.structureVerdict.strength !== 'NEUTRAL' && (
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium",
                        tradableSignalData.signal.structureVerdict.strength === 'STRONG' ? "bg-[var(--c-info)]/20 text-[var(--c-info)]" : "bg-[#9e9e9e]/15 text-[#9e9e9e]"
                      )}>{tradableSignalData.signal.structureVerdict.strength}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {Object.entries(tradableSignalData.signal.structureVerdict.perTimeframe).map(([tf, v]) => (
                    <div key={tf} className={cn("flex-1 text-center py-2 rounded-xl text-xs font-medium",
                      v.verdict === 'AGREE' && "bg-[var(--c-buy)]/10 text-[var(--c-buy)]",
                      v.verdict === 'DISAGREE' && "bg-[var(--c-sell)]/10 text-[var(--c-sell)]",
                      v.verdict === 'NEUTRAL' && "bg-[#27272d] text-[#b0b3b8]",
                    )}>
                      <div className="font-bold">{tf.toUpperCase()}</div>
                      <div className="text-[10px] mt-0.5 opacity-80">{v.bias?.replace('_', ' ')}</div>
                      <div className="text-[10px] mt-0.5">{v.verdict}</div>
                    </div>
                  ))}
                </div>
                {tradableSignalData.signal.structureVerdict.overall === 'AGAINST' && (
                  <p className="mt-3 text-xs text-[var(--c-sell)]/80 bg-[var(--c-sell)]/10 rounded-lg p-2.5">
                    ⚠ Structure is against the signal — consider skipping or wait for structure to align.
                  </p>
                )}
                {tradableSignalData.signal.structureVerdict.overall === 'MIXED' && (
                  <p className="mt-3 text-xs text-[#ffb74d]/80 bg-[#ffb74d]/10 rounded-lg p-2.5">
                    ~ Mixed structure — trade with caution, check the best timeframe.
                  </p>
                )}
              </div>
            )}

            {/* Sessions */}
            <div className="premium-card p-4">
              <div className="flex items-center gap-2 mb-3"><Globe2 className="w-4 h-4 text-[var(--c-info)]" /><span className="text-sm font-medium">Market Sessions</span></div>
              <div className="flex flex-wrap gap-2">
                {tradableSignalData.session.sessions.map(s => <div key={s} className="px-3 py-1.5 bg-[#27272d] rounded-lg text-sm font-medium">{s}</div>)}
                <div className={cn("px-3 py-1.5 rounded-lg text-sm font-medium",
                  tradableSignalData.session.quality === 'HIGH' && "bg-[var(--c-buy)]/20 text-[var(--c-buy)]",
                  tradableSignalData.session.quality === 'MEDIUM' && "bg-[#ffb74d]/20 text-[#ffb74d]",
                  tradableSignalData.session.quality === 'LOW' && "bg-[var(--c-sell)]/20 text-[var(--c-sell)]"
                )}>{tradableSignalData.session.quality} Quality</div>
              </div>
            </div>

            {/* Entry Reason */}
            <div className="premium-card p-4">
              <div className="flex items-center gap-2 mb-2"><Zap className="w-4 h-4 text-[#ffb74d]" /><span className="text-sm font-medium">Entry Reasoning</span></div>
              <p className="text-sm text-[#c4c6d0] leading-relaxed">{tradableSignalData.signal.entryReason}</p>
            </div>

            {/* Market Regime */}
            <div className="premium-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[var(--c-info)]" /><span className="text-sm font-medium">Market Regime</span></div>
                <span className={cn("px-3 py-1 rounded-full text-xs font-medium",
                  tradableSignalData.signal.marketRegime === 'TRENDING' && "bg-[var(--c-buy)]/20 text-[var(--c-buy)]",
                  tradableSignalData.signal.marketRegime === 'RANGING' && "bg-[#ffb74d]/20 text-[#ffb74d]"
                )}>{tradableSignalData.signal.marketRegime}</span>
              </div>
              <p className="text-sm text-[#b0b3b8]">{tradableSignalData.signal.regimeAdvice}</p>
            </div>
          </div>
        )}

        {/* ── ANALYSIS TAB ── */}
        {activeTab === 'analysis' && tradableSignalData && (
          <div className="space-y-3 fade-in">
            <div className="flex items-center gap-3 px-1 pt-1 pb-1">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--c-info)]/10"><Layers className="w-4 h-4 text-[var(--c-info)]" /></div>
              <div>
                <h2 className="text-[17px] font-bold leading-tight tracking-tight">Multi-Timeframe Analysis</h2>
                <p className="text-[11px] text-[var(--t-low)]">Signal strength across all timeframes</p>
              </div>
            </div>
            {Object.entries(tradableSignalData.signal.recommendations).map(([tf, rec]) => (
              <TimeframeCard key={tf} tf={tf} rec={rec} />
            ))}
            <div className="mt-4 mb-2 px-1"><h3 className="label-caption">Technical Indicators</h3></div>
            <IndicatorGrid
              recommendations={tradableSignalData.signal.recommendations}
              timeframeAnalysis={tradableSignalData.signal.timeframeAnalysis}
              selectedTF={selectedIndicatorTF}
              onSelectTF={setSelectedIndicatorTF}
            />
          </div>
        )}

        {/* ── SCANNER TAB ── */}
        {activeTab === 'scanner' && <ScannerView onSignalClick={handleScannerSignalClick} />}

        {/* ── BOARD TAB ── */}
        {activeTab === 'board' && (
          <DashboardView onPairSelect={(pair) => { setSelectedPair(pair); setActiveTab('home'); }} />
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <div className="fade-in">
            <div className="mb-4">
              <h2 className="text-[26px] font-bold mb-0.5 tracking-tight">Signal History</h2>
              <p className="label-caption">Track your trading performance</p>
            </div>
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="label-caption">Your Local History</h3>
              <span className="text-[10px] text-[var(--t-faint)]">This device only</span>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              <StatCard label="Total" value={history.length} color="var(--c-info)" />
              <StatCard label="Wins" value={wins} color="var(--c-buy)" />
              <StatCard label="Losses" value={losses} color="var(--c-sell)" />
              <StatCard label="Win %" value={`${winRate}%`} color="#ffb74d" />
            </div>

            {/* Honesty UI: n-backed win-rate, no fake 75%, breakeven */}
            <div className="space-y-2 mb-3">
              <FilterChipRow
                label="Pair:" chips={[{ id: 'all', label: 'All Pairs' }, { id: 'selected', label: selectedPair }]}
                selectedId={serverWrFilter.pairScope}
                onSelect={(id) => setServerWrFilter(prev => ({ ...prev, pairScope: id as PairScope }))}
              />
              <FilterChipRow
                label="Time:" chips={[{ id: 'all', label: 'All Time' }, { id: 'today', label: 'Today' }, { id: '7d', label: 'Last 7 Days' }]}
                selectedId={serverWrFilter.timeRange}
                onSelect={(id) => setServerWrFilter(prev => ({ ...prev, timeRange: id as TimeRange }))}
              />
            </div>
            <ServerStatsCard state={serverStatsState} selectedPair={selectedPair} onRetry={retryServerWr} />

            <div className="surface-group">
              {history.length === 0 ? (
                <div className="p-10 text-center">
                  <Clock className="w-12 h-12 text-[#2a2a2f] mx-auto mb-3" />
                  <p className="text-[#b0b3b8] font-medium mb-1">No history yet</p>
                  <p className="text-[var(--t-low)] text-sm">Generated signals will appear here</p>
                </div>
              ) : (
                history.slice(0, 30).map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} onReport={handleReport} onDelete={(id) => setHistory(prev => prev.filter(h => h.id !== id))} onDetail={(e) => setDetailEntry(e)} />
                ))
              )}
            </div>
            {history.length > 0 && (
              <button onClick={clearHistory} className="w-full mt-4 py-3 text-[#ff5252] font-medium text-sm active:scale-95 transition-transform">
                Clear History
              </button>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div className="fade-in">
            <div className="mb-4">
              <h2 className="text-[26px] font-bold mb-0.5 tracking-tight">Settings</h2>
              <p className="label-caption">Customize your experience</p>
            </div>
            <HealthPill />
            <div className="surface-group mb-3">
              <SettingRow icon={autoRefresh ? RefreshCw : Zap} iconColor="var(--c-info)" label="Auto Refresh" description="Update signals every 60s" toggle toggleValue={autoRefresh} onToggle={() => setAutoRefresh(!autoRefresh)} />
              <SettingRow icon={Layers} iconColor="#b39ddb" label="Signal Mode"
                description={signalMode === 'fx' ? 'FX — SL/TP (spot)' : signalMode === 'both' ? 'BOTH — SL/TP + expiry' : 'FTT — fixed-time'}
                value={signalMode === 'fx' ? '💹 FX' : signalMode === 'both' ? '🔄 BOTH' : '⏱ FTT'}
                isLast
                onClick={() => {
                  const next = signalMode === 'ftt' ? 'fx' : signalMode === 'fx' ? 'both' : 'ftt';
                  setMode(next);
                }}
              />
            </div>
            <div className="surface-group mb-3">
              <SettingRow icon={Trash2} iconColor="var(--c-sell)" label="Clear History" description={`${history.length} entries`} onClick={() => setHistory([])} isLast />
            </div>
            <div className="surface-group">
              <SettingRow icon={Info} iconColor="var(--c-info)" label="Version" value="2.0.0" />
              <SettingRow icon={Code} iconColor="#b39ddb" label="API Method" value={signalData?.signal?.method?.split('_').slice(0, 2).join(' ') || 'v6.9.2'} isLast />
            </div>
            <div className="text-center py-8">
              <div className="inline-flex items-center gap-2 text-xs text-[var(--t-low)]"><Code className="w-4 h-4" /><span>SignalPro · AI Trading Intelligence</span></div>
              {lastUpdated && <p className="text-[10px] text-[#4a4a4f] mt-2">Last sync: {lastUpdated.toLocaleTimeString()}</p>}
            </div>
          </div>
        )}
      </main>

      {/* ── Bottom Navigation ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 safe-bottom" style={{ background: 'rgba(8,8,10,0.85)', backdropFilter: 'blur(24px) saturate(180%)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center justify-around py-1.5">
          <NavButton icon={TrendingUp} label="Signal" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
          <NavButton icon={Radar} label="Scanner" active={activeTab === 'scanner'} onClick={() => setActiveTab('scanner')} />
          <NavButton icon={LayoutGrid} label="Board" active={activeTab === 'board'} onClick={() => setActiveTab('board')} />
          <NavButton icon={BarChart3} label="Analysis" active={activeTab === 'analysis'} onClick={() => setActiveTab('analysis')} />
          <NavButton icon={History} label="History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} badge={pendingCount} />
          <NavButton icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      </nav>

      {/* Pair Picker */}
      <PairSelector isOpen={pickerOpen} selectedPair={selectedPair} favorites={favorites} onToggleFavorite={toggleFavorite}
        onSelect={(p) => { setSelectedPair(p); setPickerOpen(false); }} onClose={() => setPickerOpen(false)} />

      {/* History Detail Modal */}
      <HistoryDetailModal entry={detailEntry ? {
        pair: detailEntry.pair, direction: detailEntry.direction, result: detailEntry.result,
        confidence: detailEntry.confidence, grade: detailEntry.grade,
        entryPrice: detailEntry.entryPrice, exitPrice: detailEntry.exitPrice,
        timestamp: detailEntry.timestamp, expiryMinutes: detailEntry.expiryMinutes,
        timeframe: detailEntry.timeframe,
        structureVerdict: detailEntry.structureVerdict,
        aiStatus: detailEntry.aiStatus, coreConfidence: detailEntry.coreConfidence,
        entrySource: detailEntry.entrySource, autoChecked: detailEntry.autoChecked,
      } : null} onClose={() => setDetailEntry(null)} />
    </div>
  );
}
