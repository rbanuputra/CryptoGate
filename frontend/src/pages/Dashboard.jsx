import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Loader2, Radar, RefreshCw, TrendingUp, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar as RechartsRadar,
} from 'recharts';
import TokenTable from '@/components/tokens/TokenTable';
import { fetchTokens, fetchAnalytics, runDiscovery, runRefreshAll } from '@/lib/api';
import { formatPrice, formatNumber } from '@/lib/format';

const chains = ['All', 'ethereum', 'solana', 'arbitrum', 'polygon'];
const verdicts = ['All', 'PASS', 'WATCH', 'FAIL', 'INCOMPLETE'];

const VERDICT_COLORS = {
  PASS: 'var(--color-positive)',
  WATCH: 'var(--color-warning)',
  FAIL: 'var(--color-negative)',
  INCOMPLETE: 'var(--color-muted-foreground)',
  UNSCORED: 'var(--color-muted-foreground)',
};

const MCAP_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd'];

function formatMcap(val) {
  if (val >= 1e12) return '$' + (val / 1e12).toFixed(1) + 'T';
  if (val >= 1e9) return '$' + (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return '$' + (val / 1e6).toFixed(0) + 'M';
  return '$' + formatNumber(val);
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{d.name}</p>
      <p className="text-muted-foreground">{d.value} tokens</p>
    </div>
  );
}

