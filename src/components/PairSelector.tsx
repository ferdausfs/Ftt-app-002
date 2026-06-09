import { useState } from 'react';
import { Search, X, Star, TrendingUp } from 'lucide-react';
import { cn, haptic } from '../utils/cn';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedPair: string;
  onSelect: (pair: string) => void;
  favorites: string[];
  onToggleFavorite: (pair: string) => void;
}

const ALL_PAIRS = {
  'Forex Majors': ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD'],
  'Forex Crosses': ['EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'EUR/AUD', 'GBP/CHF', 'CHF/JPY'],
  'Commodities': ['XAU/USD', 'XAG/USD', 'WTI/USD'],
  'Crypto': ['BTC/USD', 'ETH/USD', 'XRP/USD', 'LTC/USD', 'BNB/USD', 'SOL/USD'],
  'OTC': ['EURUSD-OTC', 'GBPUSD-OTC', 'USDJPY-OTC', 'AUDCAD-OTC', 'EURGBP-OTC']
};

export function PairSelector({ isOpen, onClose, selectedPair, onSelect, favorites, onToggleFavorite }: Props) {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filteredPairs = Object.entries(ALL_PAIRS).reduce((acc, [category, pairs]) => {
    const filtered = pairs.filter(p => p.toLowerCase().includes(search.toLowerCase()));
    if (filtered.length > 0) acc[category] = filtered;
    return acc;
  }, {} as Record<string, string[]>);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm fade-in" />
      
      {/* Sheet */}
      <div 
        className="relative w-full max-w-lg ios-blur-strong rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-white/30 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Select Pair</h2>
          <button 
            onClick={() => { haptic('light'); onClose(); }}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center haptic-tap"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pairs..."
              className="w-full bg-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-white/40 focus:outline-none focus:bg-white/15 transition-colors"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">
          {favorites.length > 0 && !search && (
            <div className="mb-4">
              <h3 className="text-xs uppercase tracking-wider text-white/40 font-semibold mb-2 px-1">
                Favorites
              </h3>
              <div className="ios-card rounded-2xl overflow-hidden">
                {favorites.map((pair, idx) => (
                  <PairItem
                    key={pair}
                    pair={pair}
                    isSelected={selectedPair === pair}
                    isFavorite={true}
                    isLast={idx === favorites.length - 1}
                    onSelect={() => { haptic('medium'); onSelect(pair); onClose(); }}
                    onToggleFavorite={() => { haptic('light'); onToggleFavorite(pair); }}
                  />
                ))}
              </div>
            </div>
          )}

          {Object.entries(filteredPairs).map(([category, pairs]) => (
            <div key={category} className="mb-4">
              <h3 className="text-xs uppercase tracking-wider text-white/40 font-semibold mb-2 px-1">
                {category}
              </h3>
              <div className="ios-card rounded-2xl overflow-hidden">
                {pairs.map((pair, idx) => (
                  <PairItem
                    key={pair}
                    pair={pair}
                    isSelected={selectedPair === pair}
                    isFavorite={favorites.includes(pair)}
                    isLast={idx === pairs.length - 1}
                    onSelect={() => { haptic('medium'); onSelect(pair); onClose(); }}
                    onToggleFavorite={() => { haptic('light'); onToggleFavorite(pair); }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PairItem({ 
  pair, 
  isSelected, 
  isFavorite,
  isLast,
  onSelect, 
  onToggleFavorite 
}: { 
  pair: string; 
  isSelected: boolean;
  isFavorite: boolean;
  isLast: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const isOTC = pair.includes('OTC');
  const isCrypto = ['BTC', 'ETH', 'XRP', 'LTC', 'BNB', 'SOL'].some(c => pair.includes(c));
  const isCommodity = pair.startsWith('XAU') || pair.startsWith('XAG') || pair.startsWith('WTI');

  return (
    <div className={cn(
      "flex items-center justify-between p-3.5 haptic-tap cursor-pointer",
      !isLast && "border-b border-white/[0.06]",
      isSelected && "bg-white/5"
    )} onClick={onSelect}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold",
          isOTC ? "bg-[#ff9f0a]/20 text-[#ff9f0a]" :
          isCrypto ? "bg-[#bf5af2]/20 text-[#bf5af2]" :
          isCommodity ? "bg-[#ffd60a]/20 text-[#ffd60a]" :
          "bg-[#0a84ff]/20 text-[#0a84ff]"
        )}>
          {isOTC ? 'OTC' : isCrypto ? '₿' : isCommodity ? <TrendingUp className="w-4 h-4" /> : pair.slice(0, 2)}
        </div>
        <div>
          <div className="text-white font-semibold text-[15px]">{pair}</div>
          <div className="text-white/40 text-xs">
            {isOTC ? 'Over-the-counter' : isCrypto ? 'Cryptocurrency' : isCommodity ? 'Commodity' : 'Forex Pair'}
          </div>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
        className="w-8 h-8 rounded-full flex items-center justify-center haptic-tap"
      >
        <Star className={cn(
          "w-4 h-4 transition-colors",
          isFavorite ? "fill-[#ffd60a] text-[#ffd60a]" : "text-white/30"
        )} />
      </button>
    </div>
  );
}
