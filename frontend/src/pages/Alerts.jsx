import { useState, useEffect } from 'react';
import { Bell, BellOff, Trash2, Check, AlertTriangle, Loader2, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { fetchAlerts, updateAlert, deleteAlert, fetchAlertLogs, checkAlerts } from '@/lib/api';
import { formatPrice } from '@/lib/format';

const typeLabels = {
  price_above: 'Price Above',
  price_below: 'Price Below',
  buy_zone_enter: 'Buy Zone',
  tp_hit: 'Take Profit',
  sl_hit: 'Stop Loss',
};

const typeColors = {
  price_above: 'text-positive',
  price_below: 'text-negative',
  buy_zone_enter: 'text-positive',
  tp_hit: 'text-positive',
  sl_hit: 'text-negative',
};

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [tab, setTab] = useState('active');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [alertsData, logsData] = await Promise.all([
        fetchAlerts(),
        fetchAlertLogs({ limit: 50 }),
      ]);
      setAlerts(alertsData);
      setLogs(logsData);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function handleCheck() {
    setChecking(true);
    setCheckResult(null);
    try {
      const result = await checkAlerts();
      setCheckResult(result);
      await loadData();
    } catch {
      // silent
    } finally {
      setChecking(false);
    }
  }

  async function toggleAlert(alert) {
    try {
      const updated = await updateAlert(alert.id, { active: !alert.active });
      setAlerts(prev => prev.map(a => a.id === updated.id ? updated : a));
    } catch {
      // silent
    }
  }

  async function handleDelete(id) {
    try {
      await deleteAlert(id);
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch {
      // silent
    }
  }

  const activeAlerts = alerts.filter(a => a.active);
  const triggeredAlerts = alerts.filter(a => !a.active && a.triggered_at);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading alerts...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="text-sm text-muted-foreground">
            Price alerts — checked every 15 minutes automatically
          </p>
        </div>
        <Button size="sm" onClick={handleCheck} disabled={checking}>
          {checking ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-3.5 w-3.5" />
          )}
          {checking ? 'Checking...' : 'Check Now'}
        </Button>
      </div>

      {checkResult && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3 text-sm">
              <Check className="h-4 w-4 text-positive" />
              <span>Checked {checkResult.checked} alerts</span>
              {checkResult.total_triggered > 0 ? (
                <Badge className="bg-warning/15 text-warning border-0">{checkResult.total_triggered} triggered!</Badge>
              ) : (
                <Badge variant="secondary">No triggers</Badge>
              )}
              <button onClick={() => setCheckResult(null)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                Dismiss
              </button>
            </div>
            {checkResult.triggered?.length > 0 && (
              <div className="mt-3 space-y-1">
                {checkResult.triggered.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    <span>{t.message}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activeAlerts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Triggered</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-warning">{triggeredAlerts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-muted-foreground">{logs.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-1">
        {['active', 'triggered', 'logs'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'active' ? `Active (${activeAlerts.length})` : t === 'triggered' ? `Triggered (${triggeredAlerts.length})` : `Logs (${logs.length})`}
          </button>
        ))}
      </div>

      {tab === 'active' && (
        <Card>
          {activeAlerts.length === 0 ? (
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No active alerts. Create alerts from a token's Investment Plan.
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeAlerts.map(alert => (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {alert.token?.logo_url ? (
                          <img src={alert.token.logo_url} alt="" className="h-5 w-5 rounded-full" />
                        ) : (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px]">
                            {alert.token?.symbol?.slice(0, 2)}
                          </div>
                        )}
                        <span className="font-medium">{alert.token?.symbol}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${typeColors[alert.type]}`}>
                        {typeLabels[alert.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(alert.target_price)}
                      {alert.secondary_price && (
                        <span className="text-muted-foreground"> — {formatPrice(alert.secondary_price)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{alert.label || '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => toggleAlert(alert)} className="rounded p-1 hover:bg-muted transition-colors">
                          <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => handleDelete(alert.id)} className="rounded p-1 hover:bg-muted transition-colors">
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'triggered' && (
        <Card>
          {triggeredAlerts.length === 0 ? (
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No triggered alerts yet.
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Triggered At</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {triggeredAlerts.map(alert => (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {alert.token?.logo_url && <img src={alert.token.logo_url} alt="" className="h-5 w-5 rounded-full" />}
                        <span className="font-medium">{alert.token?.symbol}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${typeColors[alert.type]}`}>
                        {typeLabels[alert.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPrice(alert.target_price)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(alert.triggered_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPrice(alert.triggered_price)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => toggleAlert(alert)} className="rounded p-1 hover:bg-muted transition-colors" title="Re-activate">
                          <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => handleDelete(alert.id)} className="rounded p-1 hover:bg-muted transition-colors">
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'logs' && (
        <Card>
          {logs.length === 0 ? (
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No alert logs yet.
            </CardContent>
          ) : (
            <div className="divide-y">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{log.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(log.created_at).toLocaleString()} — Price: {formatPrice(log.price_at_trigger)}
                    </p>
                  </div>
                  {log.alert?.token && (
                    <Badge variant="secondary" className="text-xs shrink-0">{log.alert.token.symbol}</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
