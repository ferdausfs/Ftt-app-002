export interface TimeframeRec {
  direction: 'BUY' | 'SELL' | 'NO_TRADE' | string;
  score: { up: number; down: number; diff: number };
  confluence: string | number;
  alignedWithHTF?: boolean;
  expiry: {
    candles: number;
    candleSize: string;
    totalMinutes: number;
    humanReadable: string;
    countdown: {
      secondsLeft: number;
      minutesLeft: number;
      label: string;
    };
  };
  entry: {
    price: number;
    candleTime: string;
    candleDirection: string;
  };
  candleConfirmed?: boolean;
  patterns?: string[];
  divergence?: { rsi: string; macd: string };
  diCrossover?: string;
  // indicators live inside timeframeAnalysis, but also accessible here via App mapping
  indicators?: Record<string, string | number>;
  // structure fields (from timeframeAnalysis)
  structure?: {
    bias: string;
    bos: any;
    choch: any;
    sweep: any;
    recentEvents?: Array<{ type: string; barsAgo: number; level: number }>;
    multiplier?: { direction: string | null; value: number };
    summary: string;
  };
  structureApplied?: string;
  categoryScores?: Record<string, any>;
}

export interface AIValidationSingle {
  status: string;
  signal?: string;
  confidence?: number;
  reason?: string;
  concerns?: string;
  model?: string;
  message?: string;
  httpStatus?: number;
}

export interface AIValidation {
  status?: string; // 'SKIPPED'
  cerebras?: AIValidationSingle;
  groq?: AIValidationSingle;
  combined?: AIValidationSingle & { agreement?: string };
  combinedAgreed?: boolean;
  agrees?: boolean;
}

export interface StructureVerdictTF {
  verdict: 'AGREE' | 'DISAGREE' | 'NEUTRAL';
  bias: string;
  structureDirection: string;
  multiplier: number;
  detail: string;
}

export interface StructureVerdict {
  direction: 'BUY' | 'SELL' | 'MIXED' | 'NEUTRAL';
  strength: 'STRONG' | 'WEAK' | 'NEUTRAL';
  overall: 'ALIGNED' | 'AGAINST' | 'MIXED' | 'NEUTRAL' | 'N/A';
  perTimeframe: Record<string, StructureVerdictTF>;
}

export interface SignalData {
  id?: string;
  signalId?: string;
  pair: string;
  basePair?: string;
  assetType: string;
  isOTC?: boolean;
  otcBroker?: string;
  marketStatus: string;
  message?: string;
  nextOpen?: string;
  nextOpenReadable?: string;
  opensIn?: string;
  advice?: string;
  cryptoAlternative?: string;
  session?: {
    sessions: string[];
    overlap?: string;
    quality: string;
    hour?: number;
  };
  isExoticPair?: boolean;
  signal: {
    finalSignal: 'BUY' | 'SELL' | 'NEUTRAL' | 'NO_TRADE';
    confidence: string;
    // Backend v6.9.2 (B5): engine confidence BEFORE filters/AI adjustment.
    coreConfidence?: number;
    grade: {
      grade: string;
      label: string;
      description: string;
    };
    assetType?: string;
    isOTC?: boolean;
    otcNote?: string;
    marketRegime: string;
    regimeAdvice: string;
    marketCondition?: string[];
    alignment?: string;
    higherTFTrend?: string;
    entryReason: string;
    filtersApplied?: string[];
    newsBlackout?: any;
    aiValidation?: AIValidation;
    bestTimeframe: {
      timeframe: string;
      direction: string;
      score: number;
      confluence: number;
      reason?: string;
      expiry: {
        humanReadable: string;
        countdown: {
          secondsLeft: number;
          minutesLeft: number;
          label: string;
        };
      };
    };
    recommendations: {
      '1min': TimeframeRec;
      '5min': TimeframeRec;
      '15min': TimeframeRec;
    };
    timeframeAnalysis?: Record<string, TimeframeRec & {
      categoryScores?: Record<string, any>;
      indicators?: Record<string, any>;
      structure?: TimeframeRec['structure'];
      structureApplied?: string;
      deadMarket?: boolean;
    }>;
    votes?: {
      BUY: number;
      SELL: number;
      NO_TRADE: number;
      total: number;
      weightedBuy: number;
      weightedSell: number;
      weightedNoTrade: number;
    };
    averageConfluence?: number;
    structureSummary?: Record<string, {
      bias: string;
      bos: string;
      choch: string;
      sweep: string;
      applied: string;
      multiplier: number;
    }>;
    structureVerdict?: StructureVerdict;
    // Fill status (2026-08-05): INSTANT (price at entry, take now) or
    // PENDING_ENTRY (price away — wait). Comes from engine.
    fillStatus?: 'INSTANT' | 'PENDING_ENTRY';
    entryPrice?: number;
    currentPrice?: number;
    entryDistancePct?: number;
    mode?: 'ftt' | 'fx' | 'both';
    fxLevels?: { entry?: number; sl?: number; tp?: number; rr?: number };
    sessionWeight?: number;
    candleQuality?: number;
    method?: string;
    generatedAt?: string;
    // OTC-specific
    otcPatterns?: {
      consecutiveCandles?: { count: number; direction: string };
      wickRejection?: any;
      roundNumber?: any;
      sizeAnomaly?: any;
      timeContext?: { quality: string; reason: string; penaltyPct: number };
      signals?: any[];
      confluenceBonus?: number;
    };
  };
  source?: string;
  dataNote?: string;
  timestamp: string;
  nextRefresh?: string;
  cacheHits?: number;
  // Backend v6.9.2: which candles backed this signal (0 cache hits = FRESH_API,
  // 1-2 = CACHE_PARTIAL, 3 = CACHE_ALL). Present on the response body.
  entrySource?: string;
  dataStatus?: Record<string, string>;
  // Backend v6.9.2 per-pair circuit breaker. Present only while a pair is in
  // cooldown; the signal is forced to NO_TRADE but still recorded as a shadow
  // row server-side, so `wouldBeSignal` carries the suppressed direction.
  circuitBreaker?: {
    tripped: boolean;
    cooldownUntil: string;
    lossStreak?: number;
    wouldBeSignal?: string;
    cbShadow?: boolean;
  };
}

export interface HistoryItem {
  id: string;
  pair: string;
  direction: string;
  confidence: number;
  result?: 'WIN' | 'LOSS' | 'PENDING';
  timestamp: string;
  entryPrice?: number;
}

export interface SignalStats {
  pair: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
}

export interface WorkerHealth {
  status?: string;
  version?: string;
  apiKeysLoaded?: number;
  quotaUsedToday?: number;
  rotationIdx?: number;
}
