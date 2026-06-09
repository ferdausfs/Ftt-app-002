export interface TimeframeRec {
  direction: 'BUY' | 'SELL' | 'NO_TRADE' | string;
  score: { up: number; down: number; diff: number };
  confluence: string;
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
  indicators?: Record<string, string | number>;
}

export interface SignalData {
  pair: string;
  assetType: string;
  marketStatus: string;
  session: {
    sessions: string[];
    overlap: string;
    quality: string;
    hour: number;
  };
  isExoticPair?: boolean;
  signal: {
    finalSignal: 'BUY' | 'SELL' | 'NEUTRAL' | 'NO_TRADE';
    confidence: string;
    grade: {
      grade: string;
      label: string;
      description: string;
    };
    marketRegime: string;
    regimeAdvice: string;
    marketCondition?: string[];
    alignment?: string;
    higherTFTrend?: string;
    entryReason: string;
    filtersApplied?: string[];
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
    timeframeAnalysis?: Record<string, TimeframeRec & { categoryScores?: Record<string, any>; indicators?: Record<string, any> }>;
    aiValidation?: {
      combined?: {
        status: string;
        signal: string;
        confidence: number;
        reason: string;
        concerns?: string;
        model?: string;
      };
      combinedAgreed?: boolean;
      agrees?: boolean;
    };
    votes?: {
      BUY: number;
      SELL: number;
      NO_TRADE: number;
      total: number;
      weightedBuy: number;
      weightedSell: number;
      weightedNoTrade: number;
    };
    sessionWeight?: number;
    method?: string;
  };
  source?: string;
  timestamp: string;
  nextRefresh?: string;
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
