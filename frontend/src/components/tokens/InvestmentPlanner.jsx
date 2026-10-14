import { useState, useEffect, useMemo } from 'react';
import { Plus, Save, Trash2, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Target, DollarSign, Loader2, BarChart3, Info, Bell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { fetchPlans, createPlan, updatePlan, deletePlan, fetchBuyZone, createAlertsFromPlan } from '@/lib/api';
import { formatPrice, formatNumber } from '@/lib/format';

export default function InvestmentPlanner({ tokenId, currentPrice, symbol }) {
  const [plans, setPlans] = useState([]);
  const [activePlan, setActivePlan] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [analysis, setAnalysis] = useState(null);
  const [loadingZone, setLoadingZone] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);

  const price = Number(currentPrice) || 0;

  useEffect(() => {
    loadPlans();
  }, [tokenId]);

  async function loadPlans() {
    try {
      const data = await fetchPlans(tokenId);
      setPlans(data);
      const active = data.find(p => p.status === 'active') || data[0];
      if (active) {
        setActivePlan(active);
        setForm(planToForm(active));
      } else {
        loadSmartZone();
      }
    } catch {
      loadSmartZone();
    }
  }

  async function loadSmartZone() {
    if (!price) return;
    setLoadingZone(true);
    try {
      const data = await fetchBuyZone(tokenId);
      setAnalysis(data.analysis);
      setForm(prev => ({
        ...prev,
        entry_low: fmt(data.buy_zone.entry_low),
        entry_ideal: fmt(data.buy_zone.entry_ideal),
        entry_high: fmt(data.buy_zone.entry_high),
        tp1: fmt(data.targets.tp1),
        tp2: fmt(data.targets.tp2),
        tp3: fmt(data.targets.tp3),
        stop_loss: fmt(data.stop_loss),
        capital: prev.capital || '1000',
      }));
      setEditing(true);
    } catch {
      applyFallback();
    } finally {
      setLoadingZone(false);
    }
  }

  function fmt(v) {
    const n = Number(v);
    return n >= 1 ? n.toFixed(2) : n.toFixed(6);
  }

  function applyFallback() {
    if (!price) return;
    const dec = price >= 1 ? 2 : 6;
    setForm(prev => ({
      ...prev,
      entry_low: (price * 0.85).toFixed(dec),
      entry_ideal: (price * 0.90).toFixed(dec),
      entry_high: (price * 0.95).toFixed(dec),
      tp1: (price * 1.20).toFixed(dec),
      tp2: (price * 1.50).toFixed(dec),
      tp3: (price * 2.00).toFixed(dec),
      stop_loss: (price * 0.80).toFixed(dec),
      capital: prev.capital || '1000',
    }));
    setEditing(true);
  }

  function emptyForm() {
    return {
      entry_low: '', entry_high: '', entry_ideal: '',
      capital: '', tp1: '', tp2: '', tp3: '',
      stop_loss: '', thesis: '', notes: '',
    };
  }

  function planToForm(plan) {
    return {
      entry_low: plan.entry_low ?? '',
      entry_high: plan.entry_high ?? '',
      entry_ideal: plan.entry_ideal ?? '',
      capital: plan.capital ?? '',
      tp1: plan.tp1 ?? '',
      tp2: plan.tp2 ?? '',
      tp3: plan.tp3 ?? '',
      stop_loss: plan.stop_loss ?? '',
      thesis: plan.thesis ?? '',
      notes: plan.notes ?? '',
    };
  }

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (!editing) setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {};
      for (const [k, v] of Object.entries(form)) {
        payload[k] = v === '' ? null : v;
      }
      payload.status = 'active';

      if (activePlan) {
        const updated = await updatePlan(tokenId, activePlan.id, payload);
        setActivePlan(updated);
        setPlans(prev => prev.map(p => p.id === updated.id ? updated : p));
      } else {
        const created = await createPlan(tokenId, payload);
        setActivePlan(created);
        setPlans(prev => [created, ...prev]);
      }
      setEditing(false);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleNew() {
    setActivePlan(null);
    setForm(emptyForm());
    setAnalysis(null);
    setEditing(true);
  }

  async function handleSetAlerts() {
    try {
      const payload = {};
      if (form.entry_high) payload.entry_high = form.entry_high;
      if (form.entry_low) payload.entry_low = form.entry_low;
      if (form.tp1) payload.tp1 = form.tp1;
      if (form.tp2) payload.tp2 = form.tp2;
      if (form.tp3) payload.tp3 = form.tp3;
      if (form.stop_loss) payload.stop_loss = form.stop_loss;
      const result = await createAlertsFromPlan(tokenId, payload);
      setAlertMsg(`${result.created} alerts created`);
      setTimeout(() => setAlertMsg(null), 3000);
    } catch {
      setAlertMsg('Failed to create alerts');
      setTimeout(() => setAlertMsg(null), 3000);
    }
  }

  async function handleDelete() {
    if (!activePlan) return;
    try {
      await deletePlan(tokenId, activePlan.id);
      setPlans(prev => prev.filter(p => p.id !== activePlan.id));
      setActivePlan(null);
      setForm(emptyForm());
      setEditing(false);
    } catch {
      // silent
    }
  }

  const projections = useMemo(() => {
    const entryPrice = Number(form.entry_ideal) || price;
    const capital = Number(form.capital) || 0;
    const qty = capital > 0 && entryPrice > 0 ? capital / entryPrice : 0;
    const sl = Number(form.stop_loss) || 0;
    const targets = [
      { label: 'TP1', sublabel: 'Conservative', price: Number(form.tp1) || 0 },
      { label: 'TP2', sublabel: 'Moderate', price: Number(form.tp2) || 0 },
      { label: 'TP3', sublabel: 'Aggressive', price: Number(form.tp3) || 0 },
    ].filter(t => t.price > 0);

    const results = targets.map(t => {
      const pnl = (t.price - entryPrice) * qty;
      const pct = entryPrice > 0 ? ((t.price - entryPrice) / entryPrice) * 100 : 0;
      return { ...t, pnl, pct, value: t.price * qty };
    });

    const slPnl = sl > 0 ? (sl - entryPrice) * qty : 0;
    const slPct = sl > 0 && entryPrice > 0 ? ((sl - entryPrice) / entryPrice) * 100 : 0;

    const riskPerUnit = entryPrice - sl;
    const bestReward = targets.length > 0 ? targets[targets.length - 1].price - entryPrice : 0;
    const rr = riskPerUnit > 0 && bestReward > 0 ? bestReward / riskPerUnit : 0;

    return { entryPrice, capital, qty, results, sl, slPnl, slPct, rr };
  }, [form, price]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2">
            <CardTitle className="text-base">Investment Plan</CardTitle>
            {activePlan && <Badge variant="secondary" className="text-xs">{activePlan.status}</Badge>}
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={loadSmartZone} disabled={loadingZone}>
              {loadingZone ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <BarChart3 className="mr-1 h-3 w-3" />}
              {loadingZone ? 'Analyzing...' : 'Smart Zone'}
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleNew}>
              <Plus className="mr-1 h-3 w-3" /> New
            </Button>
            {editing && (
              <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
                <Save className="mr-1 h-3 w-3" /> {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
            {(form.tp1 || form.stop_loss || form.entry_high) && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSetAlerts}>
                <Bell className="mr-1 h-3 w-3" /> Set Alerts
              </Button>
            )}
            {activePlan && (
              <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={handleDelete}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-5">
          {alertMsg && (
            <div className="rounded-md bg-positive/10 border border-positive/20 px-3 py-2 text-sm text-positive flex items-center gap-2">
              <Bell className="h-3.5 w-3.5" />
              {alertMsg}
            </div>
          )}

          {/* Analysis Summary */}
          {analysis && (
            <div className="rounded-md bg-muted/50 border p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Smart Zone Analysis</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">
                  {analysis.fibonacci?.has_data ? 'Live Data' : 'Estimated'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Support 7d</span>
                  <span className="tabular-nums">{formatPrice(analysis.support?.low_7d)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fib 0.382</span>
                  <span className="tabular-nums">{formatPrice(analysis.fibonacci?.fib_0382)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Support 30d</span>
                  <span className="tabular-nums">{formatPrice(analysis.support?.low_30d)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fib 0.618</span>
                  <span className="tabular-nums">{formatPrice(analysis.fibonacci?.fib_0618)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Support 90d</span>
                  <span className="tabular-nums">{formatPrice(analysis.support?.low_90d)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fib 0.786</span>
                  <span className="tabular-nums">{formatPrice(analysis.fibonacci?.fib_0786)}</span>
                </div>
                <div className="flex justify-between col-span-2 pt-1 border-t border-border/50">
                  <span className="text-muted-foreground">Score Adj</span>
                  <span className="tabular-nums">
                    {analysis.score_adjustment?.factor}x — <span className="text-muted-foreground">{analysis.score_adjustment?.label}</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Buy Zone */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Target className="h-4 w-4 text-positive" />
              <h4 className="text-sm font-medium">Buy Zone</h4>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Dihitung dari Fibonacci retracement (30d high-low), historical support (7d/30d/90d low), dan score adjustment
                </TooltipContent>
              </Tooltip>
              <span className="text-xs text-muted-foreground ml-auto">Current: {formatPrice(price)}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <PriceField label="Support (Low)" value={form.entry_low} onChange={v => handleChange('entry_low', v)} price={price} />
              <PriceField label="Ideal Entry" value={form.entry_ideal} onChange={v => handleChange('entry_ideal', v)} price={price} highlight />
              <PriceField label="Entry High" value={form.entry_high} onChange={v => handleChange('entry_high', v)} price={price} />
            </div>
            {form.entry_low && form.entry_high && (
              <div className="mt-2 h-2.5 rounded-full bg-muted overflow-hidden relative">
                <BuyZoneBar low={Number(form.entry_low)} high={Number(form.entry_high)} ideal={Number(form.entry_ideal)} current={price} />
              </div>
            )}
          </div>

          <Separator />

          {/* Position Size */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <DollarSign className="h-4 w-4 text-chart-2" />
              <h4 className="text-sm font-medium">Position</h4>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Capital (USD)</label>
                <Input type="number" placeholder="1000" value={form.capital} onChange={e => handleChange('capital', e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Est. Quantity</label>
                <div className="flex h-8 items-center rounded-md bg-muted px-3 text-sm tabular-nums">
                  {projections.qty > 0 ? `${projections.qty.toFixed(projections.qty >= 1 ? 2 : 6)} ${symbol}` : '—'}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Sell Targets */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendingUp className="h-4 w-4 text-positive" />
              <h4 className="text-sm font-medium">Sell Targets</h4>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Dihitung dari Fibonacci extension (1.272, 1.618, 2.0) berdasarkan 30d high-low range, disesuaikan dengan score token
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <PriceField label="TP1 (Conservative)" value={form.tp1} onChange={v => handleChange('tp1', v)} price={price} direction="up" />
              <PriceField label="TP2 (Moderate)" value={form.tp2} onChange={v => handleChange('tp2', v)} price={price} direction="up" />
              <PriceField label="TP3 (Aggressive)" value={form.tp3} onChange={v => handleChange('tp3', v)} price={price} direction="up" />
            </div>
          </div>

          {/* Stop Loss */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendingDown className="h-4 w-4 text-negative" />
              <h4 className="text-sm font-medium">Stop Loss</h4>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  5% di bawah entry low atau di bawah 90d low (mana yang lebih rendah)
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="w-1/3">
              <PriceField label="Stop Loss" value={form.stop_loss} onChange={v => handleChange('stop_loss', v)} price={price} direction="down" />
            </div>
          </div>

          <Separator />

          {/* Projections */}
          {(projections.results.length > 0 || projections.sl > 0) && projections.capital > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2.5">Profit Projection</h4>
              <div className="rounded-md border">
                <div className="grid grid-cols-5 gap-2 px-3 py-2 text-xs text-muted-foreground border-b bg-muted/30">
                  <span>Level</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">Change</span>
                  <span className="text-right">P&L</span>
                  <span className="text-right">Total Value</span>
                </div>
                <div className="grid grid-cols-5 gap-2 px-3 py-2 text-sm border-b bg-muted/10">
                  <span className="text-muted-foreground">Entry</span>
                  <span className="text-right tabular-nums">{formatPrice(projections.entryPrice)}</span>
                  <span className="text-right tabular-nums text-muted-foreground">—</span>
                  <span className="text-right tabular-nums text-muted-foreground">—</span>
                  <span className="text-right tabular-nums">{formatNumber(projections.capital)}</span>
                </div>
                {projections.results.map(r => (
                  <div key={r.label} className="grid grid-cols-5 gap-2 px-3 py-2 text-sm border-b last:border-b-0">
                    <span className="font-medium text-positive">{r.label}</span>
                    <span className="text-right tabular-nums">{formatPrice(r.price)}</span>
                    <span className="text-right tabular-nums text-positive">+{r.pct.toFixed(1)}%</span>
                    <span className="text-right tabular-nums text-positive">+{formatNumber(r.pnl)}</span>
                    <span className="text-right tabular-nums">{formatNumber(r.value)}</span>
                  </div>
                ))}
                {projections.sl > 0 && (
                  <div className="grid grid-cols-5 gap-2 px-3 py-2 text-sm border-t">
                    <span className="font-medium text-negative">SL</span>
                    <span className="text-right tabular-nums">{formatPrice(projections.sl)}</span>
                    <span className="text-right tabular-nums text-negative">{projections.slPct.toFixed(1)}%</span>
                    <span className="text-right tabular-nums text-negative">{formatNumber(projections.slPnl)}</span>
                    <span className="text-right tabular-nums">{formatNumber(projections.sl * projections.qty)}</span>
                  </div>
                )}
              </div>
              {projections.rr > 0 && (
                <div className="mt-2.5 flex items-center gap-3">
                  <Badge variant="outline" className={`text-xs ${projections.rr >= 2 ? 'text-positive border-positive/30' : projections.rr >= 1 ? 'text-warning border-warning/30' : 'text-negative border-negative/30'}`}>
                    Risk/Reward — 1 : {projections.rr.toFixed(1)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {projections.rr >= 3 ? 'Excellent setup' : projections.rr >= 2 ? 'Good setup' : projections.rr >= 1 ? 'Fair — manage risk' : 'Poor — reconsider entry'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Thesis */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Investment Thesis</label>
              <textarea
                value={form.thesis}
                onChange={e => handleChange('thesis', e.target.value)}
                placeholder="Why buy this token? What's the catalyst?"
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[60px] resize-y"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => handleChange('notes', e.target.value)}
                placeholder="Additional notes, risk factors, etc."
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[60px] resize-y"
              />
            </div>
          </div>

          {/* Plan History */}
          {plans.length > 1 && (
            <>
              <Separator />
              <div>
                <h4 className="text-xs text-muted-foreground mb-2">Plan History</h4>
                <div className="space-y-1">
                  {plans.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setActivePlan(p); setForm(planToForm(p)); setEditing(false); }}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${
                        activePlan?.id === p.id ? 'bg-accent' : 'hover:bg-accent/50'
                      }`}
                    >
                      <span>Plan #{p.id}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={p.status === 'active' ? 'default' : 'secondary'} className="text-xs">{p.status}</Badge>
                        <span className="text-xs text-muted-foreground">{new Date(p.updated_at).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function PriceField({ label, value, onChange, price, highlight, direction }) {
  const numVal = Number(value);
  const pct = numVal > 0 && price > 0 ? ((numVal - price) / price) * 100 : null;

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        type="text"
        inputMode="decimal"
        placeholder="—"
        value={value}
        onChange={e => {
          const v = e.target.value;
          if (v === '' || /^\d*\.?\d*$/.test(v)) onChange(v);
        }}
        className={`h-8 text-sm tabular-nums ${highlight ? 'border-primary/50' : ''}`}
      />
      {pct !== null && (
        <span className={`text-[10px] tabular-nums ${pct >= 0 ? 'text-positive' : 'text-negative'}`}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(1)}% vs current
        </span>
      )}
    </div>
  );
}

function BuyZoneBar({ low, high, ideal, current }) {
  if (!low || !high || low >= high) return null;
  const range = high - low;
  const buffer = range * 0.3;
  const min = low - buffer;
  const max = high + buffer;
  const span = max - min;

  const zoneLeft = ((low - min) / span) * 100;
  const zoneWidth = ((high - low) / span) * 100;
  const idealPos = ideal ? ((ideal - min) / span) * 100 : null;
  const currentPos = current > min && current < max ? ((current - min) / span) * 100 : null;

  return (
    <>
      <div
        className="absolute h-full bg-positive/25 rounded-full"
        style={{ left: `${zoneLeft}%`, width: `${zoneWidth}%` }}
      />
      {idealPos !== null && (
        <div className="absolute h-full w-0.5 bg-positive" style={{ left: `${idealPos}%` }} title="Ideal Entry" />
      )}
      {currentPos !== null && (
        <div className="absolute h-full w-0.5 bg-warning" style={{ left: `${currentPos}%` }} title="Current Price" />
      )}
    </>
  );
}
