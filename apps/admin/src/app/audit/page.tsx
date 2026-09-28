import type { Metadata } from 'next';
import Link from 'next/link';

import {
  backendListAuditActions,
  backendListAuditEvents,
} from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SelectField } from '@/components/select-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api';
import { explainMissingRoute } from '@/lib/api-route-errors';
import {
  formatAuditMetadata,
  isAuditFiltered,
  readAuditFilters,
  summarizeAuditMetadata,
  toAuditEventQuery,
  type AuditFilters,
} from '@/lib/audit';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Audit' };

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * The filter bar. `actions` is the log's own list of action names; when that
 * read fails the field degrades to free text rather than disappearing, since
 * filtering by action is the most common way into the log.
 */
function AuditFilterForm({
  filters,
  actions,
}: {
  filters: AuditFilters;
  actions: string[] | null;
}) {
  return (
    <form className="flex flex-wrap items-end gap-3" action="/audit">
      <div className="space-y-1.5">
        <Label htmlFor="audit-action">Action</Label>
        {actions ? (
          <SelectField
            id="audit-action"
            name="action"
            placeholder="Any action"
            defaultValue={filters.action ?? ''}
            options={actions.map((action) => ({ value: action, label: action }))}
            className="max-w-64"
          />
        ) : (
          <Input
            id="audit-action"
            name="action"
            placeholder="e.g. reviews.moderation.hidden"
            defaultValue={filters.action ?? ''}
            className="w-64"
          />
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-actor">Actor user id</Label>
        <Input
          id="audit-actor"
          name="actorUserId"
          defaultValue={filters.actorUserId ?? ''}
          placeholder="UUID"
          className="w-72 font-mono text-xs"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-target-type">Target type</Label>
        <Input
          id="audit-target-type"
          name="targetType"
          defaultValue={filters.targetType ?? ''}
          placeholder="e.g. Payment"
          className="w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-target-id">Target id</Label>
        <Input
          id="audit-target-id"
          name="targetId"
          defaultValue={filters.targetId ?? ''}
          className="w-72 font-mono text-xs"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-from">From</Label>
        <Input
          id="audit-from"
          name="from"
          type="date"
          defaultValue={filters.from ?? ''}
          className="w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-to">To</Label>
        <Input
          id="audit-to"
          name="to"
          type="date"
          defaultValue={filters.to ?? ''}
          className="w-40"
        />
      </div>
      <Button type="submit" variant="secondary">
        Apply
      </Button>
      {isAuditFiltered(filters) ? (
        <Button variant="ghost" asChild>
          <Link href="/audit">Clear</Link>
        </Button>
      ) : null}
    </form>
  );
}

export default async function AuditPage({ searchParams }: PageProps<'/audit'>) {
  await requireAdmin(true);
  const params = await searchParams;
  const filters = readAuditFilters(params);

  const header = (
    <PageHeader
      title="Audit"
      description="Every privileged action any part of the platform recorded, newest first. Dates are UTC and inclusive."
    />
  );

  // The action list only feeds the filter; failing it must not cost the log.
  const [eventsResult, actionsResult] = await Promise.allSettled([
    backendListAuditEvents(apiClient, toAuditEventQuery(filters)),
    backendListAuditActions(apiClient),
  ]);
  const actions =
    actionsResult.status === 'fulfilled' ? actionsResult.value : null;

  if (eventsResult.status === 'rejected') {
    return (
      <div className="space-y-6">
        {header}
        <AuditFilterForm filters={filters} actions={actions} />
        <ApiErrorNotice
          error={explainMissingRoute(eventsResult.reason, 'the audit log')}
        />
      </div>
    );
  }

  const events = eventsResult.value;
  const totalPages = Math.max(1, Math.ceil(events.total / events.limit));
  const filtered = isAuditFiltered(filters);

  return (
    <div className="space-y-6">
      {header}
      <AuditFilterForm filters={filters} actions={actions} />

      {events.items.length === 0 ? (
        <EmptyState
          title={filtered ? 'No events match these filters' : 'No events yet'}
          description={
            filtered
              ? 'Nothing recorded fits every filter at once — try removing one.'
              : 'Events appear here as administrators and the platform take privileged actions.'
          }
          action={
            filtered ? (
              <Button asChild>
                <Link href="/audit">Clear filters</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.items.map((event) => {
                const metadataText = formatAuditMetadata(event.metadata);
                return (
                  <TableRow key={event.id} className="align-top">
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(event.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/audit?action=${encodeURIComponent(event.action)}`}
                        className="font-mono text-xs font-medium hover:underline"
                      >
                        {event.action}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {event.actorUserId ? (
                        <Link
                          href={`/audit?actorUserId=${event.actorUserId}`}
                          className="hover:underline"
                          title={event.actorUserId}
                        >
                          {event.actorEmail ?? event.actorUserId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">System</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {event.targetType || event.targetId ? (
                        <span className="space-x-1">
                          {event.targetType ? (
                            <span>{event.targetType}</span>
                          ) : null}
                          {event.targetId ? (
                            <Link
                              href={`/audit?targetId=${encodeURIComponent(event.targetId)}`}
                              className="text-muted-foreground font-mono text-xs hover:underline"
                              title={event.targetId}
                            >
                              {event.targetId.slice(0, 8)}
                            </Link>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md">
                      {metadataText || event.ipAddress || event.userAgent ? (
                        <details className="group">
                          <summary className="text-muted-foreground cursor-pointer text-xs select-none">
                            {summarizeAuditMetadata(event.metadata) ||
                              'Request details'}
                          </summary>
                          <div className="mt-2 space-y-2">
                            {metadataText ? (
                              <pre className="bg-muted/50 max-h-72 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap">
                                {metadataText}
                              </pre>
                            ) : null}
                            {event.ipAddress || event.userAgent ? (
                              <dl className="text-muted-foreground grid gap-1 text-xs">
                                {event.ipAddress ? (
                                  <div>
                                    <dt className="inline">IP </dt>
                                    <dd className="inline font-mono">
                                      {event.ipAddress}
                                    </dd>
                                  </div>
                                ) : null}
                                {event.userAgent ? (
                                  <div>
                                    <dt className="inline">User agent </dt>
                                    <dd className="inline break-all">
                                      {event.userAgent}
                                    </dd>
                                  </div>
                                ) : null}
                              </dl>
                            ) : null}
                          </div>
                        </details>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        pathname="/audit"
        params={params}
        page={events.page}
        pageSize={events.limit}
        total={events.total}
        totalPages={totalPages}
      />
    </div>
  );
}
