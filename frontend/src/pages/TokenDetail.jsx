import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Globe, ExternalLink, RefreshCw, Loader2, Play, TrendingUp, TrendingDown, Plus, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import VerdictBadge from '@/components/tokens/VerdictBadge';
import GateScoreCard from '@/components/tokens/GateScoreCard';
import InvestmentPlanner from '@/components/tokens/InvestmentPlanner';
import { fetchToken, fetchTokenScores, refreshTokenMarketData, scoreToken, fetchDefiData, fetchHolderData, fetchScoreHistory, fetchMomentum, fetchWatchlists, addTokenToWatchlist } from '@/lib/api';
import { formatNumber, formatPrice, formatSupply } from '@/lib/format';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function TokenDetail() {
  const { id } = useParams();
  const [token, setToken] = useState(null);
  const [scores, setScores] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [showLangId, setShowLangId] = useState(true);
  const [defi, setDefi] = useState(null);
  const [defiLoading, setDefiLoading] = useState(false);
  const [holders, setHolders] = useState(null);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [momentumData, setMomentumData] = useState(null);
  const [momentumLoading, setMomentumLoading] = useState(false);
  const [watchlists, setWatchlists] = useState([]);
  const [showWatchlistMenu, setShowWatchlistMenu] = useState(false);
  const [addingToWl, setAddingToWl] = useState(null);
  const [addedToWl, setAddedToWl] = useState(null);

  useEffect(() => {
    loadToken();
    fetchWatchlists().then(data => setWatchlists(data.data || data)).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!showWatchlistMenu) return;
    const close = (e) => {
      if (!e.target.closest('.watchlist-menu')) setShowWatchlistMenu(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showWatchlistMenu]);

  async function loadToken() {
    try {
      setLoading(true);
      const [tokenData, scoreData] = await Promise.all([
        fetchToken(id),
        fetchTokenScores(id).catch(() => null),
      ]);
      setToken(tokenData);
      setScores(scoreData);
      if (tokenData.latest_defi_metric) {
        setDefi({
          found: true,
          metrics: tokenData.latest_defi_metric,
          ratios: {},
        });
      } else {
        fetchDefiData(tokenData.id).then(d => setDefi(d)).catch(() => {});
      }
      if (tokenData.latest_holder_snapshot) {
        setHolders({
          found: true,
          analysis: {
            top10_pct: tokenData.latest_holder_snapshot.top10_pct,
            top50_pct: tokenData.latest_holder_snapshot.top50_pct,
            total_holders: tokenData.latest_holder_snapshot.total_holders,
          },
        });
      } else {
        fetchHolderData(tokenData.id).then(d => setHolders(d)).catch(() => {});
      }
      fetchScoreHistory(tokenData.id).then(d => setHistory(d)).catch(() => {});
      fetchMomentum(tokenData.id).then(d => setMomentumData(d)).catch(() => {});
    } catch {
      setToken(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    try {
      setRefreshing(true);
      const updated = await refreshTokenMarketData(id);
      setToken(updated);
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  }

  async function handleScore() {
    try {
      setScoring(true);
      const result = await scoreToken(id);
      setToken(result.token);
      const scoreData = await fetchTokenScores(id).catch(() => null);
      setScores(scoreData);
    } catch {
      // silent
    } finally {
      setScoring(false);
    }
  }

  async function handleFetchDefi() {
    try {
      setDefiLoading(true);
      const data = await fetchDefiData(id);
      setDefi(data);
    } catch {
      setDefi({ found: false, message: 'Failed to fetch' });
    } finally {
      setDefiLoading(false);
    }
  }

  async function handleFetchHolders() {
    try {
      setHoldersLoading(true);
      const data = await fetchHolderData(id);
      setHolders(data);
    } catch {
      setHolders({ found: false, message: 'Failed to fetch' });
    } finally {
      setHoldersLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading token...</span>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-destructive">Token not found.</p>
        <Link to="/" className="mt-2 text-sm text-muted-foreground hover:text-foreground">Back to Dashboard</Link>
      </div>
    );
  }

  const ms = token.latest_market_snapshot;
  const cs = token.latest_composite_score;
  const gateScores = token.gate_scores || scores?.gate_scores || [];
  const mcFdvRatio = ms?.market_cap && ms?.fdv ? (Number(ms.market_cap) / Number(ms.fdv)) : null;
  const circPct = ms?.circulating_supply && ms?.total_supply
    ? ((Number(ms.circulating_supply) / Number(ms.total_supply)) * 100)
    : null;

  const g1 = gateScores.find(g => g.gate === 1);
  const g2 = gateScores.find(g => g.gate === 2);
  const g3 = gateScores.find(g => g.gate === 3);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/#tokens" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Token List
        </Link>
        <div className="flex items-center gap-2">
          <div className="relative watchlist-menu">
            <Button
              variant="outline" size="sm"
              onClick={() => setShowWatchlistMenu(!showWatchlistMenu)}
            >
              {addedToWl ? (
                <Check className="mr-1.5 h-3.5 w-3.5 text-positive" />
              ) : (
                <Plus className="mr-1.5 h-3.5 w-3.5" />
              )}
              {addedToWl ? `Added to ${addedToWl}` : 'Add to Watchlist'}
            </Button>
            {showWatchlistMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border bg-popover p-1 shadow-md">
                {watchlists.length > 0 ? (
                  watchlists.map((wl) => (
                    <button
                      key={wl.id}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                      disabled={addingToWl === wl.id}
                      onClick={async () => {
                        try {
                          setAddingToWl(wl.id);
                          await addTokenToWatchlist(wl.id, token.id);
                          setAddedToWl(wl.name);
                          setShowWatchlistMenu(false);
                          setTimeout(() => setAddedToWl(null), 3000);
                        } catch (e) {
                          const msg = e.response?.data?.message || '';
                          if (msg.includes('already') || e.response?.status === 409 || e.response?.status === 422) {
                            setAddedToWl(`${wl.name} (sudah ada)`);
                            setShowWatchlistMenu(false);
                            setTimeout(() => setAddedToWl(null), 3000);
                          }
                        } finally {
                          setAddingToWl(null);
                        }
                      }}
                    >
                      {addingToWl === wl.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      <span>{wl.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{wl.tokens_count ?? wl.tokens?.length ?? ''}</span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-sm text-muted-foreground">Belum ada watchlist. Buat di halaman Watchlist.</p>
                )}
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Refresh Data
          </Button>
          <Button size="sm" onClick={handleScore} disabled={scoring}>
            {scoring ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-3.5 w-3.5" />
            )}
            {scoring ? 'Scoring...' : 'Run Score'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          {token.logo_url ? (
            <img src={token.logo_url} alt="" className="h-12 w-12 rounded-full" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-foreground">
              {token.symbol?.slice(0, 2)}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{token.name}</h1>
              <Badge variant="secondary">{token.symbol}</Badge>
              {token.chain && <Badge variant="outline">{token.chain}</Badge>}
            </div>
            {token.categories && (
              <div className="mt-1 flex flex-wrap gap-1">
                {(Array.isArray(token.categories) ? token.categories : []).slice(0, 4).map((cat) => (
                  <Badge key={cat} variant="secondary" className="text-xs font-normal">{cat}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {cs && <VerdictBadge verdict={cs.verdict} />}
          {cs && <span className="text-3xl font-bold tabular-nums">{Number(cs.composite_score).toFixed(1)}</span>}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {token.description_id && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowLangId(!showLangId)}>
                  {showLangId ? 'EN' : 'ID'}
                </Button>
              )}
              <div className="flex gap-1">
                {token.website && (
                  <a href={token.website} target="_blank" rel="noreferrer" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                    <Globe className="h-4 w-4" />
                  </a>
                )}
                {token.twitter_handle && (
                  <a href={`https://x.com/${token.twitter_handle}`} target="_blank" rel="noreferrer" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {showLangId && token.description_id ? token.description_id : (token.description_en || 'No description available.')}
          </p>
          {token.user_notes && (
            <div className="mt-3 rounded-md bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{token.user_notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Price" value={formatPrice(ms?.price)} />
        <MetricCard label="Market Cap" value={formatNumber(ms?.market_cap)} />
        <MetricCard label="FDV" value={formatNumber(ms?.fdv)} />
        <MetricCard label="MC/FDV" value={mcFdvRatio ? mcFdvRatio.toFixed(2) : '—'} />
        <MetricCard label="Circulating" value={circPct ? `${circPct.toFixed(1)}%` : '—'} />
        <MetricCard label="Volume 24h" value={formatNumber(ms?.volume_24h)} />
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tokenomics">Tokenomics</TabsTrigger>
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
          <TabsTrigger value="manipulation">Manipulation</TabsTrigger>
          <TabsTrigger value="history">Score History</TabsTrigger>
          <TabsTrigger value="momentum">Momentum</TabsTrigger>
          <TabsTrigger value="plan">Investment Plan</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <SummaryTab
            token={token}
            ms={ms}
            cs={cs}
            g1={g1}
            g2={g2}
            g3={g3}
            defi={defi}
            holders={holders}
            momentumData={momentumData}
          />
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
          {gateScores.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[g1, g2, g3].filter(Boolean).map((gs) => (
                <GateScoreCard key={gs.gate} gate={gs.gate} score={Number(gs.score)} breakdown={gs.breakdown} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No scoring data yet. Click "Run Score" to generate scores.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tokenomics" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Circulating Supply" value={formatSupply(ms?.circulating_supply)} />
            <MetricCard label="Total Supply" value={formatSupply(ms?.total_supply)} />
            <MetricCard label="Max Supply" value={ms?.max_supply ? formatSupply(ms.max_supply) : '∞'} />
          </div>

          {g1 ? (
            <>
              <GateScoreCard gate={1} score={Number(g1.score)} breakdown={g1.breakdown} />
              <BreakdownExplainer gate={1} breakdown={g1.breakdown} />
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Run scoring to see tokenomics analysis.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="valuation" className="mt-4 space-y-4">
          {/* DefiLlama Data */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">DeFi Metrics (DefiLlama)</CardTitle>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleFetchDefi} disabled={defiLoading}>
                  {defiLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  {defiLoading ? 'Fetching...' : defi ? 'Refresh' : 'Fetch DeFi Data'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {defi?.found ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">TVL</p>
                      <p className="text-lg font-semibold tabular-nums">{formatNumber(defi.metrics.tvl)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Fees (24h)</p>
                      <p className="text-lg font-semibold tabular-nums">{defi.metrics.fees_24h ? formatNumber(defi.metrics.fees_24h) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Revenue (24h)</p>
                      <p className="text-lg font-semibold tabular-nums">{defi.metrics.revenue_24h ? formatNumber(defi.metrics.revenue_24h) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Protocol</p>
                      <p className="text-sm font-medium">{defi.slug}</p>
                    </div>
                  </div>
                  {Object.keys(defi.ratios || {}).length > 0 && (
                    <div className="flex gap-4 pt-2 border-t">
                      {defi.ratios.mcap_tvl != null && (
                        <div>
                          <p className="text-xs text-muted-foreground">Mcap/TVL</p>
                          <p className={`text-sm font-mono font-semibold ${defi.ratios.mcap_tvl <= 2 ? 'text-positive' : defi.ratios.mcap_tvl <= 10 ? 'text-warning' : 'text-negative'}`}>
                            {defi.ratios.mcap_tvl}x
                          </p>
                        </div>
                      )}
                      {defi.ratios.ps_ratio != null && (
                        <div>
                          <p className="text-xs text-muted-foreground">P/S Ratio</p>
                          <p className={`text-sm font-mono font-semibold ${defi.ratios.ps_ratio <= 30 ? 'text-positive' : defi.ratios.ps_ratio <= 100 ? 'text-warning' : 'text-negative'}`}>
                            {defi.ratios.ps_ratio}x
                          </p>
                        </div>
                      )}
                      {defi.ratios.pf_ratio != null && (
                        <div>
                          <p className="text-xs text-muted-foreground">P/F Ratio</p>
                          <p className={`text-sm font-mono font-semibold ${defi.ratios.pf_ratio <= 15 ? 'text-positive' : defi.ratios.pf_ratio <= 50 ? 'text-warning' : 'text-negative'}`}>
                            {defi.ratios.pf_ratio}x
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : defi ? (
                <p className="text-sm text-muted-foreground py-2">{defi.message}</p>
              ) : (
                <p className="text-sm text-muted-foreground py-2">Click "Fetch DeFi Data" to load TVL, fees & revenue from DefiLlama.</p>
              )}
            </CardContent>
          </Card>

          {g2 ? (
            <>
              <GateScoreCard gate={2} score={Number(g2.score)} breakdown={g2.breakdown} />
              <BreakdownExplainer gate={2} breakdown={g2.breakdown} />
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Run scoring to see valuation analysis.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="manipulation" className="mt-4 space-y-4">
          {/* Holder Data */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Holder Concentration (Ethplorer)</CardTitle>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleFetchHolders} disabled={holdersLoading}>
                  {holdersLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  {holdersLoading ? 'Fetching...' : holders ? 'Refresh' : 'Fetch Holder Data'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {holders?.found ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Top 10 Holders</p>
                      <p className={`text-lg font-semibold tabular-nums ${holders.analysis.top10_pct <= 35 ? 'text-positive' : holders.analysis.top10_pct <= 70 ? 'text-warning' : 'text-negative'}`}>
                        {holders.analysis.top10_pct}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Top 50 Holders</p>
                      <p className={`text-lg font-semibold tabular-nums ${holders.analysis.top50_pct <= 55 ? 'text-positive' : holders.analysis.top50_pct <= 85 ? 'text-warning' : 'text-negative'}`}>
                        {holders.analysis.top50_pct}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Holders</p>
                      <p className="text-lg font-semibold tabular-nums">{Number(holders.analysis.total_holders).toLocaleString()}</p>
                    </div>
                  </div>
                  {/* Top 10 holder bars */}
                  {holders.analysis.holders_detail?.length > 0 && (
                    <div className="pt-2 border-t space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Top 10 Addresses</p>
                      {holders.analysis.holders_detail.map((h, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground w-4">{i + 1}</span>
                          <span className="font-mono text-muted-foreground truncate w-32">{h.address.slice(0, 8)}...{h.address.slice(-6)}</span>
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-chart-1"
                              style={{ width: `${Math.min(h.pct * 5, 100)}%`, opacity: 0.6 + (0.4 * h.pct / (holders.analysis.holders_detail[0]?.pct || 1)) }}
                            />
                          </div>
                          <span className="tabular-nums font-medium w-14 text-right">{h.pct}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : holders ? (
                <p className="text-sm text-muted-foreground py-2">{holders.message}</p>
              ) : (
                <p className="text-sm text-muted-foreground py-2">Click "Fetch Holder Data" to load top holder concentration (ERC-20 tokens on Ethereum).</p>
              )}
            </CardContent>
          </Card>

          {g3 ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <GateScoreCard gate={3} score={Number(g3.score)} breakdown={g3.breakdown} />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Red Flags</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <FlagItem
                      label="Wash Trading Signal"
                      value={g3.breakdown?.wash_trade_ratio ? `${(g3.breakdown.wash_trade_ratio * 100).toFixed(1)}%` : '—'}
                      status={flagStatus(g3.breakdown?.wash_trade_score)}
                    />
                    {g3.breakdown?.has_holder_data && (
                      <>
                        <FlagItem
                          label="Top 10 Holder %"
                          value={g3.breakdown?.top10_holder_pct ? `${g3.breakdown.top10_holder_pct}%` : '—'}
                          status={flagStatus(g3.breakdown?.top10_holder_score)}
                        />
                        <FlagItem
                          label="Top 50 Holder %"
                          value={g3.breakdown?.top50_holder_pct ? `${g3.breakdown.top50_holder_pct}%` : '—'}
                          status={flagStatus(g3.breakdown?.top50_holder_score)}
                        />
                      </>
                    )}
                    <FlagItem
                      label="Bid Depth"
                      value={g3.breakdown?.depth_data_available ? `${(g3.breakdown.depth_bid_ratio * 100).toFixed(3)}%` : 'N/A'}
                      status={g3.breakdown?.depth_data_available ? flagStatus(g3.breakdown?.depth_bid_score) : 'neutral'}
                    />
                    <FlagItem
                      label="Ask Depth"
                      value={g3.breakdown?.depth_data_available ? `${(g3.breakdown.depth_ask_ratio * 100).toFixed(3)}%` : 'N/A'}
                      status={g3.breakdown?.depth_data_available ? flagStatus(g3.breakdown?.depth_ask_score) : 'neutral'}
                    />
                    <FlagItem
                      label="Book Symmetry"
                      value={g3.breakdown?.bid_ask_symmetry ? `${(g3.breakdown.bid_ask_symmetry * 100).toFixed(1)}%` : 'N/A'}
                      status={g3.breakdown?.bid_ask_symmetry ? flagStatus(g3.breakdown?.symmetry_score) : 'neutral'}
                    />
                    <FlagItem
                      label="Liquidity Proxy"
                      value={g3.breakdown?.liquidity_proxy ? `${(g3.breakdown.liquidity_proxy * 100).toFixed(1)}%` : '—'}
                      status={flagStatus(g3.breakdown?.liquidity_proxy_score)}
                    />
                  </CardContent>
                </Card>
              </div>
              <BreakdownExplainer gate={3} breakdown={g3.breakdown} />
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Run scoring to see manipulation analysis.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Score History Tab */}
        <TabsContent value="history" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Composite Score History</CardTitle>
            </CardHeader>
            <CardContent>
              {history?.composite_history?.length > 0 ? (
                <div className="space-y-4">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={history.composite_history}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(v) => new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                          className="text-xs"
                          tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        />
                        <YAxis domain={[0, 10]} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
                          labelFormatter={(v) => new Date(v).toLocaleString('id-ID')}
                          formatter={(value) => [Number(value).toFixed(2), 'Score']}
                        />
                        <Line type="monotone" dataKey="composite_score" stroke="var(--color-chart-1)" strokeWidth={2} dot={{ r: 3 }} name="Composite" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-auto max-h-48">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-1.5 font-medium">Date</th>
                          <th className="text-right py-1.5 font-medium">Score</th>
                          <th className="text-right py-1.5 font-medium">Verdict</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...history.composite_history].reverse().map((row, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-1.5 text-muted-foreground">{new Date(row.date).toLocaleString('id-ID')}</td>
                            <td className="py-1.5 text-right tabular-nums font-medium">{Number(row.composite_score).toFixed(2)}</td>
                            <td className="py-1.5 text-right"><VerdictBadge verdict={row.verdict} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">No score history yet. Run scoring multiple times to see trends.</p>
              )}
            </CardContent>
          </Card>

          {history?.gate_history?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Gate Score History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history.gate_history}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) => new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      />
                      <YAxis domain={[0, 10]} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
                        labelFormatter={(v) => new Date(v).toLocaleString('id-ID')}
                        formatter={(value) => [Number(value).toFixed(2)]}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="gate1" stroke="var(--color-chart-1)" strokeWidth={2} dot={{ r: 2 }} name="Tokenomics" />
                      <Line type="monotone" dataKey="gate2" stroke="var(--color-chart-2)" strokeWidth={2} dot={{ r: 2 }} name="Valuation" />
                      <Line type="monotone" dataKey="gate3" stroke="var(--color-chart-3)" strokeWidth={2} dot={{ r: 2 }} name="Manipulation" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Momentum Tab */}
        <TabsContent value="momentum" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Sector Momentum</CardTitle>
                <Button
                  variant="outline" size="sm" className="h-7 text-xs"
                  onClick={async () => {
                    setMomentumLoading(true);
                    try { setMomentumData(await fetchMomentum(id)); } catch {}
                    setMomentumLoading(false);
                  }}
                  disabled={momentumLoading}
                >
                  {momentumLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {momentumData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Multiplier</p>
                      <p className={`text-2xl font-bold tabular-nums ${momentumData.multiplier >= 1.05 ? 'text-positive' : momentumData.multiplier <= 0.95 ? 'text-negative' : 'text-foreground'}`}>
                        {momentumData.multiplier}x
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Signal</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        {momentumData.signal?.includes('bullish') ? (
                          <TrendingUp className="h-5 w-5 text-positive" />
                        ) : momentumData.signal?.includes('bearish') ? (
                          <TrendingDown className="h-5 w-5 text-negative" />
                        ) : null}
                        <Badge variant={momentumData.signal?.includes('bullish') ? 'default' : momentumData.signal?.includes('bearish') ? 'destructive' : 'secondary'}>
                          {(momentumData.signal || 'neutral').replace('_', ' ')}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sector Avg Score</p>
                      <p className="text-2xl font-bold tabular-nums">{momentumData.sector_avg_score ?? '—'}</p>
                    </div>
                  </div>

                  {momentumData.sectors?.length > 0 && (
                    <div className="pt-3 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Sector Breakdown</p>
                      <div className="space-y-2">
                        {momentumData.sectors.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{s.sector}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground">{s.scored_count}/{s.token_count} scored</span>
                              <span className="text-xs text-muted-foreground">{s.pass_rate}% pass</span>
                              <span className="font-mono font-semibold tabular-nums w-10 text-right">{s.avg_score}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {momentumData.sectors?.length === 0 && (
                    <p className="text-sm text-muted-foreground">No sector mapping found for this token's categories. Add sector mappings in Settings.</p>
                  )}
                </div>
              ) : momentumLoading ? (
                <div className="flex items-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
                  <span className="text-sm text-muted-foreground">Loading momentum data...</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">Loading momentum data...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plan" className="mt-4">
          <InvestmentPlanner
            tokenId={token.id}
            currentPrice={ms?.price}
            symbol={token.symbol}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function generateInsights(g1, g2, g3, ms, defi, holders, momentumData) {
  const strengths = [];
  const weaknesses = [];
  const redFlags = [];
  const b1 = g1?.breakdown || {};
  const b2 = g2?.breakdown || {};
  const b3 = g3?.breakdown || {};

  // Gate 1
  if (b1.mc_fdv_score >= 8) strengths.push({ text: 'Risiko dilusi rendah — mayoritas token sudah beredar', score: b1.mc_fdv_score, area: 'Tokenomics' });
  if (b1.mc_fdv_score && b1.mc_fdv_score <= 3) weaknesses.push({ text: 'Risiko dilusi tinggi — banyak token belum beredar, potensi tekanan jual besar', score: b1.mc_fdv_score, area: 'Tokenomics' });
  if (b1.circ_total_score >= 8) strengths.push({ text: 'Supply distribution sehat — circulating supply mendekati total', score: b1.circ_total_score, area: 'Tokenomics' });
  if (b1.circ_total_score && b1.circ_total_score <= 3) weaknesses.push({ text: 'Banyak token terkunci — risiko unlock dump di masa depan', score: b1.circ_total_score, area: 'Tokenomics' });
  if (b1.locked_score >= 8) strengths.push({ text: 'Tekanan jual masa depan minimal — sedikit token terkunci', score: b1.locked_score, area: 'Tokenomics' });
  if (b1.locked_score && b1.locked_score <= 3) redFlags.push({ text: `${b1.locked_pct}% token masih terkunci — potensi sell pressure besar saat unlock`, area: 'Tokenomics' });

  // Gate 2
  if (b2.market_cap_tier_score >= 8) strengths.push({ text: `Market cap ${formatNumber(b2.market_cap)} — established dan stabil`, score: b2.market_cap_tier_score, area: 'Valuation' });
  if (b2.market_cap_tier_score && b2.market_cap_tier_score <= 3) weaknesses.push({ text: 'Market cap sangat kecil — risiko volatilitas tinggi', score: b2.market_cap_tier_score, area: 'Valuation' });
  if (b2.vol_mc_score >= 8) strengths.push({ text: 'Rasio volume/MC sehat — likuiditas baik tanpa anomali', score: b2.vol_mc_score, area: 'Valuation' });
  if (b2.vol_mc_score && b2.vol_mc_score <= 3) weaknesses.push({ text: 'Rasio volume/MC abnormal — kemungkinan volume tidak organik', score: b2.vol_mc_score, area: 'Valuation' });
  if (b2.fdv_score >= 8) strengths.push({ text: 'FDV realistis — valuasi tidak over-inflated', score: b2.fdv_score, area: 'Valuation' });
  if (b2.fdv_score && b2.fdv_score <= 3) weaknesses.push({ text: `FDV ${b2.fdv_multiple}x lipat MC — valuasi terlalu tinggi`, score: b2.fdv_score, area: 'Valuation' });
  if (b2.mcap_tvl_score >= 8) strengths.push({ text: `Mcap/TVL ${b2.mcap_tvl_ratio}x — undervalued relatif terhadap TVL`, score: b2.mcap_tvl_score, area: 'DeFi' });
  if (b2.mcap_tvl_score && b2.mcap_tvl_score <= 3) weaknesses.push({ text: `Mcap/TVL ${b2.mcap_tvl_ratio}x — overvalued relatif terhadap TVL`, score: b2.mcap_tvl_score, area: 'DeFi' });
  if (b2.ps_ratio_score >= 8) strengths.push({ text: `P/S ratio ${b2.ps_ratio}x — revenue generation sangat baik`, score: b2.ps_ratio_score, area: 'DeFi' });
  if (b2.ps_ratio_score && b2.ps_ratio_score <= 3) weaknesses.push({ text: `P/S ratio ${b2.ps_ratio}x — revenue terlalu kecil vs valuasi`, score: b2.ps_ratio_score, area: 'DeFi' });

  // Gate 3
  if (b3.wash_trade_score >= 8) strengths.push({ text: 'Volume terlihat organik — tidak ada sinyal wash trading', score: b3.wash_trade_score, area: 'Manipulation' });
  if (b3.wash_trade_score && b3.wash_trade_score <= 3) redFlags.push({ text: `Volume/MC ratio ${(b3.wash_trade_ratio * 100).toFixed(0)}% — kuat indikasi wash trading`, area: 'Manipulation' });
  if (b3.symmetry_score >= 8) strengths.push({ text: 'Order book seimbang — pasar sehat', score: b3.symmetry_score, area: 'Manipulation' });
  if (b3.symmetry_score && b3.symmetry_score <= 3) redFlags.push({ text: 'Order book sangat tidak seimbang — kemungkinan manipulasi', area: 'Manipulation' });
  if (b3.top10_holder_score && b3.top10_holder_score <= 3) redFlags.push({ text: `Top 10 holder menguasai ${b3.top10_holder_pct}% supply — sangat terkonsentrasi`, area: 'Holder' });
  if (b3.top10_holder_score >= 8) strengths.push({ text: `Top 10 holder hanya ${b3.top10_holder_pct}% — distribusi merata`, score: b3.top10_holder_score, area: 'Holder' });
  if (b3.top50_holder_score && b3.top50_holder_score <= 3) redFlags.push({ text: `Top 50 holder menguasai ${b3.top50_holder_pct}% — whale dominasi berlebihan`, area: 'Holder' });

  return { strengths, weaknesses, redFlags };
}

function getVerdictSummary(verdict, score, strengths, weaknesses, redFlags, symbol) {
  if (!verdict) return 'Belum ada data scoring. Klik "Run Score" untuk memulai analisis.';

  const s = Number(score).toFixed(1);

  if (verdict === 'PASS') {
    let text = `${symbol} mendapat skor ${s}/10 (PASS). Fundamental secara keseluruhan kuat.`;
    if (strengths.length > 0) text += ` Ditemukan ${strengths.length} kekuatan utama.`;
    if (weaknesses.length > 0) text += ` Namun ada ${weaknesses.length} area yang perlu diperhatikan.`;
    if (redFlags.length > 0) text += ` Perhatian: ${redFlags.length} red flag terdeteksi.`;
    text += ' Layak untuk dipertimbangkan masuk watchlist atau posisi.';
    return text;
  }
  if (verdict === 'WATCH') {
    let text = `${symbol} mendapat skor ${s}/10 (WATCH). Ada potensi tapi masih ada kelemahan.`;
    if (weaknesses.length > 0) text += ` Ditemukan ${weaknesses.length} kelemahan.`;
    if (redFlags.length > 0) text += ` Plus ${redFlags.length} red flag.`;
    text += ' Monitor perkembangan dan tunggu perbaikan sebelum entry.';
    return text;
  }
  if (verdict === 'FAIL') {
    let text = `${symbol} mendapat skor ${s}/10 (FAIL). Fundamental lemah.`;
    if (redFlags.length > 0) text += ` Terdeteksi ${redFlags.length} red flag serius.`;
    text += ' Hindari untuk saat ini, risiko terlalu tinggi.';
    return text;
  }
  return `${symbol} mendapat skor ${s}/10 (${verdict}). Data belum lengkap, jalankan scoring ulang setelah data market terupdate.`;
}

function SummaryTab({ token, ms, cs, g1, g2, g3, defi, holders, momentumData }) {
  const hasScoring = !!(g1 || g2 || g3);
  const verdict = cs?.verdict;
  const score = cs?.composite_score;
  const { strengths, weaknesses, redFlags } = hasScoring
    ? generateInsights(g1, g2, g3, ms, defi, holders, momentumData)
    : { strengths: [], weaknesses: [], redFlags: [] };

  const summaryText = getVerdictSummary(verdict, score, strengths, weaknesses, redFlags, token.symbol);

  const verdictColor = verdict === 'PASS' ? 'border-positive/30 bg-positive/5' : verdict === 'WATCH' ? 'border-warning/30 bg-warning/5' : verdict === 'FAIL' ? 'border-negative/30 bg-negative/5' : 'border-border';
  const verdictTextColor = verdict === 'PASS' ? 'text-positive' : verdict === 'WATCH' ? 'text-warning' : verdict === 'FAIL' ? 'text-negative' : 'text-muted-foreground';

  return (
    <div className="space-y-4">
      {/* Verdict Summary */}
      <Card className={`border-2 ${verdictColor}`}>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            {cs && (
              <div className="text-center shrink-0">
                <p className={`text-4xl font-bold tabular-nums ${verdictTextColor}`}>{Number(score).toFixed(1)}</p>
                <VerdictBadge verdict={verdict} />
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm leading-relaxed">{summaryText}</p>
              {momentumData && momentumData.multiplier !== 1.0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Sector momentum: {momentumData.signal?.replace('_', ' ')} ({momentumData.multiplier}x multiplier)
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {hasScoring && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Gate Scores Mini */}
          {[
            { gate: g1, label: 'Tokenomics', desc: 'Supply & dilusi' },
            { gate: g2, label: 'Valuation', desc: 'Valuasi & likuiditas' },
            { gate: g3, label: 'Manipulation', desc: 'Keamanan pasar' },
          ].map(({ gate, label, desc }) => gate && (
            <Card key={label}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium">{label}</p>
                  <span className={`text-lg font-bold tabular-nums ${Number(gate.score) >= 7 ? 'text-positive' : Number(gate.score) >= 4 ? 'text-warning' : 'text-negative'}`}>
                    {Number(gate.score).toFixed(1)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{desc}</p>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${Number(gate.score) >= 7 ? 'bg-positive' : Number(gate.score) >= 4 ? 'bg-warning' : 'bg-negative'}`}
                    style={{ width: `${Number(gate.score) * 10}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Strengths */}
      {strengths.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-positive">Kekuatan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {strengths.map((s, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="text-positive shrink-0 mt-0.5">+</span>
                <div className="flex-1">
                  <span>{s.text}</span>
                  <Badge variant="outline" className="ml-2 text-xs">{s.area}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Weaknesses */}
      {weaknesses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-warning">Kelemahan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {weaknesses.map((w, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="text-warning shrink-0 mt-0.5">!</span>
                <div className="flex-1">
                  <span>{w.text}</span>
                  <Badge variant="outline" className="ml-2 text-xs">{w.area}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Red Flags */}
      {redFlags.length > 0 && (
        <Card className="border-negative/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-negative">Red Flags</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {redFlags.map((r, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="text-negative shrink-0 mt-0.5">✕</span>
                <div className="flex-1">
                  <span>{r.text}</span>
                  <Badge variant="outline" className="ml-2 text-xs">{r.area}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* DeFi & Holder Quick Info */}
      {(defi?.found || holders?.found) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Data Tambahan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {defi?.found && defi.metrics?.tvl > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">TVL</p>
                  <p className="text-sm font-semibold tabular-nums">{formatNumber(defi.metrics.tvl)}</p>
                </div>
              )}
              {defi?.found && defi.metrics?.fees_24h > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Fees 24h</p>
                  <p className="text-sm font-semibold tabular-nums">{formatNumber(defi.metrics.fees_24h)}</p>
                </div>
              )}
              {holders?.found && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Top 10 Holder</p>
                    <p className={`text-sm font-semibold tabular-nums ${holders.analysis.top10_pct <= 35 ? 'text-positive' : holders.analysis.top10_pct <= 70 ? 'text-warning' : 'text-negative'}`}>
                      {holders.analysis.top10_pct}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Holders</p>
                    <p className="text-sm font-semibold tabular-nums">{Number(holders.analysis.total_holders).toLocaleString()}</p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!hasScoring && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Belum ada data scoring. Klik "Run Score" di atas untuk memulai analisis fundamental.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function flagStatus(score) {
  if (score === undefined || score === null) return 'neutral';
  if (score >= 8) return 'ok';
  if (score >= 5) return 'warning';
  return 'danger';
}

function MetricCard({ label, value }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function FlagItem({ label, value, status }) {
  const color = status === 'warning' ? 'text-warning' : status === 'danger' ? 'text-negative' : status === 'ok' ? 'text-positive' : 'text-muted-foreground';
  return (
    <div className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-accent transition-colors">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant="outline" className={color}>{value}</Badge>
    </div>
  );
}

const explanations = {
  1: {
    mc_fdv_score: 'MC/FDV mendekati 1.0 = mayoritas token sudah beredar, risiko dilusi rendah',
    circ_total_score: 'Rasio circulating/total supply tinggi = sedikit token terkunci',
    max_supply_score: 'Ada max supply = mekanisme deflasi, supply terbatas',
    locked_score: 'Persentase token terkunci rendah = tekanan jual masa depan kecil',
  },
  2: {
    market_cap_tier_score: 'Market cap besar = lebih established dan stabil',
    vol_mc_score: 'Volume/MC 3-30% = likuiditas sehat, tidak ada anomali',
    fdv_score: 'FDV mendekati MC = valuasi realistis, tidak over-inflated',
    volume_tier_score: 'Volume absolut tinggi = mudah masuk/keluar posisi',
    mcap_tvl_score: 'Mcap/TVL rendah = undervalued relatif terhadap total value locked (DefiLlama)',
    ps_ratio_score: 'P/S ratio rendah = valuasi wajar relatif terhadap revenue tahunan',
    pf_ratio_score: 'P/F ratio rendah = valuasi wajar relatif terhadap fees tahunan',
  },
  3: {
    wash_trade_score: 'Volume/MC rendah = kemungkinan wash trading kecil',
    top10_holder_score: 'Top 10 holder % rendah = distribusi token lebih merata (Ethplorer)',
    top50_holder_score: 'Top 50 holder % rendah = tidak ada konsentrasi whale berlebihan',
    depth_bid_score: 'Kedalaman bid order book relatif terhadap MC',
    depth_ask_score: 'Kedalaman ask order book relatif terhadap MC',
    symmetry_score: 'Bid/ask seimbang = pasar sehat, tidak ada manipulasi satu sisi',
    liquidity_proxy_score: 'Proxy likuiditas dari rasio volume (depth data tidak tersedia)',
  },
};

function BreakdownExplainer({ gate, breakdown }) {
  if (!breakdown) return null;
  const gateExpl = explanations[gate] || {};
  const items = Object.entries(gateExpl).filter(([key]) => breakdown[key] !== undefined);
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Penjelasan Skor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map(([key, text]) => {
          const score = breakdown[key];
          let color = 'text-negative';
          if (score >= 8) color = 'text-positive';
          else if (score >= 6) color = 'text-chart-2';
          else if (score >= 4) color = 'text-warning';
          return (
            <div key={key} className="flex items-start gap-3 text-sm">
              <span className={`font-mono font-medium tabular-nums w-8 shrink-0 ${color}`}>{score}</span>
              <span className="text-muted-foreground">{text}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
