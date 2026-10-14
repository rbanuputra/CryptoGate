import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import VerdictBadge from './VerdictBadge';
import { formatNumber, formatPrice } from '@/lib/format';

const columnTooltips = {
  name: 'Token name and ticker symbol. Click to sort alphabetically.',
  price: 'Current market price from CoinGecko in USD.',
  market_cap: 'Market Cap = Circulating Supply × Price. Reflects the current valuation based on tokens in circulation.',
  volume_24h: '24-hour trading volume across all exchanges. High volume relative to market cap indicates strong liquidity.',
  mc_fdv: 'Market Cap / Fully Diluted Valuation. Ratio closer to 1.0 means most tokens are already in circulation — lower dilution risk.',
  gate1: 'Gate 1 — Tokenomics & Emissions (default weight: 35%). Evaluates supply distribution, unlock schedules, and inflation pressure. Score 0–10.',
  gate2: 'Gate 2 — Valuation Metrics (default weight: 40%). Analyzes revenue, fees, P/E ratios, and value accrual mechanisms. Score 0–10.',
  gate3: 'Gate 3 — Manipulation Detection (default weight: 25%). Checks holder concentration, wash trading signals, and order book depth. Score 0–10.',
  composite_score: 'Weighted average of G1, G2, G3 scores (default: 35/40/25). Optionally adjusted by Narrative Momentum multiplier. Score 0–10.',
  verdict: 'Final screening verdict based on composite score. PASS (≥7.0), WATCH (4.0–6.9), FAIL (<4.0).',
};

const PAGE_SIZES = [10, 50, 100];

export default function TokenTable({ tokens, showVerdict = true }) {
  const [sortField, setSortField] = useState('composite_score');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  function handleSort(field) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(1);
  }

  function getValue(token, field) {
    switch (field) {
      case 'name': return token.name ?? '';
      case 'price': return Number(token.latest_market_snapshot?.price ?? 0);
      case 'market_cap': return Number(token.latest_market_snapshot?.market_cap ?? 0);
      case 'volume_24h': return Number(token.latest_market_snapshot?.volume_24h ?? 0);
      case 'mc_fdv': {
        const ms = token.latest_market_snapshot;
        const mc = Number(ms?.market_cap ?? 0);
        const fdv = Number(ms?.fdv ?? 0);
        return mc > 0 && fdv > 0 ? mc / fdv : 0;
      }
      case 'composite_score': return Number(token.latest_composite_score?.composite_score ?? -1);
      case 'gate1': return Number(token.gate_scores?.find(g => g.gate === 1)?.score ?? -1);
      case 'gate2': return Number(token.gate_scores?.find(g => g.gate === 2)?.score ?? -1);
      case 'gate3': return Number(token.gate_scores?.find(g => g.gate === 3)?.score ?? -1);
      default: return 0;
    }
  }

  const sorted = [...tokens].sort((a, b) => {
    const aVal = getValue(a, sortField);
    const bVal = getValue(b, sortField);
    if (sortField === 'name') {
      return sortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    }
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const paged = sorted.slice(startIdx, startIdx + pageSize);

  function SortIcon({ field }) {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
    return sortDir === 'asc'
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  }

  function SortableHead({ field, children, className }) {
    return (
      <TableHead
        className={`cursor-pointer select-none ${className || ''}`}
        onClick={() => handleSort(field)}
      >
        <Tooltip>
          <TooltipTrigger className="inline-flex items-center underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
            {children}
            <SortIcon field={field} />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {columnTooltips[field]}
          </TooltipContent>
        </Tooltip>
      </TableHead>
    );
  }

  function Score({ score }) {
    if (score === undefined || score === null) return <span className="text-muted-foreground">—</span>;
    const num = Number(score);
    if (isNaN(num) || num < 0) return <span className="text-muted-foreground">—</span>;
    let color = 'text-negative';
    if (num >= 8) color = 'text-positive';
    else if (num >= 6) color = 'text-chart-2';
    else if (num >= 4) color = 'text-warning';

    return <span className={`tabular-nums font-medium ${color}`}>{num.toFixed(1)}</span>;
  }

  return (
    <>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <SortableHead field="name">Name</SortableHead>
          <SortableHead field="price" className="text-right">Price</SortableHead>
          <SortableHead field="market_cap" className="text-right">Market Cap</SortableHead>
          <SortableHead field="volume_24h" className="text-right">Vol 24h</SortableHead>
          {showVerdict && (
            <>
              <SortableHead field="mc_fdv" className="text-right">MC/FDV</SortableHead>
              <SortableHead field="gate1" className="text-right">G1</SortableHead>
              <SortableHead field="gate2" className="text-right">G2</SortableHead>
              <SortableHead field="gate3" className="text-right">G3</SortableHead>
              <SortableHead field="composite_score" className="text-right">Score</SortableHead>
              <TableHead className="text-right">
                <Tooltip>
                  <TooltipTrigger className="underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
                    Verdict
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {columnTooltips.verdict}
                  </TooltipContent>
                </Tooltip>
              </TableHead>
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {paged.map((token, index) => {
          const ms = token.latest_market_snapshot;
          const cs = token.latest_composite_score;
          const mcFdv = ms?.market_cap && ms?.fdv ? (ms.market_cap / ms.fdv) : null;
          return (
            <TableRow key={token.id}>
              <TableCell className="text-muted-foreground tabular-nums">{startIdx + index + 1}</TableCell>
              <TableCell>
                <Link to={`/token/${token.id}`} className="flex items-center gap-2.5">
                  {token.logo_url ? (
                    <img src={token.logo_url} alt="" className="h-6 w-6 rounded-full" />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                      {token.symbol?.slice(0, 2)}
                    </div>
                  )}
                  <span className="font-medium">{token.name}</span>
                  <span className="text-muted-foreground">{token.symbol}</span>
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatPrice(ms?.price)}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(ms?.market_cap)}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(ms?.volume_24h)}</TableCell>
              {showVerdict && (
                <>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{mcFdv ? mcFdv.toFixed(2) : '—'}</TableCell>
                  <TableCell className="text-right"><Score score={token.gate_scores?.find(g => g.gate === 1)?.score} /></TableCell>
                  <TableCell className="text-right"><Score score={token.gate_scores?.find(g => g.gate === 2)?.score} /></TableCell>
                  <TableCell className="text-right"><Score score={token.gate_scores?.find(g => g.gate === 3)?.score} /></TableCell>
                  <TableCell className="text-right"><Score score={cs?.composite_score} /></TableCell>
                  <TableCell className="text-right"><VerdictBadge verdict={cs?.verdict} /></TableCell>
                </>
              )}
            </TableRow>
          );
        })}
        {paged.length === 0 && (
          <TableRow>
            <TableCell colSpan={showVerdict ? 11 : 5} className="h-24 text-center text-muted-foreground">
              No tokens yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>

    {sorted.length > 10 && (
      <div className="flex items-center justify-between border-t px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Show</span>
          <div className="flex gap-1">
            {PAGE_SIZES.map(size => (
              <button
                key={size}
                onClick={() => { setPageSize(size); setPage(1); }}
                className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                  pageSize === size ? 'bg-accent text-accent-foreground' : 'hover:text-foreground'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
          <span className="ml-2">{sorted.length} tokens</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {startIdx + 1}–{Math.min(startIdx + pageSize, sorted.length)} of {sorted.length}
          </span>
          <Button
            variant="outline" size="icon" className="h-7 w-7"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage <= 1}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline" size="icon" className="h-7 w-7"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    )}
    </>
  );
}
