import { Badge } from '@/components/ui/badge';

/** Maps a domain status onto a badge tone, defaulting to a neutral one. */
const TONES: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  active: 'default',
  approved: 'default',
  draft: 'secondary',
  pending: 'secondary',
  inactive: 'outline',
  archived: 'outline',
  rejected: 'destructive',
  suspended: 'destructive',
};

const LABELS: Record<string, string> = {
  threepl: '3PL',
};

export function StatusBadge({ status }: { status: string }) {
  const label =
    LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);

  return <Badge variant={TONES[status] ?? 'secondary'}>{label}</Badge>;
}
