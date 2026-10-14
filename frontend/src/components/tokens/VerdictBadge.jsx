import { Badge } from '@/components/ui/badge';

const variantMap = {
  PASS: 'outline',
  WATCH: 'outline',
  FAIL: 'outline',
  INCOMPLETE: 'secondary',
};

const colorMap = {
  PASS: 'text-positive border-positive/30',
  WATCH: 'text-warning border-warning/30',
  FAIL: 'text-negative border-negative/30',
  INCOMPLETE: 'text-muted-foreground',
};

export default function VerdictBadge({ verdict }) {
  if (!verdict) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <Badge variant={variantMap[verdict] || 'secondary'} className={colorMap[verdict]}>
      {verdict}
    </Badge>
  );
}
