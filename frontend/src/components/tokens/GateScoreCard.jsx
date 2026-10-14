import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress, ProgressTrack, ProgressIndicator } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { gateNames } from '@/lib/format';

function scoreColor(score) {
  if (score >= 8) return 'text-positive';
  if (score >= 6) return 'text-chart-2';
  if (score >= 4) return 'text-warning';
  return 'text-negative';
}

function formatBreakdownValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return num.toFixed(2);
}

export default function GateScoreCard({ gate, score, breakdown }) {
  const numScore = Number(score);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between">
          <CardTitle className="text-sm font-medium">
            <span className="text-muted-foreground">G{gate}</span>{' '}
            {gateNames[gate]}
          </CardTitle>
          <span className={`text-xl font-semibold tabular-nums ${scoreColor(numScore)}`}>
            {!isNaN(numScore) ? numScore.toFixed(1) : '—'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={!isNaN(numScore) ? (numScore / 10) * 100 : 0}>
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>

        {breakdown && (
          <>
            <Separator />
            <div className="space-y-1.5">
              {Object.entries(breakdown).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{key.replace(/_/g, ' ')}</span>
                  <span className="tabular-nums">{formatBreakdownValue(value)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
