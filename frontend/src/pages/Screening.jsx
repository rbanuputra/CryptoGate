import { useState, useEffect } from 'react';
import { Play, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { fetchWatchlists, fetchTokens, runScreening } from '@/lib/api';
import VerdictBadge from '@/components/tokens/VerdictBadge';

function Score({ score }) {
  if (score === undefined || score === null) return <span className="text-muted-foreground">—</span>;
  const num = Number(score);
  let color = 'text-negative';
  if (num >= 8) color = 'text-positive';
  else if (num >= 6) color = 'text-chart-2';
  else if (num >= 4) color = 'text-warning';
  return <span className={`tabular-nums font-medium ${color}`}>{num.toFixed(1)}</span>;
}

export default function Screening() {
  const [watchlists, setWatchlists] = useState([]);
  const [tokenCount, setTokenCount] = useState(0);
  const [selectedWatchlist, setSelectedWatchlist] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchWatchlists().then(setWatchlists).catch(() => {});
    fetchTokens({ perPage: 1 }).then(res => setTokenCount(res.total)).catch(() => {});
  }, []);

  async function handleRun() {
    if (isRunning) return;
    setIsRunning(true);
    setResults(null);
    setError(null);

    try {
      const payload = {};
      if (selectedWatchlist) payload.watchlistId = Number(selectedWatchlist);

      const data = await runScreening(payload);
      setResults(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Screening failed');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Screening</h1>
        <p className="text-sm text-muted-foreground">Run the 3-gate scoring pipeline on your tokens</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-sm space-y-1.5">
              <label className="text-sm font-medium">Target</label>
              <select
                value={selectedWatchlist}
                onChange={(e) => setSelectedWatchlist(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                disabled={isRunning}
              >
                <option value="">All tokens ({tokenCount})</option>
                {watchlists.map((wl) => (
                  <option key={wl.id} value={wl.id}>
                    {wl.name} ({wl.tokens_count} tokens)
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={handleRun} disabled={isRunning}>
              {isRunning ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Running...</>
              ) : (
                <><Play className="mr-1.5 h-4 w-4" /> Run Screening</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {results && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-positive" />
              <CardTitle className="text-base">Screening Complete</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{results.total} tokens</Badge>
              <Badge className="bg-positive/15 text-positive border-0">{results.pass} pass</Badge>
              <Badge className="bg-warning/15 text-warning border-0">{results.watch} watch</Badge>
              <Badge className="bg-negative/15 text-negative border-0">{results.fail} fail</Badge>
            </div>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Token</TableHead>
                <TableHead className="text-right">G1</TableHead>
                <TableHead className="text-right">G2</TableHead>
                <TableHead className="text-right">G3</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Verdict</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.results?.map((r) => (
                <TableRow key={r.token_id}>
                  <TableCell>
                    {r.status === 'scored' ? (
                      <Check className="h-4 w-4 text-positive" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {r.logo_url ? (
                        <img src={r.logo_url} alt="" className="h-5 w-5 rounded-full" />
                      ) : (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
                          {r.symbol?.slice(0, 2)}
                        </div>
                      )}
                      <span className="font-medium">{r.name}</span>
                      <span className="text-muted-foreground text-xs">{r.symbol}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right"><Score score={r.gate1} /></TableCell>
                  <TableCell className="text-right"><Score score={r.gate2} /></TableCell>
                  <TableCell className="text-right"><Score score={r.gate3} /></TableCell>
                  <TableCell className="text-right"><Score score={r.composite_score} /></TableCell>
                  <TableCell className="text-right">
                    {r.verdict ? <VerdictBadge verdict={r.verdict} /> : (
                      <Badge variant="destructive" className="text-xs">{r.error || 'Failed'}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
