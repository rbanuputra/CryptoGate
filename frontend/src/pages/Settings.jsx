import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { fetchWeights, updateWeights, fetchSectors } from '@/lib/api';

const defaultWeights = { gate1: 0.35, gate2: 0.40, gate3: 0.25 };

export default function Settings() {
  const [weights, setWeights] = useState(defaultWeights);
  const [momentumMode, setMomentumMode] = useState('off');
  const [sectors, setSectors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [weightData, sectorData] = await Promise.all([
          fetchWeights(),
          fetchSectors(),
        ]);
        setWeights(weightData.weights);
        setMomentumMode(weightData.momentum_mode);
        setSectors(sectorData);
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const sum = weights.gate1 + weights.gate2 + weights.gate3;
  const isValid = Math.abs(sum - 1.0) <= 0.01;

  function handleWeightChange(gate, value) {
    setWeights({ ...weights, [gate]: parseFloat(value) || 0 });
    setSaved(false);
  }

  function handleReset() {
    setWeights(defaultWeights);
    setMomentumMode('off');
    setSaved(false);
  }

  async function handleSave() {
    if (!isValid || saving) return;
    try {
      setSaving(true);
      await updateWeights(weights, momentumMode);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure gate weights and scoring parameters</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gate Weights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <WeightSlider label="G1 — Tokenomics & Emissions" value={weights.gate1} onChange={(v) => handleWeightChange('gate1', v)} />
            <WeightSlider label="G2 — Valuation Metrics" value={weights.gate2} onChange={(v) => handleWeightChange('gate2', v)} />
            <WeightSlider label="G3 — Manipulation Detection" value={weights.gate3} onChange={(v) => handleWeightChange('gate3', v)} />

            <Separator />

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className={`text-sm font-semibold tabular-nums ${isValid ? 'text-positive' : 'text-destructive'}`}>
                {(sum * 100).toFixed(0)}%{!isValid && ' (must be 100%)'}
              </span>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={!isValid || saving} size="sm">
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                {saved ? 'Saved!' : 'Save'}
              </Button>
              <Button variant="outline" onClick={handleReset} size="sm">
                Reset Default
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Momentum Mode</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                momentumMode === 'on' ? 'border-primary bg-accent' : 'border-border'
              }`}>
                <input
                  type="radio" name="momentum" value="on"
                  checked={momentumMode === 'on'}
                  onChange={() => { setMomentumMode('on'); setSaved(false); }}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">On</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Sector momentum sebagai multiplier (0.85x – 1.15x) pada composite score. Token di sektor bullish dapat score boost, sektor bearish dikurangi.
                  </p>
                </div>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                momentumMode === 'off' ? 'border-primary bg-accent' : 'border-border'
              }`}>
                <input
                  type="radio" name="momentum" value="off"
                  checked={momentumMode === 'off'}
                  onChange={() => { setMomentumMode('off'); setSaved(false); }}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">Off</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Tidak ada adjustment berdasarkan sector momentum. Composite score murni dari 3 gate.
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">API Keys</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">CoinGecko API Key</label>
                <Input type="password" placeholder="CG-xxxxxxxxxxxxxxxxxxxxxxxxxx" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Etherscan API Key</label>
                <Input type="password" placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
              </div>
              <p className="text-xs text-muted-foreground">API keys are configured in backend .env file.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Narrative Sectors</CardTitle>
          <p className="text-sm text-muted-foreground">
            CoinGecko category mappings to narrative sectors for peer comparison.
          </p>
        </CardHeader>
        <CardContent>
          {Object.keys(sectors).length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(sectors).map(([sector, categories]) => (
                <div key={sector}>
                  <p className="mb-1.5 text-sm font-medium">{sector}</p>
                  <div className="flex flex-wrap gap-1">
                    {(Array.isArray(categories) ? categories : []).map((cat) => (
                      <Badge key={cat} variant="secondary" className="text-xs font-normal">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No sectors configured. Run the SectorMappingSeeder.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WeightSlider({ label, value, onChange }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm">{label}</label>
        <span className="text-sm font-medium tabular-nums">{(value * 100).toFixed(0)}%</span>
      </div>
      <input
        type="range" min="0" max="1" step="0.05" value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-primary"
      />
    </div>
  );
}