function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">Score {label}</p>
      <p className="text-muted-foreground">{payload[0].value} tokens</p>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [tokens, setTokens] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [chainFilter, setChainFilter] = useState('All');
  const [verdictFilter, setVerdictFilter] = useState('All');
  const [discovering, setDiscovering] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState(null);
  const location = useLocation();
  const [tab, setTab] = useState(() => {
    return location.hash === '#tokens' ? 'tokens' : 'overview';
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (location.hash === '#tokens') setTab('tokens');
  }, [location.hash]);

  async function loadData() {
    try {
      setLoading(true);
      const [res, analyticsData] = await Promise.all([
        fetchTokens({ perPage: 1000 }),
        fetchAnalytics(),
      ]);
      setTokens(res.data);
      setAnalytics(analyticsData);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function handleDiscover() {
    if (discovering) return;
    try {
      setDiscovering(true);
      setDiscoveryResult(null);
      const result = await runDiscovery(15);
      setDiscoveryResult(result);
      await loadData();
    } catch (err) {
      setDiscoveryResult({ error: err.response?.data?.message || 'Discovery failed' });
    } finally {
      setDiscovering(false);
    }
  }

  async function handleRefreshAll() {
    if (refreshing) return;
    try {
      setRefreshing(true);
      await runRefreshAll();
      await loadData();
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  }

  const filtered = tokens.filter((token) => {
    if (search) {
      const q = search.toLowerCase();
      if (!token.name.toLowerCase().includes(q) && !token.symbol.toLowerCase().includes(q)) return false;
    }
    if (chainFilter !== 'All' && token.chain !== chainFilter) return false;
    if (verdictFilter !== 'All' && token.latest_composite_score?.verdict !== verdictFilter) return false;
    return true;
  });

  const totalTokens = analytics?.total_tokens ?? tokens.length;
  const passCount = analytics?.verdict_distribution?.PASS ?? 0;
  const watchCount = analytics?.verdict_distribution?.WATCH ?? 0;
  const failCount = analytics?.verdict_distribution?.FAIL ?? 0;

  const verdictData = analytics ? Object.entries(analytics.verdict_distribution)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value })) : [];

  const mcapData = analytics ? Object.entries(analytics.mcap_tiers)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value })) : [];

  const scoreData = analytics ? Object.entries(analytics.score_distribution)
    .map(([name, value]) => ({ name, value })) : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{totalTokens} tokens tracked</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={handleRefreshAll}
            disabled={refreshing || tokens.length === 0}
          >
            {refreshing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            {refreshing ? 'Refreshing...' : 'Refresh All'}
          </Button>
          <Button size="sm" onClick={handleDiscover} disabled={discovering}>
            {discovering ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Radar className="mr-1.5 h-3.5 w-3.5" />
            )}
            {discovering ? 'Discovering...' : 'Discover Coins'}
          </Button>
        </div>
      </div>

      {discoveryResult && (
        <Card>
          <CardContent className="pt-4 pb-4">
            {discoveryResult.error ? (
              <p className="text-sm text-destructive">{discoveryResult.error}</p>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm">
                  <span>Discovery complete</span>
                  <Badge variant="secondary">{discoveryResult.categories_scanned} categories</Badge>
                  <Badge className="bg-positive/15 text-positive border-0">{discoveryResult.total_added} new</Badge>
                  {discoveryResult.failed_categories?.length > 0 && (
                    <Badge variant="destructive">{discoveryResult.failed_categories.length} failed</Badge>
                  )}
                </div>
                <button onClick={() => setDiscoveryResult(null)} className="text-xs text-muted-foreground hover:text-foreground">
                  Dismiss
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalTokens}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pass</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-positive">{passCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Watch</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-warning">{watchCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fail</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-negative">{failCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {[
          { key: 'overview', label: 'Analytics', icon: BarChart3 },
          { key: 'tokens', label: 'All Tokens', icon: TrendingUp },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && analytics && (
        <div className="space-y-6">
          {/* Charts row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Verdict Distribution Pie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Verdict Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={verdictData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {verdictData.map((entry) => (
                          <Cell key={entry.name} fill={VERDICT_COLORS[entry.name] || '#888'} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {verdictData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: VERDICT_COLORS[d.name] }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-medium">{d.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Market Cap Tiers Pie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Market Cap Tiers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={mcapData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {mcapData.map((_, i) => (
                          <Cell key={i} fill={MCAP_COLORS[i % MCAP_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {mcapData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MCAP_COLORS[i] }} />
                      <span className="text-muted-foreground truncate max-w-[100px]">{d.name.replace(/\(.*\)/, '').trim()}</span>
                      <span className="font-medium">{d.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Score Distribution Bar */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Score Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scoreData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                      <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                      <Tooltip content={<BarTooltip />} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {scoreData.map((entry) => {
                          const score = parseInt(entry.name);
                          const color = score >= 7 ? 'var(--color-positive)' : score >= 4 ? 'var(--color-warning)' : 'var(--color-negative)';
                          return <Cell key={entry.name} fill={color} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-center text-xs text-muted-foreground mt-2">Composite score range</p>
              </CardContent>
            </Card>
          </div>

          {/* Sector Performance + Top Movers */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Sector Performance */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Sector Performance</CardTitle>
                <p className="text-xs text-muted-foreground">Categories with 2+ tokens, ranked by avg score</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analytics.sector_performance.map((sector) => {
                    const scoreColor = sector.avg_score >= 7 ? 'text-positive' : sector.avg_score >= 4 ? 'text-warning' : 'text-negative';
                    const barWidth = Math.min((sector.avg_score / 10) * 100, 100);
                    const barColor = sector.avg_score >= 7 ? 'bg-positive/20' : sector.avg_score >= 4 ? 'bg-warning/20' : 'bg-negative/20';
                    return (
                      <div key={sector.name} className="group">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate max-w-[200px]">{sector.name}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">{sector.count} tokens</span>
                            <span className="text-xs text-muted-foreground">{formatMcap(sector.total_mcap)}</span>
                            <span className={`font-mono font-medium tabular-nums ${scoreColor}`}>{sector.avg_score.toFixed(1)}</span>
                          </div>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%`, backgroundColor: sector.avg_score >= 7 ? 'var(--color-positive)' : sector.avg_score >= 4 ? 'var(--color-warning)' : 'var(--color-negative)', opacity: 0.4 }} />
                        </div>
                      </div>
                    );
                  })}
                  {analytics.sector_performance.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">No sector data yet. Run scoring first.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top by Score */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Top Scorers</CardTitle>
                <p className="text-xs text-muted-foreground">Highest composite scores (PASS verdict)</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {analytics.top_by_score.map((token, i) => (
                    <button
                      key={token.id}
                      onClick={() => navigate(`/token/${token.id}`)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-xs font-medium text-muted-foreground w-5">{i + 1}</span>
                      {token.logo_url ? (
                        <img src={token.logo_url} alt="" className="h-6 w-6 rounded-full" />
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                          {token.symbol.slice(0, 2)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{token.name}</p>
                        <p className="text-xs text-muted-foreground">{token.symbol} · {formatMcap(token.market_cap)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-semibold text-positive">{token.score.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">{formatPrice(token.price)}</p>
                      </div>
                    </button>
                  ))}
                  {analytics.top_by_score.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">No scored tokens yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top by Volume */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Top Volume (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {analytics.top_by_volume.map((token, i) => (
                  <button
                    key={token.id}
                    onClick={() => navigate(`/token/${token.id}`)}
                    className="flex items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-xs font-medium text-muted-foreground w-5">{i + 1}</span>
                    {token.logo_url ? (
                      <img src={token.logo_url} alt="" className="h-5 w-5 rounded-full" />
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-medium">
                        {token.symbol.slice(0, 2)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{token.symbol}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono tabular-nums">{formatMcap(token.volume_24h)}</p>
                      {token.verdict && (
                        <Badge variant="outline" className={`text-[10px] ${
                          token.verdict === 'PASS' ? 'text-positive' : token.verdict === 'FAIL' ? 'text-negative' : 'text-warning'
                        }`}>
                          {token.verdict}
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'tokens' && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search token..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1">
                {chains.map((c) => (
                  <button
                    key={c}
                    onClick={() => setChainFilter(c)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      chainFilter === c
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {c === 'All' ? 'All chains' : c}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {verdicts.map((v) => (
                  <button
                    key={v}
                    onClick={() => setVerdictFilter(v)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      verdictFilter === v
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {v === 'All' ? 'All' : v}
                  </button>
                ))}
              </div>
              {(chainFilter !== 'All' || verdictFilter !== 'All' || search) && (
                <button
                  onClick={() => { setChainFilter('All'); setVerdictFilter('All'); setSearch(''); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <Card>
            {error ? (
              <div className="py-16 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <button onClick={loadData} className="mt-2 text-sm text-muted-foreground hover:text-foreground">
                  Retry
                </button>
              </div>
            ) : (
              <TokenTable tokens={filtered} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
