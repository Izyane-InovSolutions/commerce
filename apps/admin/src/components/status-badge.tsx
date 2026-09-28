import { Badge } from '@/components/ui/badge';

/** Maps a domain status onto a badge tone, defaulting to a neutral one. */
const TONES: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  active: 'default',
  approved: 'default',
  paid: 'default',
  dispatched: 'default',
  delivered: 'default',
  succeeded: 'default',
  completed: 'default',
  published: 'default',
  visible: 'default',
  verified: 'default',
  posted: 'default',
  closed: 'default',
  draft: 'secondary',
  pending: 'secondary',
  pending_payment: 'secondary',
  pending_booking: 'secondary',
  booked: 'secondary',
  in_transit: 'secondary',
  out_for_delivery: 'secondary',
  processing: 'secondary',
  requires_action: 'secondary',
  requested: 'secondary',
  submitted: 'secondary',
  receiving: 'secondary',
  received: 'secondary',
  inspecting: 'secondary',
  partially_received: 'secondary',
  reconciliation_required: 'secondary',
  inactive: 'outline',
  archived: 'outline',
  partially_refunded: 'outline',
  refunded: 'outline',
  return_to_sender: 'outline',
  returned: 'outline',
  hidden: 'outline',
  reversed: 'outline',
  expired: 'outline',
  rejected: 'destructive',
  suspended: 'destructive',
  cancelled: 'destructive',
  delivery_failed: 'destructive',
  exception: 'destructive',
  failed: 'destructive',
  refund_failed: 'destructive',
  completed_with_errors: 'destructive',
  removed: 'destructive',
  disabled: 'destructive',
};

const LABELS: Record<string, string> = {
  threepl: '3PL',
  pending_payment: 'Awaiting payment',
};

function titleCase(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function StatusBadge({ status }: { status: string }) {
  const label = LABELS[status] ?? titleCase(status);

  return <Badge variant={TONES[status] ?? 'secondary'}>{label}</Badge>;
}
